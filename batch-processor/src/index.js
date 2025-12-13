import 'dotenv/config';
import { readdir, readFile, writeFile, mkdir, rename } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { config } from './config.js';
import { fetchAndExtract } from './fetch-content.js';
import { summarizeWithGemini } from './llm-summarize.js';
import { generateMarkdown } from './markdown-generator.js';
import { initGit, pullLatest, commitAndPush } from './git-sync.js';

const OBSIDIAN_VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH || '/Users/bertrand/Sites/fiches-veille';

async function main() {
  console.log('[batch] starting...');

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
    console.log('[batch] no pending directory');
    return;
  }

  const files = await readdir(pendingDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  if (jsonFiles.length === 0) {
    console.log('[batch] no pending items');
    return;
  }

  console.log(`[batch] processing ${jsonFiles.length} item(s)`);

  let processed = 0;
  let failed = 0;

  for (const file of jsonFiles) {
    const filePath = path.join(pendingDir, file);

    try {
      const content = await readFile(filePath, 'utf-8');
      const item = JSON.parse(content);

      console.log(`\n[batch] processing: ${item.url}`);

      // Fetch and extract
      const { title, content: textContent } = await fetchAndExtract(item.url);

      // LLM summarize
      const llmResult = await summarizeWithGemini(textContent, item.tags);

      // Use fetched title if LLM didn't provide one
      if (!llmResult.title && title) {
        llmResult.title = title;
      }

      // Generate markdown
      const { filename, content: mdContent, folder } = generateMarkdown(item, llmResult, item.url);

      // Write fiche
      const ficheFolder = path.join(fichesDir, folder);
      if (!existsSync(ficheFolder)) {
        await mkdir(ficheFolder, { recursive: true });
      }
      await writeFile(path.join(ficheFolder, filename), mdContent);
      console.log(`[batch] written: fiches/${folder}/${filename}`);

      // Move to processed
      await rename(filePath, path.join(processedDir, file));
      processed++;

    } catch (err) {
      console.error(`[batch] failed: ${err.message}`);

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
    const msg = `chore(batch): processed ${processed}, failed ${failed}`;
    await commitAndPush(msg);
  }

  console.log(`\n[batch] done: ${processed} processed, ${failed} failed`);

  // Sync Obsidian vault
  if (processed > 0 && existsSync(OBSIDIAN_VAULT_PATH)) {
    console.log('[batch] syncing obsidian vault...');
    try {
      execSync('git pull', { cwd: OBSIDIAN_VAULT_PATH, stdio: 'inherit' });
      console.log('[batch] vault synced');
    } catch (err) {
      console.error('[batch] vault sync failed:', err.message);
    }
  }
}

main().catch(err => {
  console.error('[batch] fatal:', err);
  process.exit(1);
});
