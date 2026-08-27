# CraftOps

Self-hosted web platform for spinning up, managing, and monitoring Minecraft servers on demand — built as a DevOps portfolio project demonstrating containerization, Kubernetes orchestration, and CI. Runs entirely on a local machine: a local Postgres, a local backend/frontend, and a local Kubernetes cluster (k3d) that hosts the actual Minecraft server Pods. No cloud VPS, and — deliberately — no separate deployment of the platform itself into Kubernetes; that layer was scoped out to keep the project local-dev-only. See `docs/architecture.md` for the reasoning.

## Overview

Users register, click "Create Server," pick a Minecraft version/type, and the platform provisions an isolated Pod running that server inside a local k3d (k3s-in-Docker) cluster. Users can start/stop, view live console output, run RCON commands, manage files, and back up worlds — all from a web dashboard.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React / Next.js |
| Backend | Node.js (Express) + `@kubernetes/client-node` |
| Database | PostgreSQL |
| Container image | `itzg/minecraft-server` |
| Orchestration | Kubernetes via **k3d** — used only to host user-created Minecraft server Pods, not to run the platform itself |
| CI | GitHub Actions — build/test validation only (see below) |
| Ingress | Traefik (bundled with k3s), for the MC servers' own ports |

## Architecture

See [`docs/architecture.md`](docs/architecture.md) for full component diagram, Pod lifecycle, and port allocation design.

```
Frontend (React) → Backend API (Node) → Kubernetes API (k3d) → MC Pods
                          │
                     PostgreSQL
```

## Database Schema

See [`docs/database-schema.sql`](docs/database-schema.sql).

## API Contract

See [`docs/api-contract.md`](docs/api-contract.md) for full endpoint list.

## Roadmap

- [x] Phase 0 — Environment setup
- [x] Phase 1 — Manual Docker Minecraft testing
- [x] Phase 2 — Architecture & schema design
- [x] Phase 3 — Backend API (Kubernetes client integration)
- [x] Phase 4 — Database + Auth
- [x] Phase 5 — Frontend dashboard
- [x] Phase 6 — File manager + backups
- [x] Phase 7 — ~~k3d deploy of the platform~~ — descoped; local-dev-only by design (see architecture.md)
- [x] Phase 8 — CI (build/test validation) — CD dropped along with Phase 7
- [x] Phase 9 — Monitoring & logging
- [x] Phase 10 — Documentation polish

## Local Development

This is the only way this project runs — there's no separate deployment
path for the platform itself.

```bash
# 1. Local Postgres
docker compose -f docker-compose.dev.yml up -d
cd backend && cp .env.example .env
npm install
npm run migrate

# 2. Local Kubernetes cluster — this is *only* for the Minecraft server
#    Pods the app creates on your behalf, not for the app itself
k3d cluster create mc-cluster \
  -p "25565-25600:30565-30600@server:0"
kubectl create namespace mc-servers

# metrics-server isn't part of the default k3s install — add it so the
# dashboard's CPU/memory bars show real numbers instead of "—"
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml
kubectl patch deployment metrics-server -n kube-system --type=json \
  -p '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'

# 3. Backend
npm run dev   # http://localhost:4000

# 4. Frontend
cd ../frontend && cp .env.example .env
npm install
npm run dev   # http://localhost:5173
```

## Monitoring (Phase 9)

Two independent pieces — neither requires deploying the platform into
Kubernetes, keeping this consistent with staying local-dev-only:

- **Structured logs**: the backend logs JSON lines via
  [pino](https://getpino.io) (`src/logger.js`) — one line per request
  (method, path, status, duration, request id) plus explicit `logger.warn`
  /`.error` calls at every failure point that used to just be
  `console.error`. Pipe to `npx pino-pretty` locally for colorized output.
- **Metrics**: the backend exposes Prometheus-format metrics at
  `GET /metrics` (`src/metrics.js`) — HTTP request duration/count, Node
  process stats, `mc_servers_by_status`, `k8s_api_errors_total`. An opt-in
  local Prometheus + Grafana stack scrapes it:
  ```bash
  docker compose -f docker-compose.monitoring.yml up -d
  open http://localhost:9090   # Prometheus
  open http://localhost:3001   # Grafana (anonymous viewer access, Prometheus pre-wired as datasource)
  ```
- **Real per-server CPU/memory**: `GET /servers/:id` now queries
  metrics-server directly (`src/services/metricsService.js`) for the
  running Pod's live usage and fills in `cpu_usage_pct`/`mem_usage_mb` —
  the fields the frontend's `StatBar` always expected but the backend
  never actually populated until now. Falls back to `null` (rendered as
  "—") if metrics-server isn't installed or hasn't scraped yet — this is
  enrichment, not a hard dependency.

## CI (Phase 8)

GitHub Actions, validation only — there's no deploy step, since there's
nowhere for GitHub's runners to deploy *to*:

- **`.github/workflows/ci.yml`** — every push/PR: backend unit tests
  (`node --test`), backend + frontend Docker builds (build-only, nothing
  pushed anywhere — these images aren't used by anything in this project
  beyond validating the Dockerfiles build cleanly), and the frontend Vite
  build.

## Known Limitations

Honest list, not a sales pitch:

- **Tested on Windows during real development, not on Linux/macOS** — the
  Docker/Postgres port workaround in `docker-compose.dev.yml` (5433 instead
  of 5432) is a Windows-specific fix; it's harmless elsewhere but you may
  not need it.
- **Single-node Postgres** — `strategy: Recreate` on the Deployment-era
  manifests (now removed, see architecture.md) and the current
  `docker-compose.dev.yml` both assume one instance; no replication/backup
  beyond the app's own world-backup feature.
- **Backend uses the developer's kubeconfig**, not a scoped-down
  ServiceAccount — fine for a local single-user tool, a real gap if this
  ever ran anywhere less trusted. See architecture.md Security Notes.
- **CPU/memory numbers require metrics-server** installed separately in
  the k3d cluster (not bundled with k3s) — without it, `cpu_usage_pct`/
  `mem_usage_mb` are `null` and the UI shows "—", which is the intended
  fallback, not a bug.

## License

MIT — see [LICENSE](LICENSE).
