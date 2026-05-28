"""Signal registry: the contextual facts policies can read.

Signals are defined in code (like the action taxonomy in
:mod:`src.rbac.taxonomy`), not in the database. The frontend pulls this
catalog via ``GET /policies/signals`` and uses it to build and validate
policy conditions.

When you add a runtime signal source (a sensor MCP tool, a watch recipe
that publishes a boolean, etc.) register it here so operators can
reference it in policies. ``default_when_missing`` is the value the
evaluator returns when no live reading is available — bias it toward
the safer decision for the kind of guard you expect.

The actual wiring from signal name → live value lives in the runtime
adapter (not yet implemented); this module is the schema/contract.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Final


class SignalKind(str, Enum):
    NUMBER = "number"
    BOOL = "bool"
    ENUM = "enum"
    STRING = "string"


class SignalSource(str, Enum):
    """Where the live value of a signal comes from at runtime."""

    SENSOR = "sensor"           # Physical sensor (temperature, battery, ...).
    VLA_RECIPE = "vla_recipe"   # A watch recipe under .recipes/ that publishes a bool/count.
    TIME = "time"               # Derived from the robot's clock.
    USER_CONTEXT = "user_context"  # State the agent tracks (current room, current user, ...).


@dataclass(frozen=True)
class Signal:
    name: str
    kind: SignalKind
    source: SignalSource
    description: str
    unit: str | None = None
    enum_values: tuple[str, ...] | None = None
    default_when_missing: Any = None


SIGNALS: Final[tuple[Signal, ...]] = (
    Signal(
        name="room_temperature",
        kind=SignalKind.NUMBER,
        source=SignalSource.SENSOR,
        description="Current ambient room temperature.",
        unit="°C",
        default_when_missing=None,
    ),
    Signal(
        name="battery_pct",
        kind=SignalKind.NUMBER,
        source=SignalSource.SENSOR,
        description="Robot battery state of charge.",
        unit="%",
        default_when_missing=0,
    ),
    Signal(
        name="kids_detected",
        kind=SignalKind.BOOL,
        source=SignalSource.VLA_RECIPE,
        description=(
            "True while the children-detection watch recipe is matching. "
            "Defaults to True when no recent reading is available — fail safe."
        ),
        default_when_missing=True,
    ),
    Signal(
        name="person_count",
        kind=SignalKind.NUMBER,
        source=SignalSource.VLA_RECIPE,
        description="How many people are currently in the robot's view.",
        default_when_missing=0,
    ),
    Signal(
        name="time_of_day",
        kind=SignalKind.ENUM,
        source=SignalSource.TIME,
        description="Coarse part of the day, derived from the robot's clock.",
        enum_values=("morning", "afternoon", "evening", "night"),
        default_when_missing="afternoon",
    ),
    Signal(
        name="current_room",
        kind=SignalKind.STRING,
        source=SignalSource.USER_CONTEXT,
        description="Tag of the room the robot was last navigated to.",
        default_when_missing="unknown",
    ),
)


SIGNALS_BY_NAME: Final[dict[str, Signal]] = {s.name: s for s in SIGNALS}


def get_signal(name: str) -> Signal | None:
    return SIGNALS_BY_NAME.get(name)
