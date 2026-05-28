"""Agent chat endpoints.

``POST /agents/send`` is the only path the chat UI uses. It serialises
turns through the dispatcher so the MCP gateway can attribute every
``tools/call`` to a specific user (see ``src/mcp_gateway``).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from src.agents import dispatcher as agents_dispatcher
from src.auth.jwt import get_current_user
from src.dimos_client import get_mcp_adapter
from src.mcp_gateway.session import ActiveUser
from src.rbac.db_models import User

router = APIRouter(prefix="/agents", tags=["agents"])


class AgentSendRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4096)


class AgentSendResponse(BaseModel):
    status: str
    ack: str
    events: list[str]


@router.get("/status")
async def agent_status() -> dict:
    adapter = get_mcp_adapter()
    ready = await adapter.wait_for_ready(timeout=0.5)
    if not ready:
        return {"status": "down"}
    try:
        tools = await adapter.list_tools()
    except Exception as e:
        return {"status": "degraded", "error": str(e)}
    return {
        "status": "ready",
        "tool_count": len(tools),
        "has_learned_skills": any(
            t.get("name") == "lookout_learned_skill" for t in tools
        ),
    }


@router.post("/send", response_model=AgentSendResponse)
async def agent_send(
    body: AgentSendRequest,
    user: User = Depends(get_current_user),
) -> AgentSendResponse:
    active = ActiveUser(
        user_id=str(user.id),
        username=user.username,
        role=user.role,
    )
    try:
        result = await agents_dispatcher.submit(active, body.message)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"dimos unreachable: {e}",
        ) from e
    return AgentSendResponse(status="sent", ack=result.ack, events=result.events)
