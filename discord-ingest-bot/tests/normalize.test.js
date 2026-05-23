import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl, normalizeTag } from '../src/normalize.js';

test('normalizeUrl strips trailing slash on root', () => {
  assert.equal(normalizeUrl('https://example.com/'), 'https://example.com');
});

test('normalizeUrl preserves path trailing slash if path is not /', () => {
  assert.equal(normalizeUrl('https://example.com/path/'), 'https://example.com/path/');
});

test('normalizeUrl returns input on invalid URL', () => {
  assert.equal(normalizeUrl('not a url'), 'not a url');
});

test('normalizeTag lowercases and dash-joins', () => {
  assert.equal(normalizeTag('IA Generative'), 'ia-generative');
});

test('normalizeTag strips trailing punctuation', () => {
  assert.equal(normalizeTag('IA!'), 'ia');
});
