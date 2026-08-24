import stream from 'stream';
import { log as k8sLog } from '../k8s/client.js';
import { getServer } from './serverService.js';

export async function streamLogsToSocket(userId, serverId, ws) {
  const server = await getServer(userId, serverId);
  const controller = new AbortController();

  const sink = new stream.Writable({
    write(chunk, encoding, callback) {
      const text = chunk.toString();
      for (const line of text.split('\n').filter(Boolean)) {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ line }));
      }
      callback();
    },
  });

  await k8sLog.log(server.namespace, server.pod_name, 'minecraft', sink, {
    follow: true,
    tailLines: 100,
    pretty: false,
    timestamps: false,
    abortController: controller,
  });

  return controller;
}