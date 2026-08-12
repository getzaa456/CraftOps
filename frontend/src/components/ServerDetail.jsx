import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { VoxelBlock } from '../components/VoxelBlock.jsx';
import { StatusBadge } from '../components/StatusBadge.jsx';
import { StatBar } from '../components/StatBar.jsx';
import { Console } from '../components/Console.jsx';
import { FileManager } from '../components/FileManager.jsx';
import { BackupsPanel } from '../components/BackupsPanel.jsx';

const POLL_MS = 4000;

export function ServerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [server, setServer] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('console'); // 'console' | 'files' | 'backups'
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getServer(id);
      setServer(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
    pollRef.current = setInterval(load, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [load]);

  async function run(fn) {
    setBusy(true);
    try {
      await fn(id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this server? World data will be permanently removed.')) return;
    setBusy(true);
    try {
      await api.deleteServer(id);
      navigate('/');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (!server) {
    return (
      <div className="page">
        <Link to="/" className="eyebrow">&larr; Back to servers</Link>
        {error ? <div className="banner" style={{ marginTop: 16 }}>{error}</div> : <p>Loading…</p>}
      </div>
    );
  }

  const canStart = server.status === 'stopped' || server.status === 'error';
  const canStop = server.status === 'running';

  return (
    <div className="page stack">
      <Link to="/" className="eyebrow">&larr; Back to servers</Link>

      <div className="row-between">
        <div className="row">
          <VoxelBlock status={server.status} size="lg" />
          <div>
            <h1>{server.mc_type} · {server.mc_version}</h1>
            <div className="row" style={{ marginTop: 6 }}>
              <StatusBadge status={server.status} />
              <span className="server-card-meta">localhost:{server.port}</span>
            </div>
          </div>
        </div>
        <div className="row">
          {canStart && <button className="btn btn-primary" disabled={busy} onClick={() => run(api.startServer)}>Start</button>}
          {canStop && <button className="btn" disabled={busy} onClick={() => run(api.stopServer)}>Stop</button>}
          <button className="btn btn-danger" disabled={busy} onClick={handleDelete}>Delete</button>
        </div>
      </div>

      {error && <div className="banner">{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 'var(--space-4)' }}>
        <div className="stack">
          <div className="row" style={{ gap: 4 }}>
            {['console', 'files', 'backups'].map((t) => (
              <button
                key={t}
                className={`btn btn-sm ${tab === t ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 'console' && <Console serverId={server.id} status={server.status} />}
          {tab === 'files' && (
            <div className="card">
              <FileManager serverId={server.id} isRunning={server.status === 'running'} />
            </div>
          )}
          {tab === 'backups' && (
            <div className="card">
              <BackupsPanel serverId={server.id} isRunning={server.status === 'running'} />
            </div>
          )}
        </div>

        <div className="card stack">
          <h3>Resources</h3>
          <StatBar label="CPU" value={server.cpu_usage_pct} />
          <StatBar label="Memory" value={server.mem_usage_mb ? (server.mem_usage_mb / server.memory_limit_mb) * 100 : null} />

          <h3 style={{ marginTop: 'var(--space-3)' }}>Details</h3>
          <div className="stack" style={{ gap: 6 }}>
            <div className="row-between server-card-meta"><span>Port</span><span>{server.port}</span></div>
            <div className="row-between server-card-meta"><span>Memory limit</span><span>{server.memory_limit_mb} MB</span></div>
            <div className="row-between server-card-meta"><span>CPU limit</span><span>{server.cpu_limit} vCPU</span></div>
            <div className="row-between server-card-meta"><span>Created</span><span>{new Date(server.created_at).toLocaleDateString()}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
