import 'dotenv/config';
import { readdir, readFile, writeFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { config } from './config.js';
import { fetchAndExtract } from './fetch-content.js';
import { addToNotebookLM } from './notebooklm-sync.js';
import { generateMarkdownV2 } from './markdown-generator-v2.js';
import { initGit, pullLatest, commitAndPush } from './git-sync.js';
import { notifyDiscord, notifyError, notifyBatchStart, notifyProgress } from './discord-notify.js';

const OBSIDIAN_VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH || '/Users/bertrand/Sites/fiches-veille';

async function main() {
  console.log('[batch-v2] starting with NotebookLM integration...');

  await initGit();
  await pullLatest();

  const pendingDir = path.join(config.workdir, config.paths.pending);
  const processedDir = path.join(config.workdir, config.paths.processed);
  const failedDir = path.join(config.workdir, config.paths.failed);
  const fichesDir = path.join(config.workdir, config.paths.fiches);

  // Ensure directories exist
  for (const dir of [processedDir, failedDir, fichesDir]) {
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  // Get pending items
  if (!existsSync(pendingDir)) {
    console.log('[batch-v2] no pending directory');
    return;
  }

  const files = await readdir(pendingDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  if (jsonFiles.length === 0) {
    console.log('[batch-v2] no pending items');
    return;
  }

  console.log(`[batch-v2] processing ${jsonFiles.length} item(s)`);

  // Notify batch start
  await notifyBatchStart(jsonFiles.length);

  // Warn if too many pending items
  if (jsonFiles.length > 50) {
    await notifyError(
      new Error(`${jsonFiles.length} liens en attente - accumulation anormale`),
      'Alerte: Accumulation de liens en attente'
    );
  }

  let processed = 0;
  let failed = 0;
  let rateLimited = 0;
  const createdFiches = [];
  const noTranscriptVideos = [];
  const totalItems = jsonFiles.length;

  for (const file of jsonFiles) {
    const filePath = path.join(pendingDir, file);

    try {
      const content = await readFile(filePath, 'utf-8');
      const item = JSON.parse(content);

      console.log(`\n[batch-v2] processing: ${item.url}`);

      // Fetch and extract
      const fetchResult = await fetchAndExtract(item.url);
      const { title, content: textContent } = fetchResult;

      // Track YouTube videos without transcript
      if (fetchResult.isYouTube && !fetchResult.hasTranscript) {
        console.log('[batch-v2] ⚠️ YouTube video without transcript');
        noTranscriptVideos.push(item.url);
      }

      // Add to NotebookLM (replaces Gemini summarization)
      const notebookResult = await addToNotebookLM(item.url, textContent, {
        title: title || item.title,
        tags: item.tags,
        source: item.source
      });

      // Generate markdown v2
      const { filename, content: mdContent, folder } = generateMarkdownV2(item, notebookResult, item.url, fetchResult);

      // Write fiche
      const ficheFolder = path.join(fichesDir, folder);
      if (!existsSync(ficheFolder)) {
        await mkdir(ficheFolder, { recursive: true });
      }
      await writeFile(path.join(ficheFolder, filename), mdContent);
      console.log(`[batch-v2] written: fiches/${folder}/${filename}`);
      createdFiches.push(`${folder}/${filename}`);

      // Move to processed
      await rename(filePath, path.join(processedDir, file));
      processed++;

      // Notify progress every 5 items
      if (processed % 5 === 0) {
        await notifyProgress(processed + failed + rateLimited, totalItems, filename);
      }

      // Add delay between requests (NotebookLM should have better quotas)
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (err) {
      console.error(`[batch-v2] failed: ${err.message}`);

      // If rate limit error, keep in pending for retry later
      if (err.isRateLimit) {
        console.log('[batch-v2] rate limit detected - keeping in pending for retry');
        rateLimited++;
        continue;
      }

      // Move to failed
      await rename(filePath, path.join(failedDir, file));
      await writeFile(
        path.join(failedDir, file.replace('.json', '-error.txt')),
        err.stack || err.message
      );
      failed++;
    }
  }

  // Commit and push
  if (processed > 0 || failed > 0) {
    const msg = `chore(batch-v2): processed ${processed}, failed ${failed}${rateLimited > 0 ? `, rate-limited ${rateLimited}` : ''}`;
    await commitAndPush(msg);
  }

  console.log(`\n[batch-v2] done: ${processed} processed, ${failed} failed${rateLimited > 0 ? `, ${rateLimited} rate-limited (kept in pending)` : ''}`);

  // Alert if there are failed items
  if (failed > 0) {
    await notifyError(
      new Error(`${failed} lien(s) ont échoué lors du traitement`),
      'Échec de traitement de liens'
    );
  }

  // Alert if rate limited
  if (rateLimited > 0) {
    await notifyError(
      new Error(`${rateLimited} lien(s) en attente de retry (rate limit)`),
      'Rate limit atteint - retry plus tard'
    );
  }

  // Sync Obsidian vault
  if (processed > 0 && existsSync(OBSIDIAN_VAULT_PATH)) {
    console.log('[batch-v2] syncing obsidian vault...');
    try {
      execSync('git pull', { cwd: OBSIDIAN_VAULT_PATH, stdio: 'inherit' });
      console.log('[batch-v2] vault synced');
    } catch (err) {
      console.error('[batch-v2] vault sync failed:', err.message);
      await notifyError(err, 'Échec de synchronisation du vault Obsidian');
    }
  }

  // Get remaining pending count
  const remainingPending = await readdir(pendingDir);
  const remainingCount = remainingPending.filter(f => f.endsWith('.json')).length;

  // Notify Discord with detailed stats
  await notifyDiscord(processed, failed, createdFiches, {
    rateLimited,
    pending: remainingCount,
    noTranscript: noTranscriptVideos.length
  });
}

main().catch(async (err) => {
  console.error('[batch-v2] fatal:', err);
  await notifyError(err, 'Erreur fatale lors de l\'exécution du batch v2');
  process.exit(1);
});
