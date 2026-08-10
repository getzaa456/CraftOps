import { query } from './pool.js';

export async function createUser({ email, passwordHash }) {
  const res = await query(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     RETURNING id, email, plan, max_servers, created_at`,
    [email, passwordHash]
  );
  return res.rows[0];
}

export async function findUserByEmail(email) {
  const res = await query(`SELECT * FROM users WHERE email = $1`, [email]);
  return res.rows[0] || null;
}

export async function findUserById(id) {
  const res = await query(`SELECT * FROM users WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

export async function countUserServers(userId) {
  const res = await query(
    `SELECT COUNT(*)::int AS count FROM servers
     WHERE owner_id = $1 AND status != 'deleted'`,
    [userId]
  );
  return res.rows[0].count;
}
