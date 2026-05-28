"""SQLAlchemy row for the `mcp_tools` table.

Owned by ``Base.metadata.create_all`` (see ``src/db.py``). One row per
JSON-RPC tool seen on the configured MCP endpoint. Hard-deleted on sync
when the tool disappears from the live catalog (with a guard against
empty responses — see ``service.sync_from_mcp``).
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.db import Base


class McpTool(Base):
    __tablename__ = "mcp_tools"

    name: Mapped[str] = mapped_column(String(128), primary_key=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Raw JSON Schema as returned by MCP. Stored verbatim so we can
    # inspect what arguments the LLM sees without round-tripping to dimos.
    input_schema: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
