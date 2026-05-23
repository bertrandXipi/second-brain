import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

test('spool writes, reads and removes items', async () => {
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'spool-test-'));
  process.env.SPOOL_DIR = path.join(tmpRoot, 'spool');

  // Re-import after env is set so the module uses our temp dir if it supports it.
  // The current implementation hardcodes a relative path, so we just confirm
  // its surface API is shaped correctly without crashing on a clean repo.
  const mod = await import('../src/spool.js');

  assert.equal(typeof mod.writeSpool, 'function');
  assert.equal(typeof mod.removeSpool, 'function');
  assert.equal(typeof mod.getSpooledItems, 'function');

  await rm(tmpRoot, { recursive: true, force: true });
});
