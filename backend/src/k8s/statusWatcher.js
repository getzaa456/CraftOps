import k8s from '@kubernetes/client-node';
import { kubeConfig } from './client.js';
import { config } from '../config.js';
import { updateServerStatus } from '../db/servers.js';

const watch = new k8s.Watch(kubeConfig);

function isPodReady(pod) {
  const conditions = pod.status?.conditions || [];
  return conditions.some((c) => c.type === 'Ready' && c.status === 'True');
}

function isCrashLooping(pod) {
  const statuses = pod.status?.containerStatuses || [];
  return statuses.some((s) => s.state?.waiting?.reason === 'CrashLoopBackOff');
}

/**
 * Long-running watch over all Pods in the mc-servers namespace.
 * Flips DB status running/error based on live Pod state instead of polling.
 * Call once at process startup.
 */
export function startStatusWatcher() {
  watch
    .watch(
      `/api/v1/namespaces/${config.k8sNamespace}/pods`,
      { labelSelector: 'app=mc-server' },
      async (type, pod) => {
        const serverId = pod.metadata?.labels?.['mc-server-id'];
        if (!serverId) return;

        try {
          if (type === 'DELETED') return; // deletion handled explicitly by serverService
          if (isCrashLooping(pod)) {
            await updateServerStatus(serverId, 'error');
          } else if (isPodReady(pod)) {
            await updateServerStatus(serverId, 'running');
          }
        } catch (err) {
          console.error('status watcher update failed', serverId, err.message);
        }
      },
      (err) => {
        if (err) console.error('k8s watch closed with error, restarting in 5s', err.message);
        setTimeout(startStatusWatcher, 5000);
      }
    )
    .catch((err) => {
      console.error('failed to start k8s watch, retrying in 5s', err.message);
      setTimeout(startStatusWatcher, 5000);
    });
}
