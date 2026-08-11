import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ServerCard } from '../components/ServerCard.jsx';
import { CreateServerModal } from '../components/CreateServerModal.jsx';

const POLL_MS = 5000;

export function Dashboard() {
  const { user } = useAuth();
  const [servers, setServers] = useState(null); // null = loading
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await api.listServers();
      setServers(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [load]);

  async function withBusy(id, fn) {
    setBusyId(id);
    try {
      await fn(id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const onStart = (id) => withBusy(id, api.startServer);
  const onStop = (id) => withBusy(id, api.stopServer);
  const onDelete = (id) => {
    if (!confirm('Delete this server? World data will be permanently removed.')) return;
    withBusy(id, api.deleteServer);
  };

  const atQuota = user && servers && servers.length >= user.max_servers;

  return (
    <div className="page stack">
      <div className="row-between">
        <div>
          <span className="eyebrow">Dashboard</span>
          <h1>Your Servers</h1>
        </div>
        <div className="stack" style={{ alignItems: 'flex-end', gap: 4 }}>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)} disabled={atQuota}>
            + New Server
          </button>
          {user && (
            <span className="server-card-meta">
              {servers?.length ?? 0} / {user.max_servers} used
            </span>
          )}
        </div>
      </div>

      {error && <div className="banner">{error}</div>}

      {servers === null && <p>Loading servers…</p>}

      {servers?.length === 0 && (
        <div className="empty-state">
          <div className="voxel voxel-lg voxel-stopped" style={{ opacity: 0.6 }} />
          <div>
            <h2>No servers yet</h2>
            <p style={{ color: 'var(--stone)', marginTop: 8 }}>
              Spin up your first Minecraft server — pick a version, and it's live in under a minute.
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            + New Server
          </button>
        </div>
      )}

      {servers?.length > 0 && (
        <div className="server-grid">
          {servers.map((s) => (
            <ServerCard
              key={s.id}
              server={s}
              busy={busyId === s.id}
              onStart={onStart}
              onStop={onStop}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateServerModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}
