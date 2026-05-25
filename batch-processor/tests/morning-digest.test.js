import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import { getYesterdayFiches, buildHtml, buildText } from '../src/morning-digest.js';

async function makeRepoWithFiches(fiches) {
  const root = await mkdtemp(path.join(tmpdir(), 'morning-digest-test-'));
  for (const { month, name, frontmatter, body = 'Body' } of fiches) {
    const monthDir = path.join(root, 'fiches', month);
    await mkdir(monthDir, { recursive: true });
    const fm = Object.entries(frontmatter)
      .map(([k, v]) => Array.isArray(v) ? `${k}:\n${v.map(x => `  - ${x}`).join('\n')}` : `${k}: ${typeof v === 'string' && !v.startsWith('"') ? `"${v}"` : v}`)
      .join('\n');
    const raw = `---\n${fm}\n---\n## Résumé\n\n${body}\n`;
    await writeFile(path.join(monthDir, name), raw);
  }
  return root;
}

test('getYesterdayFiches: keeps only fiches whose date_captured maps to target Paris date', async () => {
  const target = '2026-05-23';
  const root = await makeRepoWithFiches([
    {
      month: '2026-05',
      name: '2026-05-23-keep.md',
      frontmatter: {
        title: 'Kept fiche',
        source_url: 'https://example.com/a',
        date_captured: '2026-05-23T10:00:00.000Z',
        keywords: ['ai', 'tooling'],
      },
    },
    {
      month: '2026-05',
      name: '2026-05-22-skip.md',
      frontmatter: {
        title: 'Old fiche',
        source_url: 'https://example.com/b',
        date_captured: '2026-05-22T08:00:00.000Z',
        keywords: [],
      },
    },
  ]);

  const fiches = await getYesterdayFiches(root, target);
  assert.equal(fiches.length, 1);
  assert.equal(fiches[0].title, 'Kept fiche');
  assert.deepEqual(fiches[0].keywords, ['ai', 'tooling']);
  assert.equal(fiches[0].sourceUrl, 'https://example.com/a');
});

test('getYesterdayFiches: handles UTC late evening that lands on Paris next day', async () => {
  const target = '2026-05-23';
  const root = await makeRepoWithFiches([
    {
      month: '2026-05',
      name: '2026-05-22-late-utc.md',
      frontmatter: {
        title: 'Late UTC = Paris next day',
        source_url: 'https://example.com/late',
        date_captured: '2026-05-22T23:30:00.000Z',
        keywords: [],
      },
    },
  ]);

  const fiches = await getYesterdayFiches(root, target);
  assert.equal(fiches.length, 1, '23:30 UTC on 22-05 is 01:30 Paris on 23-05');
});

test('buildHtml: empty day uses calm copy', () => {
  const html = buildHtml({ targetDate: '2026-05-23', items: [] });
  assert.match(html, /Rien captur/);
  assert.match(html, /Profite du calme/);
});

test('buildHtml: renders thesis, benefit, context, source and resource link', () => {
  const html = buildHtml({
    targetDate: '2026-05-23',
    items: [{
      title: 'My Topic',
      sourceUrl: 'https://example.com/src',
      brief: { thesis: 'T-claim', benefit: 'B-gain', context: 'C-context' },
      resource: { url: 'https://example.com/related', title: 'Related Title' },
    }],
  });
  assert.match(html, /My Topic/);
  assert.match(html, /T-claim/);
  assert.match(html, /B-gain/);
  assert.match(html, /C-context/);
  assert.match(html, /example\.com\/src/);
  assert.match(html, /example\.com\/related/);
  assert.match(html, /Related Title/);
});

test('buildHtml: escapes HTML in title', () => {
  const html = buildHtml({
    targetDate: '2026-05-23',
    items: [{
      title: '<script>alert(1)</script>',
      sourceUrl: 'https://example.com',
      brief: { thesis: 't', benefit: 'b', context: 'c' },
    }],
  });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});

test('buildText: plain text fallback has all sections', () => {
  const text = buildText({
    targetDate: '2026-05-23',
    items: [{
      title: 'Sujet X',
      sourceUrl: 'https://example.com/x',
      brief: { thesis: 'th', benefit: 'be', context: 'co' },
      resource: { url: 'https://example.com/r', title: 'R' },
    }],
  });
  assert.match(text, /Sujet X/);
  assert.match(text, /Thèse : th/);
  assert.match(text, /Bénéfice : be/);
  assert.match(text, /Tenants & aboutissants : co/);
  assert.match(text, /example\.com\/x/);
  assert.match(text, /example\.com\/r/);
});
