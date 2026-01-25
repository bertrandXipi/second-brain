/**
 * Real-time processor for Discord URLs
 * Adds URL to NotebookLM, gets analysis, generates markdown, commits to Git
 */

import { generateMarkdownV2 } from '../../batch-processor/src/markdown-generator-v2.js';
import simpleGit from 'simple-git';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { config } from './config.js';

const WORKDIR = './workdir/repo';
const PENDING_PATH = 'mobile-share/pending';
const PROCESSED_PATH = 'mobile-share/processed';
const FAILED_PATH = 'mobile-share/failed';
const FICHES_PATH = 'fiches';

// NotebookLM HTTP client (calls MCP server via HTTP)
let notebookLMAvailable = false;
let addToNotebookLM = null;
let getDetailedAnalysis = null;

// Try to load NotebookLM HTTP client
try {
  const module = await import('../../batch-processor/src/notebooklm-http.js');
  addToNotebookLM = module.addToNotebookLM;
  getDetailedAnalysis = module.getDetailedAnalysis;
  notebookLMAvailable = true;
  console.log('[processor] NotebookLM HTTP client available');
} catch (err) {
  console.warn('[processor] NotebookLM HTTP client not available:', err.message);
}

/**
 * Process a single URL item in real-time
 * @param {object} item - Pending item from Discord
 * @param {object} git - SimpleGit instance
 * @param {object} discordMessage - Discord message for feedback
 * @returns {Promise<object>} - Processing result
 */
export async function processItem(item, git, discordMessage = null) {
  console.log(`\n[processor] processing: ${item.url}`);

  const pendingFile = path.join(WORKDIR, PENDING_PATH, `${item.id}.json`);
  const processedFile = path.join(WORKDIR, PROCESSED_PATH, `${item.id}.json`);
  const failedFile = path.join(WORKDIR, FAILED_PATH, `${item.id}.json`);

  try {
    // 1. Add to NotebookLM - it will fetch the URL itself
    let notebookResult = null;
    let sourceDescription = null;

    if (!notebookLMAvailable || !addToNotebookLM || !getDetailedAnalysis) {
      throw new Error('NotebookLM not available');
    }

    console.log('[processor] adding URL to NotebookLM (NotebookLM will fetch it)...');
    notebookResult = await addToNotebookLM(item.url, null, {
      title: item.title,
      tags: item.tags,
      source: item.source
    });
    console.log(`[processor] added to NotebookLM: ${notebookResult.source_id}`);

    // Send intermediate feedback to Discord
    if (discordMessage) {
      try {
        await discordMessage.react('📥');
        await discordMessage.reply(`📥 **Source ajoutée à NotebookLM**\nAnalyse en cours...`);
      } catch (e) {
        console.warn('[processor] could not send intermediate message:', e.message);
      }
    }

    // Get AI-generated detailed analysis from NotebookLM (in French, comprehensive)
    console.log('[processor] getting detailed analysis from NotebookLM...');
    sourceDescription = await getDetailedAnalysis(notebookResult.notebook_id, notebookResult.source_id);

    if (sourceDescription) {
      console.log(`[processor] got analysis (${sourceDescription.summary?.length || 0} chars, ${sourceDescription.keywords?.length || 0} keywords)`);
    }
    
    // Use NotebookLM title if we don't have one
    const title = notebookResult.title || item.title || 'Sans titre';
    const fetchResult = { 
      title, 
      content: sourceDescription?.summary || '', 
      excerpt: sourceDescription?.summary?.slice(0, 500) || '',
      isYouTube: false, 
      hasTranscript: true 
    };

    // 3. Generate markdown fiche
    console.log('[processor] generating markdown...');
    const { filename, content: mdContent, folder } = generateMarkdownV2(
      item,
      notebookResult,
      sourceDescription,
      item.url,
      fetchResult
    );

    // 4. Write fiche to Git
    const ficheFolder = path.join(WORKDIR, FICHES_PATH, folder);
    if (!existsSync(ficheFolder)) {
      await mkdir(ficheFolder, { recursive: true });
    }
    const fichePath = path.join(ficheFolder, filename);
    await writeFile(fichePath, mdContent);
    console.log(`[processor] written: fiches/${folder}/${filename}`);

    // 5. Write processed JSON and delete pending
    const processedDir = path.join(WORKDIR, PROCESSED_PATH);
    if (!existsSync(processedDir)) {
      await mkdir(processedDir, { recursive: true });
    }

    // Write processed file
    await writeFile(processedFile, JSON.stringify({ ...item, processed_at: new Date().toISOString() }, null, 2));
    console.log(`[processor] written processed: ${item.id}`);

    // Delete pending file if exists
    if (existsSync(pendingFile)) {
      await unlink(pendingFile);
      console.log(`[processor] deleted pending: ${item.id}`);
    }

    // 6. Commit and push - add fiche and processed, stage deleted pending
    await git.add([
      `${FICHES_PATH}/${folder}/${filename}`,
      `${PROCESSED_PATH}/${item.id}.json`
    ]);
    
    // Stage the deletion of pending file
    await git.add([`${PENDING_PATH}/${item.id}.json`]);

    const commitMsg = `feat(veille): ${title || 'Nouveau contenu'}\n\nSource: ${item.url}\nNotebookLM: ${notebookResult ? notebookResult.notebook_url : 'N/A'}`;
    const commitResult = await git.commit(commitMsg);

    if (commitResult.commit) {
      console.log('[processor] pushing...');
      await git.push('origin', config.github.branch);
      const hash = commitResult.commit.slice(0, 7);
      console.log(`[processor] ✅ success: ${hash}`);

      return {
        success: true,
        title: title,
        commitHash: hash,
        fichePath: `fiches/${folder}/${filename}`,
        notebookUrl: notebookResult?.notebook_url
      };
    }

    return { success: true, title: title, commitHash: null };

  } catch (err) {
    console.error(`[processor] ❌ failed:`, err.message);

    // V1 fallback: Write to pending for later processing (instead of failed)
    // This is useful when fetch fails due to IP blocking (e.g. Reddit blocks Google Cloud IPs)
    const pendingDir = path.join(WORKDIR, PENDING_PATH);
    if (!existsSync(pendingDir)) {
      await mkdir(pendingDir, { recursive: true });
    }

    // Write item to pending if not already there
    if (!existsSync(pendingFile)) {
      await writeFile(pendingFile, JSON.stringify(item, null, 2));
      console.log(`[processor] written to pending for later: ${item.id}`);
    }

    // Commit to pending (V1 behavior)
    await git.add([`${PENDING_PATH}/${item.id}.json`]);

    const commitMsg = `chore(veille): queued for later processing\n\nURL: ${item.url}\nReason: ${err.message}`;
    await git.commit(commitMsg);
    await git.push('origin', config.github.branch);

    console.log(`[processor] ⏳ queued in pending (will process later)`);

    // Don't throw - return a partial success indicating it's queued
    return {
      success: false,
      queued: true,
      error: err.message
    };
  }
}
