import path from 'path';
// Change default import to named import:
import { PathTraversalError } from '../errors.js';

const ROOT = '/data';

/**
 * Turns a client-supplied relative path into a safe absolute path under
 * /data inside the Pod. Rejects anything that normalizes to escape the
 * root (e.g. "../../etc/passwd") *before* it's ever sent to the exec API.
 */
export function resolveSafePath(relPath = '/') {
  const trimmed = String(relPath || '/').replace(/^\/+/, '');
  const normalized = path.posix.normalize(trimmed);
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new PathTraversalError();
  }
  return path.posix.join(ROOT, normalized);
}

/** Strips any directory components from an uploaded filename. */
export function sanitizeFilename(name) {
  return path.posix.basename(String(name || '').replace(/\\/g, '/')) || 'upload.bin';
}