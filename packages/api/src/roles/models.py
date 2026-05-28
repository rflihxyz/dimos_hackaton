"""Pydantic schemas for the RBAC roles surface.

Permission entries are MCP skill names (sourced from the ``mcp_tools``
catalog) plus the special wildcard token ``"*"``. Pydantic only enforces
*structural* validity here — non-empty, non-duplicate strings of bounded
length. Existence in the catalog is checked async in
``src.roles.service`` because that needs DB access.
"""
from __future__ import annotations

import re
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

NAME_PATTERN = re.compile(r"^[a-z0-9_]{1,32}$")
PERMISSION_PATTERN = re.compile(r"^(\*|[A-Za-z_][A-Za-z0-9_]{0,127})$")


def _validate_permissions(values: list[str]) -> list[str]:
    """Normalise + structurally validate a role's permission list.

    Strips whitespace, drops empties, deduplicates while preserving order.
    Each remaining entry must match :data:`PERMISSION_PATTERN` (the
    wildcard or a Python-identifier-shaped skill name). Existence in the
    MCP catalog is the service layer's job.
    """
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in values:
        v = raw.strip()
        if not v:
            continue
        if not PERMISSION_PATTERN.match(v):
            raise ValueError(
                f"invalid permission {v!r}; expected '*' or an MCP tool name "
                f"(letters, digits, underscores, max 128 chars)"
            )
        if v not in seen:
            seen.add(v)
            cleaned.append(v)
    return cleaned


class RoleCreate(BaseModel):
    """Body for `POST /roles`."""

    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, Field(min_length=1, max_length=32)]
    permissions: Annotated[list[str], Field(default_factory=list, max_length=256)]

    @field_validator("name")
    @classmethod
    def _validate_name(cls, v: str) -> str:
        if not NAME_PATTERN.match(v):
            raise ValueError("name must be lowercase snake_case ([a-z0-9_]+), 1-32 chars")
        return v

    @field_validator("permissions")
    @classmethod
    def _validate_perms(cls, v: list[str]) -> list[str]:
        return _validate_permissions(v)


class RolePatch(BaseModel):
    """Body for `PATCH /roles/{name}`. Only `permissions` is mutable."""

    model_config = ConfigDict(extra="forbid")

    permissions: Annotated[list[str], Field(max_length=256)]

    @field_validator("permissions")
    @classmethod
    def _validate_perms(cls, v: list[str]) -> list[str]:
        return _validate_permissions(v)


class RoleRow(BaseModel):
    """A persisted role as returned by the REST surface."""

    name: str
    permissions: list[str]
