"""Recipe persistence + dimos-live state composition.

Combines:
- Postgres row (source of truth for "this recipe exists in our system")
- JSON file on the shared volume (what dimos actually reads)
- Live MCP `list_learned_skills` output (whether dimos has picked the
  recipe up since it was written)
"""
from __future__ import annotations

import json

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.dimos_client import get_mcp_adapter
from src.recipes import storage
from src.recipes.db_models import RecipeRecord
from src.recipes.models import Recipe, RecipeRow


async def list_recipes(session: AsyncSession) -> list[RecipeRow]:
    rows = (
        (await session.execute(select(RecipeRecord).order_by(RecipeRecord.created_at.desc())))
        .scalars()
        .all()
    )
    live_names = await _live_recipe_names()
    return [
        RecipeRow(
            name=r.name,
            description=r.description,
            status=r.status,
            created_at=r.created_at,
            recipe=Recipe.model_validate(r.json_blob),
            live=r.name in live_names,
        )
        for r in rows
    ]


async def get_recipe(session: AsyncSession, name: str) -> RecipeRow | None:
    row = (
        await session.execute(select(RecipeRecord).where(RecipeRecord.name == name))
    ).scalar_one_or_none()
    if row is None:
        return None
    live_names = await _live_recipe_names()
    return RecipeRow(
        name=row.name,
        description=row.description,
        status=row.status,
        created_at=row.created_at,
        recipe=Recipe.model_validate(row.json_blob),
        live=row.name in live_names,
    )


async def create_recipe(session: AsyncSession, recipe: Recipe) -> RecipeRow:
    """Insert the row + write the JSON file atomically. Raises if name collides."""
    existing = (
        await session.execute(select(RecipeRecord).where(RecipeRecord.name == recipe.name))
    ).scalar_one_or_none()
    if existing is not None:
        raise ValueError(f"Recipe {recipe.name!r} already exists")

    row = RecipeRecord(
        name=recipe.name,
        description=recipe.description,
        json_blob=recipe.model_dump(mode="json"),
        status="active",
    )
    session.add(row)
    await session.flush()

    await storage.write_recipe(recipe)
    await session.commit()
    await session.refresh(row)

    return RecipeRow(
        name=row.name,
        description=row.description,
        status=row.status,
        created_at=row.created_at,
        recipe=recipe,
        live=False,
    )


async def delete_recipe(session: AsyncSession, name: str) -> bool:
    result = await session.execute(delete(RecipeRecord).where(RecipeRecord.name == name))
    file_deleted = await storage.delete_recipe(name)
    await session.commit()
    return result.rowcount > 0 or file_deleted


async def _live_recipe_names() -> set[str]:
    """Return the set of recipe names that dimos has currently loaded.

    Dimos exposes them via `list_learned_skills`. If dimos isn't reachable
    we just return an empty set — every row will be marked `live=False`,
    which the UI renders as a "pending" badge.
    """
    adapter = get_mcp_adapter()
    try:
        text = await adapter.call_tool_text(
            "list_learned_skills",
            arguments={},
        )
    except Exception:
        return set()

    names: set[str] = set()
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("- "):
            continue
        # "- name [mode]: description"
        head = stripped[2:].split(":", 1)[0]
        candidate = head.split(" ", 1)[0].strip()
        if candidate:
            names.add(candidate)
    return names


def invoke_message(name: str) -> str:
    return f"Use the '{name}' learned skill now."


def recipe_to_payload(row: RecipeRow) -> dict:
    return json.loads(row.model_dump_json())
