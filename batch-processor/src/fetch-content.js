import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { config } from './config.js';
import { isYouTubeUrl, getYouTubeContent } from './youtube.js';

export async function fetchAndExtract(url) {
  console.log(`[fetch] ${url}`);

  // Handle YouTube URLs specially
  if (isYouTubeUrl(url)) {
    return await fetchYouTube(url);
  }

  const html = await fetchWithRetry(url);
  const { title, content, excerpt } = extractContent(html, url);

  return { title, content, excerpt, html, isYouTube: false, hasTranscript: true };
}

async function fetchYouTube(url) {
  const ytContent = await getYouTubeContent(url);
  
  let content = '';
  if (ytContent.hasTranscript) {
    content = ytContent.content;
  } else {
    // Fallback to description if no transcript
    content = ytContent.metadata.description || 'Pas de transcription disponible.';
  }

  return {
    title: ytContent.title,
    content,
    excerpt: content.slice(0, 500),
    isYouTube: true,
    hasTranscript: ytContent.hasTranscript,
    youtubeMetadata: ytContent.metadata,
  };
}

async function fetchWithRetry(url) {
  let lastError;

  for (let i = 0; i < config.fetch.maxRetries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.fetch.timeout);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; VeilleBot/1.0)',
          'Accept': 'text/html,application/xhtml+xml',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } catch (err) {
      lastError = err;
      console.log(`[fetch] retry ${i + 1}/${config.fetch.maxRetries}: ${err.message}`);
      await sleep(1000 * (i + 1));
    }
  }

  throw lastError;
}

function extractContent(html, url) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    // Fallback: just get text content
    const text = dom.window.document.body?.textContent || '';
    return {
      title: dom.window.document.title || null,
      content: text.slice(0, 10000),
      excerpt: text.slice(0, 500),
    };
  }

  return {
    title: article.title,
    content: article.textContent,
    excerpt: article.excerpt || article.textContent.slice(0, 500),
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
