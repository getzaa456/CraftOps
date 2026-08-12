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
  
  const targetNamespace = namespace || 'mc-servers';
  
  try {
    // 1. Create ConfigMap
    await coreApi.createNamespacedConfigMap({
      namespace: targetNamespace,
      body: buildConfigMap({ 
        ...names, 
        namespace: targetNamespace, 
        mcType, 
        mcVersion, 
        memoryLimitMb 
      }),
    });
    
    // 2. Create PVC
    await coreApi.createNamespacedPersistentVolumeClaim({
      namespace: targetNamespace,
      body: buildPVC({ ...names, namespace: targetNamespace })
    });
    
    // 3. Create Pod
    await coreApi.createNamespacedPod({
      namespace: targetNamespace,
      body: buildPod({ ...names, namespace: targetNamespace, serverId: server.id, ownerId: userId, memoryLimitMb, cpuLimit })
    });
    
    // 4. Create Service
    await coreApi.createNamespacedService({
      namespace: targetNamespace,
      body: buildService({ ...names, namespace: targetNamespace, serverId: server.id, port: server.port })
    });
    
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
  const targetNamespace = server.namespace || 'mc-servers';
  
  await coreApi
    .deleteNamespacedPod({
      name: server.pod_name,
      namespace: targetNamespace
    })
    .catch((err) => {
      if (err.response?.statusCode !== 404) throw err;
    });
    
  return updateServerStatus(serverId, 'stopped');
}

export async function startServer(userId, serverId) {
  const server = await assertOwnership(serverId, userId);
  if (server.status === 'running') return server;

  // กำหนด namespace ปลอดภัย (เช็กถ้าไม่มีใน DB ให้ถอยไปใช้ 'mc-servers')
  const targetNamespace = server.namespace || 'mc-servers';

  // เรียกใช้ API ในรูปแบบ Object Parameter ({ namespace, body })
  await coreApi.createNamespacedPod({
    namespace: targetNamespace,
    body: buildPod({
      podName: server.pod_name,
      namespace: targetNamespace,
      serverId: server.id,
      ownerId: userId,
      configmapName: server.configmap_name,
      pvcName: server.pvc_name,
      memoryLimitMb: server.memory_limit_mb,
      cpuLimit: server.cpu_limit,
    }),
  });

  return updateServerStatus(serverId, 'creating');
}

export async function deleteServer(userId, serverId) {
  const server = await assertOwnership(serverId, userId);
  await updateServerStatus(serverId, 'deleting');

  const ns = server.namespace || 'mc-servers';
  
  await Promise.allSettled([
    coreApi.deleteNamespacedPod({ name: server.pod_name, namespace: ns }),
    coreApi.deleteNamespacedService({ name: server.service_name, namespace: ns }),
    coreApi.deleteNamespacedPersistentVolumeClaim({ name: server.pvc_name, namespace: ns }),
    coreApi.deleteNamespacedConfigMap({ name: server.configmap_name, namespace: ns }),
  ]);

  await deleteServerRow(serverId);
}