"""JWT helpers + `get_current_user` FastAPI dependency.

Mirrors ``logistics/packages/api/auth/auth_v2.py`` but stripped of all
organization logic — this app has no orgs.

Reuse from any router that needs to require authentication:

    from src.auth import get_current_user

    @router.get("/protected")
    async def whatever(user: User = Depends(get_current_user)): ...

Or, to gate an entire router, pass it once at include time:

    app.include_router(my_router, dependencies=[Depends(get_current_user)])
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import os
import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_session
from src.rbac.db_models import User

SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY environment variable is not set. "
        "Authentication cannot function without a valid secret key. "
        "Please set JWT_SECRET_KEY to a secure random string (at least 32 characters)."
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta if expires_delta else timedelta(minutes=15)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_session),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        email: str | None = payload.get("sub")
        user_id_raw: str | None = payload.get("user_id")
        if email is None or user_id_raw is None:
            raise credentials_exception
        try:
            user_id = uuid.UUID(user_id_raw)
        except (TypeError, ValueError) as e:
            raise credentials_exception from e
    except JWTError as e:
        raise credentials_exception from e

    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user
