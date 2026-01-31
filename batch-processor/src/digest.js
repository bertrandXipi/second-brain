import 'dotenv/config';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { config } from './config.js';
import { initGit, pullLatest, commitAndPush } from './git-sync.js';
import { notifyDiscord } from './discord-notify.js';

const OBSIDIAN_VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH || '~/Sites/fiches-veille';

async function getWeekFiches() {
  const fichesDir = path.join(config.workdir, 'fiches');
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const fiches = [];

  if (!existsSync(fichesDir)) return fiches;

  const months = await readdir(fichesDir);
  for (const month of months) {
    const monthDir = path.join(fichesDir, month);
    const files = await readdir(monthDir);
    
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const filePath = path.join(monthDir, file);
      const content = await readFile(filePath, 'utf-8');
      
      // Extract date from frontmatter
      const dateMatch = content.match(/date_processed:\s*["']?(\d{4}-\d{2}-\d{2})/);
      if (dateMatch) {
        const fileDate = new Date(dateMatch[1]).getTime();
        if (fileDate >= oneWeekAgo) {
          // Extract source_url from frontmatter
          const sourceUrlMatch = content.match(/source_url:\s*["']?([^\s"'\n]+)/);
          const sourceUrl = sourceUrlMatch ? sourceUrlMatch[1] : null;
          fiches.push({ file: `${month}/${file}`, content, sourceUrl });
        }
      }
    }
  }

  return fiches;
}

function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

async function generateDigest(fiches) {
  console.log('[digest] generating with gemini...');

  const fichesText = fiches.map(f => {
    // Extract just the summary and key points
    const titleMatch = f.content.match(/title:\s*["']?(.+?)["']?\n/);
    const summaryMatch = f.content.match(/## Résumé\n\n([\s\S]*?)(?=\n## )/);
    const keyPointsMatch = f.content.match(/## Points clés\n\n([\s\S]*?)(?=\n## )/);
    
    return `### ${titleMatch?.[1] || f.file}
${summaryMatch?.[1] || ''}
${keyPointsMatch?.[1] || ''}
---`;
  }).join('\n\n');

  const prompt = `Tu es un assistant qui analyse une veille technologique hebdomadaire.

Voici ${fiches.length} fiches de veille de cette semaine:

${fichesText}

Génère un digest hebdomadaire avec:
1. **Tendances clés** : Quels thèmes/sujets reviennent ? Quelles évolutions notables ?
2. **Connexions** : Comment ces sujets se relient entre eux ?
3. **Actions suggérées** : 2-3 actions concrètes basées sur cette veille (à tester, à approfondir, idées projets)
4. **Fiche à relire** : Quelle fiche mériterait une relecture approfondie et pourquoi ?

Format ta réponse en Markdown, sois concis et actionnable.`;

  const { writeFileSync, unlinkSync } = await import('fs');
  const { tmpdir } = await import('os');
  const tempFile = path.join(tmpdir(), `digest-prompt-${Date.now()}.txt`);
  writeFileSync(tempFile, prompt);

  try {
    const result = execSync(`gemini < "${tempFile}"`, {
      encoding: 'utf-8',
      timeout: 180000,
      maxBuffer: 10 * 1024 * 1024,
    });
    unlinkSync(tempFile);
    return result;
  } catch (err) {
    try { unlinkSync(tempFile); } catch {}
    throw err;
  }
}

async function main() {
  console.log('[digest] starting...');

  await initGit();
  await pullLatest();

  const fiches = await getWeekFiches();
  
  if (fiches.length === 0) {
    console.log('[digest] no fiches this week');
    await notifyDiscord(0, 0, ['Aucune fiche cette semaine, pas de digest généré']);
    return;
  }

  console.log(`[digest] found ${fiches.length} fiches this week`);

  const digestContent = await generateDigest(fiches);
  
  // Create digest file
  const now = new Date();
  const year = now.getFullYear();
  const week = getWeekNumber(now);
  const digestDir = path.join(config.workdir, 'digests');
  
  if (!existsSync(digestDir)) {
    await mkdir(digestDir, { recursive: true });
  }

  const filename = `${year}-W${String(week).padStart(2, '0')}.md`;
  
  // Collect all source URLs
  const sourceUrls = fiches
    .map(f => f.sourceUrl)
    .filter(url => url && url.length > 0);

  const fullContent = `---
type: digest
year: ${year}
week: ${week}
fiches_count: ${fiches.length}
generated_at: ${now.toISOString()}
---

# Digest Semaine ${week} (${year})

${digestContent}

## Fiches de la semaine

${fiches.map(f => `- [[${f.file.replace('.md', '')}]]`).join('\n')}

## Sources (pour NotebookLM)

${sourceUrls.join('\n')}
`;

  await writeFile(path.join(digestDir, filename), fullContent);
  console.log(`[digest] written: digests/${filename}`);

  // Commit and push
  await commitAndPush(`chore(digest): weekly digest ${year}-W${week}`);

  // Sync Obsidian vault
  if (existsSync(OBSIDIAN_VAULT_PATH)) {
    console.log('[digest] syncing obsidian vault...');
    try {
      execSync('git pull', { cwd: OBSIDIAN_VAULT_PATH, stdio: 'inherit' });
    } catch (err) {
      console.error('[digest] vault sync failed:', err.message);
    }
  }

  // Notify Discord
  const summary = digestContent.slice(0, 1500) + (digestContent.length > 1500 ? '...' : '');
  await notifyDiscord(fiches.length, 0, [`📊 **Digest S${week}**\n${summary}`]);

  console.log('[digest] done');
}

main().catch(err => {
  console.error('[digest] fatal:', err);
  process.exit(1);
});
