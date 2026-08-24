# Architecture

## Components

```
┌─────────────┐      REST + WebSocket      ┌──────────────────┐
│  Frontend   │ ─────────────────────────► │   Backend API     │
│  (React)    │ ◄───────────────────────── │  (Node/Express)   │
└─────────────┘                            └────────┬──────────┘
                                                     │ @kubernetes/client-node
                                                     ▼
                                            ┌──────────────────┐
                                            │  Kubernetes API   │
                                            │  (k3d cluster)    │
                                            └────────┬──────────┘
                                     ┌────────────────┼────────────────┐
                                     ▼                ▼                ▼
                              ┌───────────┐   ┌───────────┐    ┌───────────┐
                              │  Pod 1    │   │  Pod 2    │    │  Pod N    │
                              │ + Service │   │ + Service │    │ + Service │
                              │ + PVC     │   │ + PVC     │    │ + PVC     │
                              └───────────┘   └───────────┘    └───────────┘

                                            ┌──────────────────┐
                            Backend API ───►│   PostgreSQL      │
                                            │ users / servers /  │
                                            │ backups            │
                                            └──────────────────┘
```

The user-created Minecraft servers run inside a local **k3d** cluster (k3s running as Docker containers). The platform itself (frontend, backend, Postgres) runs directly on the developer's machine via `npm run dev` / `docker compose` — it is **not** deployed into the cluster. See "Local-Dev-Only, By Design" below for why.

## Responsibilities

- **Frontend**: auth UI, server dashboard, live console (WebSocket), file manager, resource graphs.
- **Backend API**: auth, quota enforcement, port allocation, Kubernetes object lifecycle (create/delete Pod + Service + PVC + ConfigMap), RCON command relay, log streaming, backup jobs.
- **Kubernetes API (k3d)**: schedules and runs one Pod per Minecraft server, isolated by namespace/name, exposed via a NodePort Service.
- **PostgreSQL**: source of truth for users, server metadata, backup records. Runs locally via `docker-compose.dev.yml`, not inside the cluster.

## Why Kubernetes (even locally)

Using k3d instead of raw `docker run` lets the backend manage servers as declarative Kubernetes objects (Pod, Service, PVC, ConfigMap) instead of imperative Docker SDK calls — closer to how this would run in production, and it's what the portfolio is meant to demonstrate. k3d packages a full k3s cluster inside Docker containers, so it needs nothing beyond Docker Desktop already used in Phase 1.

## Server Lifecycle (State Machine)

```
        create
          │
          ▼
      creating ────► error
          │
          ▼
   ┌──► running ◄──┐
   │      │        │
   │      ▼        │
   │   stopped ─────┘
   │      │
   ▼      ▼
       deleting
          │
          ▼
       deleted
```

- `creating`: Pod scheduled, image pulling, not yet accepting connections.
- `running`: Pod's container passes readiness (log shows "Done"), MC server accepting players.
- `stopped`: Pod scaled to 0 / deleted, but Service + PVC retained so it can be recreated with the same world data.
- `error`: Pod `CrashLoopBackOff` or failed readiness probe (detected via Kubernetes Watch API on Pod events).
- `deleting` / `deleted`: Pod, Service, ConfigMap, and PVC torn down.

## Port Allocation

- The k3d cluster is created **once** with a fixed host↔cluster port range mapping:
  ```bash
  k3d cluster create mc-cluster -p "25565-25600:30565-30600@server:0"
  ```
  This maps host ports `25565–25600` → NodePort range `30565–30600` inside the cluster.
- On server creation, the backend picks the first unused `port` (25565–25600) from the `servers` table.
- The corresponding Kubernetes `Service` is created with `type: NodePort` and `nodePort = port + 5000` (fixed offset, matches the k3d mapping above).
- Releasing a port is implicit: once a server row is deleted, that port becomes selectable again.
- Pool exhaustion (all 36 ports in use) returns `409` to the frontend.

## Pod / Resource Naming & Isolation

- Namespace: all MC servers live in a dedicated `mc-servers` namespace. There is no corresponding platform namespace — the platform itself isn't deployed into the cluster (see "Local-Dev-Only, By Design").
- Pod: `mc-{owner_id}-{server_id}`
- Service: `svc-mc-{server_id}`
- PVC: `pvc-mc-{server_id}` (holds `/data` — world files, plugins, configs)
- ConfigMap: `cfg-mc-{server_id}` (holds `TYPE`, `VERSION`, `MEMORY`, etc. env vars)
- Resource limits set via `resources.limits`/`resources.requests` on the Pod spec (CPU/memory) — prevents one server from starving the node.

