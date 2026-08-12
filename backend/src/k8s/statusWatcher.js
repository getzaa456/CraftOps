import * as k8s from '@kubernetes/client-node';
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
  // เพิ่ม Fallback ป้องกันค่า namespace จาก config เป็น undefined
  const namespace = config.k8sNamespace || 'mc-servers';

  watch
    .watch(
      `/api/v1/namespaces/${namespace}/pods`,
      { labelSelector: 'app=mc-server' },
      async (type, pod) => {
        // ดึง serverId จาก Label ของ Pod
        const serverId = pod.metadata?.labels?.['mc-server-id'];
        if (!serverId) return;

        try {
          // 🛠️ จุดที่แก้ไข: ดักจับกรณี Pod ถูกลบ (DELETED) หรือกำลังเข้าสู่กระบวนการลบ (Terminating)
          if (type === 'DELETED' || pod.metadata?.deletionTimestamp) {
            // เราสั่ง return ออกไปเลย เพื่อให้ API `stopServer` เป็นคนเปลี่ยนสถานะ DB เป็น 'stopped' 
            // โดยที่ watcher ตัวนี้จะไม่ไปกวนหรือเขียนทับให้กลับมาเป็น 'running' อีก
            return;
          }

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