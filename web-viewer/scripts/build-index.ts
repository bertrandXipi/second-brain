import { readdir, readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import type {
  Digest,
  FacetCount,
  Fiche,
  IndexFile,
  Insight,
  SourceType,
  Status,
} from '../src/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const VAULT_PATH = process.env.VAULT_PATH ?? '/Users/bertrand/Sites/fiches-veille';
const OUTPUT = join(PROJECT_ROOT, 'public', 'index.json');

const VALID_SOURCE_TYPES: SourceType[] = ['article', 'youtube', 'video', 'tweet', 'pdf', 'other'];
const VALID_STATUSES: Status[] = ['published', 'draft', 'pending', 'failed'];

const WIKILINK_RE = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

function asString(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v;
  return undefined;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => (typeof x === 'string' ? x.trim() : '')).filter((x) => x.length > 0);
}

function asSourceType(v: unknown): SourceType {
  if (typeof v === 'string' && (VALID_SOURCE_TYPES as string[]).includes(v)) {
    return v as SourceType;
  }
  return 'article';
}

function asStatus(v: unknown): Status {
  if (typeof v === 'string' && (VALID_STATUSES as string[]).includes(v)) {
    return v as Status;
  }
  return 'published';
}

function stripMarkdown(md: string): string {
  return md
    .replace(/^#+\s+/gm, '')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => (b ?? a))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countWords(s: string): number {
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}

function extractWikilinks(md: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of md.matchAll(WIKILINK_RE)) {
    const raw = m[1].trim();
    const slug = basename(raw).replace(/\.md$/i, '');
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      out.push(slug);
    }
  }
  return out;
}

async function* walkMd(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      yield* walkMd(p);
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
      yield p;
    }
  }
}

async function readFiches(root: string): Promise<Fiche[]> {
  const dir = join(root, 'fiches');
  const out: Fiche[] = [];
  let skipped = 0;
  for await (const path of walkMd(dir)) {
    try {
      const raw = await readFile(path, 'utf8');
      const fm = matter(raw);
      const data = fm.data as Record<string, unknown>;
      const title = asString(data.title);
      const sourceUrl = asString(data.source_url);
      const dateCaptured = asString(data.date_captured);
      if (!title || !sourceUrl || !dateCaptured) {
        console.warn(`[skip] missing required field — ${path}`);
        skipped++;
        continue;
      }
      const slug = basename(path).replace(/\.md$/i, '');
      const month = basename(dirname(path));
      const body = fm.content.trim();
      const excerpt = stripMarkdown(body).slice(0, 300);
      out.push({
        slug,
        month,
        title,
        source_url: sourceUrl,
        source_type: asSourceType(data.source_type),
        date_captured: dateCaptured,
        date_processed: asString(data.date_processed),
        status: asStatus(data.status),
        language: asString(data.language),
        tags: asStringArray(data.tags),
        keywords: asStringArray(data.keywords),
        notebooklm_url: asString(data.notebooklm_url),
        notebooklm_notebook_id: asString(data.notebooklm_notebook_id),
        ingest_source: asString(data.ingest_source),
        discord_message_url: asString(data.discord_message_url),
        body_markdown: body,
        body_excerpt: excerpt,
        word_count: countWords(body),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
      console.warn(`[parse-error] ${path} — ${msg}`);
      skipped++;
    }
  }
  if (skipped > 0) console.warn(`[fiches] skipped ${skipped} file(s)`);
  out.sort((a, b) => (a.date_captured < b.date_captured ? 1 : -1));
  return out;
}

async function readDigests(root: string): Promise<Digest[]> {
  const dir = join(root, 'digests');
  const out: Digest[] = [];
  for await (const path of walkMd(dir)) {
    try {
      const raw = await readFile(path, 'utf8');
      const fm = matter(raw);
      const data = fm.data as Record<string, unknown>;
      const slug = basename(path).replace(/\.md$/i, '');
      const body = fm.content.trim();
      out.push({
        slug,
        year: Number(data.year) || 0,
        week: Number(data.week) || 0,
        fiches_count: Number(data.fiches_count) || 0,
        generated_at: asString(data.generated_at) ?? '',
        body_markdown: body,
        linked_fiche_slugs: extractWikilinks(body),
      });
    } catch (err) {
      console.warn(`[error] digest ${path}:`, err);
    }
  }
  out.sort((a, b) => (a.year !== b.year ? b.year - a.year : b.week - a.week));
  return out;
}

async function readInsights(root: string): Promise<Insight[]> {
  const dir = join(root, 'insights');
  const out: Insight[] = [];
  for await (const path of walkMd(dir)) {
    try {
      const raw = await readFile(path, 'utf8');
      const fm = matter(raw);
      const data = fm.data as Record<string, unknown>;
      const slug = basename(path).replace(/\.md$/i, '');
      const body = fm.content.trim();
      out.push({
        slug,
        year: Number(data.year) || 0,
        week: Number(data.week) || 0,
        generated_at: asString(data.generated_at) ?? '',
        focus: asString(data.focus),
        body_markdown: body,
      });
    } catch (err) {
      console.warn(`[error] insight ${path}:`, err);
    }
  }
  out.sort((a, b) => (a.year !== b.year ? b.year - a.year : b.week - a.week));
  return out;
}

function countBy(items: string[]): FacetCount[] {
  const map = new Map<string, number>();
  for (const x of items) map.set(x, (map.get(x) ?? 0) + 1);
  return [...map.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));
}

function buildFacets(fiches: Fiche[]): IndexFile['facets'] {
  const months = [...new Set(fiches.map((f) => f.month))].sort().reverse();
  const sourceTypes = [...new Set(fiches.map((f) => f.source_type))].sort();
  const statuses = [...new Set(fiches.map((f) => f.status))].sort();
  const allTags = fiches.flatMap((f) => f.tags);
  const allKw = fiches.flatMap((f) => f.keywords);
  return {
    months,
    source_types: sourceTypes,
    statuses,
    tags: countBy(allTags),
    keywords: countBy(allKw),
  };
}

async function main() {
  const t0 = Date.now();
  console.log(`[build-index] vault: ${VAULT_PATH}`);
  const vaultStat = await stat(VAULT_PATH).catch(() => null);
  if (!vaultStat || !vaultStat.isDirectory()) {
    throw new Error(`VAULT_PATH not a directory: ${VAULT_PATH}`);
  }

  const [fiches, digests, insights] = await Promise.all([
    readFiches(VAULT_PATH),
    readDigests(VAULT_PATH),
    readInsights(VAULT_PATH),
  ]);

  const index: IndexFile = {
    generated_at: new Date().toISOString(),
    vault_path: VAULT_PATH,
    counts: { fiches: fiches.length, digests: digests.length, insights: insights.length },
    fiches,
    digests,
    insights,
    facets: buildFacets(fiches),
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(index));
  const sizeMb = (Buffer.byteLength(JSON.stringify(index)) / 1024 / 1024).toFixed(2);
  console.log(
    `[build-index] wrote ${OUTPUT} (${sizeMb} MB) — ${fiches.length} fiches, ${digests.length} digests, ${insights.length} insights in ${Date.now() - t0} ms`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
