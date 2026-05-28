"""Pure-function policy evaluator.

Given a context (subject + skill + signal snapshot) and a set of
policies, return the decision and the list of policies that fired.

Deny-only: any matching enabled policy denies the call. No "allow"
effect, no priority — keep it boring until we actually need more.

The evaluator never reads the database directly; the router loads
policies and calls in. That keeps it pure and trivially testable, and
lets a future MCP-gateway enforcer call the same function with cached
policy rows.
"""
from __future__ import annotations

from typing import Any

from src.policies.signals import SIGNALS_BY_NAME
from src.rbac.taxonomy import SKILL_TO_CATEGORY


def _signal_value(signals: dict[str, Any], name: str) -> Any:
    """Live value if provided, else the signal's ``default_when_missing``."""
    if name in signals:
        return signals[name]
    sig = SIGNALS_BY_NAME.get(name)
    return sig.default_when_missing if sig else None


def _eval_predicate(pred: dict[str, Any], signals: dict[str, Any]) -> bool:
    sig_name = pred["signal"]
    op = pred["op"]
    expected = pred["value"]
    actual = _signal_value(signals, sig_name)

    # Missing data with no fallback → treat as non-match. Callers that
    # want "deny on unknown" should pick a sensible default_when_missing
    # for the signal.
    if actual is None:
        return False

    try:
        if op == "==":
            return actual == expected
        if op == "!=":
            return actual != expected
        if op == "<":
            return actual < expected
        if op == "<=":
            return actual <= expected
        if op == ">":
            return actual > expected
        if op == ">=":
            return actual >= expected
        if op == "in":
            return actual in expected
        if op == "not_in":
            return actual not in expected
    except TypeError:
        # Type mismatch (e.g. comparing a string to a number). Don't
        # explode — just don't match.
        return False
    return False


def _eval_condition(condition: dict[str, Any], signals: dict[str, Any]) -> bool:
    if "all_of" in condition and condition["all_of"] is not None:
        return all(_eval_predicate(p, signals) for p in condition["all_of"])
    if "any_of" in condition and condition["any_of"] is not None:
        return any(_eval_predicate(p, signals) for p in condition["any_of"])
    return False


def policy_applies_to(policy_roles: list[str], role: str | None) -> bool:
    """Empty ``applies_to_roles`` = applies to every role."""
    if not policy_roles:
        return True
    if role is None:
        return False
    return role in policy_roles


def policy_targets_skill(
    scope_kind: str, scope_values: list[str], skill: str, category: str | None
) -> bool:
    if scope_kind == "all":
        return True
    if scope_kind == "skills":
        return skill in scope_values
    if scope_kind == "categories":
        return category is not None and category in scope_values
    return False


def policy_denies(
    *,
    enabled: bool,
    applies_to_roles: list[str],
    scope_kind: str,
    scope_values: list[str],
    condition: dict[str, Any],
    role: str | None,
    skill: str,
    signals: dict[str, Any],
) -> bool:
    """Single-policy evaluation. Returns True iff the policy fires."""
    if not enabled:
        return False
    if not policy_applies_to(applies_to_roles, role):
        return False
    category = SKILL_TO_CATEGORY.get(skill)
    category_value = category.value if category else None
    if not policy_targets_skill(scope_kind, scope_values, skill, category_value):
        return False
    return _eval_condition(condition, signals)
