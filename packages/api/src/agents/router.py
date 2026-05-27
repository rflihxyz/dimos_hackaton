"""Agent chat endpoints (thin MCP proxies)."""
from __future__ import annotations

from collections.abc import AsyncIterator
import json
import uuid

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
import httpx
from pydantic import BaseModel, Field

from src.dimos_client import get_mcp_adapter, get_mcp_sse_url

router = APIRouter(prefix="/agents", tags=["agents"])


class AgentSendRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4096)


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


@router.post("/send")
async def agent_send(body: AgentSendRequest) -> dict:
    adapter = get_mcp_adapter()
    try:
        text = await adapter.call_tool_text(
            "agent_send", arguments={"message": body.message}
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"dimos unreachable: {e}",
        ) from e
    return {"status": "sent", "response": text}


@router.get("/stream")
async def agent_stream() -> StreamingResponse:
    """Server-Sent Events proxy of dimos's MCP SSE channel.

    The browser could hit `dimos:9990` directly, but proxying through the
    broker gives us a single CORS-friendly origin and lets us add request
    logging.
    """
    mcp_url = get_mcp_sse_url()

    async def event_stream() -> AsyncIterator[bytes]:
        payload = {
            "jsonrpc": "2.0",
            "id": str(uuid.uuid4()),
            "method": "notifications/subscribe",
        }
        async with httpx.AsyncClient(timeout=None) as client:
            try:
                async with client.stream(
                    "GET",
                    mcp_url,
                    headers={"Accept": "text/event-stream"},
                ) as response:
                    async for chunk in response.aiter_bytes():
                        yield chunk
            except httpx.HTTPError as e:
                err = {"error": str(e)}
                yield f"event: error\ndata: {json.dumps(err)}\n\n".encode()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
