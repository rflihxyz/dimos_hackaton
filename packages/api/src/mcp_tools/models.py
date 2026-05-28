"""Pydantic schemas for the persisted MCP tool catalog."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class McpToolRow(BaseModel):
    """One row of the catalog, annotated with taxonomy info."""

    model_config = ConfigDict(from_attributes=True)

    name: str
    description: str | None = None
    input_schema: dict[str, Any] | None = None
    first_seen_at: datetime
    last_seen_at: datetime

    # Joined at read time from src.rbac.taxonomy — not persisted because
    # the taxonomy is code, not data.
    category: str | None = Field(
        default=None,
        description=(
            "The action category gating this tool, or null if it is either "
            "ungated (utility) or not yet classified."
        ),
    )
    is_always_allowed: bool = Field(
        default=False,
        description="True if the tool is in ALWAYS_ALLOWED_SKILLS (e.g. current_time).",
    )
    is_categorized: bool = Field(
        default=False,
        description=(
            "True iff the tool is recognised by the taxonomy (either has a "
            "category or is in ALWAYS_ALLOWED_SKILLS). False = the tool is "
            "exposed by MCP but the broker does not know how to gate it; "
            "deny-by-default applies."
        ),
    )


class McpToolListResponse(BaseModel):
    items: list[McpToolRow]
    total: int
    last_synced_at: datetime | None = Field(
        default=None,
        description="max(last_seen_at) across all rows, or null if the catalog is empty.",
    )
    uncategorized_count: int = Field(
        description="How many tools the taxonomy doesn't recognise yet.",
    )


class SyncResponse(BaseModel):
    upserted: int
    deleted: int
    last_synced_at: datetime
    skipped: bool = Field(
        default=False,
        description="True if MCP returned 0 tools and we left the catalog untouched.",
    )
