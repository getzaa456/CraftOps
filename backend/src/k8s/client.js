import k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();
// Always loads the developer's local kubeconfig (pointed at k3d). The
// backend runs on the host, not as a Pod, so there's no in-cluster
// ServiceAccount to fall back to — see docs/architecture.md
// "Local-Dev-Only, By Design" for why, and the trade-off that comes with it.
kc.loadFromDefault();

export const coreApi = kc.makeApiClient(k8s.CoreV1Api);
export const customObjectsApi = kc.makeApiClient(k8s.CustomObjectsApi);
export const exec = new k8s.Exec(kc);
export const log = new k8s.Log(kc);
export const kubeConfig = kc;
