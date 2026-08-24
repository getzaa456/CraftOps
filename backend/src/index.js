import http from 'http';
import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { app } from './app.js';
import { config } from './config.js';
import { startStatusWatcher } from './k8s/statusWatcher.js';
import { streamLogsToSocket } from './services/logStreamService.js';
import { logger } from './logger.js';

const server = http.createServer(app);

// GET /api/v1/servers/:id/logs?token=<jwt>  (WebSocket upgrade)
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost');
  const match = url.pathname.match(/^\/api\/v1\/servers\/([^/]+)\/logs$/);
  if (!match) return socket.destroy();

  const token = url.searchParams.get('token');
  let user;
  try {
    user = jwt.verify(token, config.jwtSecret);
  } catch {
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, { serverId: match[1], userId: user.sub });
  });
});

wss.on('connection', async (ws, { serverId, userId }) => {
  try {
    const controller = await streamLogsToSocket(userId, serverId, ws);
    ws.on('close', () => controller.abort());
  } catch (err) {
    logger.warn({ err, serverId, userId }, 'log stream failed to start');
    ws.send(JSON.stringify({ error: err.message }));
    ws.close();
  }
});

startStatusWatcher();

server.listen(config.port, () => {
  logger.info({ port: config.port }, 'mc-host-panel backend listening');
});
