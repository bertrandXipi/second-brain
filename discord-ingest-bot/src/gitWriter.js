import simpleGit from 'simple-git';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { config } from './config.js';

const WORKDIR = './workdir/repo';
const PENDING_PATH = 'mobile-share/pending';
const INSIGHTS_PATH = 'insights';
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 10000];

let git = null;

/**
 * Build a canonical GitHub "blob" URL for a file inside the fiches repo.
 * Pure helper — repoUrl/branch default to config but can be overridden for tests.
 *
 * Input:  'fiches/2026-05/2026-05-23-titre.md'
 * Output: 'https://github.com/owner/repo/blob/main/fiches/2026-05/2026-05-23-titre.md'
 */
export function buildGitHubFileUrl(
  relativePath,
  repoUrl = config.github.repoUrl,
  branch = config.github.branch,
) {
  if (!relativePath) return null;
  const base = String(repoUrl).replace(/\.git$/, '').replace(/\/$/, '');
  const segments = relativePath.split('/').map(encodeURIComponent).join('/');
  return `${base}/blob/${branch || 'main'}/${segments}`;
}

// Simple async mutex to serialize git operations and prevent concurrent pull/push conflicts
let _lockQueue = Promise.resolve();
export const gitLock = {
  async acquire() {
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    const prev = _lockQueue;
    _lockQueue = _lockQueue.then(() => wait);
    await prev;
    return release;
  }
};

export async function initRepo() {
  if (!existsSync('./workdir')) {
    await mkdir('./workdir', { recursive: true });
  }

  const repoUrl = config.github.repoUrl.replace(
    'https://',
    `https://${config.github.pat}@`
  );

  if (!existsSync(WORKDIR)) {
    console.log('[git] cloning repo...');
    const tempGit = simpleGit();
    await tempGit.clone(repoUrl, WORKDIR, ['--branch', config.github.branch]);
  }

  git = simpleGit(WORKDIR);

  // Always ensure the remote URL carries the PAT, even if the repo was
  // already cloned without one (or the token was rotated).
  await git.remote(['set-url', 'origin', repoUrl]);

  await git.addConfig('user.name', config.github.authorName);
  await git.addConfig('user.email', config.github.authorEmail);
  console.log('[git] repo ready');
}

/**
 * Get ISO week number
 */
function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Save insight to markdown file and commit
 */
export async function saveInsight(content, focus = null, sourceCount = null) {
  if (!git) throw new Error('Git not initialized');

  const now = new Date();
  const year = now.getFullYear();
  const week = getWeekNumber(now);
  const weekStr = String(week).padStart(2, '0');
  const filename = `${year}-W${weekStr}.md`;
  
  // Build frontmatter
  const frontmatter = {
    type: 'insight',
    year: year,
    week: week,
    generated_at: now.toISOString(),
    focus: focus || null,
    source_count: sourceCount || null
  };

  // Build markdown content
  let markdown = '---\n';
  markdown += `type: insight\n`;
  markdown += `year: ${year}\n`;
  markdown += `week: ${week}\n`;
  markdown += `generated_at: ${now.toISOString()}\n`;
  if (focus) markdown += `focus: "${focus}"\n`;
  if (sourceCount) markdown += `source_count: ${sourceCount}\n`;
  markdown += '---\n\n';
  markdown += `# Insights Semaine ${week} (${year})\n\n`;
  if (focus) {
    markdown += `> **Focus:** ${focus}\n\n`;
  }
  markdown += content;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Pull latest
      console.log('[git] pulling for insight...');
      await git.pull('origin', config.github.branch, ['--rebase']);

      // Ensure insights directory exists
      const insightsDir = path.join(WORKDIR, INSIGHTS_PATH);
      if (!existsSync(insightsDir)) {
        await mkdir(insightsDir, { recursive: true });
      }

      // Write file
      const filePath = path.join(insightsDir, filename);
      await writeFile(filePath, markdown);
      console.log(`[git] written insight: ${filename}`);

      // Stage, commit, push
      await git.add(`${INSIGHTS_PATH}/${filename}`);
      
      const commitMsg = `docs(insight): semaine ${week} ${year}${focus ? ` - ${focus}` : ''}`;
      const commitResult = await git.commit(commitMsg);
      
      if (!commitResult.commit) {
        console.log('[git] insight already up to date');
        return { success: true, commitHash: null, filename };
      }

      console.log('[git] pushing insight...');
      await git.push('origin', config.github.branch);
      
      const hash = commitResult.commit.slice(0, 7);
      console.log(`[git] insight pushed: ${hash}`);
      return { success: true, commitHash: hash, filename };

    } catch (err) {
      console.error(`[git] insight attempt ${attempt} failed:`, err.message);
      
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt - 1];
        console.log(`[git] retrying in ${delay}ms...`);
        await sleep(delay);
        
        try {
          await git.rebase(['--abort']);
        } catch {}
        await git.reset(['--hard', `origin/${config.github.branch}`]);
        await git.pull('origin', config.github.branch, ['--rebase']);
      } else {
        throw err;
      }
    }
  }
}

export async function writeAndPush(items, batchId, messageId) {
  if (!git) throw new Error('Git not initialized');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Pull latest
      console.log('[git] pulling...');
      await git.pull('origin', config.github.branch, ['--rebase']);

      // Ensure pending directory exists
      const pendingDir = path.join(WORKDIR, PENDING_PATH);
      if (!existsSync(pendingDir)) {
        await mkdir(pendingDir, { recursive: true });
      }

      // Write files
      for (const item of items) {
        const filePath = path.join(pendingDir, `${item.id}.json`);
        await writeFile(filePath, JSON.stringify(item, null, 2));
        console.log(`[git] written: ${item.id}.json`);
      }

      // Stage, commit, push
      await git.add(`${PENDING_PATH}/*.json`);
      
      const commitMsg = `chore(ingest): discord pending (${items.length} urls) ${batchId}\n\nmessage_id: ${messageId}`;
      const commitResult = await git.commit(commitMsg);
      
      if (!commitResult.commit) {
        console.log('[git] nothing to commit');
        return { success: true, commitHash: null };
      }

      console.log('[git] pushing...');
      await git.push('origin', config.github.branch);
      
      const hash = commitResult.commit.slice(0, 7);
      console.log(`[git] pushed: ${hash}`);
      return { success: true, commitHash: hash };

    } catch (err) {
      console.error(`[git] attempt ${attempt} failed:`, err.message);
      
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt - 1];
        console.log(`[git] retrying in ${delay}ms...`);
        await sleep(delay);
        
        // Try to recover with rebase
        try {
          await git.rebase(['--abort']);
        } catch {}
        await git.reset(['--hard', `origin/${config.github.branch}`]);
        await git.pull('origin', config.github.branch, ['--rebase']);
      } else {
        throw err;
      }
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
