import express from 'express';
import cors from 'cors';
import pinoHttp from 'pino-http';
import { authRouter } from './routes/auth.js';
import { serversRouter } from './routes/servers.js';
import { logger } from './logger.js';
import { registry, metricsMiddleware } from './metrics.js';

export const app = express();

app.use(cors());
app.use(express.json());
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/healthz' || req.url === '/metrics' } }));
app.use(metricsMiddleware);

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/servers', serversRouter);

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.get('/metrics', async (req, res) => {
  res.set('Content-Type', registry.contentType);
  res.send(await registry.metrics());
});

// Central error handler — services throw errors with a `.status`,
// anything unlabeled falls back to 500 and gets logged.
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status === 500) req.log?.error({ err }, 'unhandled error') ?? logger.error({ err }, 'unhandled error');
  res.status(status).json({ error: err.message || 'internal error' });
});
