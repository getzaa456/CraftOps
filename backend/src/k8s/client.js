import * as k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();

// Auto-detect: when the backend itself runs as a Pod (Phase 7+), Kubernetes
// injects KUBERNETES_SERVICE_HOST and mounts a ServiceAccount token — use
// that. Otherwise (local dev, backend running on the host against k3d),
// fall back to the developer's kubeconfig.
if (process.env.KUBERNETES_SERVICE_HOST) {
  kc.loadFromCluster();
} else {
  kc.loadFromDefault();
}

export const coreApi = kc.makeApiClient(k8s.CoreV1Api);
export const exec = new k8s.Exec(kc);
export const log = new k8s.Log(kc);
export const kubeConfig = kc;
