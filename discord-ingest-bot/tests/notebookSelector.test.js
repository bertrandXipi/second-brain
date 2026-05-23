import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// notebookSelector reads CONFIG_FILE at module-load time, so we must set
// NOTEBOOK_CONFIG_PATH BEFORE the first import. Each test uses a fresh
// temp dir + dynamic import so module state doesn't leak.
async function withSelector(setup) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'notebook-selector-test-'));
  const configPath = path.join(tmpDir, 'notebook-config.json');
  process.env.NOTEBOOK_CONFIG_PATH = configPath;
  // Bust the module cache by appending a unique query (ESM dynamic import trick)
  const mod = await import(`../src/notebookSelector.js?t=${Date.now()}-${Math.random()}`);
  try {
    return await setup({ mod, configPath, tmpDir });
  } finally {
    delete process.env.NOTEBOOK_CONFIG_PATH;
    await rm(tmpDir, { recursive: true, force: true });
  }
}

test('resetNotebookSelection returns true when no config file exists (ENOENT)', async () => {
  await withSelector(async ({ mod, configPath }) => {
    // Sanity: file does NOT exist
    await assert.rejects(access(configPath));

    const result = await mod.resetNotebookSelection();
    assert.equal(result, true, 'reset must return true on ENOENT, not throw');
  });
});

test('resetNotebookSelection removes an existing config and returns true', async () => {
  await withSelector(async ({ mod, configPath }) => {
    await writeFile(configPath, JSON.stringify({ selectedNotebookId: 'abc' }));
    await access(configPath); // exists

    const result = await mod.resetNotebookSelection();
    assert.equal(result, true);
    await assert.rejects(access(configPath), 'config file should be deleted');
  });
});

test('getSelectedNotebook returns null when no config file exists', async () => {
  await withSelector(async ({ mod }) => {
    const result = await mod.getSelectedNotebook();
    assert.equal(result, null);
  });
});
