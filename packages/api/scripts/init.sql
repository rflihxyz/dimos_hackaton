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
    -- Stable internal identifier used by JWT (sub claim is email, but
    -- `user_id` claim references this column so renames don't break tokens).
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Login identity. Unique + lower-cased by the API layer before insert.
    email          TEXT NOT NULL UNIQUE,
    -- Bcrypt-hashed password (60-char fixed). Set by /auth/signup.
    password       TEXT NOT NULL,
    -- Legacy / RBAC handle. Used by /users/{username}/face and friends.
    -- Auto-derived from the email local-part on signup; can collide so we
    -- still enforce uniqueness here.
    username       TEXT NOT NULL UNIQUE,
    full_name      TEXT NOT NULL,
    role           TEXT NOT NULL REFERENCES roles(name) ON UPDATE CASCADE,
    -- Single canonical face embedding (centroid of enrolled samples).
    -- NULL until the user enrolls. Switch to pgvector if/when we need
    -- ANN search.
    face_embedding REAL[],
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_role_idx ON users (role);
CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);

-- Seed roles are upserted from Python on startup (see SEED_ROLES in
-- src/rbac/taxonomy.py) so editing the taxonomy doesn't require dropping
-- the volume. This file owns the schema only.
