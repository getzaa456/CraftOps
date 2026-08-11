import { config } from '../config.js';

export function toNodePort(port) {
  return port + config.nodePortOffset;
}
