"""REST surface for RBAC roles."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_session
from src.roles import service
from src.roles.models import RoleCreate, RolePatch, RoleRow

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("", response_model=list[RoleRow])
async def list_roles(session: AsyncSession = Depends(get_session)) -> list[RoleRow]:
    return await service.list_roles(session)


@router.post("", response_model=RoleRow, status_code=status.HTTP_201_CREATED)
async def create_role(
    body: RoleCreate, session: AsyncSession = Depends(get_session)
) -> RoleRow:
    try:
        return await service.create_role(session, body)
    except ValueError as e:
        msg = str(e)
        code = (
            status.HTTP_409_CONFLICT
            if "already exists" in msg
            else status.HTTP_422_UNPROCESSABLE_ENTITY
        )
        raise HTTPException(status_code=code, detail=msg) from e


@router.get("/{name}", response_model=RoleRow)
async def get_role(name: str, session: AsyncSession = Depends(get_session)) -> RoleRow:
    row = await service.get_role(session, name)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


@router.patch("/{name}", response_model=RoleRow)
async def update_role(
    name: str, body: RolePatch, session: AsyncSession = Depends(get_session)
) -> RoleRow:
    try:
        row = await service.update_role(session, name, body)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        ) from e
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


@router.delete("/{name}")
async def delete_role(
    name: str, session: AsyncSession = Depends(get_session)
) -> Response:
    try:
        deleted = await service.delete_role(session, name)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e)) from e
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
