import Exa from 'exa-js';

let exaClient = null;
function getClient() {
  if (exaClient) return exaClient;
  const key = process.env.EXA_API_KEY;
  if (!key) return null;
  exaClient = new Exa(key);
  return exaClient;
}

export async function findRelatedResource({ title, keywords = [], excludeUrl = null }) {
  const client = getClient();
  if (!client) {
    console.log('[exa] no API key — skipping related resource lookup');
    return null;
  }

  const query = [title, ...keywords.slice(0, 3)].filter(Boolean).join(' ');
  if (!query.trim()) return null;

  try {
    const excludeDomain = excludeUrl ? safeHostname(excludeUrl) : null;
    const res = await client.search(query, {
      numResults: 3,
      type: 'auto',
      ...(excludeDomain ? { excludeDomains: [excludeDomain] } : {}),
    });

    const results = res?.results || [];
    const pick = results.find(r => r.url && r.url !== excludeUrl) || results[0];
    if (!pick) return null;

    return {
      url: pick.url,
      title: pick.title || pick.url,
    };
  } catch (err) {
    console.error(`[exa] search failed for "${query.slice(0, 60)}":`, err.message);
    return null;
  }
}

function safeHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}
