import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client.js';

function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

export function BackupsPanel({ serverId, isRunning }) {
  const [backups, setBackups] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setBackups(await api.listBackups(serverId));
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [serverId]);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    setBusy(true);
    try {
      await api.createBackup(serverId);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore(backupId) {
    if (!confirm('Restore this backup? Current world data will be overwritten.')) return;
    setBusy(true);
    try {
      await api.restoreBackup(serverId, backupId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <div className="row-between">
        <h3>Backups</h3>
        <button className="btn btn-sm btn-primary" onClick={handleCreate} disabled={!isRunning || busy}>
          {busy ? 'Working…' : 'Create backup'}
        </button>
      </div>
      {!isRunning && <p className="server-card-meta">Start the server to create or restore backups.</p>}
      {error && <div className="banner">{error}</div>}
      {backups === null && <p>Loading…</p>}
      {backups?.length === 0 && <p className="server-card-meta">No backups yet.</p>}

      {backups?.length > 0 && (
        <div className="stack" style={{ gap: 2 }}>
          {backups.map((b) => (
            <div key={b.id} className="row-between" style={{ padding: '6px 4px', borderBottom: '1px solid rgba(35,36,31,0.1)' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                  {new Date(b.created_at).toLocaleString()}
                </div>
                <div className="server-card-meta">{formatSize(b.size_bytes)}</div>
              </div>
              <button className="btn btn-sm" disabled={!isRunning || busy} onClick={() => handleRestore(b.id)}>
                Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
