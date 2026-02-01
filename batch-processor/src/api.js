/**
 * Second-Brain HTTP API
 * Expose les fonctionnalités de second-brain comme une API REST
 * 
 * Endpoints:
 * - POST /archive - Archive une URL complète (fetch + NotebookLM + markdown + git)
 * - GET /health - Health check
 */

import express from 'express';
import { fetchAndExtract } from './fetch-content.js';
import { addToNotebookLM, getDetailedAnalysis } from './notebooklm-http.js';
import { generateMarkdownV2 } from './markdown-generator-v2.js';
import simpleGit from 'simple-git';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const app = express();
app.use(express.json());

const PORT = process.env.API_PORT || 3100;
const REPO_PATH = process.env.REPO_PATH || './workdir/repo';
const API_TOKEN = process.env.API_TOKEN;

/**
 * Authentication middleware
 */
function authMiddleware(req, res, next) {
  // Health check doesn't require auth
  if (req.path === '/health') {
    return next();
  }
  
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Missing or invalid Authorization header' });
  }
  
  const token = authHeader.slice(7);
  if (!API_TOKEN || token !== API_TOKEN) {
    return res.status(403).json({ success: false, error: 'Invalid API token' });
  }
  
  next();
}

// Apply auth middleware to all routes
app.use(authMiddleware);

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * Archive URL endpoint
 * 
 * Body:
 * - url: string (required)
 * - tags: string[] (optional)
 * - note: string (optional)
 * - source: string (optional, default: 'api')
 */
app.post('/archive', async (req, res) => {
  const startTime = Date.now();
  const { url, tags = [], note = '', source = 'api' } = req.body;

  if (!url) {
    return res.status(400).json({ success: false, error: 'URL is required' });
  }

  console.log(`[api] Archive request: ${url} (source: ${source})`);

  try {
    // 1. Fetch content
    console.log('[api] Fetching content...');
    const fetchResult = await fetchAndExtract(url);

    // 2. Add to NotebookLM
    console.log('[api] Adding to NotebookLM...');
    const notebookResult = await addToNotebookLM(url, fetchResult.content, {
      title: fetchResult.title,
      tags,
    });

    // 3. Get AI analysis
    console.log('[api] Getting AI analysis...');
    const analysis = await getDetailedAnalysis(
      notebookResult.notebook_id,
      notebookResult.source_id
    );

    // 4. Generate markdown
    console.log('[api] Generating markdown...');
    const item = {
      id: crypto.randomUUID(),
      url,
      title: fetchResult.title,
      tags: [...tags, `ingest_source:${source}`],
      note,
      source,
      created_at: new Date().toISOString(),
    };

    const markdown = generateMarkdownV2(
      item,
      notebookResult,
      analysis,
      url,
      fetchResult
    );

    // 5. Save markdown file
    const now = new Date();
    const datePrefix = now.toISOString().slice(0, 10);
    const monthFolder = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const slug = createSlug(fetchResult.title);
    const filename = `${datePrefix}-${slug}.md`;
    const fichePath = `fiches/${monthFolder}/${filename}`;
    const fullPath = path.join(REPO_PATH, fichePath);

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, markdown.content || markdown);

    // 6. Git commit and push
    console.log('[api] Committing to Git...');
    const git = simpleGit(REPO_PATH);
    
    await git.pull('origin', 'main', { '--rebase': 'true' }).catch(() => {});
    await git.add(fichePath);
    
    const commitMsg = `feat(${source}): ${fetchResult.title}`;
    await git.commit(commitMsg, [fichePath]);
    
    // Push with retry
    for (let i = 0; i < 3; i++) {
      try {
        await git.push('origin', 'main');
        break;
      } catch (e) {
        console.log(`[api] Push retry ${i + 1}/3`);
        await git.pull('origin', 'main', { '--rebase': 'true' });
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[api] Archive completed in ${duration}ms`);

    res.json({
      success: true,
      title: fetchResult.title,
      markdown_path: fichePath,
      notebook_url: notebookResult.notebook_url,
      source_id: notebookResult.source_id,
      duration_ms: duration,
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[api] Archive failed: ${error.message}`);
    
    res.status(500).json({
      success: false,
      error: error.message,
      duration_ms: duration,
    });
  }
});

/**
 * Create URL-safe slug from title
 */
function createSlug(title) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

// Start server
app.listen(PORT, () => {
  console.log(`[api] Second-Brain API listening on port ${PORT}`);
});

export default app;
