import { useState } from 'react';
import { api } from '../api/client.js';

const TYPES = ['PAPER', 'VANILLA', 'FORGE', 'FABRIC'];
const MEMORY_OPTIONS = [1024, 2048, 4096, 8192];

export function CreateServerModal({ onClose, onCreated }) {
  const [mcType, setMcType] = useState('PAPER');
  const [mcVersion, setMcVersion] = useState('1.20.4');
  const [memoryLimitMb, setMemoryLimitMb] = useState(2048);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.createServer({ mc_type: mcType, mc_version: mcVersion, memory_limit_mb: memoryLimitMb });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginBottom: 'var(--space-4)' }}>New Server</h2>

        <form className="stack" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="mc-type">Server type</label>
            <select id="mc-type" value={mcType} onChange={(e) => setMcType(e.target.value)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="mc-version">Minecraft version</label>
            <input
              id="mc-version"
              value={mcVersion}
              onChange={(e) => setMcVersion(e.target.value)}
              placeholder="1.20.4"
              required
            />
          </div>

          <div className="field">
            <label htmlFor="mc-memory">Memory limit</label>
            <select
              id="mc-memory"
              value={memoryLimitMb}
              onChange={(e) => setMemoryLimitMb(Number(e.target.value))}
            >
              {MEMORY_OPTIONS.map((mb) => (
                <option key={mb} value={mb}>{mb} MB</option>
              ))}
            </select>
          </div>

          {error && <div className="field-error">{error}</div>}

          <div className="row" style={{ marginTop: 'var(--space-2)' }}>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create server'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
