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
  MorningDigest,
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

function parisDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
}

function countSujets(html: string): number {
  const match = html.match(/Sujet \d+\/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function crossReferenceMorningDigests(
  morningDigests: MorningDigest[],
  fiches: Fiche[],
): MorningDigest[] {
  const dateToSlugs = new Map<string, string[]>();
  for (const f of fiches) {
    const d = parisDate(f.date_captured);
    if (!dateToSlugs.has(d)) dateToSlugs.set(d, []);
    dateToSlugs.get(d)!.push(f.slug);
  }
  return morningDigests.map((md) => {
    const linked = dateToSlugs.get(md.date) ?? [];
    return { ...md, fiches_count: linked.length, linked_fiche_slugs: linked };
  });
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
        similar: [],
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

async function readMorningDigests(root: string): Promise<MorningDigest[]> {
  const dir = join(root, 'digests-morning');
  const out: MorningDigest[] = [];
  for await (const path of walkMd(dir)) {
    try {
      const raw = await readFile(path, 'utf8');
      const fm = matter(raw);
      const data = fm.data as Record<string, unknown>;
      const slug = basename(path).replace(/\.md$/i, '');
      const body = fm.content.trim();
      out.push({
        slug,
        date: asString(data.date) ?? slug,
        generated_at: asString(data.generated_at) ?? '',
        body_html: body,
        sujet_count: countSujets(body),
        fiches_count: 0,
        linked_fiche_slugs: [],
      });
    } catch (err) {
      console.warn(`[error] morning-digest ${path}:`, err);
    }
  }
  out.sort((a, b) => (a.date < b.date ? 1 : -1));
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

// ---------------------------------------------------------------------------
// TF-IDF + cosine similarity
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  // FR
  'le', 'la', 'les', 'de', 'du', 'des', 'et', 'un', 'une', 'dans', 'pour',
  'par', 'sur', 'avec', 'que', 'qui', 'est', 'sont', 'pas', 'plus', 'mais',
  'ou', 'où', 'donc', 'car', 'ce', 'cette', 'ces', 'son', 'sa', 'ses',
  'leur', 'leurs', 'aux', 'aussi', 'très', 'bien', 'être', 'avoir', 'fait',
  'faire', 'tout', 'tous', 'cela', 'comme', 'peut', 'peuvent', 'entre',
  'après', 'avant', 'pendant', 'sans', 'chez', 'dont', 'alors', 'même',
  'autres', 'chaque', 'cet', 'cette', 'vers', 'lors', 'cet', 'autre',
  'deux', 'trois', 'encore', 'notamment', 'ainsi', 'leurs', 'elle', 'elles',
  'celui', 'ceux', 'peu', 'ici', 'non',
  // EN
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'can', 'shall', 'this', 'that',
  'these', 'those', 'it', 'its', 'not', 'no', 'so', 'if', 'as', 'just',
  'about', 'into', 'over', 'than', 'then', 'also', 'very', 'only', 'some',
  'any', 'each', 'all', 'both', 'few', 'more', 'most', 'other', 'up', 'out',
  'when', 'what', 'which', 'who', 'how', 'they', 'them', 'their', 'we',
  'you', 'he', 'she', 'his', 'her', 'my', 'your', 'our',
]);

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const raw of text.toLowerCase().split(/[^a-zàâäéèêëîïôöùûüçœæ0-9]+/)) {
    const t = raw.trim();
    if (t.length >= 3 && !STOPWORDS.has(t)) tokens.push(t);
  }
  return tokens;
}

