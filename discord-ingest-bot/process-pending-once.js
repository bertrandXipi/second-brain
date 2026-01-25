#!/usr/bin/env node
/**
 * Process one pending item from the queue
 * Run this to test NotebookLM HTTP processing
 */

import { processItem } from './src/processor.js';
import simpleGit from 'simple-git';
import { readdir, readFile } from 'fs/promises';
import path from 'path';

const WORKDIR = './workdir/repo';
const PENDING_PATH = 'mobile-share/pending';

async function main() {
  console.log('[test] Starting pending processor test...');
  
  const git = simpleGit(WORKDIR);
  
  console.log('[test] Pulling latest...');
  await git.pull('origin', 'main', ['--rebase']);
  
  const pendingDir = path.join(WORKDIR, PENDING_PATH);
  const files = await readdir(pendingDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  if (jsonFiles.length === 0) {
    console.log('[test] No pending items');
    return;
  }
  
  console.log(`[test] Found ${jsonFiles.length} pending items`);
  
  // Process first one
  const firstFile = jsonFiles[0];
  const content = await readFile(path.join(pendingDir, firstFile), 'utf-8');
  const item = JSON.parse(content);
  
  console.log(`[test] Processing: ${item.url}`);
  
  try {
    const result = await processItem(item, git);
    console.log('[test] Result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('[test] Error:', err.message);
    console.error(err.stack);
  }
}

main().catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});
