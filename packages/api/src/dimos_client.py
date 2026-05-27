"""Async MCP JSON-RPC client for talking to a running DimOS instance.

Mirrors the surface of `dimos.agents.mcp.mcp_adapter.McpAdapter` but uses
`httpx.AsyncClient` so calls don't block the FastAPI event loop. We do not
import the dimos package from the broker — it carries a heavy ML
dependency tree that would explode the API container image.
"""
from __future__ import annotations

from functools import lru_cache
import os
from typing import Any
import uuid

import httpx


class McpError(RuntimeError):
    """Raised when the MCP server returns a JSON-RPC error."""

    def __init__(self, message: str, code: int | None = None) -> None:
        self.code = code
        super().__init__(message)


class AsyncMcpAdapter:
    def __init__(self, url: str, timeout: float = 30.0) -> None:
        self.url = url
        self.timeout = timeout

    async def call(
        self, method: str, params: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "jsonrpc": "2.0",
            "id": str(uuid.uuid4()),
            "method": method,
        }
        if params:
            payload["params"] = params

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(self.url, json=payload)
            resp.raise_for_status()
            return resp.json()

    async def initialize(self) -> dict[str, Any]:
        return await self.call("initialize")

    async def list_tools(self) -> list[dict[str, Any]]:
        result = self._unwrap(await self.call("tools/list"))
        return result.get("tools", [])

    async def call_tool(
        self, name: str, arguments: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        return self._unwrap(
            await self.call(
                "tools/call",
                {"name": name, "arguments": arguments or {}},
            )
        )

    async def call_tool_text(
        self, name: str, arguments: dict[str, Any] | None = None
    ) -> str:
        result = await self.call_tool(name, arguments)
        content = result.get("content", [])
        if not content:
            return ""
        first = content[0]
        return first.get("text", str(first))

    async def wait_for_ready(self, timeout: float = 0.5) -> bool:
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.post(
                    self.url,
                    json={"jsonrpc": "2.0", "id": "probe", "method": "initialize"},
                )
                return resp.status_code == 200
        except Exception:
            return False

    @staticmethod
    def _unwrap(response: dict[str, Any]) -> dict[str, Any]:
        if "error" in response:
            err = response["error"]
            msg = err.get("message", str(err)) if isinstance(err, dict) else str(err)
            code = err.get("code") if isinstance(err, dict) else None
            raise McpError(msg, code=code)
        return response.get("result", {})

    def __repr__(self) -> str:
        return f"AsyncMcpAdapter(url={self.url!r})"


def _mcp_url() -> str:
    return os.environ.get("DIMOS_MCP_URL", "http://host.docker.internal:9990/mcp")


def _video_base_url() -> str:
    return os.environ.get("DIMOS_VIDEO_URL", "http://host.docker.internal:5555")


@lru_cache(maxsize=1)
def get_mcp_adapter() -> AsyncMcpAdapter:
    return AsyncMcpAdapter(_mcp_url())


def get_video_url() -> str:
    return f"{_video_base_url()}/video_feed/color_image"


def get_agent_sse_url() -> str:
    return f"{_video_base_url()}/text_stream/agent_responses"


def get_mcp_sse_url() -> str:
    return _mcp_url()


def get_browser_mcp_url() -> str:
    """The MCP URL the *browser* should use (localhost, not the docker DNS name)."""
    return os.environ.get(
        "NEXT_PUBLIC_DIMOS_MCP_URL", "http://localhost:9990/mcp"
    )
