"""Async SQLAlchemy engine + session factory.

Uses the standard Postgres credentials from environment variables (set in
docker-compose). No Alembic — `Base.metadata.create_all` is called from the
FastAPI lifespan on startup for app-owned tables (recipes). RBAC tables
(`roles`, `users`) are bootstrapped by `scripts/init.sql` and bound via
`RbacBase` for read-only ORM access.
"""
from __future__ import annotations

from collections.abc import AsyncIterator
import os

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase


def _database_url() -> str:
    user = os.environ.get("POSTGRES_USER", "postgres")
    pw = os.environ.get("POSTGRES_PASSWORD", "postgres")
    host = os.environ.get("POSTGRES_HOST", "postgres")
    port = os.environ.get("POSTGRES_PORT", "5432")
    db = os.environ.get("POSTGRES_DB", "dimos")
    return f"postgresql+asyncpg://{user}:{pw}@{host}:{port}/{db}"


class Base(DeclarativeBase):
    """Tables created by `Base.metadata.create_all` on lifespan startup."""

    pass


class RbacBase(DeclarativeBase):
    """Tables managed by /docker-entrypoint-initdb.d/01-rbac.sql.

    Models bind here for ORM access, but their schema is owned by the
    SQL bootstrap and never touched by `Base.metadata.create_all`.
    """

    pass


engine = create_async_engine(_database_url(), echo=False, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def init_db() -> None:
    """Create app-owned tables and seed canonical RBAC roles. Idempotent."""
    # Import models so they register on Base.metadata.
    from src.mcp_tools import db_models as _mcp_tools_db_models  # noqa: F401
    from src.policies import db_models as _policies_db_models  # noqa: F401
    from src.recipes import db_models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    await _seed_rbac_roles()


async def _seed_rbac_roles() -> None:
    """Upsert the canonical seed roles from the action taxonomy.

    Lets us evolve role permissions in code without forcing
    ``docker compose down -v``: ``init.sql`` only owns the schema, this
    upsert owns the data. Existing rows for non-seed roles (e.g. user-
    created ones) are untouched.
    """
    # Local import to avoid a top-level cycle (rbac.taxonomy -> nothing,
    # but keep db.py free of feature-module imports at module load).
    from sqlalchemy.dialects.postgresql import insert

    from src.rbac.db_models import Role
    from src.rbac.taxonomy import SEED_ROLES

    async with SessionLocal() as session:
        for name, permissions in SEED_ROLES.items():
            stmt = insert(Role).values(name=name, permissions=permissions)
            stmt = stmt.on_conflict_do_update(
                index_elements=[Role.name],
                set_={"permissions": stmt.excluded.permissions},
            )
            await session.execute(stmt)
        await session.commit()


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
