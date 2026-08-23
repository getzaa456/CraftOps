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
| CI/CD | GitHub Actions (build images, run tests, redeploy to local k3d via self-hosted runner) |
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
- [x] Phase 5 — Frontend dashboard
- [x] Phase 6 — File manager + backups
- [x] Phase 7 — k3d cluster setup
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

# 3. Backend
npm run dev   # http://localhost:4000

# 4. Frontend
cd ../frontend && cp .env.example .env
npm install
npm run dev   # http://localhost:5173
```

## CI/CD (Phase 8)

Two separate GitHub Actions workflows, because this project has no cloud
account and no registry — CI validates on GitHub's own runners; CD deploys
to *your* machine, which GitHub's runners can't reach.

- **`.github/workflows/ci.yml`** — every push/PR, on GitHub-hosted runners:
  backend unit tests (`node --test`), backend + frontend Docker builds
  (build-only, nothing pushed anywhere), frontend Vite build, and
  `k8s/*.yaml` validated against the real Kubernetes schema with
  [kubeconform](https://github.com/yannh/kubeconform) — no live cluster
  needed for this check.
- **`.github/workflows/deploy.yml`** — push to `main`, but only runs on a
  **self-hosted runner**: rebuilds both images, `k3d image import`s them,
  re-applies `k8s/`, re-runs the migration Job, and rolls the Deployments.

### Self-hosted runner setup

The runner must live on the same machine as your k3d cluster (it needs
`docker`, `k3d`, and `kubectl` on its `PATH`, and your kubeconfig).

1. GitHub repo → **Settings → Actions → Runners → New self-hosted runner**,
   follow the generated `./config.sh` command for your OS.
2. Run it as a background service (`./svc.sh install && ./svc.sh start` on
   Linux/macOS) so it's always listening for pushes to `main`.
3. Push to `main` — the **Deploy (local k3d)** workflow picks it up.

Without a registered self-hosted runner, `deploy.yml` simply has nothing to
run on and stays queued — `ci.yml` still runs normally on every push.

## License

MIT — see [LICENSE](LICENSE).