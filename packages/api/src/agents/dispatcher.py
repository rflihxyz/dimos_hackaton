"""Single-robot chat turn dispatcher.

A user POSTs ``/agents/send`` → we acquire the global ``_turn_lock`` →
stamp the active user into :mod:`src.mcp_gateway.session` so the gateway
can attribute tool calls → publish the message to dimos's agent via
``tools/call agent_send`` → wait for the agent to go idle → clear the
active user → return.

We don't have a direct "agent idle" signal from dimos over HTTP, so
idle is approximated by **silence on the gateway**: when no ``tools/
call`` has been seen for ``_IDLE_WINDOW`` seconds (after at least one
call, or after ``_INITIAL_GRACE`` if no tool was ever called), we
consider the turn done. A hard upper bound of ``_TURN_MAX_SECONDS``
prevents a stuck agent from holding the lock forever.

This is heuristic but correct enough for a single physical robot: the
robot can only do one thing at a time anyway, and serialising at the
broker maps cleanly to that.
"""
from __future__ import annotations

import asyncio
import logging
import time

from src.dimos_client import get_mcp_adapter
from src.mcp_gateway import session as gw_session
from src.mcp_gateway.session import ActiveUser

log = logging.getLogger(__name__)

# Tunables. Generous defaults; if turns feel sluggish, lower _IDLE_WINDOW.
_TURN_MAX_SECONDS = 90.0
_IDLE_WINDOW = 4.0
_INITIAL_GRACE = 6.0

_turn_lock = asyncio.Lock()
_last_activity_monotonic: float = 0.0


def mark_gateway_activity() -> None:
    """Called by the MCP gateway on every ``tools/call`` it handles."""
    global _last_activity_monotonic
    _last_activity_monotonic = time.monotonic()


class TurnResult:
    """Bag of stuff a chat turn produces. Trivial; could be a Pydantic
    model but we keep the dispatcher dependency-light."""

    __slots__ = ("ack", "events")

    def __init__(self, ack: str, events: list[str]) -> None:
        self.ack = ack
        self.events = events


async def submit(user: ActiveUser, message: str) -> TurnResult:
    """Run one chat turn end-to-end. Returns when the agent appears idle."""
    async with _turn_lock:
        log.info(
            "dispatcher start user=%s role=%s message=%r",
            user.username,
            user.role,
            message[:80],
        )
        gw_session.set_active(user)
        global _last_activity_monotonic
        _last_activity_monotonic = 0.0
        turn_start = time.monotonic()

        adapter = get_mcp_adapter()
        try:
            ack = await adapter.call_tool_text(
                "agent_send", arguments={"message": message}
            )
        except Exception:
            gw_session.clear_active()
            log.exception("dispatcher agent_send failed")
            raise

        try:
            await _wait_for_idle(turn_start)
            events = gw_session.drain_events()
        finally:
            gw_session.clear_active()

        log.info(
            "dispatcher end user=%s events=%d ack=%r",
            user.username,
            len(events),
            ack[:80],
        )
        return TurnResult(ack=ack, events=events)


async def _wait_for_idle(turn_start: float) -> None:
    deadline = turn_start + _TURN_MAX_SECONDS
    while True:
        now = time.monotonic()
        if now >= deadline:
            log.warning("dispatcher turn timeout, releasing lock")
            return
        if _last_activity_monotonic == 0.0:
            if now - turn_start >= _INITIAL_GRACE:
                return
        else:
            if now - _last_activity_monotonic >= _IDLE_WINDOW:
                return
        await asyncio.sleep(0.5)
