"""REST surface for recipe-driven learned skills."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.db import get_session
from src.dimos_client import get_mcp_adapter
from src.recipes import codegen, service
from src.recipes.models import Recipe, RecipeDraftRequest, RecipeRow

router = APIRouter(prefix="/recipes", tags=["recipes"])


@router.get("", response_model=list[RecipeRow])
async def list_recipes(session: AsyncSession = Depends(get_session)) -> list[RecipeRow]:
    return await service.list_recipes(session)


@router.post("/draft", response_model=Recipe)
async def draft_recipe(body: RecipeDraftRequest) -> Recipe:
    try:
        return await codegen.draft_recipe(body)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM draft failed: {e}",
        ) from e


@router.post("", response_model=RecipeRow, status_code=status.HTTP_201_CREATED)
async def create_recipe(
    recipe: Recipe,
    session: AsyncSession = Depends(get_session),
) -> RecipeRow:
    try:
        return await service.create_recipe(session, recipe)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(e)
        ) from e


@router.get("/{name}", response_model=RecipeRow)
async def get_recipe(
    name: str, session: AsyncSession = Depends(get_session)
) -> RecipeRow:
    row = await service.get_recipe(session, name)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


@router.delete("/{name}")
async def delete_recipe(
    name: str, session: AsyncSession = Depends(get_session)
) -> Response:
    deleted = await service.delete_recipe(session, name)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{name}/invoke")
async def invoke_recipe(name: str) -> dict:
    """Tell the running agent to use this learned skill.

    Uses the chat-driven path (`agent_send`) so the LLM stays in the loop
    and emits progress on the SSE stream.
    """
    adapter = get_mcp_adapter()
    try:
        text = await adapter.call_tool_text(
            "agent_send",
            arguments={"message": service.invoke_message(name)},
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"dimos unreachable: {e}",
        ) from e
    return {"status": "sent", "agent_response": text}
