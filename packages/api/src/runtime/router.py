"""`GET /runtime` — discovery endpoint for the webapp.

The browser pulls video and the agent text-stream *directly* from dimos
(port 5555). The MCP JSON-RPC endpoint goes through the broker for CORS
and observability. This endpoint just packages those URLs and a quick
liveness probe.
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from src.dimos_client import (
    get_agent_sse_url,
    get_browser_mcp_url,
    get_mcp_adapter,
    get_video_url,
)

router = APIRouter(prefix="/runtime", tags=["runtime"])


class RuntimeInfo(BaseModel):
    video_url: str
    agent_sse_url: str
    mcp_url: str
    dimos_status: str


@router.get("", response_model=RuntimeInfo)
async def runtime_info() -> RuntimeInfo:
    adapter = get_mcp_adapter()
    ready = await adapter.wait_for_ready(timeout=0.5)
    return RuntimeInfo(
        video_url=get_video_url(),
        agent_sse_url=get_agent_sse_url(),
        mcp_url=get_browser_mcp_url(),
        dimos_status="ready" if ready else "down",
    )
