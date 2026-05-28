"""HTTP MCP gateway in front of dimos.

dimos's ``McpClient`` is configured (via ``DIMOS_MCP_GATEWAY_URL``) to
post all its tool requests here instead of straight to its own
``McpServer`` on ``:9990``. This router forwards everything to the real
dimos MCP, but intercepts ``tools/call`` to enforce per-user RBAC +
policies based on the *active turn* set by the dispatcher.

Notes on the gating semantics:

* The denial response uses an MCP ``result`` envelope (not a JSON-RPC
  ``error``) so the LLM in dimos sees it as a normal tool reply text
  and can apologise to the user instead of crashing the loop.
* ``initialize`` / ``tools/list`` are passed through unchanged. We
  could filter the tool list per active user later but the deny-at-
  call-time check is what actually enforces — listing is cosmetic.
* When no user is active (e.g. Claude Code connects directly to this
  gateway), we **pass through**. The threat model here is the chat
  UI; bolting auth on every MCP caller is out of scope for v1.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select

from src.agents import dispatcher as agents_dispatcher
from src.db import SessionLocal
from src.dimos_client import get_mcp_adapter
from src.mcp_gateway import session as gw_session
from src.policies import service as policies_service
from src.policies.models import EvaluateRequest
from src.rbac.db_models import Role
from src.rbac.taxonomy import is_always_allowed, role_allows_skill

log = logging.getLogger(__name__)

router = APIRouter(prefix="/mcp", tags=["mcp-gateway"])


def _result_text(req_id: Any, text: str) -> dict[str, Any]:
    """MCP result envelope wrapping a single text content block."""
    return {
        "jsonrpc": "2.0",
        "id": req_id,
        "result": {"content": [{"type": "text", "text": text}]},
    }


def _rpc_error(req_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


async def _get_role_permissions(role_name: str) -> list[str]:
    async with SessionLocal() as session:
        row = (
            await session.execute(select(Role).where(Role.name == role_name))
        ).scalar_one_or_none()
        if row is None:
            return []
        return list(row.permissions)


@router.post("")
async def mcp_proxy(request: Request) -> Response:
    body = await request.json()
    method = body.get("method")
    req_id = body.get("id")
    params = body.get("params") or {}
    adapter = get_mcp_adapter()

    # Notifications (no id) get acked synchronously with 204; dimos's
    # MCP server already does the same.
    if "id" not in body:
        try:
            await adapter.call(method or "", params)
        except Exception:
            log.exception("mcp_gateway notification forward failed method=%s", method)
        return Response(status_code=204)

    if method != "tools/call":
        try:
            data = await adapter.call(method or "initialize", params)
            # adapter.call generates its own random JSON-RPC id; rewrite
            # so the caller sees the id they sent.
            data["id"] = req_id
            return JSONResponse(data)
        except Exception as e:
            log.exception("mcp_gateway upstream error method=%s", method)
            return JSONResponse(_rpc_error(req_id, -32000, str(e)))

    skill = params.get("name", "")
    args = params.get("arguments") or {}
    # Bump the dispatcher's idle timer regardless of allow/deny, so a
    # stream of denials doesn't trip the silence-detection heuristic.
    agents_dispatcher.mark_gateway_activity()
    active = gw_session.get_active()

    if active is None:
        # No active turn = direct admin/dev client. Pass through without
        # gating. Logged so it's visible during demos.
        log.info("mcp_gateway passthrough (no active user) skill=%s", skill)
        return await _forward_call(adapter, params, req_id)

    # 1) Skills declared always-allowed bypass the gate entirely.
    if is_always_allowed(skill):
        gw_session.record_event(f"allow (always-allowed) {skill}")
        return await _forward_call(adapter, params, req_id)

    # 2) RBAC: role permissions check.
    perms = await _get_role_permissions(active.role)
    if not role_allows_skill(perms, skill):
        msg = (
            f"Denied: your role {active.role!r} is not allowed to call "
            f"{skill!r}."
        )
        gw_session.record_event(f"deny (rbac) {skill}")
        log.info(
            "mcp_gateway deny rbac user=%s role=%s skill=%s",
            active.username,
            active.role,
            skill,
        )
        return JSONResponse(_result_text(req_id, msg))

    # 3) Policy check (deny-only, signals empty for v1 since we don't
    # have a runtime signal source wired yet).
    async with SessionLocal() as session:
        decision = await policies_service.evaluate(
            session,
            EvaluateRequest(skill=skill, role=active.role, signals={}),
        )
    if decision.decision == "deny":
        first = decision.matched[0] if decision.matched else None
        msg = (
            f"Denied by policy {first.policy_name!r}: "
            f"{first.message or 'no message provided'}"
            if first is not None
            else "Denied by policy."
        )
        gw_session.record_event(f"deny (policy) {skill}")
        log.info(
            "mcp_gateway deny policy user=%s role=%s skill=%s policy=%s",
            active.username,
            active.role,
            skill,
            first.policy_name if first else "?",
        )
        return JSONResponse(_result_text(req_id, msg))

    log.info(
        "mcp_gateway allow user=%s role=%s skill=%s args=%s",
        active.username,
        active.role,
        skill,
        args,
    )
    gw_session.record_event(f"allow {skill}")
    return await _forward_call(adapter, params, req_id)


async def _forward_call(adapter: Any, params: dict[str, Any], req_id: Any) -> Response:
    try:
        data = await adapter.call("tools/call", params)
        data["id"] = req_id
        return JSONResponse(data)
    except Exception as e:
        log.exception(
            "mcp_gateway upstream tools/call failed skill=%s", params.get("name", "?")
        )
        return JSONResponse(_rpc_error(req_id, -32000, str(e)))
