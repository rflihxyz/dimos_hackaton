"""REST surface for RBAC users."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_session
from src.users import service, storage
from src.users.models import UserCreate, UserPatch, UserRow

router = APIRouter(prefix="/users", tags=["users"])

_MAX_FACE_BYTES = 4 * 1024 * 1024  # 4 MB
_CONTENT_TYPE_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


@router.get("", response_model=list[UserRow])
async def list_users(session: AsyncSession = Depends(get_session)) -> list[UserRow]:
    return await service.list_users(session)


@router.post("", response_model=UserRow, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate, session: AsyncSession = Depends(get_session)
) -> UserRow:
    try:
        return await service.create_user(session, body)
    except ValueError as e:
        msg = str(e)
        code = (
            status.HTTP_409_CONFLICT
            if "already exists" in msg
            else status.HTTP_422_UNPROCESSABLE_ENTITY
        )
        raise HTTPException(status_code=code, detail=msg) from e


@router.get("/{username}", response_model=UserRow)
async def get_user(
    username: str, session: AsyncSession = Depends(get_session)
) -> UserRow:
    row = await service.get_user(session, username)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


@router.patch("/{username}", response_model=UserRow)
async def update_user(
    username: str,
    body: UserPatch,
    session: AsyncSession = Depends(get_session),
) -> UserRow:
    try:
        row = await service.update_user(session, username, body)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        ) from e
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


@router.delete("/{username}")
async def delete_user(
    username: str, session: AsyncSession = Depends(get_session)
) -> Response:
    deleted = await service.delete_user(session, username)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{username}/face", response_model=UserRow)
async def upload_face(
    username: str,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
) -> UserRow:
    """Replace the user's face image. Resets the cached embedding."""
    user = await service.get_user(session, username)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    ext = _CONTENT_TYPE_TO_EXT.get((file.content_type or "").lower())
    if ext is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported image type {file.content_type!r}; use jpeg/png/webp",
        )

    data = await file.read(_MAX_FACE_BYTES + 1)
    if not data:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Empty upload"
        )
    if len(data) > _MAX_FACE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Face image must be \u2264 {_MAX_FACE_BYTES // (1024 * 1024)} MB",
        )

    await storage.write_face(username, data, ext=ext)
    await service.clear_face_embedding(session, username)

    refreshed = await service.get_user(session, username)
    assert refreshed is not None  # we just verified it exists above
    return refreshed


@router.get("/{username}/face")
async def get_face(username: str) -> FileResponse:
    path = storage.existing_face_path(username)
    if path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No face on file")
    return FileResponse(path, media_type="image/jpeg")


@router.delete("/{username}/face")
async def delete_face(
    username: str, session: AsyncSession = Depends(get_session)
) -> Response:
    deleted = await storage.delete_face(username)
    await service.clear_face_embedding(session, username)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No face on file")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
