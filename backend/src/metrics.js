import client from 'prom-client';

export const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry }); // process cpu/mem/eventloop, free

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [registry],
});

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

export const k8sApiErrorsTotal = new client.Counter({
  name: 'k8s_api_errors_total',
  help: 'Errors returned by Kubernetes API calls, by operation',
  labelNames: ['operation'],
  registers: [registry],
});

export const mcServersByStatus = new client.Gauge({
  name: 'mc_servers_by_status',
  help: 'Current number of Minecraft servers, by status',
  labelNames: ['status'],
  registers: [registry],
});

/** Express middleware: times every request and records it against the histogram/counter above. */
export function metricsMiddleware(req, res, next) {
  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    // req.route is only set once Express matches a route; fall back to
    // the raw path for 404s so labels stay bounded (not one per random URL).
    const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    const labels = { method: req.method, route, status_code: res.statusCode };
    end(labels);
    httpRequestsTotal.inc(labels);
  });
  next();
}
