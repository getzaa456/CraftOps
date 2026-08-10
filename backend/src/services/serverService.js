import { randomUUID } from 'crypto';
import { coreApi } from '../k8s/client.js';
import { buildConfigMap, buildPVC, buildPod, buildService } from '../k8s/manifests.js';
import {
  allocatePortAndInsertServer,
  getServerById,
  listServersByOwner,
  updateServerStatus,
  deleteServerRow,
} from '../db/servers.js';
import { countUserServers, findUserById } from '../db/users.js';
import { config } from '../config.js';
import { QuotaExceededError, NotFoundError } from '../errors.js';

async function assertOwnership(serverId, userId) {
  const server = await getServerById(serverId);
  if (!server || server.owner_id !== userId || server.status === 'deleted') {
    throw new NotFoundError('Server');
  }
  return server;
}

export async function createServer(userId, { mcType, mcVersion, memoryLimitMb = 2048, cpuLimit = 1.0 }) {
  const user = await findUserById(userId);
  const used = await countUserServers(userId);
  if (used >= user.max_servers) throw new QuotaExceededError();

  const serverId = randomUUID();
  const namespace = config.k8sNamespace;
  const names = {
    podName: `mc-${userId}-${serverId}`,
    serviceName: `svc-mc-${serverId}`,
    pvcName: `pvc-mc-${serverId}`,
    configmapName: `cfg-mc-${serverId}`,
  };

  // Insert row first (status=creating) — this is what actually reserves the port,
  // atomically, inside a DB transaction. See db/servers.js.
  const server = await allocatePortAndInsertServer({
    ownerId: userId,
    ...names,
    namespace,
    mcType,
    mcVersion,
    memoryLimitMb,
    cpuLimit,
  });

  try {
    await coreApi.createNamespacedConfigMap(
      namespace,
      buildConfigMap({ ...names, namespace, mcType, mcVersion, memoryLimitMb })
    );
    await coreApi.createNamespacedPersistentVolumeClaim(namespace, buildPVC({ ...names, namespace }));
    await coreApi.createNamespacedPod(
      namespace,
      buildPod({ ...names, namespace, serverId: server.id, ownerId: userId, memoryLimitMb, cpuLimit })
    );
    await coreApi.createNamespacedService(
      namespace,
      buildService({ ...names, namespace, serverId: server.id, port: server.port })
    );
  } catch (err) {
    await updateServerStatus(server.id, 'error');
    throw err;
  }

  // Actual creating -> running transition is driven by k8s/statusWatcher.js
  // once the Pod passes its readiness probe, not here.
  return server;
}

export async function getServer(userId, serverId) {
  return assertOwnership(serverId, userId);
}

export async function assertServerRunning(userId, serverId) {
  const server = await assertOwnership(serverId, userId);
  if (server.status !== 'running') {
    const err = new Error('Server is not running');
    err.status = 409;
    throw err;
  }
  return server;
}

export async function listServers(userId) {
  return listServersByOwner(userId);
}

export async function stopServer(userId, serverId) {
  const server = await assertOwnership(serverId, userId);
  await coreApi
    .deleteNamespacedPod(server.pod_name, server.namespace)
    .catch((err) => {
      if (err.response?.statusCode !== 404) throw err;
    });
  return updateServerStatus(serverId, 'stopped');
}

export async function startServer(userId, serverId) {
  const server = await assertOwnership(serverId, userId);
  if (server.status === 'running') return server;

  await coreApi.createNamespacedPod(
    server.namespace,
    buildPod({
      podName: server.pod_name,
      namespace: server.namespace,
      serverId: server.id,
      ownerId: userId,
      configmapName: server.configmap_name,
      pvcName: server.pvc_name,
      memoryLimitMb: server.memory_limit_mb,
      cpuLimit: server.cpu_limit,
    })
  );
  return updateServerStatus(serverId, 'creating');
}

export async function deleteServer(userId, serverId) {
  const server = await assertOwnership(serverId, userId);
  await updateServerStatus(serverId, 'deleting');

  const ns = server.namespace;
  await Promise.allSettled([
    coreApi.deleteNamespacedPod(server.pod_name, ns),
    coreApi.deleteNamespacedService(server.service_name, ns),
    coreApi.deleteNamespacedPersistentVolumeClaim(server.pvc_name, ns),
    coreApi.deleteNamespacedConfigMap(server.configmap_name, ns),
  ]);

  await deleteServerRow(serverId);
}
