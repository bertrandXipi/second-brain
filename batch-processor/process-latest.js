#!/usr/bin/env node
/**
 * Process the LATEST pending URL with NotebookLM
 * Run this after posting a URL in Discord
 */

import 'dotenv/config';
import { readdir, readFile, writeFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fetchAndExtract } from './src/fetch-content.js';
import { generateMarkdownV2 } from './src/markdown-generator-v2.js';

const WORKDIR = './workdir/repo';
const PENDING_DIR = path.join(WORKDIR, 'mobile-share/pending');
const PROCESSED_DIR = path.join(WORKDIR, 'mobile-share/processed');
const FAILED_DIR = path.join(WORKDIR, 'mobile-share/failed');
const FICHES_DIR = path.join(WORKDIR, 'fiches');
const NOTEBOOK_ID = 'c4dba600-dd91-4027-ba33-8ad93f971a31'; // Veille Tech - Janvier 2026

console.log('🚀 Processing latest pending URL with NotebookLM\n');

// Pull latest
console.log('[git] Pulling latest...');
execSync('git pull origin main', { cwd: WORKDIR, stdio: 'inherit' });

// Get latest pending (most recent file)
const files = await readdir(PENDING_DIR);
const jsonFiles = files.filter(f => f.endsWith('.json'));

if (jsonFiles.length === 0) {
  console.log('❌ No pending items found');
  process.exit(0);
}

// Sort by modification time (most recent first)
const filesWithStats = await Promise.all(
  jsonFiles.map(async (file) => {
    const stats = await import('fs').then(fs => 
      fs.promises.stat(path.join(PENDING_DIR, file))
    );
    return { file, mtime: stats.mtime };
  })
);
filesWithStats.sort((a, b) => b.mtime - a.mtime);

const latestFile = filesWithStats[0].file;
const filePath = path.join(PENDING_DIR, latestFile);
const content = await readFile(filePath, 'utf-8');
const item = JSON.parse(content);

console.log(`\n📄 Latest pending: ${latestFile}`);
console.log(`🔗 URL: ${item.url}\n`);

try {
  // 1. Fetch content
  console.log('1️⃣  Fetching content...');
  const fetchResult = await fetchAndExtract(item.url);
  console.log(`   ✅ ${fetchResult.title}`);
  console.log(`   📝 ${fetchResult.content?.length || 0} chars\n`);
  
  // 2. Add to NotebookLM
  console.log('2️⃣  Adding to NotebookLM...');
  const addResult = await mcp_notebooklm_notebook_add_url({
    notebook_id: NOTEBOOK_ID,
    url: item.url
  });
  
  if (addResult.status !== 'success') {
    throw new Error(`Failed to add to NotebookLM: ${addResult.error}`);
  }
  
  const sourceId = addResult.source.id;
  console.log(`   ✅ Source ID: ${sourceId}\n`);
  
  // 3. Get AI summary
  console.log('3️⃣  Getting NotebookLM summary...');
  const descResult = await mcp_notebooklm_source_describe({ source_id: sourceId });
  
  const sourceDescription = descResult.status === 'success' ? {
    summary: descResult.summary,
    keywords: descResult.keywords || []
  } : null;
  
  if (sourceDescription) {
    console.log(`   ✅ Summary: ${sourceDescription.summary.substring(0, 100)}...`);
    console.log(`   🏷️  Keywords: ${sourceDescription.keywords.join(', ')}\n`);
  }
  
  const notebookResult = {
    notebook_id: NOTEBOOK_ID,
    source_id: sourceId,
    title: addResult.source.title || fetchResult.title,
    url: item.url,
    notebook_url: `https://notebooklm.google.com/notebook/${NOTEBOOK_ID}`,
    source_url: `https://notebooklm.google.com/notebook/${NOTEBOOK_ID}`
  };
  
  // 4. Generate markdown
  console.log('4️⃣  Generating markdown...');
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
  console.log(`   ✅ Written: fiches/${folder}/${filename}\n`);
  
  // 6. Move to processed
  if (!existsSync(PROCESSED_DIR)) {
    await mkdir(PROCESSED_DIR, { recursive: true });
  }
  await rename(filePath, path.join(PROCESSED_DIR, latestFile));
  
  // 7. Commit and push
  console.log('5️⃣  Committing to Git...');
  execSync('git add .', { cwd: WORKDIR });
  const commitMsg = `feat(veille): ${notebookResult.title}\n\nSource: ${item.url}\nNotebookLM: ${notebookResult.notebook_url}`;
  execSync(`git commit -m "${commitMsg}"`, { cwd: WORKDIR });
  execSync('git push origin main', { cwd: WORKDIR, stdio: 'inherit' });
  
  console.log('\n✅ SUCCESS!\n');
  console.log(`📚 NotebookLM: ${notebookResult.notebook_url}`);
  console.log(`📄 Fiche: fiches/${folder}/${filename}`);
  
} catch (err) {
  console.error('\n❌ ERROR:', err.message);
  
  // Move to failed
  if (!existsSync(FAILED_DIR)) {
    await mkdir(FAILED_DIR, { recursive: true });
  }
  await rename(filePath, path.join(FAILED_DIR, latestFile));
  await writeFile(
    path.join(FAILED_DIR, latestFile.replace('.json', '-error.txt')),
    `${err.stack || err.message}\n\nTimestamp: ${new Date().toISOString()}`
  );
  
  process.exit(1);
}
