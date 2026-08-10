import { toNodePort } from '../services/portAllocator.js';

export function buildConfigMap({ configmapName, namespace, mcType, mcVersion, memoryLimitMb }) {
  return {
    metadata: { name: configmapName, namespace, labels: { app: 'mc-server' } },
    data: {
      EULA: 'TRUE',
      TYPE: mcType,
      VERSION: mcVersion,
      MEMORY: `${memoryLimitMb}M`,
      ENABLE_RCON: 'true',
    },
  };
}

export function buildPVC({ pvcName, namespace }) {
  return {
    metadata: { name: pvcName, namespace, labels: { app: 'mc-server' } },
    spec: {
      accessModes: ['ReadWriteOnce'],
      resources: { requests: { storage: '5Gi' } },
    },
  };
}

export function buildPod({
  podName,
  namespace,
  serverId,
  ownerId,
  configmapName,
  pvcName,
  memoryLimitMb,
  cpuLimit,
}) {
  return {
    metadata: {
      name: podName,
      namespace,
      labels: { app: 'mc-server', 'mc-server-id': serverId, 'mc-owner-id': ownerId },
    },
    spec: {
      containers: [
        {
          name: 'minecraft',
          image: 'itzg/minecraft-server:latest',
          envFrom: [{ configMapRef: { name: configmapName } }],
          ports: [
            { name: 'mc', containerPort: 25565 },
            { name: 'rcon', containerPort: 25575 },
          ],
          resources: {
            limits: { memory: `${memoryLimitMb}Mi`, cpu: `${cpuLimit}` },
            requests: { memory: `${Math.floor(memoryLimitMb / 2)}Mi`, cpu: `${cpuLimit / 2}` },
          },
          volumeMounts: [{ name: 'data', mountPath: '/data' }],
          readinessProbe: {
            exec: { command: ['mc-monitor', 'status', '--host', 'localhost'] },
            initialDelaySeconds: 20,
            periodSeconds: 10,
            failureThreshold: 30,
          },
        },
      ],
      volumes: [{ name: 'data', persistentVolumeClaim: { claimName: pvcName } }],
      restartPolicy: 'Always',
    },
  };
}

export function buildService({ serviceName, namespace, serverId, port }) {
  return {
    metadata: { name: serviceName, namespace, labels: { app: 'mc-server', 'mc-server-id': serverId } },
    spec: {
      type: 'NodePort',
      selector: { 'mc-server-id': serverId },
      ports: [
        { name: 'mc', port: 25565, targetPort: 25565, nodePort: toNodePort(port) },
      ],
    },
  };
}
