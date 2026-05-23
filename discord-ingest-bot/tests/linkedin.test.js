import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitIntoChunks,
  extractLinkedInContent,
  buildThreadPrompt,
  buildLinkedInPrompt,
  buildTwitterPrompt,
  buildBothPrompt,
} from '../src/commands.js';

// --- splitIntoChunks ---

test('splitIntoChunks keeps short text as one chunk', () => {
  const text = 'Hello world';
  const chunks = splitIntoChunks(text, 100);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0], 'Hello world');
});

test('splitIntoChunks splits long text on paragraph boundaries', () => {
  const para1 = 'A'.repeat(1200);
  const para2 = 'B'.repeat(1200);
  const text = para1 + '\n\n' + para2;
  const chunks = splitIntoChunks(text, 1900);
  assert.equal(chunks.length, 2);
  assert.ok(chunks[0].includes('AAAA'));
  assert.ok(chunks[1].includes('BBBB'));
});

test('splitIntoChunks handles text at exact maxLength', () => {
  const text = 'X'.repeat(100);
  const chunks = splitIntoChunks(text, 100);
  assert.equal(chunks.length, 1);
});

test('splitIntoChunks handles empty string', () => {
  const chunks = splitIntoChunks('');
  assert.equal(chunks.length, 0);
});

// --- buildLinkedInPrompt ---

test('buildLinkedInPrompt includes MOFU instructions by default', () => {
  const prompt = buildLinkedInPrompt('Test sujet');
  assert.ok(prompt.includes('Test sujet'));
  assert.ok(prompt.includes('MOFU'));
  assert.ok(prompt.includes('expert qui partage'));
});

test('buildLinkedInPrompt includes TOFU instructions when specified', () => {
  const prompt = buildLinkedInPrompt('Sujet', 'tofu');
  assert.ok(prompt.includes('TOFU'));
  assert.ok(prompt.includes('audience froide'));
});

test('buildLinkedInPrompt includes BOFU instructions when specified', () => {
  const prompt = buildLinkedInPrompt('Sujet', 'bofu');
  assert.ok(prompt.includes('BOFU'));
  assert.ok(prompt.includes('Conversion'));
});

test('buildLinkedInPrompt falls back to MOFU for unknown funnel', () => {
  const prompt = buildLinkedInPrompt('Sujet', 'unknown');
  assert.ok(prompt.includes('MOFU'));
});

// --- buildTwitterPrompt ---

test('buildTwitterPrompt includes subject and Twitter rules', () => {
  const prompt = buildTwitterPrompt('Mon thread');
  assert.ok(prompt.includes('Mon thread'));
  assert.ok(prompt.includes('280'));
  assert.ok(prompt.includes('1/'));
  assert.ok(prompt.includes('Twitter/X'));
});

// --- buildBothPrompt ---

test('buildBothPrompt includes both Twitter and LinkedIn sections', () => {
  const prompt = buildBothPrompt('Sujet combo');
  assert.ok(prompt.includes('VERSION TWITTER'));
  assert.ok(prompt.includes('VERSION LINKEDIN'));
  assert.ok(prompt.includes('Sujet combo'));
});

// --- buildThreadPrompt ---

test('buildThreadPrompt dispatches to LinkedIn builder for linkedin platform', () => {
  const prompt = buildThreadPrompt('Sujet', 'linkedin', 'expert', '', 'mofu');
  assert.ok(prompt.includes('MOFU'));
  assert.ok(!prompt.includes('VERSION TWITTER'));
});

test('buildThreadPrompt dispatches to Twitter builder for twitter platform', () => {
  const prompt = buildThreadPrompt('Sujet', 'twitter', 'provocateur', '', 'tofu');
  assert.ok(prompt.includes('280'));
  assert.ok(prompt.includes('Ton provocateur'));
});

test('buildThreadPrompt dispatches to both builder for both platform', () => {
  const prompt = buildThreadPrompt('Sujet', 'both', 'storytelling', '', 'bofu');
  assert.ok(prompt.includes('VERSION TWITTER'));
  assert.ok(prompt.includes('VERSION LINKEDIN'));
  assert.ok(prompt.includes('Ton storytelling'));
});

test('buildThreadPrompt includes contexte block when provided', () => {
  const prompt = buildThreadPrompt('Sujet', 'linkedin', 'expert', 'Je suis dev IA depuis 10 ans', 'mofu');
  assert.ok(prompt.includes('Je suis dev IA depuis 10 ans'));
});

// --- extractLinkedInContent ---

test('extractLinkedInContent returns full text when plateforme is linkedin', () => {
  const content = 'Post LinkedIn complet ici';
  const result = extractLinkedInContent(content, 'linkedin');
  assert.equal(result, content);
});

test('extractLinkedInContent extracts LinkedIn section from both output', () => {
  const content = `## 🐦 VERSION TWITTER/X (Thread)

1/ Tweet un

2/ Tweet deux

## 💼 VERSION LINKEDIN (Post)

Voici le post LinkedIn
avec plusieurs lignes
et des hashtags

---`;
  const result = extractLinkedInContent(content, 'both');
  assert.ok(result.includes('Voici le post LinkedIn'));
  assert.ok(!result.includes('VERSION TWITTER'));
});

test('extractLinkedInContent returns null if no LinkedIn section found', () => {
  const content = 'Juste du texte sans section LinkedIn';
  const result = extractLinkedInContent(content, 'both');
  assert.equal(result, null);
});
