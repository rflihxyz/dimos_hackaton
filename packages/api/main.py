import json
import logging
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from fastapi_pagination import add_pagination

from src.core.logging import setup_logging
from src.core.middleware import LoggingMiddleware
from src.db import SessionLocal, init_db
from src.dimos_client import get_mcp_adapter

setup_logging()
log = logging.getLogger(__name__)


async def _best_effort_mcp_sync() -> None:
    """Try once to sync the MCP tool catalog. Never fail the broker.

    DimOS lives on the host and may not be up when the broker boots.
    Operators can refresh on demand via ``POST /mcp/tools/sync``.
    """
    from src.mcp_tools import service as mcp_tools_service

    adapter = get_mcp_adapter()
    if not await adapter.wait_for_ready(timeout=0.5):
        log.info("startup_mcp_sync_skipped_dimos_down")
        return
    try:
        async with SessionLocal() as session:
            result = await mcp_tools_service.sync_from_mcp(session, adapter)
        log.info(
            "startup_mcp_sync_ok upserted=%d deleted=%d skipped=%s",
            result.upserted,
            result.deleted,
            result.skipped,
        )
    except Exception as e:
        log.warning("startup_mcp_sync_failed error=%s", e)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await _best_effort_mcp_sync()
    generate_openapi_json()
    yield


app = FastAPI(
    title="Dimos API",
    description="Backend API",
    lifespan=lifespan,
    servers=[
        {"url": "http://0.0.0.0:8000", "description": "Local development server"},
    ],
    openapi_tags=[
        {
            "name": "healthchecks",
            "description": "Healthcheck endpoints",
        },
    ],
)


def get_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ALLOW_ORIGINS", "").strip()
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    return [
        "http://localhost",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5001",
    ]


cors_origin_regex = os.getenv("CORS_ALLOW_ORIGIN_REGEX") or None

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_origin_regex=cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(LoggingMiddleware)

security = HTTPBearer()

add_pagination(app)


def generate_openapi_json():
    """Generate and write OpenAPI JSON schema to swagger/openapi.json"""
    openapi_schema = app.openapi()

    os.makedirs("swagger", exist_ok=True)

    with open("swagger/openapi.json", "w") as f:
        json.dump(openapi_schema, f, indent=2)

    print("OpenAPI JSON schema written to swagger/openapi.json")


@app.get("/", tags=["healthchecks"])
def read_root():
    return {"status": 200}


@app.get("/health", tags=["healthchecks"])
def read_health():
    return {"status": 200}


@app.get("/refresh-openapi", tags=["healthchecks"])
def refresh_openapi():
    """Manual endpoint to refresh the OpenAPI JSON file"""
    generate_openapi_json()
    return {"message": "OpenAPI JSON file refreshed successfully"}


from src.agents.router import router as agents_router
from src.mcp_tools.router import router as mcp_tools_router
from src.rbac.router import router as rbac_router
from src.recipes.router import router as recipes_router
from src.roles.router import router as roles_router
from src.runtime.router import router as runtime_router
from src.users.router import router as users_router

app.include_router(recipes_router)
app.include_router(runtime_router)
app.include_router(agents_router)
app.include_router(mcp_tools_router)
app.include_router(rbac_router)
app.include_router(roles_router)
app.include_router(users_router)


if __name__ == "__main__":
    generate_openapi_json()
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
