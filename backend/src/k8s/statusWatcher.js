import k8s from '@kubernetes/client-node';
import { kubeConfig } from './client.js';
import { config } from '../config.js';
import { updateServerStatus, countServersByStatus } from '../db/servers.js';
import { logger } from '../logger.js';
import { k8sApiErrorsTotal, mcServersByStatus } from '../metrics.js';

const watch = new k8s.Watch(kubeConfig);

function isPodReady(pod) {
  const conditions = pod.status?.conditions || [];
  return conditions.some((c) => c.type === 'Ready' && c.status === 'True');
}

function isCrashLooping(pod) {
  const statuses = pod.status?.containerStatuses || [];
  return statuses.some((s) => s.state?.waiting?.reason === 'CrashLoopBackOff');
}

/** Refreshes the mc_servers_by_status gauge from the DB. Best-effort — never throws. */
export async function refreshServerStatusGauge() {
  try {
    const counts = await countServersByStatus();
    for (const { status, count } of counts) {
      mcServersByStatus.set({ status }, count);
    }
  } catch (err) {
    logger.warn({ err }, 'failed to refresh mc_servers_by_status gauge');
  }
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
          await refreshServerStatusGauge();
        } catch (err) {
          logger.error({ err, serverId }, 'status watcher update failed');
        }
      },
      (err) => {
        if (err) {
          k8sApiErrorsTotal.inc({ operation: 'watch_pods' });
          logger.warn({ err }, 'k8s watch closed with error, restarting in 5s');
        }
        setTimeout(startStatusWatcher, 5000);
      }
    )
    .catch((err) => {
      k8sApiErrorsTotal.inc({ operation: 'watch_pods_start' });
      logger.warn({ err }, 'failed to start k8s watch, retrying in 5s');
      setTimeout(startStatusWatcher, 5000);
    });

  refreshServerStatusGauge();
}
