"""SQLAlchemy row for the ``policies`` table.

Owned by ``Base.metadata.create_all`` (see :mod:`src.db`) — the table
isn't in ``scripts/init.sql`` because it follows the same convention as
``mcp_tools``: app-owned, schema is the ORM model.

``applies_to_roles`` is a ``TEXT[]`` mirroring how ``roles.permissions``
is stored. Empty array means "apply to every role"; otherwise the policy
only triggers for users with one of the listed roles. Validity of role
names is checked at the service layer, not by an FK constraint, so the
admin UI can edit policies without dropping them when a role is removed.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from src.db import Base


class Policy(Base):
    __tablename__ = "policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # 'all' | 'categories' | 'skills' — what the rule restricts.
    scope_kind: Mapped[str] = mapped_column(String(16), nullable=False)
    # Category names or skill names, depending on scope_kind. Empty when
    # scope_kind == 'all'.
    scope_values: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list
    )
    # Empty array = applies to every role. Otherwise the policy only
    # gates calls from users whose role is in this list.
    applies_to_roles: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list
    )
    # Condition AST. See src/policies/models.py for the schema.
    condition: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    # Optional human message to surface when the policy denies a call.
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    __table_args__ = (
        CheckConstraint(
            "scope_kind IN ('all', 'categories', 'skills')",
            name="policies_scope_kind_chk",
        ),
    )
