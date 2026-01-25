#!/usr/bin/env node
/**
 * Process pending URLs with NotebookLM (V2)
 * Uses Kiro MCP tools to add URLs to NotebookLM and generate markdown
 * 
 * Run: node batch-processor/process-pending-notebooklm-v2.js
 */

import { readdir, readFile, writeFile, rename, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import simpleGit from 'simple-git';
import { generateMarkdownV2 } from './src/markdown-generator-v2.js';

const WORKDIR = './batch-processor/workdir/repo';
const PENDING_PATH = path.join(WORKDIR, 'mobile-share/pending');
const PROCESSED_PATH = path.join(WORKDIR, 'mobile-share/processed');
const FAILED_PATH = path.join(WORKDIR, 'mobile-share/failed');
const FICHES_PATH = path.join(WORKDIR, 'fiches');

const git = simpleGit(WORKDIR);

// Get monthly notebook ID (will be created if doesn't exist)
let currentNotebookId = null;

async function getOrCreateMonthlyNotebook() {
  if (currentNotebookId) return currentNotebookId;
  
  const now = new Date();
  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const monthName = monthNames[now.getMonth()];
  const year = now.getFullYear();
  const notebookTitle = `Veille Tech - ${monthName} ${year}`;
  
  console.log(`\n📚 Looking for notebook: "${notebookTitle}"`);
  
  // This will be called via Kiro MCP tools
  // For now, return the known ID
  currentNotebookId = 'c4dba600-dd91-4027-ba33-8ad93f971a31';
  return currentNotebookId;
}

async function processPendingItem(item) {
  console.log(`\n🔄 Processing: ${item.url}`);
  
  try {
    // Get notebook
    const notebookId = await getOrCreateMonthlyNotebook();
    
    console.log(`   📝 Adding to NotebookLM...`);
    console.log(`   ⚠️  MANUAL STEP: Use Kiro to run:`);
    console.log(`   mcp_notebooklm_notebook_add_url(notebook_id="${notebookId}", url="${item.url}")`);
    console.log(`   Then get the source_id and run:`);
    console.log(`   mcp_notebooklm_notebook_query(notebook_id="${notebookId}", source_ids=["SOURCE_ID"], query="Analyse détaillée en français...")`);
    
    // For now, skip - this needs to be done via Kiro MCP
    return { success: false, queued: true, reason: 'Needs Kiro MCP' };
    
  } catch (err) {
    console.error(`   ❌ Error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

async function main() {
  console.log('🚀 NotebookLM Batch Processor V2');
  console.log('================================\n');
  
  // Pull latest
  console.log('📥 Pulling latest from Git...');
  await git.pull('origin', 'main', ['--rebase']);
  
  // Get pending items
  const pendingFiles = await readdir(PENDING_PATH);
  const jsonFiles = pendingFiles.filter(f => f.endsWith('.json'));
  
  console.log(`\n📋 Found ${jsonFiles.length} pending item(s)`);
  
  if (jsonFiles.length === 0) {
    console.log('✅ Nothing to process!');
    return;
  }
  
  // Process each
  const results = [];
  for (const file of jsonFiles) {
    const filePath = path.join(PENDING_PATH, file);
    const data = await readFile(filePath, 'utf-8');
    const item = JSON.parse(data);
    
    const result = await processPendingItem(item);
    results.push({ item, result });
  }
  
  // Summary
  console.log('\n📊 Summary:');
  console.log(`   Total: ${results.length}`);
  console.log(`   Queued: ${results.filter(r => r.result.queued).length}`);
  console.log(`   Failed: ${results.filter(r => r.result.error).length}`);
  
  console.log('\n⚠️  This script needs to be run via Kiro with MCP tools!');
  console.log('   The URLs are ready in pending/ for processing.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
