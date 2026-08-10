import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  k8sNamespace: process.env.K8S_NAMESPACE || 'mc-servers',
  nodePortOffset: Number(process.env.NODE_PORT_OFFSET || 5000),
  portRangeMin: Number(process.env.PORT_RANGE_MIN || 25565),
  portRangeMax: Number(process.env.PORT_RANGE_MAX || 25600),
};
