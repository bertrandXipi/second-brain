// Sets env vars needed by config.js so tests can import any module without crashing.
// Imported via NODE_OPTIONS="--import ./tests/setup.js" in package.json test script.
process.env.DISCORD_TOKEN ||= 'test-discord-token';
process.env.GITHUB_REPO_URL ||= 'https://example.com/test.git';
process.env.GITHUB_PAT ||= 'test-pat';
process.env.ALLOWED_GUILD_ID ||= 'test-guild';
process.env.ALLOWED_CHANNEL_ID ||= 'test-channel';
process.env.ALLOWED_AUTHOR_IDS ||= 'test-author';
