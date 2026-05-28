"""Auth business logic: signup, authenticate, token issuance."""
from __future__ import annotations

import re
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.jwt import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    hash_password,
    verify_password,
)
from src.auth.models import LoginResponse, UserAuth, UserLogin, UserSignup
from src.rbac.db_models import User

# Same constraint as src/users/models.py: lowercase snake-ish, 1..32 chars.
_USERNAME_CLEAN_RE = re.compile(r"[^a-z0-9_]+")
_DEFAULT_ROLE = "guest"


def _user_to_auth(u: User) -> UserAuth:
    return UserAuth(
        id=u.id,
        email=u.email,
        username=u.username,
        full_name=u.full_name,
        role=u.role,
    )


def _username_from_email(email: str) -> str:
    """Derive a `[a-z0-9_]{1..32}` handle from the email local-part.

    Caller is responsible for collision resolution if the chosen handle is
    already taken — see ``_unique_username``.
    """
    local = email.split("@", 1)[0].lower()
    cleaned = _USERNAME_CLEAN_RE.sub("_", local).strip("_")
    if not cleaned:
        cleaned = "user"
    return cleaned[:32]


async def _unique_username(db: AsyncSession, base: str) -> str:
    """Return ``base``, or ``base_2`` / ``base_3`` ... if taken."""
    candidate = base
    suffix = 2
    while True:
        existing = (
            await db.execute(select(User.id).where(User.username == candidate))
        ).scalar_one_or_none()
        if existing is None:
            return candidate
        candidate = f"{base[: 32 - len(str(suffix)) - 1]}_{suffix}"
        suffix += 1


async def signup(db: AsyncSession, body: UserSignup) -> UserAuth:
    """Create a new user. Raises ValueError if the email is already taken."""
    email = body.email.lower()

    existing = (
        await db.execute(select(User.id).where(User.email == email))
    ).scalar_one_or_none()
    if existing is not None:
        raise ValueError(f"Email {email!r} is already registered")

    username = await _unique_username(db, _username_from_email(email))

    user = User(
        email=email,
        password=hash_password(body.password),
        username=username,
        full_name=body.full_name,
        role=_DEFAULT_ROLE,
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        # Most likely race on email/username uniqueness or the default
        # `guest` role missing from the `roles` table.
        raise ValueError("Could not create user (conflict or unknown role)") from e
    await db.refresh(user)
    return _user_to_auth(user)


async def authenticate(db: AsyncSession, body: UserLogin) -> User | None:
    """Return the matching user, or None on bad email/password."""
    email = body.email.lower()
    user = (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()
    if user is None:
        return None
    if not verify_password(body.password, user.password):
        return None
    return user


def issue_login_response(user: User) -> LoginResponse:
    token = create_access_token(
        data={"sub": user.email, "user_id": str(user.id)},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return LoginResponse(access_token=token, user=_user_to_auth(user))


def user_to_auth(user: User) -> UserAuth:
    return _user_to_auth(user)
