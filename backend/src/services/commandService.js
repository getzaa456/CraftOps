import stream from 'stream';
import { exec as k8sExec } from '../k8s/client.js';
import { assertServerRunning } from './serverService.js';

/**
 * Runs `rcon-cli <command>` inside the target Pod's minecraft container
 * and returns its captured stdout. Never opens the RCON port externally —
 * this goes through the Kubernetes exec API, backend credentials only.
 */
export async function sendCommand(userId, serverId, commandText) {
  const server = await assertServerRunning(userId, serverId);

  const stdout = new stream.PassThrough();
  const stderr = new stream.PassThrough();
  let out = '';
  let err = '';
  stdout.on('data', (chunk) => (out += chunk.toString()));
  stderr.on('data', (chunk) => (err += chunk.toString()));

  await new Promise((resolve, reject) => {
    k8sExec
      .exec(
        server.namespace,
        server.pod_name,
        'minecraft',
        ['rcon-cli', commandText],
        stdout,
        stderr,
        null,
        false,
        (status) => (status.status === 'Success' ? resolve() : reject(new Error(err || status.message)))
      )
      .catch(reject);
  });

  return out.trim();
}
