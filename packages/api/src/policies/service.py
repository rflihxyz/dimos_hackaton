"""Async DB operations for the ``policies`` table."""
from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.mcp_tools.db_models import McpTool
from src.policies import evaluator
from src.policies.db_models import Policy
from src.policies.models import (
    Condition,
    EvaluateRequest,
    EvaluateResponse,
    PolicyCreate,
    PolicyMatch,
    PolicyPatch,
    PolicyRow,
    SignalCatalogResponse,
    SignalInfo,
)
from src.policies.signals import SIGNALS
from src.rbac.db_models import Role
from src.rbac.taxonomy import ActionCategory


def _to_row(p: Policy) -> PolicyRow:
    return PolicyRow(
        id=p.id,
        name=p.name,
        description=p.description,
        enabled=p.enabled,
        scope_kind=p.scope_kind,
        scope_values=list(p.scope_values),
        applies_to_roles=list(p.applies_to_roles),
        condition=Condition.model_validate(p.condition),
        message=p.message,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


def signal_catalog() -> SignalCatalogResponse:
    return SignalCatalogResponse(
        signals=[
            SignalInfo(
                name=s.name,
                kind=s.kind.value,
                source=s.source.value,
                description=s.description,
                unit=s.unit,
                enum_values=list(s.enum_values) if s.enum_values else None,
                default_when_missing=s.default_when_missing,
            )
            for s in SIGNALS
        ],
        operators=["==", "!=", "<", "<=", ">", ">=", "in", "not_in"],
    )


async def _validate_scope_and_subjects(
    session: AsyncSession,
    *,
    scope_kind: str,
    scope_values: list[str],
    applies_to_roles: list[str],
) -> None:
    """Reject scope / role references that don't resolve.

    * ``scope_kind='categories'`` → values must be in :class:`ActionCategory`.
    * ``scope_kind='skills'`` → values must exist in the ``mcp_tools`` catalog.
    * ``applies_to_roles`` → values must exist in the ``roles`` table.
    """
    if scope_kind == "categories":
        valid = {c.value for c in ActionCategory}
        unknown = sorted(set(scope_values) - valid)
        if unknown:
            raise ValueError(
                "unknown action category: " + ", ".join(repr(c) for c in unknown)
            )
    elif scope_kind == "skills":
        rows = (
            await session.execute(
                select(McpTool.name).where(McpTool.name.in_(scope_values))
            )
        ).scalars().all()
        known = set(rows)
        unknown = sorted(set(scope_values) - known)
        if unknown:
            raise ValueError(
                "unknown skill(s) not in MCP catalog: "
                + ", ".join(repr(s) for s in unknown)
            )

    if applies_to_roles:
        rows = (
            await session.execute(
                select(Role.name).where(Role.name.in_(applies_to_roles))
            )
        ).scalars().all()
        known = set(rows)
        unknown = sorted(set(applies_to_roles) - known)
        if unknown:
            raise ValueError(
                "unknown role(s): " + ", ".join(repr(r) for r in unknown)
            )


async def list_policies(session: AsyncSession) -> list[PolicyRow]:
    rows = (
        await session.execute(select(Policy).order_by(Policy.name))
    ).scalars().all()
    return [_to_row(r) for r in rows]


async def get_policy(session: AsyncSession, policy_id: int) -> PolicyRow | None:
    row = (
        await session.execute(select(Policy).where(Policy.id == policy_id))
    ).scalar_one_or_none()
    return _to_row(row) if row else None


async def create_policy(session: AsyncSession, body: PolicyCreate) -> PolicyRow:
    existing = (
        await session.execute(select(Policy).where(Policy.name == body.name))
    ).scalar_one_or_none()
    if existing is not None:
        raise ValueError(f"Policy {body.name!r} already exists")

    await _validate_scope_and_subjects(
        session,
        scope_kind=body.scope_kind,
        scope_values=body.scope_values,
        applies_to_roles=body.applies_to_roles,
    )

    row = Policy(
        name=body.name,
        description=body.description,
        enabled=body.enabled,
        scope_kind=body.scope_kind,
        scope_values=list(body.scope_values),
        applies_to_roles=list(body.applies_to_roles),
        condition=body.condition.model_dump(exclude_none=True),
        message=body.message,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _to_row(row)


async def update_policy(
    session: AsyncSession, policy_id: int, body: PolicyPatch
) -> PolicyRow | None:
    row = (
        await session.execute(select(Policy).where(Policy.id == policy_id))
    ).scalar_one_or_none()
    if row is None:
        return None

    # Compute the effective scope / subjects post-patch so we can
    # validate them as a coherent unit rather than each field in
    # isolation.
    next_scope_kind = body.scope_kind if body.scope_kind is not None else row.scope_kind
    next_scope_values = (
        list(body.scope_values) if body.scope_values is not None else list(row.scope_values)
    )
    next_applies_to_roles = (
        list(body.applies_to_roles)
        if body.applies_to_roles is not None
        else list(row.applies_to_roles)
    )

    if next_scope_kind == "all" and next_scope_values:
        raise ValueError("scope_values must be empty when scope_kind='all'")
    if next_scope_kind != "all" and not next_scope_values:
        raise ValueError(
            f"scope_values must list at least one item when scope_kind={next_scope_kind!r}"
        )

    await _validate_scope_and_subjects(
        session,
        scope_kind=next_scope_kind,
        scope_values=next_scope_values,
        applies_to_roles=next_applies_to_roles,
    )

    if body.description is not None:
        row.description = body.description
    if body.enabled is not None:
        row.enabled = body.enabled
    row.scope_kind = next_scope_kind
    row.scope_values = next_scope_values
    row.applies_to_roles = next_applies_to_roles
    if body.condition is not None:
        row.condition = body.condition.model_dump(exclude_none=True)
    if body.message is not None:
        row.message = body.message

    await session.commit()
    await session.refresh(row)
    return _to_row(row)


async def delete_policy(session: AsyncSession, policy_id: int) -> bool:
    result = await session.execute(delete(Policy).where(Policy.id == policy_id))
    await session.commit()
    return result.rowcount > 0


async def evaluate(session: AsyncSession, req: EvaluateRequest) -> EvaluateResponse:
    """Dry-run every enabled policy against the synthetic context.

    Pure read: never writes. Used by the editor's "Preview" button.
    """
    rows = (
        await session.execute(select(Policy).where(Policy.enabled.is_(True)))
    ).scalars().all()

    matched: list[PolicyMatch] = []
    for p in rows:
        if evaluator.policy_denies(
            enabled=p.enabled,
            applies_to_roles=list(p.applies_to_roles),
            scope_kind=p.scope_kind,
            scope_values=list(p.scope_values),
            condition=p.condition,
            role=req.role,
            skill=req.skill,
            signals=req.signals,
        ):
            matched.append(
                PolicyMatch(policy_id=p.id, policy_name=p.name, message=p.message)
            )

    return EvaluateResponse(
        decision="deny" if matched else "allow",
        matched=matched,
    )
