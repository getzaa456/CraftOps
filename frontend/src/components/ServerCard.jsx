import { Link } from 'react-router-dom';
import { VoxelBlock } from './VoxelBlock.jsx';
import { StatusBadge } from './StatusBadge.jsx';

export function ServerCard({ server, onStart, onStop, onDelete, busy }) {
  const canStart = server.status === 'stopped' || server.status === 'error';
  const canStop = server.status === 'running';

  function stop(e, fn) {
    e.preventDefault();
    e.stopPropagation();
    fn(server.id);
  }

  return (
    <Link to={`/servers/${server.id}`} className="card server-card">
      <div className="server-card-head">
        <VoxelBlock status={server.status} />
        <div>
          <div className="server-card-title">{server.mc_type}</div>
          <div className="server-card-meta">
            {server.mc_version} · :{server.port}
          </div>
        </div>
      </div>

      <StatusBadge status={server.status} />

      <div className="server-card-foot">
        {canStart && (
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={(e) => stop(e, onStart)}>
            Start
          </button>
        )}
        {canStop && (
          <button className="btn btn-sm" disabled={busy} onClick={(e) => stop(e, onStop)}>
            Stop
          </button>
        )}
        <button className="btn btn-sm btn-danger" disabled={busy} onClick={(e) => stop(e, onDelete)}>
          Delete
        </button>
      </div>
    </Link>
  );
}
