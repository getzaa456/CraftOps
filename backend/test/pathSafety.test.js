import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSafePath, sanitizeFilename } from '../src/services/pathSafety.js';

test('resolveSafePath: root path resolves under /data', () => {
  assert.equal(resolveSafePath('/'), '/data');
});

test('resolveSafePath: nested path resolves correctly', () => {
  assert.equal(resolveSafePath('/plugins/foo'), '/data/plugins/foo');
});

test('resolveSafePath: bare filename (no leading slash) resolves under /data', () => {
  assert.equal(resolveSafePath('server.properties'), '/data/server.properties');
});

test('resolveSafePath: rejects simple traversal', () => {
  assert.throws(() => resolveSafePath('../../etc/passwd'), /escapes/);
});

test('resolveSafePath: rejects traversal disguised inside a subpath', () => {
  assert.throws(() => resolveSafePath('plugins/../../etc/passwd'), /escapes/);
});

test('resolveSafePath: collapses safe internal ".." segments', () => {
  // "world/../plugins" is safe — it never leaves /data, just normalizes.
  assert.equal(resolveSafePath('world/../plugins'), '/data/plugins');
});

test('sanitizeFilename: strips directory components', () => {
  assert.equal(sanitizeFilename('../../etc/passwd'), 'passwd');
  assert.equal(sanitizeFilename('plugins/evil.jar'), 'evil.jar');
});

test('sanitizeFilename: falls back for empty input', () => {
  assert.equal(sanitizeFilename(''), 'upload.bin');
  assert.equal(sanitizeFilename(undefined), 'upload.bin');
});