## Security Notes

- **Known trade-off of staying local-dev-only**: the backend runs on the
  developer's machine and authenticates to the Kubernetes API using their
  own kubeconfig — which, on a local k3d cluster, typically has
  cluster-admin. There is no RBAC-scoped ServiceAccount actually enforcing
  the `mc-servers`-only boundary described below; that would only exist if
  the backend itself ran as a Pod (an earlier iteration of this project
  did exactly that — see git history — before the deploy layer was
  descoped in favor of staying local-dev-only). This is fine for a
  single-developer local tool; it would need to be re-added before the
  backend runs anywhere less trusted than localhost.
- The raw Kubernetes API / kubeconfig is never exposed to the frontend; only the backend holds cluster credentials.
- All Pod-creation inputs (`mc_type`, `mc_version`, `memory_limit_mb`) are validated against an allow-list before being templated into the Pod manifest, to prevent injection via crafted env vars.
- RCON commands are relayed backend → Pod only (via `kubectl exec`-equivalent through the client library); the RCON port is never exposed via a Service.
- Per-user quotas (max servers, max memory) enforced at the API layer before any Kubernetes object is created; a Kubernetes `ResourceQuota` on the `mc-servers` namespace would be a reasonable hard backstop to add if this ever runs multi-tenant.

## File Manager & Backups

The backend never mounts a server's PVC directly — only the Pod does. File
listing, download, upload, and world backup/restore all go through the
Kubernetes **exec** API (the same mechanism as RCON commands), running
`find`, `base64`, and `tar` inside the target Pod's `minecraft` container
and streaming the result back over the exec channel.

- Binary-safe transfer over the text-oriented exec streams is done by
  base64-encoding on the pod side before sending, and decoding back to raw
  bytes in the backend.
- Backup archives (`tar czf ... | base64`) are pulled out this way and
  stored on the backend's local disk (`BACKUP_DIR`), with metadata in the
  `backups` table. Restore reverses the process: base64-encode the local
  file, pipe it to `base64 -d | tar xzf - -C /data` inside the Pod.
- Because this requires a live container, **file/backup operations only
  work while a server is `running`** — there's no Pod to exec into while
  `stopped`. The frontend surfaces this directly rather than failing silently.
- Client-supplied paths are normalized and checked server-side
  (`services/pathSafety.js`) before ever reaching a shell command, closing
  off path traversal (`../../etc/passwd`-style) attempts.

## Local-Dev-Only, By Design

An earlier iteration of this project deployed the platform itself
(frontend, backend, Postgres) into the same k3d cluster as a `k8s/`
manifest set — separate `mc-platform`/`mc-servers` namespaces, a
RBAC-scoped ServiceAccount for the backend, an nginx reverse proxy
ConfigMap, a migration Job, and a matching CI/CD deploy workflow on a
self-hosted GitHub Actions runner.

That layer was intentionally removed to keep the project scoped to local
development: `docker compose` for Postgres, `npm run dev` for
backend/frontend, and k3d used *only* for what it's actually needed for —
hosting the Minecraft server Pods the app creates on the user's behalf.

Trade-offs that come with that choice (also called out in Security Notes
above):
- The backend's Kubernetes credentials are the developer's own kubeconfig,
  not a scoped-down ServiceAccount — acceptable for a single-user local
  tool, not for anything running on shared or untrusted infrastructure.
- There's no CD pipeline — `git log` / the removed `k8s/` and
  `.github/workflows/deploy.yml` files (see version control history) show
  what that looked like, if it's ever worth re-adding.
- Prometheus/Grafana-style monitoring (Phase 9) doesn't need the removed
  deploy layer after all: the backend exposes `/metrics` directly
  (`src/metrics.js`) and an opt-in `docker-compose.monitoring.yml` runs
  Prometheus + Grafana locally, scraping the host-run backend via
  `host.docker.internal`. Per-server CPU/memory comes from querying
  metrics-server directly rather than through a scrape pipeline — see
  `src/services/metricsService.js`.

## Data Flow: Create Server

1. User submits form → `POST /servers`.
2. Backend checks user quota.
3. Backend allocates a free port from the 25565–25600 pool.
4. Backend inserts a `servers` row with `status = creating`.
5. Backend calls the Kubernetes API to create, in order: ConfigMap → PVC → Pod → Service (NodePort).
6. Backend watches the Pod's logs until the "Done" marker appears, then updates `status = running`.
7. Frontend receives the status change via WebSocket (or polling fallback) and updates the UI.
8. Player connects directly to `localhost:<port>` — k3d's Docker port mapping forwards it straight to the Pod.
