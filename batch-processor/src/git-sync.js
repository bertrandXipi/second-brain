import simpleGit from 'simple-git';
import { mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { config } from './config.js';

let git = null;

export async function initGit() {
  if (!existsSync('./workdir')) {
    await mkdir('./workdir', { recursive: true });
  }

  const repoUrl = config.github.repoUrl.replace(
    'https://',
    `https://${config.github.pat}@`
  );

  if (!existsSync(config.workdir)) {
    console.log('[git] cloning repo...');
    const tempGit = simpleGit();
    await tempGit.clone(repoUrl, config.workdir, ['--branch', config.github.branch]);
  }

  git = simpleGit(config.workdir);
  await git.addConfig('user.name', config.github.authorName);
  await git.addConfig('user.email', config.github.authorEmail);
  console.log('[git] repo ready');
}

export async function pullLatest() {
  console.log('[git] pulling...');
  try {
    await git.pull('origin', config.github.branch, ['--rebase']);
    console.log('[git] pull ok');
  } catch (err) {
    // Retry once after a short delay
    console.log('[git] pull failed, retrying...');
    await new Promise(r => setTimeout(r, 2000));
    try {
      await git.pull('origin', config.github.branch, ['--rebase']);
      console.log('[git] pull ok (retry)');
    } catch (retryErr) {
      throw new Error(`Git pull failed: ${retryErr.message}`);
    }
  }
}

export async function commitAndPush(message) {
  console.log('[git] committing...');
  
  await git.add('.');
  const result = await git.commit(message);

  if (!result.commit) {
    console.log('[git] nothing to commit');
    return null;
  }

  console.log('[git] pushing...');
  await git.push('origin', config.github.branch);

  const hash = result.commit.slice(0, 7);
  console.log(`[git] pushed: ${hash}`);
  return hash;
}
