-- Bootstrap schema for face-recognition RBAC.
--
-- Loaded by the postgres image from /docker-entrypoint-initdb.d/ ON FIRST
-- BOOT ONLY (i.e. when the pg_data volume is empty). To re-run after
-- editing this file: `docker compose -f docker-compose.dev.yml down -v`.
--
-- The `recipes` table is owned by SQLAlchemy (Base.metadata.create_all in
-- src/db.py); this script only owns RBAC tables and is safe to coexist.

CREATE TABLE IF NOT EXISTS roles (
    name        TEXT PRIMARY KEY,
    -- Granted action categories (see packages/api/src/rbac/taxonomy.py).
    --
    -- Each entry is either '*' (grants every category) or one of:
    --   'observe'  one-off perception (snapshots, listing learned skills)
    --   'watch'    continuous perception loops (look_out_for, lookouts)
    --   'move'     locomotion / sport commands / navigation / follow
    --   'speak'    audio output through the speaker
    --
    -- Utility skills like current_time / wait are always allowed and
    -- intentionally not gated by any category.
    permissions TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS users (
    username       TEXT PRIMARY KEY,
    full_name      TEXT NOT NULL,
    role           TEXT NOT NULL REFERENCES roles(name) ON UPDATE CASCADE,
    -- Single canonical face embedding (centroid of enrolled samples).
    -- NULL until the user enrolls. Switch to pgvector if/when we need
    -- ANN search.
    face_embedding REAL[],
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);

-- Seed roles are upserted from Python on startup (see SEED_ROLES in
-- src/rbac/taxonomy.py) so editing the taxonomy doesn't require dropping
-- the volume. This file owns the schema only.
