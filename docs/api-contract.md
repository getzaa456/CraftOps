# API Contract

Base URL: `/api/v1`
Auth: `Authorization: Bearer <jwt>` on all routes except `/auth/*`.

## Auth

### `POST /auth/register`
```json
// request
{ "email": "user@example.com", "password": "string" }
// response 201
{ "id": "uuid", "email": "user@example.com" }
```

### `POST /auth/login`
```json
// request
{ "email": "user@example.com", "password": "string" }
// response 200
{ "token": "jwt", "user": { "id": "uuid", "email": "user@example.com" } }
```

## Servers

### `POST /servers`
Create a new Minecraft server.
```json
// request
{
  "mc_type": "PAPER",
  "mc_version": "1.20.4",
  "memory_limit_mb": 2048
}
// response 201
{ "id": "uuid", "port": 25566, "status": "creating" }
```
Errors: `403` quota exceeded, `409` no ports available.

### `GET /servers`
List current user's servers.
```json
// response 200
[
  { "id": "uuid", "status": "running", "port": 25566, "mc_type": "PAPER", "mc_version": "1.20.4" }
]
```

### `GET /servers/:id`
```json
// response 200
{
  "id": "uuid",
  "status": "running",
  "port": 25566,
  "mc_type": "PAPER",
  "mc_version": "1.20.4",
  "cpu_usage_pct": 12.4,
  "mem_usage_mb": 1340,
  "created_at": "2026-08-01T10:00:00Z"
}
```

### `POST /servers/:id/start`
```json
// response 200
{ "status": "running" }
```

### `POST /servers/:id/stop`
```json
// response 200
{ "status": "stopped" }
```

### `DELETE /servers/:id`
```json
// response 202
{ "status": "deleting" }
```

### `GET /servers/:id/logs` (WebSocket)
Streams the Pod's container stdout line-by-line (via Kubernetes log stream API).
```
ws://host/api/v1/servers/:id/logs
→ { "line": "[Server] Done (12.3s)!" }
```

### `POST /servers/:id/command`
Send an RCON command.
```json
// request
{ "command": "say hello" }
// response 200
{ "output": "..." }
```

## Files

### `GET /servers/:id/files?path=/`
List files in the server's PVC-backed data directory.
```json
// response 200
[
  { "name": "world", "type": "dir" },
  { "name": "server.properties", "type": "file", "size": 1421 }
]
```

### `GET /servers/:id/files/download?path=...`
Downloads a file.

### `POST /servers/:id/files/upload`
Multipart upload to a target path (e.g. plugin `.jar`).

## Backups

### `POST /servers/:id/backups`
Trigger a manual backup.
```json
// response 202
{ "status": "backup_started" }
```

### `GET /servers/:id/backups`
```json
// response 200
[
  { "id": "uuid", "file_path": "backups/uuid.tar.gz", "size_bytes": 104857600, "created_at": "2026-08-01T10:00:00Z" }
]
```

### `POST /servers/:id/backups/:backupId/restore`
```json
// response 202
{ "status": "restoring" }
```

## Status Codes

| Code | Meaning |
|---|---|
| 200 | OK |
| 201 | Created |
| 202 | Accepted (async op started) |
| 400 | Validation error |
| 401 | Unauthorized |
| 403 | Forbidden / quota exceeded |
| 404 | Not found |
| 409 | Conflict (e.g. no ports available) |
| 500 | Server error |
