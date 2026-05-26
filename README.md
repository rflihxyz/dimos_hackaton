# Dimos Hackathon

Next.js webapp + Python API + Postgres.

## Quick Start

```bash
export GIT_LFS_SKIP_SMUDGE=1
git clone https://github.com/rflihxyz/dimos_hackaton.git
cd dimos_hackaton
cp .env.example .env
docker compose -f docker-compose.dev.yml up
```

## Services

| Service  | URL                    |
|----------|------------------------|
| Webapp   | http://localhost:3000   |
| API      | http://localhost:8000   |
| Postgres | localhost:5432          |

All services hot-reload in dev mode.
