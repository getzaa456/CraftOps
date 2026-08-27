-- MC Host Panel — Database Schema
-- PostgreSQL

CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ─────────────────────────────────────────────
-- users
-- ─────────────────────────────────────────────
CREATE TABLE users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    plan           TEXT NOT NULL DEFAULT 'free', -- 'free' | 'pro'
    max_servers    INT NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- servers
-- ─────────────────────────────────────────────
CREATE TYPE server_status AS ENUM (
    'creating', 'running', 'stopped', 'error', 'deleting', 'deleted'
);

CREATE TYPE mc_type AS ENUM (
    'VANILLA', 'PAPER', 'FORGE', 'FABRIC'
);

CREATE TABLE servers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Kubernetes object references (namespace: mc-servers)
    pod_name        TEXT NOT NULL UNIQUE, -- mc-{owner_id}-{server_id}
    service_name    TEXT NOT NULL UNIQUE, -- svc-mc-{server_id}
    pvc_name        TEXT NOT NULL UNIQUE, -- pvc-mc-{server_id}
    configmap_name  TEXT NOT NULL UNIQUE, -- cfg-mc-{server_id}
    namespace       TEXT NOT NULL DEFAULT 'mc-servers',

    -- Networking (k3d host port <-> NodePort, fixed +5000 offset)
    port            INT NOT NULL CHECK (port BETWEEN 25565 AND 25600), -- host-facing port; uniqueness enforced below, only among active rows
    node_port       INT GENERATED ALWAYS AS (port + 5000) STORED,             -- k8s Service nodePort

    mc_type         mc_type NOT NULL DEFAULT 'PAPER',
    mc_version      TEXT NOT NULL,
    memory_limit_mb INT NOT NULL DEFAULT 2048,
    cpu_limit       NUMERIC(3,1) NOT NULL DEFAULT 1.0,
    status          server_status NOT NULL DEFAULT 'creating',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_servers_owner_id ON servers(owner_id);
CREATE INDEX idx_servers_status   ON servers(status);

-- Port uniqueness only applies among *active* (non-deleted) servers — a
-- plain UNIQUE constraint here would block reusing a port freed by a
-- deleted server, which is exactly the bug migration 0002 fixes. Unlike
-- pod_name/service_name/pvc_name/configmap_name (unique forever, since
-- they're keyed by a fresh UUID every time), port is drawn from a small
-- fixed pool and is meant to be reused.
CREATE UNIQUE INDEX servers_port_active_unique ON servers (port) WHERE status != 'deleted';

-- ─────────────────────────────────────────────
-- backups
-- ─────────────────────────────────────────────
CREATE TABLE backups (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id   UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    file_path   TEXT NOT NULL,      -- local path or object storage key
    size_bytes  BIGINT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_backups_server_id ON backups(server_id);

-- ─────────────────────────────────────────────
-- trigger: auto-update servers.updated_at
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_servers_updated_at
BEFORE UPDATE ON servers
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
