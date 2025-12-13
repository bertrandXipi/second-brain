import { readdir, readFile, writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const SPOOL_DIR = './spool';

export async function ensureSpoolDir() {
  if (!existsSync(SPOOL_DIR)) {
    await mkdir(SPOOL_DIR, { recursive: true });
  }
}

export async function writeSpool(batchId, data) {
  await ensureSpoolDir();
  const filePath = path.join(SPOOL_DIR, `${batchId}.json`);
  await writeFile(filePath, JSON.stringify(data, null, 2));
  console.log(`[spool] written: ${batchId}`);
}

export async function removeSpool(batchId) {
  const filePath = path.join(SPOOL_DIR, `${batchId}.json`);
  try {
    await unlink(filePath);
    console.log(`[spool] removed: ${batchId}`);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

export async function getSpooledItems() {
  await ensureSpoolDir();
  const files = await readdir(SPOOL_DIR);
  const items = [];

  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    const filePath = path.join(SPOOL_DIR, file);
    const content = await readFile(filePath, 'utf-8');
    items.push(JSON.parse(content));
  }

  return items;
}
