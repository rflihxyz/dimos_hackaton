"""SQLAlchemy rows for tables managed by ``packages/api/scripts/init.sql``.

These bind to ``RbacBase`` (not ``Base``), so ``Base.metadata.create_all``
never touches them. The SQL bootstrap is the source of truth for schema;
this file only provides ORM access.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import REAL, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from src.db import RbacBase


class Role(RbacBase):
    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String, primary_key=True)
    # Granted action categories (see src/rbac/taxonomy.py). Each entry is
    # either '*' (grants every category) or one of the four category
    # names: 'observe', 'watch', 'move', 'speak'.
    permissions: Mapped[list[str]] = mapped_column(
        ARRAY(String), nullable=False, default=list
    )


class User(RbacBase):
    __tablename__ = "users"

    username: Mapped[str] = mapped_column(String, primary_key=True)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(
        ForeignKey("roles.name", onupdate="CASCADE"), nullable=False, index=True
    )
    # Single canonical face embedding (centroid of enrolled samples).
    # NULL until the user enrolls.
    face_embedding: Mapped[list[float] | None] = mapped_column(
        ARRAY(REAL), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
