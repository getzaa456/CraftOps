import { query } from './pool.js';

export async function insertBackup({ serverId, filePath, sizeBytes }) {
  const res = await query(
    `INSERT INTO backups (server_id, file_path, size_bytes) VALUES ($1, $2, $3) RETURNING *`,
    [serverId, filePath, sizeBytes]
  );
  return res.rows[0];
}

export async function listBackupsByServer(serverId) {
  const res = await query(
    `SELECT * FROM backups WHERE server_id = $1 ORDER BY created_at DESC`,
    [serverId]
  );
  return res.rows;
}

export async function getBackupById(id) {
  const res = await query(`SELECT * FROM backups WHERE id = $1`, [id]);
  return res.rows[0] || null;
}
