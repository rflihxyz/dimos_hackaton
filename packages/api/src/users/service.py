"""Async DB operations for the RBAC `users` table."""
from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.rbac.db_models import User
from src.users import storage
from src.users.models import UserCreate, UserPatch, UserRow


def _to_row(u: User) -> UserRow:
    return UserRow(
        username=u.username,
        full_name=u.full_name,
        role=u.role,
        has_face_image=storage.existing_face_path(u.username) is not None,
        has_face_embedding=u.face_embedding is not None,
        created_at=u.created_at,
    )


async def list_users(session: AsyncSession) -> list[UserRow]:
    rows = (
        (await session.execute(select(User).order_by(User.created_at.desc())))
        .scalars()
        .all()
    )
    return [_to_row(u) for u in rows]


async def get_user(session: AsyncSession, username: str) -> UserRow | None:
    row = (
        await session.execute(select(User).where(User.username == username))
    ).scalar_one_or_none()
    return _to_row(row) if row else None


async def create_user(session: AsyncSession, body: UserCreate) -> UserRow:
    """Insert a user. Raises ValueError on conflict or unknown role."""
    existing = (
        await session.execute(select(User).where(User.username == body.username))
    ).scalar_one_or_none()
    if existing is not None:
        raise ValueError(f"User {body.username!r} already exists")

    row = User(username=body.username, full_name=body.full_name, role=body.role)
    session.add(row)
    try:
        await session.commit()
    except IntegrityError as e:
        await session.rollback()
        raise ValueError(f"Unknown role {body.role!r}") from e
    await session.refresh(row)
    return _to_row(row)


async def update_user(
    session: AsyncSession, username: str, body: UserPatch
) -> UserRow | None:
    row = (
        await session.execute(select(User).where(User.username == username))
    ).scalar_one_or_none()
    if row is None:
        return None
    if body.full_name is not None:
        row.full_name = body.full_name
    if body.role is not None:
        row.role = body.role
    try:
        await session.commit()
    except IntegrityError as e:
        await session.rollback()
        raise ValueError(f"Unknown role {body.role!r}") from e
    await session.refresh(row)
    return _to_row(row)


async def delete_user(session: AsyncSession, username: str) -> bool:
    """Delete the user row + face image. Returns True if anything was removed."""
    result = await session.execute(delete(User).where(User.username == username))
    file_deleted = await storage.delete_face(username)
    await session.commit()
    return result.rowcount > 0 or file_deleted


async def clear_face_embedding(session: AsyncSession, username: str) -> None:
    """Reset the embedding when the face image changes — dimos will recompute."""
    row = (
        await session.execute(select(User).where(User.username == username))
    ).scalar_one_or_none()
    if row is None:
        return
    row.face_embedding = None
    await session.commit()
