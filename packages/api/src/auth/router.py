"""HTTP surface for authentication.

All routes here are **unauthenticated** (they're the entry point). To get
the current user from a protected route, depend on ``get_current_user``
from ``src.auth``.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from src.auth import service
from src.auth.jwt import get_current_user
from src.auth.models import LoginResponse, UserAuth, UserLogin, UserSignup
from src.db import get_session
from sqlalchemy.ext.asyncio import AsyncSession

from src.rbac.db_models import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=UserAuth, status_code=status.HTTP_201_CREATED)
async def signup(
    body: UserSignup,
    db: AsyncSession = Depends(get_session),
) -> UserAuth:
    try:
        return await service.signup(db, body)
    except ValueError as e:
        msg = str(e)
        code = (
            status.HTTP_409_CONFLICT
            if "already registered" in msg
            else status.HTTP_422_UNPROCESSABLE_ENTITY
        )
        raise HTTPException(status_code=code, detail=msg) from e


@router.post("/login", response_model=LoginResponse)
async def login(
    body: UserLogin,
    db: AsyncSession = Depends(get_session),
) -> LoginResponse:
    user = await service.authenticate(db, body)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    return service.issue_login_response(user)


@router.get("/me", response_model=UserAuth)
async def me(current_user: User = Depends(get_current_user)) -> UserAuth:
    return service.user_to_auth(current_user)
