import express from 'express';
import cors from 'cors';
import { authRouter } from './routes/auth.js';
import { serversRouter } from './routes/servers.js';

export const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/servers', serversRouter);

app.get('/healthz', (req, res) => res.json({ ok: true }));

// Central error handler — services throw errors with a `.status`,
// anything unlabeled falls back to 500 and gets logged.
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message || 'internal error' });
});
