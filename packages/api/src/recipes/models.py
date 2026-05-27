"""Pydantic models for the v0 recipe schema.

Source of truth shared by the codegen LLM, the REST surface, and the JSON
files written into the shared volume. The schema mirrors the contract pinned
in issues #3 and #4 verbatim.
"""
from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


NAME_PATTERN = re.compile(r"^[a-z0-9_]{1,64}$")

RecipeMode = Literal["vlm", "yoloe"]


class Recipe(BaseModel):
    """A v0 recipe JSON document.

    `name` must match the on-disk file stem and is the value passed to
    `lookout_learned_skill(name=...)` on the dimos side.
    """

    model_config = ConfigDict(extra="ignore")

    name: Annotated[str, Field(min_length=1, max_length=64)]
    description: Annotated[str, Field(min_length=1, max_length=512)]
    mode: RecipeMode
    vlm_query: Annotated[str, Field(default="", max_length=1024)]
    yoloe_prompts: Annotated[list[str], Field(default_factory=list, max_length=32)]
    exemplar_image_refs: Annotated[list[str], Field(default_factory=list, max_length=32)]
    created_at: Annotated[str, Field(default_factory=lambda: datetime.now(tz=timezone.utc).isoformat())]
    created_by: Annotated[str, Field(default="anonymous", max_length=64)]
    version: int = 1

    @field_validator("name")
    @classmethod
    def _validate_name(cls, v: str) -> str:
        if not NAME_PATTERN.match(v):
            raise ValueError(
                "name must be lowercase snake_case ([a-z0-9_]+), 1-64 chars"
            )
        return v


class RecipeDraftRequest(BaseModel):
    """Body for `POST /recipes/draft`."""

    description: Annotated[str, Field(min_length=1, max_length=1024)]
    name_hint: Annotated[str | None, Field(default=None, max_length=64)] = None


class RecipeRow(BaseModel):
    """A persisted recipe as returned by the REST surface."""

    name: str
    description: str
    status: str
    created_at: datetime
    recipe: Recipe
    live: bool = False