function computeSimilarity(fiches: Fiche[]): Map<string, string[]> {
  // Build corpus: title (×3), keywords, tags, body_excerpt
  const docs: string[][] = [];
  for (const f of fiches) {
    const titleTokens = tokenize(f.title);
    const kwTokens = tokenize(f.keywords.join(' '));
    const tagTokens = tokenize(f.tags.join(' '));
    const excerptTokens = tokenize(f.body_excerpt);
    docs.push([
      ...titleTokens, ...titleTokens, ...titleTokens,  // title ×3
      ...kwTokens,
      ...tagTokens,
      ...excerptTokens,
    ]);
  }

  const N = docs.length;

  // Document frequencies
  const df = new Map<string, number>();
  for (const tokens of docs) {
    const seen = new Set<string>();
    for (const t of tokens) {
      if (!seen.has(t)) {
        seen.add(t);
        df.set(t, (df.get(t) ?? 0) + 1);
      }
    }
  }

  // IDF
  const idf = new Map<string, number>();
  for (const [term, count] of df) {
    idf.set(term, Math.log(N / count));
  }

  // TF-IDF vectors (sparse)
  const vectors: Map<string, number>[] = [];
  for (const tokens of docs) {
    const tf = new Map<string, number>();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) ?? 0) + 1);
    }
    const vec = new Map<string, number>();
    for (const [t, cnt] of tf) {
      vec.set(t, (cnt / tokens.length) * (idf.get(t) ?? 0));
    }
    vectors.push(vec);
  }

  // Cosine similarity per pair → top 5
  const result = new Map<string, string[]>();
  for (let i = 0; i < N; i++) {
    const a = fiches[i];
    const va = vectors[i];
    const scores: { slug: string; score: number }[] = [];

    for (let j = 0; j < N; j++) {
      if (i === j) continue;
      const b = fiches[j];
      const vb = vectors[j];

      let dot = 0;
      // iterate smaller vector
      const [small, large] = va.size <= vb.size ? [va, vb] : [vb, va];
      for (const [t, w] of small) {
        dot += w * (large.get(t) ?? 0);
      }

      // norms (precomputed would be faster but 369 is small)
      if (dot === 0) continue;
      const normA = Math.sqrt([...va.values()].reduce((s, v) => s + v * v, 0));
      const normB = Math.sqrt([...vb.values()].reduce((s, v) => s + v * v, 0));
      const sim = dot / (normA * normB);

      scores.push({ slug: b.slug, score: sim });
    }

    scores.sort((x, y) => y.score - x.score);
    result.set(a.slug, scores.slice(0, 5).map((s) => s.slug));
  }

  return result;
}

async function main() {
  const t0 = Date.now();
  console.log(`[build-index] vault: ${VAULT_PATH}`);
  const vaultStat = await stat(VAULT_PATH).catch(() => null);
  if (!vaultStat || !vaultStat.isDirectory()) {
    throw new Error(`VAULT_PATH not a directory: ${VAULT_PATH}`);
  }

  const [fiches, digests, insights, rawMorningDigests] = await Promise.all([
    readFiches(VAULT_PATH),
    readDigests(VAULT_PATH),
    readInsights(VAULT_PATH),
    readMorningDigests(VAULT_PATH),
  ]);

  const tSim = Date.now();
  const similarity = computeSimilarity(fiches);
  for (const f of fiches) {
    f.similar = similarity.get(f.slug) ?? [];
  }
  console.log(`[build-index] similarity computed in ${Date.now() - tSim} ms`);

  const morningDigests = crossReferenceMorningDigests(rawMorningDigests, fiches);

  const index: IndexFile = {
    generated_at: new Date().toISOString(),
    vault_path: VAULT_PATH,
    counts: { fiches: fiches.length, digests: digests.length, insights: insights.length, morningDigests: morningDigests.length },
    fiches,
    digests,
    insights,
    morningDigests,
    facets: buildFacets(fiches),
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(index));
  const sizeMb = (Buffer.byteLength(JSON.stringify(index)) / 1024 / 1024).toFixed(2);
  console.log(
    `[build-index] wrote ${OUTPUT} (${sizeMb} MB) — ${fiches.length} fiches, ${digests.length} digests, ${insights.length} insights, ${morningDigests.length} morning digests in ${Date.now() - t0} ms`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
