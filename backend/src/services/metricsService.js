import { customObjectsApi } from '../k8s/client.js';
import { k8sApiErrorsTotal } from '../metrics.js';

function parseCpuNanocores(str) {
  if (!str) return null;
  if (str.endsWith('n')) return Number(str.slice(0, -1));
  if (str.endsWith('u')) return Number(str.slice(0, -1)) * 1e3;
  if (str.endsWith('m')) return Number(str.slice(0, -1)) * 1e6;
  return Number(str) * 1e9; // bare number = whole cores
}

const MEM_UNITS = { Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, K: 1000, M: 1000 ** 2, G: 1000 ** 3 };

function parseMemoryBytes(str) {
  if (!str) return null;
  const m = str.match(/^(\d+)([A-Za-z]*)$/);
  if (!m) return null;
  const mult = MEM_UNITS[m[2]] || 1;
  return Number(m[1]) * mult;
}

/**
 * Reads live CPU/memory for a Pod from the metrics-server API
 * (metrics.k8s.io/v1beta1). Requires metrics-server to be installed in the
 * k3d cluster (not part of the default k3s install — see README). Returns
 * nulls rather than throwing if metrics aren't available: this is optional
 * enrichment on top of GET /servers/:id, not a hard dependency — the
 * frontend already renders "—" for null values.
 */
export async function getPodResourceUsage(namespace, podName, { cpuLimitCores, memoryLimitMb }) {
  try {
    const res = await customObjectsApi.getNamespacedCustomObject('metrics.k8s.io', 'v1beta1', namespace, 'pods', podName);
    const container = res.body?.containers?.find((c) => c.name === 'minecraft');
    if (!container) return { cpu_usage_pct: null, mem_usage_mb: null };

    const cpuNano = parseCpuNanocores(container.usage?.cpu);
    const memBytes = parseMemoryBytes(container.usage?.memory);

    const cpu_usage_pct =
      cpuNano != null && cpuLimitCores ? Math.round(((cpuNano / 1e9 / cpuLimitCores) * 100 + Number.EPSILON) * 10) / 10 : null;
    const mem_usage_mb = memBytes != null ? Math.round(memBytes / 1024 / 1024) : null;

    return { cpu_usage_pct, mem_usage_mb };
  } catch (err) {
    // 404 is expected (pod not scraped yet, or metrics-server absent) —
    // not an error worth counting. Anything else is.
    if (err.response?.statusCode !== 404) {
      k8sApiErrorsTotal.inc({ operation: 'get_pod_metrics' });
    }
    return { cpu_usage_pct: null, mem_usage_mb: null };
  }
}
