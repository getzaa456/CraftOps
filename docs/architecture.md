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

Everything — the platform itself (frontend, backend, postgres) and every user-created Minecraft server — runs inside a single local **k3d** cluster (k3s running as Docker containers). No cloud VPS is used; the "infrastructure" is the developer's own machine.

## Responsibilities

- **Frontend**: auth UI, server dashboard, live console (WebSocket), file manager, resource graphs.
- **Backend API**: auth, quota enforcement, port allocation, Kubernetes object lifecycle (create/delete Pod + Service + PVC + ConfigMap), RCON command relay, log streaming, backup jobs.
- **Kubernetes API (k3d)**: schedules and runs one Pod per Minecraft server, isolated by namespace/name, exposed via a NodePort Service.
- **PostgreSQL**: source of truth for users, server metadata, backup records. Runs as its own Deployment + PVC inside the cluster.

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

- Namespace: all MC servers live in a dedicated `mc-servers` namespace, separate from the platform's own `mc-platform` namespace.
- Pod: `mc-{owner_id}-{server_id}`
- Service: `svc-mc-{server_id}`
- PVC: `pvc-mc-{server_id}` (holds `/data` — world files, plugins, configs)
- ConfigMap: `cfg-mc-{server_id}` (holds `TYPE`, `VERSION`, `MEMORY`, etc. env vars)
- Resource limits set via `resources.limits`/`resources.requests` on the Pod spec (CPU/memory) — prevents one server from starving the node.

## Security Notes

- The backend authenticates to the Kubernetes API using a **ServiceAccount** scoped by **RBAC** to only the `mc-servers` namespace and only the verbs it needs (create/get/list/delete on Pods, Services, PVCs, ConfigMaps) — it cannot touch the `mc-platform` namespace or cluster-wide resources.
- The raw Kubernetes API / kubeconfig is never exposed to the frontend; only the backend holds cluster credentials.
- All Pod-creation inputs (`mc_type`, `mc_version`, `memory_limit_mb`) are validated against an allow-list before being templated into the Pod manifest, to prevent injection via crafted env vars.
- RCON commands are relayed backend → Pod only (via `kubectl exec`-equivalent through the client library); the RCON port is never exposed via a Service.
- Per-user quotas (max servers, max memory) enforced at the API layer before any Kubernetes object is created; a Kubernetes `ResourceQuota` on the `mc-servers` namespace acts as a hard backstop.

## Data Flow: Create Server

1. User submits form → `POST /servers`.
2. Backend checks user quota.
3. Backend allocates a free port from the 25565–25600 pool.
4. Backend inserts a `servers` row with `status = creating`.
5. Backend calls the Kubernetes API to create, in order: ConfigMap → PVC → Pod → Service (NodePort).
6. Backend watches the Pod's logs until the "Done" marker appears, then updates `status = running`.
7. Frontend receives the status change via WebSocket (or polling fallback) and updates the UI.
8. Player connects directly to `localhost:<port>` — k3d's Docker port mapping forwards it straight to the Pod.
