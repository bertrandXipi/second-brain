import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { config } from './config.js';
import { isYouTubeUrl, getYouTubeContent } from './youtube.js';

function isRedditUrl(url) {
  return url.includes('reddit.com/r/') || url.includes('redd.it/');
}

function isTwitterUrl(url) {
  return url.includes('twitter.com') || url.includes('x.com');
}

export async function fetchAndExtract(url) {
  console.log(`[fetch] ${url}`);

  // Handle YouTube URLs specially
  if (isYouTubeUrl(url)) {
    return await fetchYouTube(url);
  }

  // Handle Reddit URLs specially (use JSON API to bypass 403)
  if (isRedditUrl(url)) {
    return await fetchReddit(url);
  }

  // Handle Twitter/X URLs specially (use fxtwitter.com to bypass bot protection)
  if (isTwitterUrl(url)) {
    return await fetchTwitter(url);
  }

  const html = await fetchWithRetry(url);
  const { title, content, excerpt } = extractContent(html, url);

  return { title, content, excerpt, html, isYouTube: false, hasTranscript: true };
}

async function fetchReddit(url) {
  console.log(`[fetch] Reddit detected, using JSON API`);

  // Clean URL and add .json
  let jsonUrl = url.replace(/\?.*$/, ''); // Remove query params
  if (!jsonUrl.endsWith('/')) jsonUrl += '/';
  jsonUrl += '.json';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.fetch.timeout);

  const response = await fetch(jsonUrl, {
    signal: controller.signal,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; VeilleBot/1.0)',
    },
  });

  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  // Extract post data
  const post = data[0]?.data?.children?.[0]?.data;
  if (!post) {
    throw new Error('Could not parse Reddit response');
  }

  const title = post.title || 'Reddit Post';
  let content = post.selftext || '';

  // Add top comments for context
  const comments = data[1]?.data?.children || [];
  const topComments = comments
    .filter(c => c.kind === 't1' && c.data?.body)
    .slice(0, 10)
    .map(c => c.data.body)
    .join('\n\n---\n\n');

  if (topComments) {
    content += '\n\n## Top Comments:\n\n' + topComments;
  }

  // If no selftext, mention it's a link post
  if (!post.selftext && post.url) {
    content = `Link post: ${post.url}\n\n${content}`;
  }

  const excerpt = content.slice(0, 500);

  return { title, content, excerpt, isReddit: true, hasTranscript: true };
}

async function fetchTwitter(url) {
  console.log(`[fetch] Twitter detected, using fixupx.com`);

  // Replace domain with fixupx.com
  const fxUrl = url.replace(/(x|twitter)\.com/, 'fixupx.com');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.fetch.timeout);

  const response = await fetch(fxUrl, {
    signal: controller.signal,
    headers: {
      // Bots like Discord/Telegram get the metadata, everyone else gets redirected
      'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)',
      'Accept': 'text/html',
    },
  });

  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from fixupx`);
  }

  const html = await response.text();
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  // Extract content from meta tags
  const title = doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
    doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ||
    'Twitter Post';
  const content = doc.querySelector('meta[property="og:description"]')?.getAttribute('content') ||
    doc.querySelector('meta[name="twitter:description"]')?.getAttribute('content') ||
    '';

  if (!content) {
    console.log('[fetch] twitter body snippet:', html.slice(0, 500));
    throw new Error('Could not extract content from twitter wrapper meta tags');
  }

  const excerpt = content.slice(0, 500);

  return {
    title,
    content: `${title}\n\n${content}`,
    excerpt,
    isTwitter: true,
    hasTranscript: true
  };
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
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
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
