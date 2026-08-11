import { useEffect, useRef, useState } from 'react';
import { getToken } from '../api/client.js';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:4000/api/v1';
const MAX_LINES = 400;

export function useServerLogs(serverId, enabled) {
  const [lines, setLines] = useState([]);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  useEffect(() => {
    if (!enabled || !serverId) return;

    const token = getToken();
    const ws = new WebSocket(`${WS_URL}/servers/${serverId}/logs?token=${token}`);
    socketRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => setConnected(false);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        setLines((prev) => {
          const next = [...prev, msg];
          return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
        });
      } catch {
        // ignore malformed frames
      }
    };

    return () => ws.close();
  }, [serverId, enabled]);

  function appendLocal(line, kind = 'system') {
    setLines((prev) => [...prev, { line, kind }]);
  }

  return { lines, connected, appendLocal };
}
