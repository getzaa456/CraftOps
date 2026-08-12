import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.js';
import {
  createServer,
  listServers,
  getServer,
  startServer,
  stopServer,
  deleteServer,
} from '../services/serverService.js';
import { sendCommand } from '../services/commandService.js';
import { listFiles, downloadFile, uploadFile } from '../services/fileService.js';
import { createBackup, listBackups, restoreBackup } from '../services/backupService.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export const serversRouter = Router();
serversRouter.use(requireAuth);

const ALLOWED_TYPES = new Set(['VANILLA', 'PAPER', 'FORGE', 'FABRIC']);
// Simple allow-list validation — never pass raw user input straight into
// container env vars / k8s manifests.
function validateCreateBody(body) {
  const { mc_type, mc_version, memory_limit_mb } = body;
  if (!ALLOWED_TYPES.has(mc_type)) return 'invalid mc_type';
  if (typeof mc_version !== 'string' || !/^[\w.\-]{1,20}$/.test(mc_version)) return 'invalid mc_version';
  if (memory_limit_mb && (memory_limit_mb < 512 || memory_limit_mb > 8192)) return 'memory_limit_mb out of range';
  return null;
}

serversRouter.post('/', async (req, res, next) => {
  try {
    const error = validateCreateBody(req.body);
    if (error) return res.status(400).json({ error });

    const server = await createServer(req.user.sub, {
      mcType: req.body.mc_type,
      mcVersion: req.body.mc_version,
      memoryLimitMb: req.body.memory_limit_mb,
    });
    res.status(201).json({ id: server.id, port: server.port, status: server.status });
  } catch (err) {
    next(err);
  }
});

serversRouter.get('/', async (req, res, next) => {
  try {
    res.json(await listServers(req.user.sub));
  } catch (err) {
    next(err);
  }
});

serversRouter.get('/:id', async (req, res, next) => {
  try {
    res.json(await getServer(req.user.sub, req.params.id));
  } catch (err) {
    next(err);
  }
});

serversRouter.post('/:id/start', async (req, res, next) => {
  try {
    const server = await startServer(req.user.sub, req.params.id);
    res.json({ status: server.status });
  } catch (err) {
    next(err);
  }
});

serversRouter.post('/:id/stop', async (req, res, next) => {
  try {
    const server = await stopServer(req.user.sub, req.params.id);
    res.json({ status: server.status });
  } catch (err) {
    next(err);
  }
});

serversRouter.delete('/:id', async (req, res, next) => {
  try {
    await deleteServer(req.user.sub, req.params.id);
    res.status(202).json({ status: 'deleting' });
  } catch (err) {
    next(err);
  }
});

serversRouter.post('/:id/command', async (req, res, next) => {
  try {
    const { command } = req.body;
    if (!command || typeof command !== 'string') return res.status(400).json({ error: 'command required' });
    const output = await sendCommand(req.user.sub, req.params.id, command);
    res.json({ output });
  } catch (err) {
    next(err);
  }
});

// ── Files ──────────────────────────────────────────────
serversRouter.get('/:id/files', async (req, res, next) => {
  try {
    const files = await listFiles(req.user.sub, req.params.id, req.query.path);
    res.json(files);
  } catch (err) {
    next(err);
  }
});

serversRouter.get('/:id/files/download', async (req, res, next) => {
  try {
    const { buffer, filename } = await downloadFile(req.user.sub, req.params.id, req.query.path);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

serversRouter.post('/:id/files/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const result = await uploadFile(req.user.sub, req.params.id, req.query.path || req.body.path, req.file.originalname, req.file.buffer);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// ── Backups ────────────────────────────────────────────
serversRouter.post('/:id/backups', async (req, res, next) => {
  try {
    const backup = await createBackup(req.user.sub, req.params.id);
    res.status(201).json(backup);
  } catch (err) {
    next(err);
  }
});

serversRouter.get('/:id/backups', async (req, res, next) => {
  try {
    res.json(await listBackups(req.user.sub, req.params.id));
  } catch (err) {
    next(err);
  }
});

serversRouter.post('/:id/backups/:backupId/restore', async (req, res, next) => {
  try {
    res.status(202).json(await restoreBackup(req.user.sub, req.params.id, req.params.backupId));
  } catch (err) {
    next(err);
  }
});
