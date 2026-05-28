"""Fixed taxonomy of guardable robot actions.

Permissions on a role are stored as **MCP skill names** (sourced from the
``mcp_tools`` catalog) plus the special wildcard ``"*"``. This module
exists alongside that storage to give the UI a stable grouping
("observe"/"watch"/"move"/"speak") so operators can reason about a role
at a glance instead of squinting at a flat list of skill names.

Three layers:

1. :class:`ActionCategory` + copy — the fixed grouping used by the
   frontend to bucket skills.
2. :data:`SKILL_TO_CATEGORY` — maps each known DimOS MCP skill name to
   its category. Skills present in ``mcp_tools`` but missing here render
   as "Uncategorized" in the UI; that's a signal to extend this map.
3. :data:`ALWAYS_ALLOWED_SKILLS` — utility skills that bypass RBAC
   entirely (e.g. ``current_time``).

The wildcard ``"*"`` in a role's permissions grants every skill, present
or future. It is the only non-skill-name token allowed in a role.
"""

from __future__ import annotations

from enum import Enum
from typing import Final


class ActionCategory(str, Enum):
    """The fixed set of guardable action categories.

    Inherits from ``str`` so values serialise cleanly to JSON / Postgres
    text arrays and can be compared with raw strings.
    """

    OBSERVE = "observe"
    WATCH = "watch"
    MOVE = "move"
    SPEAK = "speak"


WILDCARD: Final[str] = "*"
"""Special permission token granting every category."""


CATEGORY_LABELS: Final[dict[ActionCategory, str]] = {
    ActionCategory.OBSERVE: "Observe",
    ActionCategory.WATCH: "Watch",
    ActionCategory.MOVE: "Move",
    ActionCategory.SPEAK: "Speak",
}


CATEGORY_DESCRIPTIONS: Final[dict[ActionCategory, str]] = {
    ActionCategory.OBSERVE: (
        "Take a one-off look. Snapshots, scene descriptions, listing what the "
        "robot already knows how to recognise. Read-only."
    ),
    ActionCategory.WATCH: (
        "Run a continuous perception loop — watch for a person, an object, or "
        "a custom recipe — until told to stop. No physical motion."
    ),
    ActionCategory.MOVE: (
        "Drive or pose the robot: navigate to a place, walk, sit, dance, "
        "follow a person. Anything that moves the body."
    ),
    ActionCategory.SPEAK: (
        "Make the robot say something out loud through its speaker."
    ),
}


CATEGORY_EXAMPLES: Final[dict[ActionCategory, list[str]]] = {
    ActionCategory.OBSERVE: [
        "What do you see right now?",
        "List the skills you've learned.",
    ],
    ActionCategory.WATCH: [
        "Watch for a person in a red shirt.",
        "Stop watching.",
    ],
    ActionCategory.MOVE: [
        "Walk forward two metres.",
        "Sit down.",
        "Follow the person in front of you.",
    ],
    ActionCategory.SPEAK: [
        "Say 'hello, world'.",
    ],
}


SKILL_TO_CATEGORY: Final[dict[str, ActionCategory]] = {
    # OBSERVE — passive, single-shot perception / introspection.
    "list_learned_skills": ActionCategory.OBSERVE,
    # WATCH — continuous perception loops.
    "look_out_for": ActionCategory.WATCH,
    "stop_looking_out": ActionCategory.WATCH,
    "lookout_learned_skill": ActionCategory.WATCH,
    # MOVE — anything that displaces or poses the robot body.
    "relative_move": ActionCategory.MOVE,
    "execute_sport_command": ActionCategory.MOVE,
    "navigate_with_text": ActionCategory.MOVE,
    "tag_location": ActionCategory.MOVE,
    "stop_navigation": ActionCategory.MOVE,
    "follow_human": ActionCategory.MOVE,
    "stop_following": ActionCategory.MOVE,
    # SPEAK — audio output.
    "speak": ActionCategory.SPEAK,
}


ALWAYS_ALLOWED_SKILLS: Final[frozenset[str]] = frozenset(
    {
        # Pure utility, no externally observable side effect.
        "current_time",
        "wait",
    }
)


# Canonical seed roles. The broker upserts these on startup so a fresh
# pg volume always has at least the admin role available; everyone else
# starts empty and is configured via the /roles UI once the operator has
# synced the MCP tool catalogue.
SEED_ROLES: Final[dict[str, list[str]]] = {
    "admin": [WILDCARD],
    "operator": [],
    "guest": [],
}


def category_for(skill_name: str) -> ActionCategory | None:
    """Return the category gating ``skill_name``, or ``None`` if ungated.

    Unknown skills also return ``None``: the caller decides whether to
    treat that as deny-by-default or allow-by-default. The MCP enforcement
    layer (when added) should default to deny.
    """
    return SKILL_TO_CATEGORY.get(skill_name)


def is_always_allowed(skill_name: str) -> bool:
    return skill_name in ALWAYS_ALLOWED_SKILLS


def role_allows_skill(permissions: list[str], skill_name: str) -> bool:
    """Decide if a role with the given ``permissions`` may call ``skill_name``.

    Permissions are stored as MCP skill names. Rules:

      * Skills in :data:`ALWAYS_ALLOWED_SKILLS` are always allowed.
      * ``"*"`` in permissions grants every skill.
      * Otherwise the skill name itself must appear in ``permissions``.
    """
    if is_always_allowed(skill_name):
        return True
    if WILDCARD in permissions:
        return True
    return skill_name in permissions
