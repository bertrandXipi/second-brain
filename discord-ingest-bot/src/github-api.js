/**
 * GitHub API client for fetching user commits (devlog feature)
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME;
const API_BASE = 'https://api.github.com';

const headers = {
  'Authorization': `Bearer ${GITHUB_TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'veille-bot',
};

/**
 * Fetch all repos (public + private) for the authenticated user
 */
async function fetchUserRepos() {
  const repos = [];
  let page = 1;

  while (true) {
    const res = await fetch(`${API_BASE}/user/repos?per_page=100&page=${page}&sort=pushed`, { headers });
    if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    const data = await res.json();
    if (data.length === 0) break;
    repos.push(...data);
    if (data.length < 100) break;
    page++;
  }

  return repos;
}

/**
 * Fetch commits for a repo since a given date
 * Note: we don't filter by author= because git commit author name/email
 * may differ from the GitHub account login (e.g. "Votre Nom" vs "bertrandXipi")
 */
async function fetchRepoCommits(repoFullName, since) {
  const url = `${API_BASE}/repos/${repoFullName}/commits?since=${since.toISOString()}&per_page=50`;
  const res = await fetch(url, { headers });
  if (!res.ok) return []; // skip repos with no access or errors
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data;
}

/**
 * Get all commits across all repos for a given period
 * @param {number} days - number of days to look back (default: 1 = today)
 * @returns {Array} commits grouped by repo
 */
export async function getRecentCommits(days = 1) {
  if (!GITHUB_TOKEN) throw new Error('GITHUB_TOKEN not configured');
  if (!GITHUB_USERNAME) throw new Error('GITHUB_USERNAME not configured');

  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const repos = await fetchUserRepos();
  console.log(`[github] checking ${repos.length} repos since ${since.toISOString()}`);

  const results = [];

  // Fetch commits in parallel (batches of 10 to avoid rate limits)
  const batchSize = 10;
  for (let i = 0; i < repos.length; i += batchSize) {
    const batch = repos.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (repo) => {
        const commits = await fetchRepoCommits(repo.full_name, since);
        if (commits.length === 0) return null;
        return {
          repo: repo.name,
          repoFullName: repo.full_name,
          repoUrl: repo.html_url,
          private: repo.private,
          commits: commits.map(c => ({
            sha: c.sha?.slice(0, 7),
            message: c.commit?.message?.split('\n')[0], // first line only
            date: c.commit?.author?.date,
            url: c.html_url,
          })),
        };
      })
    );
    results.push(...batchResults.filter(Boolean));
  }

  // Sort by most recent commit
  results.sort((a, b) => {
    const aDate = new Date(a.commits[0]?.date || 0);
    const bDate = new Date(b.commits[0]?.date || 0);
    return bDate - aDate;
  });

  return results;
}

/**
 * Format commits into a readable summary for LLM prompt
 */
export function formatCommitsForPrompt(repoCommits) {
  if (repoCommits.length === 0) return 'Aucun commit trouvé pour cette période.';

  let text = '';
  for (const { repo, commits } of repoCommits) {
    text += `\n### ${repo}\n`;
    for (const c of commits) {
      const date = new Date(c.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      text += `- [${date}] ${c.message}\n`;
    }
  }
  return text.trim();
}
