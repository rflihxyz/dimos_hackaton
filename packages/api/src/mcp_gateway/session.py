"""Shared state between the turn dispatcher and the MCP gateway.

Dimos's ``McpClient`` is one shared agent across all users, so its
``tools/call`` requests don't carry a per-user identity. We bridge that
gap by serialising chat turns: the dispatcher takes one user's turn at
a time and stamps the *active user* into module-level state here. The
MCP gateway reads that state on every ``tools/call`` and gates against
it.

Module-level globals are deliberate. The dispatcher holds an asyncio
lock around each turn, so the global is single-writer / single-reader
within the broker process. We don't use a :class:`contextvars.ContextVar`
because the dispatcher task and the gateway request handlers run in
independent asyncio tasks that don't share context.
"""
from __future__ import annotations

from dataclasses import dataclass
import threading


@dataclass(frozen=True)
class ActiveUser:
    user_id: str
    username: str
    role: str


_lock = threading.Lock()
_active: ActiveUser | None = None

# Per-turn event log. The gateway appends one line per gated call (allow
# or deny) and the dispatcher drains it at the end of the turn to return
# to the chat client. Cheap, no persistence, cleared every turn.
_events: list[str] = []


def set_active(user: ActiveUser) -> None:
    global _active
    with _lock:
        _active = user
        _events.clear()


def clear_active() -> None:
    global _active
    with _lock:
        _active = None


def get_active() -> ActiveUser | None:
    with _lock:
        return _active


def record_event(line: str) -> None:
    """Append a one-line summary of a gated call to the active turn's log."""
    with _lock:
        if _active is not None:
            _events.append(line)


def drain_events() -> list[str]:
    """Snapshot then clear the current turn's events."""
    with _lock:
        snapshot = list(_events)
        _events.clear()
        return snapshot
