#!/usr/bin/env node
/**
 * Retry a failed URL
 */

import { processItem } from './discord-ingest-bot/src/processor.js';
import simpleGit from 'simple-git';
import { readFile } from 'fs/promises';

const WORKDIR = './discord-ingest-bot/workdir/repo';

async function main() {
  const failedId = process.argv[2];
  
  if (!failedId) {
    console.error('Usage: node retry-failed.js <failed-id>');
    process.exit(1);
  }
  
  console.log(`Retrying failed item: ${failedId}`);
  
  // Read the failed item (without .json extension if provided)
  const id = failedId.replace('.json', '');
  const failedPath = `${WORKDIR}/mobile-share/failed/${id}.json`;
  
  const data = await readFile(failedPath, 'utf-8');
  const item = JSON.parse(data);
  
  console.log(`URL: ${item.url}`);
  
  const git = simpleGit(WORKDIR);
  
  try {
    await git.pull('origin', 'main', ['--rebase']);
    const result = await processItem(item, git);
    console.log('✅ Success!', result);
  } catch (err) {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

main();
