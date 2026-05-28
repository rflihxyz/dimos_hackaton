"""REST surface for contextual access policies."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_session
from src.policies import service
from src.policies.models import (
    EvaluateRequest,
    EvaluateResponse,
    PolicyCreate,
    PolicyPatch,
    PolicyRow,
    SignalCatalogResponse,
)

router = APIRouter(prefix="/policies", tags=["policies"])


@router.get("/signals", response_model=SignalCatalogResponse)
def list_signals() -> SignalCatalogResponse:
    """Return the static catalog of contextual signals + valid operators.

    Code-defined (not a DB read); cheap, no async needed.
    """
    return service.signal_catalog()


@router.get("", response_model=list[PolicyRow])
async def list_policies(session: AsyncSession = Depends(get_session)) -> list[PolicyRow]:
    return await service.list_policies(session)


@router.post("", response_model=PolicyRow, status_code=status.HTTP_201_CREATED)
async def create_policy(
    body: PolicyCreate, session: AsyncSession = Depends(get_session)
) -> PolicyRow:
    try:
        return await service.create_policy(session, body)
    except ValueError as e:
        msg = str(e)
        code = (
            status.HTTP_409_CONFLICT
            if "already exists" in msg
            else status.HTTP_422_UNPROCESSABLE_ENTITY
        )
        raise HTTPException(status_code=code, detail=msg) from e


@router.get("/{policy_id}", response_model=PolicyRow)
async def get_policy(
    policy_id: int, session: AsyncSession = Depends(get_session)
) -> PolicyRow:
    row = await service.get_policy(session, policy_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


@router.patch("/{policy_id}", response_model=PolicyRow)
async def update_policy(
    policy_id: int,
    body: PolicyPatch,
    session: AsyncSession = Depends(get_session),
) -> PolicyRow:
    try:
        row = await service.update_policy(session, policy_id, body)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e)
        ) from e
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


@router.delete("/{policy_id}")
async def delete_policy(
    policy_id: int, session: AsyncSession = Depends(get_session)
) -> Response:
    deleted = await service.delete_policy(session, policy_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/evaluate", response_model=EvaluateResponse)
async def evaluate_policies(
    body: EvaluateRequest, session: AsyncSession = Depends(get_session)
) -> EvaluateResponse:
    """Dry-run all enabled policies against a synthetic context."""
    return await service.evaluate(session, body)
