# Dimos Hackathon

Next.js webapp + FastAPI broker + Postgres + host-side DimOS runtime.

Teach the robot a new perception skill in plain English:
the broker drafts a JSON recipe with GPT-5.5, drops it on a shared volume,
and DimOS picks it up live via the `lookout_learned_skill` skill.

## Quick Start

### 1. Clone + env

```bash
export GIT_LFS_SKIP_SMUDGE=1
git clone --recurse-submodules https://github.com/rflihxyz/dimos_hackaton.git
cd dimos_hackaton
cp .env.example .env
# Fill in OPENAI_API_KEY in .env
```

### 2. Webapp + API + Postgres (docker)

```bash
docker compose -f docker-compose.dev.yml up --build
```

This brings up:

| Service  | URL                     |
| -------- | ----------------------- |
| Webapp   | http://localhost:3000   |
| API      | http://localhost:8000   |
| Postgres | localhost:5432          |

Recipes JSON files land in `./.recipes/` (gitignored); the backend
container mounts it at `/recipes`.

### 3. DimOS (on the host)

DimOS carries a heavy ML dependency tree so it runs on the host, not in
docker. The broker reaches it via `host.docker.internal:9990`.

```bash
cd packages/dimos
uv sync --extra all
DIMOS_RECIPES_DIR="$(pwd)/../../.recipes" \
  uv run dimos --simulation run dimos-hackathon-agentic
```

This blueprint composes `unitree-go2-agentic` with the
`LearnedSkillsModule`, which exposes two extra skills to the agent:
`list_learned_skills()` and `lookout_learned_skill(name)`.

## Using it

Open http://localhost:3000:

1. The dashboard shows the live robot camera (MJPEG from dimos:5555),
   the recipe list, and an agent chat box.
2. Click **Teach a skill**, describe what the robot should watch for,
   review the GPT-5.5 draft, and ship it.
3. The recipe lands in `./.recipes/<name>.json`; DimOS's mtime cache
   picks it up on the next `list_learned_skills` call.
4. Click **Invoke** on any recipe to have the agent activate it via
   chat.

## Architecture

- **`packages/api/`** — FastAPI broker. Async SQLAlchemy + pydantic-ai
  + atomic JSON file writes + thin MCP JSON-RPC proxy.
- **`apps/webapp/`** — Next.js 16 + React 19 + shadcn UI. Pulls video
  and the agent SSE stream directly from dimos.
- **`packages/dimos/`** — DimOS submodule. Adds
  `LearnedSkillsModule` and the `dimos-hackathon-agentic` blueprint.
- **`./.recipes/`** — shared volume of JSON recipes (the source of
  truth dimos reads).
