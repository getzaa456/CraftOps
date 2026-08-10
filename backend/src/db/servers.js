import { pool, query } from './pool.js';
import { config } from '../config.js';
import { NoPortsAvailableError } from '../errors.js';

/**
 * Allocates the first free port in the configured pool and inserts the
 * server row in one DB transaction, guarded by a Postgres advisory lock.
 * This prevents two concurrent "create server" requests from picking the
 * same port (a plain SELECT-then-INSERT would race).
 */
export async function allocatePortAndInsertServer({
  ownerId,
  podName,
  serviceName,
  pvcName,
  configmapName,
  namespace,
  mcType,
  mcVersion,
  memoryLimitMb,
  cpuLimit,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Lock released automatically at COMMIT/ROLLBACK (xact-scoped).
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('mc_port_allocation'))`);

    const usedRes = await client.query(
      `SELECT port FROM servers WHERE status IN ('creating', 'running', 'stopped', 'error')`
    );
    const used = new Set(usedRes.rows.map((r) => r.port));

    let port = null;
    for (let p = config.portRangeMin; p <= config.portRangeMax; p++) {
      if (!used.has(p)) {
        port = p;
        break;
      }
    }
    if (port === null) {
      await client.query('ROLLBACK');
      throw new NoPortsAvailableError();
    }

    const insertRes = await client.query(
      `INSERT INTO servers
         (owner_id, pod_name, service_name, pvc_name, configmap_name, namespace,
          port, mc_type, mc_version, memory_limit_mb, cpu_limit, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'creating')
       RETURNING *`,
      [
        ownerId, podName, serviceName, pvcName, configmapName, namespace,
        port, mcType, mcVersion, memoryLimitMb, cpuLimit,
      ]
    );

    await client.query('COMMIT');
    return insertRes.rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function updateServerStatus(id, status) {
  const res = await query(
    `UPDATE servers SET status = $2 WHERE id = $1 RETURNING *`,
    [id, status]
  );
  return res.rows[0];
}

export async function getServerById(id) {
  const res = await query(`SELECT * FROM servers WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

export async function listServersByOwner(ownerId) {
  const res = await query(
    `SELECT * FROM servers WHERE owner_id = $1 AND status != 'deleted' ORDER BY created_at DESC`,
    [ownerId]
  );
  return res.rows;
}

export async function deleteServerRow(id) {
  await query(`UPDATE servers SET status = 'deleted' WHERE id = $1`, [id]);
}
