import { runInPod } from '../k8s/execHelpers.js';
import { assertServerRunning } from './serverService.js';
import { resolveSafePath, sanitizeFilename } from './pathSafety.js';

function shQuote(p) {
  return `'${p.replace(/'/g, `'\\''`)}'`;
}

export async function listFiles(userId, serverId, relPath) {
  const server = await assertServerRunning(userId, serverId);
  const dir = resolveSafePath(relPath);

  const { stdout } = await runInPod(server.namespace, server.pod_name, 'minecraft', [
    'sh',
    '-c',
    `find ${shQuote(dir)} -mindepth 1 -maxdepth 1 -printf '%f\\t%y\\t%s\\n' 2>&1`,
  ]);

  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [name, kind, size] = line.split('\t');
      return { name, type: kind === 'd' ? 'dir' : 'file', size: Number(size) || 0 };
    });
}

export async function downloadFile(userId, serverId, relPath) {
  const server = await assertServerRunning(userId, serverId);
  const filePath = resolveSafePath(relPath);

  const { stdout } = await runInPod(server.namespace, server.pod_name, 'minecraft', [
    'sh',
    '-c',
    `base64 ${shQuote(filePath)}`,
  ]);

  return { buffer: Buffer.from(stdout, 'base64'), filename: filePath.split('/').pop() };
}

export async function uploadFile(userId, serverId, targetDirRelPath, originalname, buffer) {
  const server = await assertServerRunning(userId, serverId);
  const dir = resolveSafePath(targetDirRelPath);
  const filename = sanitizeFilename(originalname);
  const target = `${dir.replace(/\/$/, '')}/${filename}`;

  await runInPod(
    server.namespace,
    server.pod_name,
    'minecraft',
    ['sh', '-c', `base64 -d > ${shQuote(target)}`],
    { stdinText: buffer.toString('base64') }
  );

  return { name: filename, path: targetDirRelPath };
}
