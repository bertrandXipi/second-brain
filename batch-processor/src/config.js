const required = (name) => {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
};

export const config = {
  github: {
    repoUrl: required('GITHUB_REPO_URL'),
    branch: process.env.GITHUB_BRANCH || 'main',
    pat: required('GITHUB_PAT'),
    authorName: process.env.GIT_AUTHOR_NAME || 'Batch Processor',
    authorEmail: process.env.GIT_AUTHOR_EMAIL || 'batch@fiches-veille.local',
  },
  workdir: './workdir/repo',
  paths: {
    pending: 'mobile-share/pending',
    processed: 'mobile-share/processed',
    failed: 'mobile-share/failed',
    fiches: 'fiches',
  },
  fetch: {
    timeout: 30000,
    maxRetries: 3,
  },
};
