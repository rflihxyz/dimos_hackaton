import json
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer
from fastapi_pagination import add_pagination

from src.core.logging import setup_logging
from src.core.middleware import LoggingMiddleware

setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
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


# Register routers below as modules are added under `src/`.
# Example:
#   from src import api_keys
#   app.include_router(api_keys.router)


if __name__ == "__main__":
    generate_openapi_json()
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
