import fs from 'fs/promises';
import path from 'path';
import { runInPod } from '../k8s/execHelpers.js';
import { assertServerRunning, getServer } from './serverService.js';
import { config } from '../config.js';
import { insertBackup, listBackupsByServer, getBackupById } from '../db/backups.js';
import { NotFoundError } from '../errors.js';

const REMOTE_TMP = '/tmp/mc-backup.tar.gz';

async function backupDirFor(serverId) {
  const dir = path.join(config.backupDir, serverId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function createBackup(userId, serverId) {
  const server = await assertServerRunning(userId, serverId);

  // Archive /data inside the pod, then pull it out base64-encoded over exec
  // (the backend has no direct mount on the PVC — only the Pod does).
  await runInPod(server.namespace, server.pod_name, 'minecraft', [
    'sh',
    '-c',
    `tar czf ${REMOTE_TMP} -C /data .`,
  ]);
  const { stdout } = await runInPod(server.namespace, server.pod_name, 'minecraft', [
    'sh',
    '-c',
    `base64 ${REMOTE_TMP}`,
  ]);
  await runInPod(server.namespace, server.pod_name, 'minecraft', ['rm', '-f', REMOTE_TMP]).catch(() => {});

  const buffer = Buffer.from(stdout, 'base64');
  const dir = await backupDirFor(serverId);
  const filename = `${new Date().toISOString().replace(/[:.]/g, '-')}.tar.gz`;
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, buffer);

  return insertBackup({ serverId, filePath, sizeBytes: buffer.length });
}

export async function listBackups(userId, serverId) {
  await getServer(userId, serverId); // ownership check; server need not be running to list
  return listBackupsByServer(serverId);
}

export async function restoreBackup(userId, serverId, backupId) {
  const server = await assertServerRunning(userId, serverId);
  const backup = await getBackupById(backupId);
  if (!backup || backup.server_id !== serverId) throw new NotFoundError('Backup');

  const buffer = await fs.readFile(backup.file_path);
  await runInPod(
    server.namespace,
    server.pod_name,
    'minecraft',
    ['sh', '-c', 'base64 -d | tar xzf - -C /data'],
    { stdinText: buffer.toString('base64') }
  );

  return { restored: true, backupId };
}
