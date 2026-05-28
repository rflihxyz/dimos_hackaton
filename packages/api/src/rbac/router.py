"""REST surface for the RBAC action taxonomy.

Read-only. The taxonomy is compile-time data (see :mod:`src.rbac.taxonomy`),
so this router exists solely to make it discoverable to the frontend in
one round-trip — both for explaining role permissions to humans and, in
follow-up work, for the agent to introspect what it's allowed to do.
"""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel, Field

from src.rbac.taxonomy import (
    ALWAYS_ALLOWED_SKILLS,
    CATEGORY_DESCRIPTIONS,
    CATEGORY_EXAMPLES,
    CATEGORY_LABELS,
    SKILL_TO_CATEGORY,
    WILDCARD,
    ActionCategory,
)

router = APIRouter(prefix="/rbac", tags=["rbac"])


class CategoryInfo(BaseModel):
    """One row of the action taxonomy."""

    name: str = Field(description="Stable enum value, e.g. 'observe'.")
    label: str = Field(description="Human-readable title for the UI.")
    description: str
    examples: list[str]
    skills: list[str] = Field(
        description="DimOS MCP skill names gated by this category."
    )


class TaxonomyResponse(BaseModel):
    wildcard: str = Field(
        description="Special permission token granting every category.",
    )
    categories: list[CategoryInfo]
    always_allowed_skills: list[str] = Field(
        description="Utility skills that are not gated by any category.",
    )


@router.get("/taxonomy", response_model=TaxonomyResponse)
def get_taxonomy() -> TaxonomyResponse:
    skills_by_category: dict[ActionCategory, list[str]] = {c: [] for c in ActionCategory}
    for skill_name, category in SKILL_TO_CATEGORY.items():
        skills_by_category[category].append(skill_name)
    for skills in skills_by_category.values():
        skills.sort()

    return TaxonomyResponse(
        wildcard=WILDCARD,
        categories=[
            CategoryInfo(
                name=c.value,
                label=CATEGORY_LABELS[c],
                description=CATEGORY_DESCRIPTIONS[c],
                examples=CATEGORY_EXAMPLES[c],
                skills=skills_by_category[c],
            )
            for c in ActionCategory
        ],
        always_allowed_skills=sorted(ALWAYS_ALLOWED_SKILLS),
    )
