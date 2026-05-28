"""Discovery + read operations for the MCP tool catalog."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.dimos_client import AsyncMcpAdapter
from src.mcp_tools.db_models import McpTool
from src.mcp_tools.models import McpToolListResponse, McpToolRow, SyncResponse
from src.rbac.taxonomy import (
    ALWAYS_ALLOWED_SKILLS,
    SKILL_TO_CATEGORY,
)


def _annotate(row: McpTool) -> McpToolRow:
    cat = SKILL_TO_CATEGORY.get(row.name)
    is_always_allowed = row.name in ALWAYS_ALLOWED_SKILLS
    return McpToolRow(
        name=row.name,
        description=row.description,
        input_schema=row.input_schema,
        first_seen_at=row.first_seen_at,
        last_seen_at=row.last_seen_at,
        category=cat.value if cat else None,
        is_always_allowed=is_always_allowed,
        is_categorized=cat is not None or is_always_allowed,
    )


async def list_tools(session: AsyncSession) -> McpToolListResponse:
    rows = (
        (await session.execute(select(McpTool).order_by(McpTool.name)))
        .scalars()
        .all()
    )
    items = [_annotate(r) for r in rows]
    last_synced_at = max((r.last_seen_at for r in rows), default=None)
    uncategorized = sum(1 for it in items if not it.is_categorized)
    return McpToolListResponse(
        items=items,
        total=len(items),
        last_synced_at=last_synced_at,
        uncategorized_count=uncategorized,
    )


async def sync_from_mcp(
    session: AsyncSession, adapter: AsyncMcpAdapter
) -> SyncResponse:
    """Fetch the live tool list from MCP and replace our snapshot.

    Behaviour:
      * Each tool name gets upserted with its current description /
        input schema; ``last_seen_at`` ticks to ``now()``.
      * Any persisted tool whose name is *not* in the live response gets
        hard-deleted — but only if the live response had at least one
        tool. A zero-tool response is treated as "MCP is degraded" and
        leaves the catalog untouched (``skipped=True``).
      * Raises whatever the adapter raises if MCP is unreachable. Callers
        decide whether to swallow that (best-effort startup sync) or
        propagate it (manual ``POST /mcp/tools/sync``).
    """
    raw = await adapter.list_tools()

    if not raw:
        # Probably a degraded MCP — keep the last known catalog.
        last_synced_at = await _max_last_seen(session) or datetime.now(timezone.utc)
        return SyncResponse(
            upserted=0,
            deleted=0,
            last_synced_at=last_synced_at,
            skipped=True,
        )

    seen_names: set[str] = set()
    upserted = 0
    for tool in raw:
        name = tool.get("name")
        if not isinstance(name, str) or not name:
            continue
        seen_names.add(name)
        stmt = pg_insert(McpTool).values(
            name=name,
            description=tool.get("description"),
            input_schema=tool.get("inputSchema"),
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[McpTool.name],
            set_={
                "description": stmt.excluded.description,
                "input_schema": stmt.excluded.input_schema,
                "last_seen_at": func.now(),
            },
        )
        await session.execute(stmt)
        upserted += 1

    delete_result = await session.execute(
        delete(McpTool).where(McpTool.name.notin_(seen_names))
    )
    deleted = delete_result.rowcount or 0

    await session.commit()

    last_synced_at = await _max_last_seen(session) or datetime.now(timezone.utc)
    return SyncResponse(
        upserted=upserted,
        deleted=deleted,
        last_synced_at=last_synced_at,
        skipped=False,
    )


async def _max_last_seen(session: AsyncSession) -> datetime | None:
    return (
        await session.execute(select(func.max(McpTool.last_seen_at)))
    ).scalar_one_or_none()
