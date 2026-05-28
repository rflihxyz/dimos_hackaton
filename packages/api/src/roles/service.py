"""Async DB operations for the RBAC `roles` table."""
from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.mcp_tools.db_models import McpTool
from src.rbac.db_models import Role
from src.rbac.taxonomy import WILDCARD
from src.roles.models import RoleCreate, RolePatch, RoleRow


def _to_row(r: Role) -> RoleRow:
    return RoleRow(name=r.name, permissions=list(r.permissions))


async def list_roles(session: AsyncSession) -> list[RoleRow]:
    rows = (await session.execute(select(Role).order_by(Role.name))).scalars().all()
    return [_to_row(r) for r in rows]


async def get_role(session: AsyncSession, name: str) -> RoleRow | None:
    row = (
        await session.execute(select(Role).where(Role.name == name))
    ).scalar_one_or_none()
    return _to_row(row) if row else None


async def _ensure_permissions_in_catalog(
    session: AsyncSession, permissions: list[str]
) -> None:
    """Reject permission entries that don't refer to a known MCP tool.

    The wildcard ``"*"`` is exempt. Raises :class:`ValueError` listing the
    offending entries; the router translates that to a 422.

    Catalog freshness is the operator's responsibility — call
    ``POST /mcp/tools/sync`` to refresh from a live DimOS before granting
    skills that have only just been added to a blueprint.
    """
    skill_names = [p for p in permissions if p != WILDCARD]
    if not skill_names:
        return
    rows = (
        await session.execute(
            select(McpTool.name).where(McpTool.name.in_(skill_names))
        )
    ).scalars().all()
    known = set(rows)
    unknown = sorted(set(skill_names) - known)
    if unknown:
        raise ValueError(
            "unknown skill(s) not in MCP catalog: "
            + ", ".join(repr(s) for s in unknown)
            + " (run POST /mcp/tools/sync if dimos has new skills)"
        )


async def create_role(session: AsyncSession, body: RoleCreate) -> RoleRow:
    """Insert a role. Raises ValueError if `name` collides or any
    permission entry is not a known skill in ``mcp_tools``.
    """
    existing = (
        await session.execute(select(Role).where(Role.name == body.name))
    ).scalar_one_or_none()
    if existing is not None:
        raise ValueError(f"Role {body.name!r} already exists")

    await _ensure_permissions_in_catalog(session, body.permissions)

    row = Role(name=body.name, permissions=list(body.permissions))
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return _to_row(row)


async def update_role(session: AsyncSession, name: str, body: RolePatch) -> RoleRow | None:
    row = (
        await session.execute(select(Role).where(Role.name == name))
    ).scalar_one_or_none()
    if row is None:
        return None

    await _ensure_permissions_in_catalog(session, body.permissions)

    row.permissions = list(body.permissions)
    await session.commit()
    await session.refresh(row)
    return _to_row(row)


async def delete_role(session: AsyncSession, name: str) -> bool:
    """Delete a role. Returns False if not found, raises ValueError if any
    user still references the role (FK violation, no ON DELETE clause).
    """
    try:
        result = await session.execute(delete(Role).where(Role.name == name))
        await session.commit()
    except IntegrityError as e:
        await session.rollback()
        raise ValueError(f"Role {name!r} is still in use by one or more users") from e
    return result.rowcount > 0
