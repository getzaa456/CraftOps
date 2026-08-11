import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { useServerLogs } from '../hooks/useServerLogs.js';

export function Console({ serverId, status }) {
  const isRunning = status === 'running';
  const { lines, connected, appendLocal } = useServerLogs(serverId, isRunning);
  const [command, setCommand] = useState('');
  const [sending, setSending] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lines]);

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = command.trim();
    if (!trimmed || sending) return;

    appendLocal(`> ${trimmed}`, 'system');
    setCommand('');
    setSending(true);
    try {
      const { output } = await api.sendCommand(serverId, trimmed);
      if (output) appendLocal(output, 'system');
    } catch (err) {
      appendLocal(err.message, 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="console">
      <div ref={logRef} className="console-log">
        {lines.length === 0 && (
          <div className="console-log-line system">
            {isRunning ? (connected ? 'Connected. Waiting for output…' : 'Connecting…') : 'Server is not running — start it to view the console.'}
          </div>
        )}
        {lines.map((entry, i) => (
          <div key={i} className={`console-log-line ${entry.kind || ''}`}>
            {entry.line}
          </div>
        ))}
      </div>
      <form className="console-input" onSubmit={handleSubmit}>
        <span className="prompt">/</span>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={isRunning ? 'say hello' : 'server offline'}
          disabled={!isRunning || sending}
        />
      </form>
    </div>
  );
}
