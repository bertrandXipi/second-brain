import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGitHubFileUrl } from '../src/gitWriter.js';

const REPO_HTTPS_GIT = 'https://github.com/owner/fiches-veille.git';
const REPO_HTTPS = 'https://github.com/owner/fiches-veille';

test('buildGitHubFileUrl strips trailing .git and builds blob URL', () => {
  const url = buildGitHubFileUrl(
    'fiches/2026-05/2026-05-23-titre.md',
    REPO_HTTPS_GIT,
    'main',
  );
  assert.equal(
    url,
    'https://github.com/owner/fiches-veille/blob/main/fiches/2026-05/2026-05-23-titre.md',
  );
});

test('buildGitHubFileUrl works without .git suffix', () => {
  const url = buildGitHubFileUrl(
    'fiches/2026-05/note.md',
    REPO_HTTPS,
    'main',
  );
  assert.equal(
    url,
    'https://github.com/owner/fiches-veille/blob/main/fiches/2026-05/note.md',
  );
});

test('buildGitHubFileUrl URL-encodes accented filename segments', () => {
  const url = buildGitHubFileUrl(
    'fiches/2026-05/2026-05-23-éducation-IA.md',
    REPO_HTTPS_GIT,
    'main',
  );
  // Path traversal preserved (slashes intact), only segments encoded
  assert.ok(url.startsWith('https://github.com/owner/fiches-veille/blob/main/fiches/2026-05/'));
  assert.ok(url.includes('%C3%A9ducation-IA.md'), `expected encoded path, got ${url}`);
});

test('buildGitHubFileUrl honors a custom branch', () => {
  const url = buildGitHubFileUrl(
    'fiches/foo.md',
    REPO_HTTPS_GIT,
    'develop',
  );
  assert.ok(url.includes('/blob/develop/fiches/foo.md'));
});

test('buildGitHubFileUrl defaults branch to main when blank', () => {
  const url = buildGitHubFileUrl(
    'fiches/foo.md',
    REPO_HTTPS_GIT,
    '',
  );
  assert.ok(url.includes('/blob/main/fiches/foo.md'));
});

test('buildGitHubFileUrl returns null for empty path', () => {
  assert.equal(buildGitHubFileUrl('', REPO_HTTPS_GIT, 'main'), null);
  assert.equal(buildGitHubFileUrl(null, REPO_HTTPS_GIT, 'main'), null);
});
