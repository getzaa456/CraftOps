import k8s from '@kubernetes/client-node';

const kc = new k8s.KubeConfig();
// Loads ~/.kube/config for local dev against k3d.
// In-cluster (once the backend itself runs as a Pod) this should switch to
// kc.loadFromCluster() using the mounted ServiceAccount token instead.
kc.loadFromDefault();

export const coreApi = kc.makeApiClient(k8s.CoreV1Api);
export const exec = new k8s.Exec(kc);
export const log = new k8s.Log(kc);
export const kubeConfig = kc;
