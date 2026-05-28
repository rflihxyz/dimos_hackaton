"""Pydantic schemas for the RBAC users surface."""
from __future__ import annotations

from datetime import datetime
import re
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

USERNAME_PATTERN = re.compile(r"^[a-z0-9_]{1,32}$")


class UserCreate(BaseModel):
    """Body for `POST /users` (no face image — that's a separate upload)."""

    model_config = ConfigDict(extra="forbid")

    username: Annotated[str, Field(min_length=1, max_length=32)]
    full_name: Annotated[str, Field(min_length=1, max_length=128)]
    role: Annotated[str, Field(min_length=1, max_length=32)]

    @field_validator("username")
    @classmethod
    def _validate_username(cls, v: str) -> str:
        if not USERNAME_PATTERN.match(v):
            raise ValueError(
                "username must be lowercase snake_case ([a-z0-9_]+), 1-32 chars"
            )
        return v


class UserPatch(BaseModel):
    """Body for `PATCH /users/{username}`. Username is immutable."""

    model_config = ConfigDict(extra="forbid")

    full_name: Annotated[str | None, Field(default=None, min_length=1, max_length=128)] = None
    role: Annotated[str | None, Field(default=None, min_length=1, max_length=32)] = None


class UserRow(BaseModel):
    """A persisted user as returned by the REST surface.

    `face_embedding` is intentionally omitted: it's potentially large and
    only meaningful to the dimos side. Use `has_face` instead.
    """

    username: str
    full_name: str
    role: str
    has_face_image: bool
    has_face_embedding: bool
    created_at: datetime
