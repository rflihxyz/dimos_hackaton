"""Pydantic models for `/auth/*`."""
from __future__ import annotations

import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserLogin(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=1)


class UserSignup(BaseModel):
    """Body for `POST /auth/signup`.

    `username` and `role` are auto-derived by the service:
    - ``username`` = email local-part (lower-cased, with a suffix if taken)
    - ``role`` = ``"guest"`` (least-privileged seed role)
    """

    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=128)


class UserAuth(BaseModel):
    """The currently-authenticated user, as returned to the frontend."""

    id: uuid.UUID
    email: EmailStr
    username: str
    full_name: str
    role: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginResponse(Token):
    """Login returns the token plus the user in one round-trip."""

    user: UserAuth
