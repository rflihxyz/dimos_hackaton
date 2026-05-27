"""Async SQLAlchemy engine + session factory.

Uses the standard Postgres credentials from environment variables (set in
docker-compose). No Alembic — `Base.metadata.create_all` is called from the
FastAPI lifespan on startup. This is hackathon-scope, single-table, no users.
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
    pass


engine = create_async_engine(_database_url(), echo=False, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def init_db() -> None:
    """Create all tables. Idempotent."""
    # Import models so they register on Base.metadata.
    from src.recipes import db_models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
