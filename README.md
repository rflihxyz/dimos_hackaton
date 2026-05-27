# Dimos Hackathon

Next.js webapp + FastAPI broker + Postgres + host-side DimOS runtime.

Teach the robot a new perception skill in plain English: the broker drafts
a JSON recipe with GPT-5.5, drops it on a shared volume, and DimOS picks
it up live via the `lookout_learned_skill` skill.

## Prerequisites

- macOS 12.6+ (or Linux), Docker Desktop, ~5 GB free disk
- An `OPENAI_API_KEY`
- For the DimOS runtime on the host: Homebrew + `uv`

## 1. Clone + env

```bash
export GIT_LFS_SKIP_SMUDGE=1
git clone --recurse-submodules https://github.com/rflihxyz/dimos_hackaton.git
cd dimos_hackaton
cp .env.example .env
# then edit .env and set OPENAI_API_KEY=sk-...
```

The `packages/dimos` submodule is pinned to our
[rflihxyz/dimos@feat/learned-skills](https://github.com/rflihxyz/dimos/tree/feat/learned-skills)
fork, which carries `LearnedSkillsModule` + the `dimos-hackathon-agentic`
blueprint.

If you forgot `--recurse-submodules`:

```bash
git submodule update --init --recursive
```

## 2. Webapp + API + Postgres (docker)

```bash
docker compose -f docker-compose.dev.yml up --build
```

Brings up three services:

| Service  | URL                   |
| -------- | --------------------- |
| Webapp   | http://localhost:3000 |
| API      | http://localhost:8000 |
| Postgres | localhost:5432        |

Recipe JSON files land in `./.recipes/` (gitignored). The backend
container mounts it at `/recipes`, and the host-side DimOS instance reads
from the same directory — that's how a "Ship it" click in the UI becomes
a live skill in the running robot agent.

## 3. DimOS (on the host)

DimOS pulls in a heavy ML dependency tree (PyTorch, ultralytics,
transformers, moondream, …) so it runs on the host, not in docker. The
broker reaches it via `host.docker.internal:9990`.

### One-time setup (macOS)

```bash
# System deps via Homebrew (skip ones you already have)
brew install gnu-sed gcc portaudio git-lfs libjpeg-turbo python pre-commit

# uv (if you don't have it)
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"

# Install dimos from our fork (already checked out as a submodule)
cd packages/dimos
uv sync --extra all
cd ../..
```

> Linux: see [`packages/dimos/docs/installation/ubuntu.md`](packages/dimos/docs/installation/ubuntu.md)
> or [`packages/dimos/docs/installation/nix.md`](packages/dimos/docs/installation/nix.md).
> The `cuda` extras are auto-skipped on Apple Silicon, so `--extra all` is safe.

### Launch the blueprint

From the repo root:

```bash
DIMOS_RECIPES_DIR="$PWD/.recipes" \
  uv --project packages/dimos run dimos --simulation run dimos-hackathon-agentic
```

This composes `unitree-go2-agentic` with `LearnedSkillsModule` and
exposes two extra MCP skills to the agent:
`list_learned_skills()` and `lookout_learned_skill(name)`. It also
serves:

- MCP JSON-RPC + SSE at `http://localhost:9990/mcp`
- MJPEG video at `http://localhost:5555/video_feed/color_image`
- Agent text stream at `http://localhost:5555/text_stream/agent_responses`

> First boot downloads ~75 MB from LFS (perception models). It also
> compiles native LCM bindings; expect 1–2 minutes the first time.

### Useful side commands

```bash
# Verify the new blueprint is registered
uv --project packages/dimos run dimos list | grep dimos-hackathon

# Inspect the live MCP catalogue (should include lookout_learned_skill)
uv --project packages/dimos run dimos mcp list-tools

# Send the agent a message from the CLI (works without the webapp)
uv --project packages/dimos run dimos agent-send "list your learned skills"

# Follow the dimos log
uv --project packages/dimos run dimos log -f

# Graceful shutdown
uv --project packages/dimos run dimos stop
```

## 4. Using it

Open http://localhost:3000:

1. The dashboard shows the live robot camera (MJPEG from dimos:5555),
   the recipe list, and an agent chat box.
2. Click **Teach a skill**, describe what the robot should watch for,
   review the GPT-5.5 draft, and ship it.
3. The recipe lands in `./.recipes/<name>.json`; DimOS's mtime cache
   picks it up on the next `list_learned_skills` call (no restart
   needed).
4. Click **Invoke** on any recipe to have the agent activate it via
   chat — the response streams in real time.

## Architecture

```
                         ┌───────────────┐
   browser ──HTTP──▶     │  Next.js UI   │  apps/webapp (docker)
        │                └──────┬────────┘
        │                       │ /recipes, /agents, /runtime
        │                ┌──────▼────────┐
        │                │ FastAPI broker │  packages/api (docker)
        │                │  + Postgres    │
        │                │  + Pydantic AI │
        │                └──────┬────────┘
        │                       │ JSON-RPC
        │                       │ + atomic write -> ./.recipes
        │                ┌──────▼────────┐
        └──MJPEG + SSE──▶│    DimOS      │  packages/dimos (HOST)
                         │  agent + MCP  │
                         │   + Learned   │
                         │   SkillsModule│
                         └───────────────┘
```

- [`packages/api/`](packages/api) — FastAPI broker. Async SQLAlchemy +
  Pydantic AI + atomic JSON file writes + thin MCP JSON-RPC proxy.
- [`apps/webapp/`](apps/webapp) — Next.js 16 + React 19 + shadcn. Pulls
  video and the agent SSE stream directly from dimos (no broker hop).
- [`packages/dimos/`](packages/dimos) — DimOS submodule (our fork). Adds
  `LearnedSkillsModule` and the `dimos-hackathon-agentic` blueprint.
- `./.recipes/` — shared volume of JSON recipes. Source of truth for
  what the robot knows how to look for.

## Troubleshooting

- **`uv sync` fails on Mac with a Rust/Cargo error**: install Xcode CLT
  via `xcode-select --install`, then retry.
- **Webapp shows "No video stream"**: dimos isn't running, or it's
  bound to a different port. Check `dimos status` and confirm port
  5555 is free.
- **`/recipes` is empty in the UI but the file exists on disk**: DimOS
  was started before the recipes dir existed. Stop dimos, remove the
  empty `./.recipes/` dir, restart dimos with `DIMOS_RECIPES_DIR`
  pointing at the absolute path.
- **`dimos mcp list-tools` doesn't show `lookout_learned_skill`**: the
  submodule isn't on `feat/learned-skills`. Fix with
  `cd packages/dimos && git checkout feat/learned-skills` and rerun
  `uv sync --extra all`.
