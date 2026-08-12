import stream from 'stream';
import { exec as k8sExec } from './client.js';

/**
 * Runs a command inside a Pod's container via the Kubernetes exec API and
 * resolves with captured stdout/stderr text. Used for file listing,
 * download/upload (via base64 over stdin/stdout), and backup tar/untar —
 * the backend never mounts the PVC directly, only the Pod does.
 */
export function runInPod(namespace, podName, containerName, command, { stdinText } = {}) {
  const stdout = new stream.PassThrough();
  const stderr = new stream.PassThrough();
  const outChunks = [];
  const errChunks = [];
  stdout.on('data', (c) => outChunks.push(c));
  stderr.on('data', (c) => errChunks.push(c));

  const stdin = stdinText != null ? stream.Readable.from([stdinText]) : null;

  return new Promise((resolve, reject) => {
    k8sExec
      .exec(namespace, podName, containerName, command, stdout, stderr, stdin, false, (status) => {
        const stdoutText = Buffer.concat(outChunks).toString('utf8');
        const stderrText = Buffer.concat(errChunks).toString('utf8');
        if (status.status === 'Success') {
          resolve({ stdout: stdoutText, stderr: stderrText });
        } else {
          reject(new Error(stderrText || status.message || 'command failed in pod'));
        }
      })
      .catch(reject);
  });
}
