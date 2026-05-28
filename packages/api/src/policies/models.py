"""Pydantic schemas for policies + the condition AST.

The AST is intentionally tiny: a single-level ``all_of`` or ``any_of``
list of ``{signal, op, value}`` predicates. That's enough to express
"temperature > 30 AND kids in view" without forcing the UI to render a
recursive tree.

Validation enforces that:

* Every referenced signal exists in :mod:`src.policies.signals`.
* The operator is valid for the signal's :class:`SignalKind`
  (``<``/``>`` only on numbers; ``in``/``not_in`` take a list).
* Values match the signal's declared type and, for enums, are one of
  the declared values.

Existence of role / category / skill names referenced from ``scope`` /
``applies_to_roles`` is checked async in :mod:`src.policies.service`.
"""
from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.policies.signals import SIGNALS_BY_NAME, Signal, SignalKind

NAME_PATTERN = re.compile(r"^[a-z0-9_]{1,64}$")

Operator = Literal["==", "!=", "<", "<=", ">", ">=", "in", "not_in"]
ScopeKind = Literal["all", "categories", "skills"]

MAX_PREDICATES = 16


class Predicate(BaseModel):
    """One leaf condition: ``<signal> <op> <value>``."""

    model_config = ConfigDict(extra="forbid")

    signal: str
    op: Operator
    value: Any

    @model_validator(mode="after")
    def _validate_against_signal(self) -> "Predicate":
        sig = SIGNALS_BY_NAME.get(self.signal)
        if sig is None:
            raise ValueError(f"unknown signal {self.signal!r}")
        _check_op_and_value(sig, self.op, self.value)
        return self


def _check_op_and_value(sig: Signal, op: Operator, value: Any) -> None:
    if op in ("in", "not_in"):
        if not isinstance(value, list):
            raise ValueError(f"operator {op!r} requires a list value")
        if not value:
            raise ValueError(f"operator {op!r} requires a non-empty list")
        for v in value:
            _check_scalar(sig, v)
        return
    if op in ("<", "<=", ">", ">="):
        if sig.kind != SignalKind.NUMBER:
            raise ValueError(
                f"operator {op!r} is only valid for number signals, "
                f"{sig.name!r} is {sig.kind.value}"
            )
    _check_scalar(sig, value)


def _check_scalar(sig: Signal, value: Any) -> None:
    if sig.kind == SignalKind.NUMBER:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"signal {sig.name!r} expects a number, got {type(value).__name__}")
    elif sig.kind == SignalKind.BOOL:
        if not isinstance(value, bool):
            raise ValueError(f"signal {sig.name!r} expects a boolean")
    elif sig.kind == SignalKind.STRING:
        if not isinstance(value, str):
            raise ValueError(f"signal {sig.name!r} expects a string")
    elif sig.kind == SignalKind.ENUM:
        if not isinstance(value, str):
            raise ValueError(f"signal {sig.name!r} expects a string")
        if sig.enum_values and value not in sig.enum_values:
            raise ValueError(
                f"signal {sig.name!r} value must be one of {list(sig.enum_values)}"
            )


class Condition(BaseModel):
    """Top-level: exactly one of ``all_of`` (AND) or ``any_of`` (OR)."""

    model_config = ConfigDict(extra="forbid")

    all_of: list[Predicate] | None = None
    any_of: list[Predicate] | None = None

    @model_validator(mode="after")
    def _validate_shape(self) -> "Condition":
        has_all = self.all_of is not None
        has_any = self.any_of is not None
        if has_all == has_any:
            raise ValueError("condition must have exactly one of 'all_of' or 'any_of'")
        terms = self.all_of if has_all else self.any_of
        assert terms is not None
        if not terms:
            raise ValueError("condition must contain at least one predicate")
        if len(terms) > MAX_PREDICATES:
            raise ValueError(f"condition has too many predicates (max {MAX_PREDICATES})")
        return self


class PolicyCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Annotated[str, Field(min_length=1, max_length=64)]
    description: Annotated[str | None, Field(default=None, max_length=512)] = None
    enabled: bool = True
    scope_kind: ScopeKind
    scope_values: list[str] = Field(default_factory=list, max_length=64)
    applies_to_roles: list[str] = Field(default_factory=list, max_length=32)
    condition: Condition
    message: Annotated[str | None, Field(default=None, max_length=512)] = None

    @field_validator("name")
    @classmethod
    def _check_name(cls, v: str) -> str:
        if not NAME_PATTERN.match(v):
            raise ValueError("name must be lowercase snake_case ([a-z0-9_]+), 1-64 chars")
        return v

    @model_validator(mode="after")
    def _check_scope(self) -> "PolicyCreate":
        if self.scope_kind == "all":
            if self.scope_values:
                raise ValueError("scope_values must be empty when scope_kind='all'")
        else:
            if not self.scope_values:
                raise ValueError(
                    f"scope_values must list at least one item when scope_kind={self.scope_kind!r}"
                )
            # dedupe, preserve order
            self.scope_values = list(dict.fromkeys(self.scope_values))
        self.applies_to_roles = list(dict.fromkeys(self.applies_to_roles))
        return self


class PolicyPatch(BaseModel):
    """All fields optional. Only provided fields are updated."""

    model_config = ConfigDict(extra="forbid")

    description: Annotated[str | None, Field(default=None, max_length=512)] = None
    enabled: bool | None = None
    scope_kind: ScopeKind | None = None
    scope_values: list[str] | None = None
    applies_to_roles: list[str] | None = None
    condition: Condition | None = None
    message: Annotated[str | None, Field(default=None, max_length=512)] = None


class PolicyRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    enabled: bool
    scope_kind: str
    scope_values: list[str]
    applies_to_roles: list[str]
    condition: Condition
    message: str | None = None
    created_at: datetime
    updated_at: datetime


# --- signal catalog response ---


class SignalInfo(BaseModel):
    name: str
    kind: str
    source: str
    description: str
    unit: str | None = None
    enum_values: list[str] | None = None
    default_when_missing: Any = None


class SignalCatalogResponse(BaseModel):
    signals: list[SignalInfo]
    operators: list[str]


# --- evaluation (dry-run) ---


class EvaluateRequest(BaseModel):
    """Dry-run all enabled policies against a synthetic context.

    Used by the UI to preview "what would happen if temperature = 35 and
    kids_detected = true and role = guest tries to call relative_move?".
    """

    model_config = ConfigDict(extra="forbid")

    skill: Annotated[str, Field(min_length=1, max_length=128)]
    role: Annotated[str | None, Field(default=None, max_length=32)] = None
    signals: dict[str, Any] = Field(default_factory=dict)


class PolicyMatch(BaseModel):
    policy_id: int
    policy_name: str
    message: str | None = None


class EvaluateResponse(BaseModel):
    decision: Literal["allow", "deny"]
    matched: list[PolicyMatch]
