# Dimos API

FastAPI backend for the Dimos hackathon project.

## Structure

```
packages/api/
├── main.py              # FastAPI app entrypoint (lifespan, middleware, routers)
├── pyproject.toml       # Poetry dependencies & pytest config
├── src/                 # Modular application code
│   └── core/            # Cross-cutting concerns
│       ├── logging.py   # Structured logging setup (structlog)
│       └── middleware.py# Request-scoped logging middleware
├── tests/               # Pytest test suite (mirrors src/ layout)
└── swagger/             # Auto-generated OpenAPI schema (created at runtime)
```

Each feature lives in its own package under `src/<feature>/` and exposes a
`router` from its `__init__.py`. Register it in `main.py` with
`app.include_router(<feature>.router)`.

## Running locally

```bash
poetry install
poetry run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Or run `python main.py` to launch via the script entrypoint (also writes the
OpenAPI schema to `swagger/openapi.json`).

## Environment variables

- `ENVIRONMENT` (default: `development`) — `production` switches logs to JSON.
- `CORS_ALLOW_ORIGINS` — comma-separated origins. Falls back to localhost defaults.
- `CORS_ALLOW_ORIGIN_REGEX` — optional regex of allowed origins.

## Pagination

List endpoints use [`fastapi-pagination`](https://uriyyo-fastapi-pagination.netlify.app/):

- `page` (default: `1`)
- `size` (default: `50`)

Response shape:

```json
{ "items": [...], "total": 100, "page": 1, "size": 50, "pages": 2 }
```

## Tests

```bash
poetry run pytest
```
