import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessage } from '../src/parser.js';

test('parses a single bare URL', () => {
  const { urls, tags, note } = parseMessage('https://example.com/article');
  assert.deepEqual(urls, ['https://example.com/article']);
  assert.deepEqual(tags, []);
  assert.equal(note, null);
});

test('extracts multiple URLs and a tag', () => {
  const { urls, tags, note } = parseMessage(
    'check ces deux liens https://a.com/x https://b.com/y #ia super intéressant'
  );
  assert.deepEqual(urls.sort(), ['https://a.com/x', 'https://b.com/y']);
  assert.deepEqual(tags, ['ia']);
  assert.equal(note, 'check ces deux liens super intéressant');
});

test('strips trailing punctuation from URLs', () => {
  const { urls } = parseMessage('voir https://example.com/article.');
  assert.deepEqual(urls, ['https://example.com/article']);
});

test('deduplicates URLs', () => {
  const { urls } = parseMessage('https://a.com https://a.com');
  assert.deepEqual(urls, ['https://a.com']);
});

test('returns note=null when only URL is provided', () => {
  const { note } = parseMessage('   https://x.com   ');
  assert.equal(note, null);
});

test('returns empty arrays for empty input', () => {
  const { urls, tags } = parseMessage('');
  assert.deepEqual(urls, []);
  assert.deepEqual(tags, []);
});
