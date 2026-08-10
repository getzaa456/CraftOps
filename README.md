# CraftOps

Self-hosted web platform for spinning up, managing, and monitoring Minecraft servers on demand — built as a DevOps portfolio project demonstrating containerization, Kubernetes orchestration, CI/CD, and monitoring. Runs entirely on a local machine using a local Kubernetes cluster (k3d) — no cloud VPS required.

## Overview

Users register, click "Create Server," pick a Minecraft version/type, and the platform provisions an isolated Pod running that server inside a local k3d (k3s-in-Docker) cluster. Users can start/stop, view live console output, run RCON commands, manage files, and back up worlds — all from a web dashboard.

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React / Next.js |
| Backend | Node.js (Express) + `@kubernetes/client-node` |
| Database | PostgreSQL |
| Container image | `itzg/minecraft-server` |
| Orchestration | Kubernetes via **k3d** (local, Docker-in-Docker k3s cluster) |
| Packaging | Helm chart |
| CI/CD | GitHub Actions (build images, run tests, redeploy to local k3d via self-hosted runner or manual `helm upgrade`) |
| Monitoring | Prometheus + Grafana (deployed in-cluster) |
| Ingress | Traefik (bundled with k3s) |

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
- [ ] Phase 5 — Frontend dashboard
- [ ] Phase 6 — File manager + backups
- [ ] Phase 7 — k3d cluster setup + Helm packaging
- [ ] Phase 8 — CI/CD pipeline (build + local redeploy)
- [ ] Phase 9 — Monitoring & logging (Prometheus/Grafana in-cluster)
- [ ] Phase 10 — Documentation polish

## Local Development

```bash
# 1. Local Postgres for dev (separate from the k3d cluster)
docker compose -f docker-compose.dev.yml up -d
cd backend && cp .env.example .env
npm install
npm run migrate

# 2. Point kubectl/backend at a local k8s cluster with a port range for MC servers
k3d cluster create mc-cluster \
  -p "25565-25600:30565-30600@server:0"
kubectl create namespace mc-servers

# 3. Run the backend
npm run dev
```

> Phase 7 replaces steps 1–3 with a Helm chart deploying backend, frontend, and Postgres *inside* the same k3d cluster — see roadmap.

## License

MIT — see [LICENSE](LICENSE).
