import type { Fiche } from '../../types';

export interface GraphNode {
  id: string;
  label: string;
  month: string;
  size: number;
  color: string;
}

export interface GraphLink {
  source: string;
  target: string;
  value: number;          // shared count
  shared: string[];
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  isolatedCount: number;
}

const MONTH_PALETTE = [
  '#4f46e5', '#0ea5e9', '#10b981', '#84cc16',
  '#eab308', '#f59e0b', '#ef4444', '#ec4899',
  '#a855f7', '#6366f1',
];

function colorForMonth(month: string, allMonths: string[]): string {
  const idx = allMonths.indexOf(month);
  if (idx < 0) return '#888';
  return MONTH_PALETTE[idx % MONTH_PALETTE.length];
}

interface BuildOptions {
  fiches: Fiche[];
  keywordFilter?: string;    // restrict to fiches containing this keyword/tag
  minSharedTerms: number;    // min shared keywords+tags to draw an edge
  maxNodes: number;          // hard cap
}

export function buildGraph({
  fiches,
  keywordFilter,
  minSharedTerms,
  maxNodes,
}: BuildOptions): GraphData {
  let pool = fiches;
  if (keywordFilter) {
    const needle = keywordFilter.toLowerCase();
    pool = pool.filter(
      (f) =>
        f.keywords.some((k) => k.toLowerCase() === needle) ||
        f.tags.some((t) => t.toLowerCase() === needle),
    );
  }

  // Most-recent first, capped
  const selected = pool.slice(0, maxNodes);
  const allMonths = [...new Set(selected.map((f) => f.month))].sort();

  // Pre-compute term sets per fiche
  const terms = new Map<string, Set<string>>();
  for (const f of selected) {
    const s = new Set<string>();
    for (const k of f.keywords) s.add(k.toLowerCase());
    for (const t of f.tags) s.add(t.toLowerCase());
    terms.set(f.slug, s);
  }

  const links: GraphLink[] = [];
  const connectedSlugs = new Set<string>();

  for (let i = 0; i < selected.length; i++) {
    const a = selected[i];
    const aTerms = terms.get(a.slug)!;
    if (aTerms.size === 0) continue;
    for (let j = i + 1; j < selected.length; j++) {
      const b = selected[j];
      const bTerms = terms.get(b.slug)!;
      if (bTerms.size === 0) continue;
      const shared: string[] = [];
      for (const t of aTerms) if (bTerms.has(t)) shared.push(t);
      if (shared.length >= minSharedTerms) {
        links.push({ source: a.slug, target: b.slug, value: shared.length, shared });
        connectedSlugs.add(a.slug);
        connectedSlugs.add(b.slug);
      }
    }
  }

  const nodes: GraphNode[] = selected.map((f) => ({
    id: f.slug,
    label: f.title,
    month: f.month,
    size: 3 + Math.min(8, f.keywords.length + f.tags.length),
    color: colorForMonth(f.month, allMonths),
  }));

  return {
    nodes,
    links,
    isolatedCount: nodes.length - connectedSlugs.size,
  };
}
