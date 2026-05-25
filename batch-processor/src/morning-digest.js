import './preload-env.js';
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { initGit, pullLatest, commitAndPush } from './git-sync.js';
import { notifyError } from './discord-notify.js';
import { sendEmail } from './email-sender.js';
import { findRelatedResource } from './related-resource.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.join(__dirname, '../prompts/morning-fiche.txt');

const DRY_RUN = process.argv.includes('--dry-run');
const USE_LOCAL = process.argv.includes('--local');
const TZ = 'Europe/Paris';

function parseDateArg() {
  const idx = process.argv.indexOf('--date');
  if (idx === -1 || idx + 1 >= process.argv.length) return null;
  const raw = process.argv[idx + 1];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    console.error(`[morning-digest] invalid date: ${raw} (expected YYYY-MM-DD)`);
    process.exit(1);
  }
  return raw;
}
const DATE_OVERRIDE = parseDateArg();

function parisDate(input) {
  return new Date(input).toLocaleDateString('fr-CA', { timeZone: TZ });
}

function yesterdayParis(now = new Date()) {
  const ms = now.getTime() - 24 * 60 * 60 * 1000;
  return parisDate(new Date(ms));
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { fm: {}, body: raw };
  const fm = {};
  const lines = match[1].split('\n');
  let currentKey = null;
  let listBuffer = null;
  for (const line of lines) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) {
      if (currentKey && listBuffer) {
        fm[currentKey] = listBuffer;
        listBuffer = null;
      }
      const [, key, val] = kv;
      currentKey = key;
      const trimmed = val.trim();
      if (trimmed === '') {
        listBuffer = [];
      } else {
        fm[key] = trimmed.replace(/^["']|["']$/g, '');
        currentKey = null;
      }
    } else {
      const item = line.match(/^\s*-\s*(.+)$/);
      if (item && listBuffer !== null) {
        listBuffer.push(item[1].trim().replace(/^["']|["']$/g, ''));
      }
    }
  }
  if (currentKey && listBuffer) fm[currentKey] = listBuffer;
  return { fm, body: match[2] };
}

export async function getYesterdayFiches(repoRoot, targetDate) {
  const fichesDir = path.join(repoRoot, 'fiches');
  if (!existsSync(fichesDir)) return [];

  const monthsToScan = [targetDate.slice(0, 7)];
  const todayMonth = new Date().toLocaleDateString('fr-CA', { timeZone: TZ }).slice(0, 7);
  if (!monthsToScan.includes(todayMonth)) monthsToScan.push(todayMonth);

  const fiches = [];
  for (const month of monthsToScan) {
    const monthDir = path.join(fichesDir, month);
    if (!existsSync(monthDir)) continue;
    const files = await readdir(monthDir);
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      const filePath = path.join(monthDir, file);
      const raw = await readFile(filePath, 'utf-8');
      const { fm, body } = parseFrontmatter(raw);
      if (!fm.date_captured) continue;
      if (parisDate(fm.date_captured) !== targetDate) continue;
      fiches.push({
        file: `${month}/${file}`,
        title: fm.title || file.replace('.md', ''),
        sourceUrl: fm.source_url || null,
        keywords: Array.isArray(fm.keywords) ? fm.keywords : [],
        summary: extractSummary(body),
        notebookUrl: fm.notebooklm_url || null,
      });
    }
  }
  return fiches;
}

function extractSummary(body) {
  const match = body.match(/##\s*Résumé[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i);
  return (match?.[1] || body).trim().slice(0, 4000);
}

function pickLlmCmd() {
  if (process.env.MORNING_LLM_CMD) return process.env.MORNING_LLM_CMD;
  const candidates = ['gemini', 'llm -m deepseek-chat'];
  for (const c of candidates) {
    const bin = c.split(' ')[0];
    try {
      execSync(`command -v ${bin}`, { stdio: 'ignore' });
      return c;
    } catch {}
  }
  return null;
}

const LLM_CMD = pickLlmCmd();

async function generateBrief(fiche) {
  if (!LLM_CMD) throw new Error('no LLM CLI available (gemini or llm)');

  const promptTemplate = await readFile(PROMPT_PATH, 'utf-8');
  const prompt = promptTemplate
    .replace('{{TITLE}}', fiche.title)
    .replace('{{KEYWORDS}}', fiche.keywords.join(', ') || '(aucun)')
    .replace('{{SUMMARY}}', fiche.summary);

  const tempFile = path.join(tmpdir(), `morning-brief-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`);
  writeFileSync(tempFile, prompt);

  try {
    const out = execSync(`${LLM_CMD} < "${tempFile}"`, {
      encoding: 'utf-8',
      timeout: 60000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const jsonMatch = out.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no JSON in LLM output');
    return JSON.parse(jsonMatch[0]);
  } finally {
    try { unlinkSync(tempFile); } catch {}
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatHumanDate(yyyyMmDd) {
  const [y, m, d] = yyyyMmDd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function buildHtml({ targetDate, items }) {
  const human = formatHumanDate(targetDate);

  if (items.length === 0) {
    return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#222">
<h1 style="font-size:20px;margin:0 0 8px">📭 Rien capturé ${escapeHtml(human)}</h1>
<p style="color:#666">Profite du calme. Le cron a tourné comme prévu.</p>
</body></html>`;
  }

  const cards = items.map((it, i) => {
    const brief = it.brief || {};
    const resource = it.resource;
    return `
<div style="border-left:3px solid #4a90e2;padding:12px 16px;margin:16px 0;background:#fafbfc">
  <div style="font-size:12px;color:#888;margin-bottom:4px">Sujet ${i + 1}/${items.length}</div>
  <h2 style="font-size:16px;margin:0 0 8px"><a href="${escapeHtml(it.sourceUrl || '#')}" style="color:#222;text-decoration:none">${escapeHtml(it.title)}</a></h2>
  ${brief.thesis ? `<p style="margin:6px 0"><strong>Thèse.</strong> ${escapeHtml(brief.thesis)}</p>` : ''}
  ${brief.benefit ? `<p style="margin:6px 0"><strong>Bénéfice.</strong> ${escapeHtml(brief.benefit)}</p>` : ''}
  ${brief.context ? `<p style="margin:6px 0"><strong>Tenants &amp; aboutissants.</strong> ${escapeHtml(brief.context)}</p>` : ''}
  <div style="margin-top:10px;font-size:13px">
    ${it.sourceUrl ? `<a href="${escapeHtml(it.sourceUrl)}" style="color:#4a90e2;margin-right:12px">🔗 Source</a>` : ''}
    ${resource ? `<a href="${escapeHtml(resource.url)}" style="color:#4a90e2">📚 Ressource exploitable : ${escapeHtml(resource.title)}</a>` : ''}
  </div>
</div>`;
  }).join('');

  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#222">
<h1 style="font-size:22px;margin:0 0 4px">📰 Veille du ${escapeHtml(human)}</h1>
<p style="color:#666;margin:0 0 16px">${items.length} sujet${items.length > 1 ? 's' : ''} capté${items.length > 1 ? 's' : ''} hier.</p>
${cards}
<p style="color:#999;font-size:12px;margin-top:24px">Second Brain — généré automatiquement</p>
</body></html>`;
}

export function buildText({ targetDate, items }) {
  const human = formatHumanDate(targetDate);
  if (items.length === 0) return `Rien capturé ${human}. Profite du calme.`;
  const lines = [`Veille du ${human} — ${items.length} sujet(s)`, ''];
  items.forEach((it, i) => {
    lines.push(`${i + 1}. ${it.title}`);
    if (it.brief?.thesis) lines.push(`   Thèse : ${it.brief.thesis}`);
    if (it.brief?.benefit) lines.push(`   Bénéfice : ${it.brief.benefit}`);
    if (it.brief?.context) lines.push(`   Tenants & aboutissants : ${it.brief.context}`);
    if (it.sourceUrl) lines.push(`   Source : ${it.sourceUrl}`);
    if (it.resource) lines.push(`   Ressource : ${it.resource.url}`);
    lines.push('');
  });
  return lines.join('\n');
}

async function enrichFiche(fiche) {
  let brief = null;
  try {
    brief = await generateBrief(fiche);
  } catch (err) {
    console.error(`[brief] failed for "${fiche.title.slice(0, 50)}":`, err.message);
    brief = { thesis: fiche.title, benefit: '', context: '(synthèse indisponible)' };
  }

  let resource = null;
  try {
    resource = await findRelatedResource({
      title: fiche.title,
      keywords: fiche.keywords,
      excludeUrl: fiche.sourceUrl,
    });
  } catch (err) {
    console.error(`[exa] failed for "${fiche.title.slice(0, 50)}":`, err.message);
  }

  return { ...fiche, brief, resource };
}

async function writeOne(dir, targetDate, html) {
  const backupDir = path.join(dir, 'digests-morning');
  if (!existsSync(backupDir)) await mkdir(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `${targetDate}.md`);
  const content = `---
type: morning-digest
date: ${targetDate}
generated_at: ${new Date().toISOString()}
---

${html}
`;
  await writeFile(backupFile, content);
  console.log(`[backup] written digests-morning/${targetDate}.md to ${dir}`);
}

async function writeBackup(repoRoot, targetDate, html) {
  await writeOne(repoRoot, targetDate, html);

  const vault = process.env.OBSIDIAN_VAULT_PATH;
  if (vault && path.resolve(vault) !== path.resolve(repoRoot)) {
    await writeOne(vault, targetDate, html);
  }
}

async function main() {
  console.log(`[morning-digest] starting${DRY_RUN ? ' (DRY RUN)' : ''}...`);

  let repoRoot;
  if ((DRY_RUN || USE_LOCAL) && process.env.OBSIDIAN_VAULT_PATH && existsSync(process.env.OBSIDIAN_VAULT_PATH)) {
    repoRoot = process.env.OBSIDIAN_VAULT_PATH;
    console.log(`[morning-digest] using local vault: ${repoRoot}`);
  } else {
    await initGit();
    await pullLatest();
    repoRoot = config.workdir;
  }

  const target = DATE_OVERRIDE || yesterdayParis();
  console.log(`[morning-digest] target date (Paris): ${target}`);

  const fiches = await getYesterdayFiches(repoRoot, target);
  console.log(`[morning-digest] found ${fiches.length} fiche(s) for ${target}`);

  const enriched = [];
  for (const fiche of fiches) {
    console.log(`[morning-digest] enriching: ${fiche.title.slice(0, 60)}`);
    enriched.push(await enrichFiche(fiche));
  }

  const html = buildHtml({ targetDate: target, items: enriched });
  const text = buildText({ targetDate: target, items: enriched });
  const subject = enriched.length === 0
    ? `📭 Veille du ${formatHumanDate(target)} — rien à signaler`
    : `📰 Veille du ${formatHumanDate(target)} — ${enriched.length} sujet${enriched.length > 1 ? 's' : ''}`;

  await sendEmail({ subject, html, text, dryRun: DRY_RUN });

  if (!DRY_RUN) {
    try {
      await writeBackup(repoRoot, target, html);
      await commitAndPush(`chore(morning-digest): ${target}`);
    } catch (err) {
      console.error('[morning-digest] backup/push failed:', err.message);
    }
  }

  console.log('[morning-digest] done');
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch(async (err) => {
    console.error('[morning-digest] fatal:', err);
    if (!DRY_RUN) {
      try { await notifyError(err, 'Morning digest'); } catch {}
    }
    process.exit(1);
  });
}
