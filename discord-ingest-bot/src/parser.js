import { config } from './config.js';

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

export function parseMessage(content) {
  const urls = extractUrls(content);
  const tags = extractTags(content);
  const note = extractNote(content, urls, tags);

  return { urls, tags, note };
}

function extractUrls(content) {
  const matches = content.match(URL_REGEX) || [];
  // Dedupe + clean trailing punctuation
  const cleaned = matches.map(url => url.replace(/[.,;:!?)]+$/, ''));
  const unique = [...new Set(cleaned)];
  return unique.slice(0, config.options.maxUrlsPerMessage);
}

function extractTags(content) {
  const tags = [];
  const prefixes = config.options.tagPrefixes;

  // Split by whitespace and find tags
  const tokens = content.split(/\s+/);
  for (const token of tokens) {
    for (const prefix of prefixes) {
      if (token.startsWith(prefix) && token.length > prefix.length) {
        // Skip if it looks like a URL fragment
        if (token.includes('://') || token.includes('/')) continue;
        
        let tag = token.slice(prefix.length);
        // Normalize: lowercase, remove trailing punctuation
        tag = tag.toLowerCase().replace(/[.,;:!?]+$/, '');
        if (tag && !tags.includes(tag)) {
          tags.push(tag);
        }
      }
    }
  }
  return tags;
}

function extractNote(content, urls, tags) {
  let note = content;

  // Remove URLs
  for (const url of urls) {
    note = note.replace(url, '');
  }

  // Remove tags
  for (const prefix of config.options.tagPrefixes) {
    for (const tag of tags) {
      const regex = new RegExp(`${prefix}${tag}\\b`, 'gi');
      note = note.replace(regex, '');
    }
  }

  // Clean up whitespace
  note = note.replace(/\s+/g, ' ').trim();
  return note || null;
}
