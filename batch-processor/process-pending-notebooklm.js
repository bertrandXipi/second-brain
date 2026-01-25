#!/usr/bin/env node
/**
 * Process pending URLs with NotebookLM
 * This script must run in Kiro context to access MCP tools
 * 
 * Usage: Run this file from Kiro (not standalone Node.js)
 */

import 'dotenv/config';
import { readdir, readFile, writeFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fetchAndExtract } from './src/fetch-content.js';
import { generateMarkdownV2 } from './src/markdown-generator-v2.js';

const WORKDIR = process.env.WORKDIR || './workdir/repo';
const PENDING_DIR = path.join(WORKDIR, 'mobile-share/pending');
const PROCESSED_DIR = path.join(WORKDIR, 'mobile-share/processed');
const FAILED_DIR = path.join(WORKDIR, 'mobile-share/failed');
const FICHES_DIR = path.join(WORKDIR, 'fiches');

console.log('[process-pending] Starting NotebookLM batch processor...');
console.log('[process-pending] Workdir:', WORKDIR);

/**
 * Get or create monthly notebook
 */
async function getOrCreateMonthlyNotebook() {
  const now = new Date();
  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const monthName = monthNames[now.getMonth()];
  const year = now.getFullYear();
  const notebookTitle = `Veille Tech - ${monthName} ${year}`;
  
  console.log(`[notebooklm] Looking for notebook: "${notebookTitle}"`);
  
  const result = await mcp_notebooklm_notebook_list({ max_results: 200 });
  
  if (result.status === 'success') {
    const existingNotebook = result.notebooks.find(nb => nb.title === notebookTitle);
    
    if (existingNotebook) {
      console.log(`[notebooklm] Found existing notebook: ${existingNotebook.id}`);
      return existingNotebook.id;
    }
  }
  
  console.log(`[notebooklm] Creating new notebook: "${notebookTitle}"`);
  const createResult = await mcp_notebooklm_notebook_create({ title: notebookTitle });
  
  if (createResult.status === 'success') {
    console.log(`[notebooklm] Created notebook: ${createResult.notebook.id}`);
    return createResult.notebook.id;
  }
  
  throw new Error('Failed to create notebook');
}

/**
 * Process a single pending item
 */
