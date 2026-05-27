"""NL-to-Recipe synthesis via pydantic-ai on OpenAI GPT-5.5.

Pydantic AI's typed output guarantees the LLM emits a JSON object that
validates against `Recipe`. We re-validate on persistence anyway since the
agent may pick a `name` that collides with something on disk; that's caught
in the service layer.
"""
from __future__ import annotations

from functools import lru_cache
import os

from pydantic_ai import Agent

from src.recipes.models import Recipe, RecipeDraftRequest

SYSTEM_PROMPT = """\
You synthesise robot perception "recipes" as structured JSON for a learned-skills
runtime.

Schema rules:
- `name` MUST be lowercase snake_case (a-z, 0-9, underscore), <= 64 chars, and
  derive from the user's description (or the optional name_hint).
- `description` is a short human sentence.
- `mode` is either "vlm" (vision-language model, free-form natural language
  query) or "yoloe" (closed-vocabulary detector, list of object class names).
- Pick `mode = "yoloe"` ONLY when the description maps cleanly to a small,
  closed list of concrete named objects (e.g. "saw blade, hammer, ladder").
  In that case populate `yoloe_prompts` with those exact class names and
  leave `vlm_query` empty.
- Otherwise pick `mode = "vlm"` and write a free-form `vlm_query` describing
  what to look for, the way you would describe it to a human. Leave
  `yoloe_prompts` as an empty list.
- Always set `exemplar_image_refs` to an empty list and `created_by` to
  "anonymous". `version` is always 1.

Be concrete and specific. Never include explanatory prose outside the JSON.
"""


@lru_cache(maxsize=1)
def _agent() -> Agent[None, Recipe]:
    """Lazy-init the OpenAI agent — defers the API-key check until first use."""
    model = os.environ.get("OPENAI_MODEL", "openai:gpt-5.5")
    return Agent(model, output_type=Recipe, system_prompt=SYSTEM_PROMPT)


async def draft_recipe(request: RecipeDraftRequest) -> Recipe:
    """Ask the LLM to synthesise a Recipe. Does not persist."""
    user_prompt = (
        f"Description: {request.description.strip()}\n"
        f"Name hint: {request.name_hint or '(none — pick a sensible snake_case name)'}"
    )
    result = await _agent().run(user_prompt)
    return result.output
