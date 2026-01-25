#!/usr/bin/env node
/**
 * Process ONE pending URL with NotebookLM (for testing)
 * Run this from Kiro to test the workflow
 */

import 'dotenv/config';
import { readdir, readFile, writeFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fetchAndExtract } from './src/fetch-content.js';
import { generateMarkdownV2 } from './src/markdown-generator-v2.js';

const WORKDIR = './workdir/repo';
const PENDING_DIR = path.join(WORKDIR, 'mobile-share/pending');

console.log('[test] Testing NotebookLM processing with ONE pending item...\n');

// Get first pending item
const files = await readdir(PENDING_DIR);
const jsonFiles = files.filter(f => f.endsWith('.json'));

if (jsonFiles.length === 0) {
  console.log('No pending items found');
  process.exit(0);
}

const firstFile = jsonFiles[0];
const filePath = path.join(PENDING_DIR, firstFile);
const content = await readFile(filePath, 'utf-8');
const item = JSON.parse(content);

console.log('Item:', item);
console.log('\nURL:', item.url);
console.log('\n---\n');

// Step 1: Fetch content
console.log('Step 1: Fetching content...');
const fetchResult = await fetchAndExtract(item.url);
console.log('✅ Fetched:', fetchResult.title);
console.log('   Content length:', fetchResult.content?.length || 0, 'chars');

// Step 2: Add to NotebookLM (manual for now)
console.log('\nStep 2: Add to NotebookLM');
console.log('   Notebook ID: c4dba600-dd91-4027-ba33-8ad93f971a31');
console.log('   URL:', item.url);
console.log('\n   → Use mcp_notebooklm_notebook_add_url in Kiro');

console.log('\n✅ Test complete - ready for full processing');