async function processItem(item, notebookId) {
  console.log(`\n[process] Processing: ${item.url}`);
  
  const pendingFile = path.join(PENDING_DIR, `${item.id}.json`);
  const processedFile = path.join(PROCESSED_DIR, `${item.id}.json`);
  const failedFile = path.join(FAILED_DIR, `${item.id}.json`);
  
  try {
    // 1. Fetch content
    console.log('[process] Fetching content...');
    const fetchResult = await fetchAndExtract(item.url);
    const { title, content: textContent } = fetchResult;
    
    // 2. Add to NotebookLM
    console.log('[process] Adding to NotebookLM...');
    const addResult = await mcp_notebooklm_notebook_add_url({
      notebook_id: notebookId,
      url: item.url
    });
    
    if (addResult.status !== 'success') {
      throw new Error(`Failed to add to NotebookLM: ${addResult.error || 'Unknown error'}`);
    }
    
    const sourceId = addResult.source.id;
    console.log(`[process] Added to NotebookLM: ${sourceId}`);
    
    // 3. Get AI summary from NotebookLM
    console.log('[process] Getting NotebookLM summary...');
    const descResult = await mcp_notebooklm_source_describe({ source_id: sourceId });
    
    const sourceDescription = descResult.status === 'success' ? {
      summary: descResult.summary,
      keywords: descResult.keywords || []
    } : null;
    
    if (sourceDescription) {
      console.log(`[process] Got summary (${sourceDescription.summary?.length || 0} chars, ${sourceDescription.keywords?.length || 0} keywords)`);
    }
    
    const notebookResult = {
      notebook_id: notebookId,
      source_id: sourceId,
      title: addResult.source.title || title,
      url: item.url,
      notebook_url: `https://notebooklm.google.com/notebook/${notebookId}`,
      source_url: addResult.source.url || `https://notebooklm.google.com/notebook/${notebookId}`
    };
    
    // 4. Generate markdown
    console.log('[process] Generating markdown...');
    const { filename, content: mdContent, folder } = generateMarkdownV2(
      item,
      notebookResult,
      sourceDescription,
      item.url,
      fetchResult
    );
    
    // 5. Write fiche
    const ficheFolder = path.join(FICHES_DIR, folder);
    if (!existsSync(ficheFolder)) {
      await mkdir(ficheFolder, { recursive: true });
    }
    const fichePath = path.join(ficheFolder, filename);
    await writeFile(fichePath, mdContent);
    console.log(`[process] Written: fiches/${folder}/${filename}`);
    
    // 6. Move to processed
    if (!existsSync(PROCESSED_DIR)) {
      await mkdir(PROCESSED_DIR, { recursive: true });
    }
    await rename(pendingFile, processedFile);
    console.log(`[process] ✅ Success: ${item.id}`);
    
    return {
      success: true,
      fichePath: `fiches/${folder}/${filename}`,
      notebookUrl: notebookResult.notebook_url
    };
    
  } catch (err) {
    console.error(`[process] ❌ Failed:`, err.message);
    
    // Move to failed
    if (!existsSync(FAILED_DIR)) {
      await mkdir(FAILED_DIR, { recursive: true });
    }
    
    if (existsSync(pendingFile)) {
      await rename(pendingFile, failedFile);
    }
    
    // Write error log
    await writeFile(
      failedFile.replace('.json', '-error.txt'),
      `${err.stack || err.message}\n\nTimestamp: ${new Date().toISOString()}`
    );
    
    return {
      success: false,
      error: err.message
    };
  }
}

/**
 * Main processing loop
 */
async function main() {
  // Pull latest from Git
  console.log('[git] Pulling latest...');
  try {
    execSync('git pull origin main', { cwd: WORKDIR, stdio: 'inherit' });
  } catch (err) {
    console.error('[git] Pull failed:', err.message);
  }
  
  // Get or create monthly notebook
  const notebookId = await getOrCreateMonthlyNotebook();
  
  // Get pending items
  if (!existsSync(PENDING_DIR)) {
    console.log('[process] No pending directory');
    return;
  }
  
  const files = await readdir(PENDING_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  if (jsonFiles.length === 0) {
    console.log('[process] No pending items');
    return;
  }
  
  console.log(`\n[process] Found ${jsonFiles.length} pending item(s)\n`);
  
  let processed = 0;
  let failed = 0;
  const createdFiches = [];
  
  for (const file of jsonFiles) {
    const filePath = path.join(PENDING_DIR, file);
    const content = await readFile(filePath, 'utf-8');
    const item = JSON.parse(content);
    
    const result = await processItem(item, notebookId);
    
    if (result.success) {
      processed++;
      createdFiches.push(result.fichePath);
    } else {
      failed++;
    }
    
    // Delay between requests
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  console.log(`\n[process] Done: ${processed} processed, ${failed} failed`);
  
  // Commit and push
  if (processed > 0 || failed > 0) {
    console.log('[git] Committing...');
    try {
      execSync('git add .', { cwd: WORKDIR });
      const msg = `chore(notebooklm): processed ${processed}, failed ${failed}`;
      execSync(`git commit -m "${msg}"`, { cwd: WORKDIR });
      execSync('git push origin main', { cwd: WORKDIR, stdio: 'inherit' });
      console.log('[git] ✅ Pushed to Git');
    } catch (err) {
      console.error('[git] Commit/push failed:', err.message);
    }
  }
  
  console.log('\n✅ Batch processing complete!');
  console.log(`📚 NotebookLM: https://notebooklm.google.com/notebook/${notebookId}`);
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
