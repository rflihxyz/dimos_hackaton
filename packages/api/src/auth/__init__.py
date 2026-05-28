"""JWT-based authentication.

Public surface re-exported here so callers can do:

    from src.auth import get_current_user, hash_password, ...
"""
from src.auth.jwt import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ALGORITHM,
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)

__all__ = [
    "ACCESS_TOKEN_EXPIRE_MINUTES",
    "ALGORITHM",
    "create_access_token",
    "get_current_user",
    "hash_password",
    "verify_password",
]
