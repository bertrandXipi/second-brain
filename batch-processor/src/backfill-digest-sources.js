import 'dotenv/config';
import { readdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { config } from './config.js';

async function getSourceUrlsForFiches(ficheRefs) {
  const fichesDir = path.join(config.workdir, 'fiches');
  const sourceUrls = [];

  for (const ref of ficheRefs) {
    // ref format: [[2025-12/2025-12-27-google-notebooklm-s-integre-a-gemini...]]
    const match = ref.match(/\[\[([^\]]+)\]\]/);
    if (!match) continue;
    
    const fichePath = path.join(fichesDir, match[1] + '.md');
    if (!existsSync(fichePath)) continue;

    const content = await readFile(fichePath, 'utf-8');
    const sourceUrlMatch = content.match(/source_url:\s*["']?([^\s"'\n]+)/);
    if (sourceUrlMatch) {
      sourceUrls.push(sourceUrlMatch[1]);
    }
  }

  return sourceUrls;
}

async function backfillDigest(digestPath) {
  const content = await readFile(digestPath, 'utf-8');
  
  // Skip if already has sources section
  if (content.includes('## Sources (pour NotebookLM)')) {
    console.log(`[backfill] skipping ${path.basename(digestPath)} - already has sources`);
    return false;
  }

  // Extract fiche references
  const fichesSection = content.match(/## Fiches de la semaine\n\n([\s\S]*?)(?=\n## |$)/);
  if (!fichesSection) {
    console.log(`[backfill] skipping ${path.basename(digestPath)} - no fiches section`);
    return false;
  }

  const ficheRefs = fichesSection[1].match(/- \[\[[^\]]+\]\]/g) || [];
  const sourceUrls = await getSourceUrlsForFiches(ficheRefs);

  if (sourceUrls.length === 0) {
    console.log(`[backfill] skipping ${path.basename(digestPath)} - no source URLs found`);
    return false;
  }

  // Append sources section
  const newContent = content.trimEnd() + `\n\n## Sources (pour NotebookLM)\n\n${sourceUrls.join('\n')}\n`;
  await writeFile(digestPath, newContent);
  console.log(`[backfill] updated ${path.basename(digestPath)} with ${sourceUrls.length} sources`);
  return true;
}

async function main() {
  const digestsDir = path.join(config.workdir, 'digests');
  
  if (!existsSync(digestsDir)) {
    console.log('[backfill] no digests directory found');
    return;
  }

  const files = await readdir(digestsDir);
  const digestFiles = files.filter(f => f.endsWith('.md'));

  console.log(`[backfill] found ${digestFiles.length} digests`);

  let updated = 0;
  for (const file of digestFiles) {
    const wasUpdated = await backfillDigest(path.join(digestsDir, file));
    if (wasUpdated) updated++;
  }

  console.log(`[backfill] done - updated ${updated} digests`);
}

main().catch(err => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});
