const required = (name) => {
  const val = process.env[name];
  if (!val) throw new Error(`Missing required env var: ${name}`);
  return val;
};

export const config = {
  discord: {
    token: required('DISCORD_TOKEN'),
  },
  github: {
    repoUrl: required('GITHUB_REPO_URL'),
    branch: process.env.GITHUB_BRANCH || 'main',
    pat: required('GITHUB_PAT'),
    authorName: process.env.GIT_AUTHOR_NAME || 'Veille Bot',
    authorEmail: process.env.GIT_AUTHOR_EMAIL || 'bot@fiches-veille.local',
  },
  security: {
    allowedGuildId: required('ALLOWED_GUILD_ID'),
    allowedChannelId: required('ALLOWED_CHANNEL_ID'),
    allowedAuthorIds: required('ALLOWED_AUTHOR_IDS').split(',').map(id => id.trim()),
    ignoreBotMessages: process.env.IGNORE_BOT_MESSAGES !== 'false',
  },
  options: {
    tagPrefixes: ['#'],
    maxUrlsPerMessage: 10,
    reactOnSuccess: '✅',
    reactOnError: '❌',
  },
};
