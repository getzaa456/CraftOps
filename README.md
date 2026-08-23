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
- [ ] Phase 9 — Monitoring & logging
- [ ] Phase 10 — Documentation polish

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

# 3. Backend
npm run dev   # http://localhost:4000

# 4. Frontend
cd ../frontend && cp .env.example .env
npm install
npm run dev   # http://localhost:5173
```

## CI (Phase 8)

GitHub Actions, validation only — there's no deploy step, since there's
nowhere for GitHub's runners to deploy *to*:

- **`.github/workflows/ci.yml`** — every push/PR: backend unit tests
  (`node --test`), backend + frontend Docker builds (build-only, nothing
  pushed anywhere — these images aren't used by anything in this project
  beyond validating the Dockerfiles build cleanly), and the frontend Vite
  build.

## License

MIT — see [LICENSE](LICENSE).
