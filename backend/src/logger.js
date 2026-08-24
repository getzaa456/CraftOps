import pino from 'pino';

// Structured (JSON) logs to stdout — deliberately no pretty-printer
// dependency; `| npx pino-pretty` locally if you want colorized output,
// but the raw JSON is what makes these greppable/shippable to a log
// aggregator later.
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
});
