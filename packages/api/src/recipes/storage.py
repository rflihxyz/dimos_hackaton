"""Atomic JSON read/write/delete for the recipes shared volume.

The dimos side uses an mtime-keyed cache, so we MUST write a temp file and
then `os.replace` it; otherwise dimos can read a half-written file and
poison its cache.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
import re

import aiofiles

from src.recipes.models import Recipe

NAME_RE = re.compile(r"^[a-z0-9_]{1,64}$")


def recipes_dir() -> Path:
    raw = os.environ.get("RECIPES_DIR", "/recipes")
    path = Path(raw)
    path.mkdir(parents=True, exist_ok=True)
    return path


def recipe_path(name: str) -> Path:
    if not NAME_RE.match(name):
        raise ValueError(f"Invalid recipe name {name!r}")
    return recipes_dir() / f"{name}.json"


async def write_recipe(recipe: Recipe) -> Path:
    path = recipe_path(recipe.name)
    tmp = path.with_suffix(".json.tmp")
    payload = json.dumps(recipe.model_dump(mode="json"), indent=2)
    async with aiofiles.open(tmp, "w", encoding="utf-8") as f:
        await f.write(payload)
    os.replace(tmp, path)
    return path


async def delete_recipe(name: str) -> bool:
    path = recipe_path(name)
    try:
        path.unlink()
        return True
    except FileNotFoundError:
        return False


async def read_recipe(name: str) -> Recipe | None:
    path = recipe_path(name)
    try:
        async with aiofiles.open(path, "r", encoding="utf-8") as f:
            text = await f.read()
    except FileNotFoundError:
        return None
    return Recipe.model_validate_json(text)
