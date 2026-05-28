"""REST surface for the persisted MCP tool catalog."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_session
from src.dimos_client import get_mcp_adapter
from src.mcp_tools import service
from src.mcp_tools.models import McpToolListResponse, SyncResponse

router = APIRouter(prefix="/mcp", tags=["mcp"])


@router.get("/tools", response_model=McpToolListResponse)
async def list_tools(
    session: AsyncSession = Depends(get_session),
) -> McpToolListResponse:
    """Return the persisted catalog with taxonomy annotations.

    This reads from Postgres and never talks to MCP, so it works (and
    keeps working) even if DimOS is offline. Use ``POST /mcp/tools/sync``
    to refresh.
    """
    return await service.list_tools(session)


@router.post(
    "/tools/sync",
    response_model=SyncResponse,
    status_code=status.HTTP_200_OK,
)
async def sync_tools(
    session: AsyncSession = Depends(get_session),
) -> SyncResponse:
    """Pull the live tool list from MCP and replace our snapshot.

    Returns 502 if MCP is unreachable (we don't want to silently leave
    the operator with stale data).
    """
    adapter = get_mcp_adapter()
    try:
        return await service.sync_from_mcp(session, adapter)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"MCP sync failed: {e}",
        ) from e
