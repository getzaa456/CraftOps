const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';

export function getToken() {
  return localStorage.getItem('mc_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('mc_token', token);
  else localStorage.removeItem('mc_token');
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  register: (email, password) => request('/auth/register', { method: 'POST', body: { email, password }, auth: false }),
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  me: () => request('/auth/me'),

  listServers: () => request('/servers'),
  getServer: (id) => request(`/servers/${id}`),
  createServer: (payload) => request('/servers', { method: 'POST', body: payload }),
  startServer: (id) => request(`/servers/${id}/start`, { method: 'POST' }),
  stopServer: (id) => request(`/servers/${id}/stop`, { method: 'POST' }),
  deleteServer: (id) => request(`/servers/${id}`, { method: 'DELETE' }),
  sendCommand: (id, command) => request(`/servers/${id}/command`, { method: 'POST', body: { command } }),
};
