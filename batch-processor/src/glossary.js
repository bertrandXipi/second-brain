import 'dotenv/config';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { config } from './config.js';
import { initGit, pullLatest, commitAndPush } from './git-sync.js';
import { notifyDiscord } from './discord-notify.js';

const OBSIDIAN_VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH || '/Users/bertrand/Sites/fiches-veille';

async function getAllFiches() {
  const fichesDir = path.join(config.workdir, 'fiches');
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
      fiches.push({ 
        path: `fiches/${month}/${file}`,
        name: file.replace('.md', ''),
        content 
      });
    }
  }

  return fiches;
}

function extractConcepts(fiches) {
  const conceptMap = new Map();

  for (const fiche of fiches) {
    // Extract concepts from wikilinks [[Concept]]
    const wikilinks = fiche.content.match(/\[\[([^\]]+)\]\]/g) || [];
    
    for (const link of wikilinks) {
      const concept = link.replace(/\[\[|\]\]/g, '').split('|')[0].trim();
      
      // Skip self-references and file paths
      if (concept.includes('/') || concept === fiche.name) continue;
      
      if (!conceptMap.has(concept)) {
        conceptMap.set(concept, []);
      }
      conceptMap.get(concept).push(fiche);
    }

    // Also extract from tags in frontmatter
    const tagsMatch = fiche.content.match(/tags:\n((?:\s+-\s+.+\n)+)/);
    if (tagsMatch) {
      const tags = tagsMatch[1].match(/-\s+(\w+)/g) || [];
      for (const tag of tags) {
        const concept = tag.replace('-', '').trim();
        if (!conceptMap.has(concept)) {
          conceptMap.set(concept, []);
        }
        if (!conceptMap.get(concept).includes(fiche)) {
          conceptMap.get(concept).push(fiche);
        }
      }
    }
  }

  return conceptMap;
}

async function generateDefinition(concept, fiches) {
  const context = fiches.slice(0, 5).map(f => {
    const summaryMatch = f.content.match(/## Résumé\n\n([\s\S]*?)(?=\n## )/);
    return summaryMatch?.[1]?.slice(0, 500) || '';
  }).join('\n---\n');

  const prompt = `Concept: "${concept}"

Contexte (extraits de fiches de veille qui mentionnent ce concept):
${context}

Génère une définition concise (2-3 phrases) de ce concept dans le contexte de la veille technologique. 
Si le concept est trop générique ou manque de contexte, dis-le.
Réponds uniquement avec la définition, sans introduction.`;

  const { writeFileSync, unlinkSync } = await import('fs');
  const { tmpdir } = await import('os');
  const tempFile = path.join(tmpdir(), `glossary-prompt-${Date.now()}.txt`);
  writeFileSync(tempFile, prompt);

  try {
    const result = execSync(`gemini < "${tempFile}"`, {
      encoding: 'utf-8',
      timeout: 60000,
      maxBuffer: 10 * 1024 * 1024,
    });
    unlinkSync(tempFile);
    return result.trim();
  } catch (err) {
    try { unlinkSync(tempFile); } catch {}
    return `Concept mentionné dans ${fiches.length} fiche(s).`;
  }
}

async function main() {
  console.log('[glossary] starting...');

  await initGit();
  await pullLatest();

  const fiches = await getAllFiches();
  console.log(`[glossary] found ${fiches.length} fiches`);

  const conceptMap = extractConcepts(fiches);
  console.log(`[glossary] found ${conceptMap.size} concepts`);

  // Filter concepts with at least 2 mentions
  const significantConcepts = [...conceptMap.entries()]
    .filter(([_, fiches]) => fiches.length >= 2)
    .sort((a, b) => b[1].length - a[1].length);

  console.log(`[glossary] ${significantConcepts.length} concepts with 2+ mentions`);

  const glossaryDir = path.join(config.workdir, 'glossaire');
  if (!existsSync(glossaryDir)) {
    await mkdir(glossaryDir, { recursive: true });
  }

  // Check existing glossary files
  let existingFiles = [];
  try {
    existingFiles = await readdir(glossaryDir);
  } catch {}

  let created = 0;
  let updated = 0;

  for (const [concept, fichesForConcept] of significantConcepts) {
    const filename = `${concept}.md`;
    const filePath = path.join(glossaryDir, filename);
    const exists = existingFiles.includes(filename);

    // Generate definition only for new concepts
    let definition = '';
    if (!exists) {
      console.log(`[glossary] generating definition for: ${concept}`);
      definition = await generateDefinition(concept, fichesForConcept);
    } else {
      // Keep existing definition
      const existing = await readFile(filePath, 'utf-8');
      const defMatch = existing.match(/## Définition\n\n([\s\S]*?)(?=\n## )/);
      definition = defMatch?.[1]?.trim() || '';
    }

    const content = `---
type: glossaire
concept: ${concept}
mentions: ${fichesForConcept.length}
updated_at: ${new Date().toISOString()}
---

# ${concept}

## Définition

${definition}

## Fiches liées (${fichesForConcept.length})

${fichesForConcept.map(f => `- [[${f.name}]]`).join('\n')}
`;

    await writeFile(filePath, content);
    
    if (exists) {
      updated++;
    } else {
      created++;
    }
  }

  console.log(`[glossary] created: ${created}, updated: ${updated}`);

  // Generate index
  const indexContent = `---
type: glossaire-index
updated_at: ${new Date().toISOString()}
---

# Glossaire

${significantConcepts.map(([concept, fiches]) => 
  `- [[${concept}]] (${fiches.length} mentions)`
).join('\n')}
`;

  await writeFile(path.join(glossaryDir, '_index.md'), indexContent);

  // Commit and push
  if (created > 0 || updated > 0) {
    await commitAndPush(`chore(glossary): ${created} created, ${updated} updated`);
  }

  // Sync Obsidian vault
  if (existsSync(OBSIDIAN_VAULT_PATH)) {
    console.log('[glossary] syncing obsidian vault...');
    try {
      execSync('git pull', { cwd: OBSIDIAN_VAULT_PATH, stdio: 'inherit' });
    } catch (err) {
      console.error('[glossary] vault sync failed:', err.message);
    }
  }

  // Notify Discord
  await notifyDiscord(created, 0, [`📖 Glossaire mis à jour: ${created} nouveaux, ${updated} actualisés`]);

  console.log('[glossary] done');
}

main().catch(err => {
  console.error('[glossary] fatal:', err);
  process.exit(1);
});
