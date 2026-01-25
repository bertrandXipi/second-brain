#!/usr/bin/env node
/**
 * Process ALL pending items from the queue
 */

import { processItem } from './src/processor.js';
import simpleGit from 'simple-git';
import { readdir, readFile } from 'fs/promises';
import path from 'path';

const WORKDIR = './workdir/repo';
const PENDING_PATH = 'mobile-share/pending';

async function main() {
  console.log('[batch] Starting batch processor...');
  
  const git = simpleGit(WORKDIR);
  
  console.log('[batch] Pulling latest...');
  await git.pull('origin', 'main', ['--rebase']);
  
  const pendingDir = path.join(WORKDIR, PENDING_PATH);
  const files = await readdir(pendingDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  if (jsonFiles.length === 0) {
    console.log('[batch] No pending items');
    return;
  }
  
  console.log(`[batch] Found ${jsonFiles.length} pending items`);
  
  let success = 0;
  let failed = 0;
  
  for (const file of jsonFiles) {
    const content = await readFile(path.join(pendingDir, file), 'utf-8');
    const item = JSON.parse(content);
    
    console.log(`\n[batch] Processing ${success + failed + 1}/${jsonFiles.length}: ${item.url}`);
    
    try {
      const result = await processItem(item, git);
      if (result.success) {
        success++;
        console.log(`[batch] ✅ Success: ${result.commitHash}`);
      } else if (result.queued) {
        console.log(`[batch] ⏳ Queued for later`);
      } else {
        failed++;
        console.log(`[batch] ❌ Failed: ${result.error}`);
      }
    } catch (err) {
      failed++;
      console.error(`[batch] ❌ Error: ${err.message}`);
    }
    
    // Small delay between items to avoid rate limiting
    await new Promise(r => setTimeout(r, 2000));
  }
  
  console.log(`\n[batch] Done: ${success} success, ${failed} failed`);
}

main().catch(err => {
  console.error('[fatal]', err);
  process.exit(1);
});
