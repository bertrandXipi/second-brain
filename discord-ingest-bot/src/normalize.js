export function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    // Remove trailing slash for consistency
    let normalized = parsed.href;
    if (normalized.endsWith('/') && parsed.pathname === '/') {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}

export function normalizeTag(tag) {
  return tag
    .toLowerCase()
    .replace(/[.,;:!?]+$/, '')
    .replace(/\s+/g, '-')
    .trim();
}
