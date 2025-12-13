import 'dotenv/config';
import { config } from './config.js';
import { createClient } from './discord.js';
import { initRepo, writeAndPush } from './gitWriter.js';
import { getSpooledItems, removeSpool } from './spool.js';

const REPLAY_INTERVAL = 5 * 60 * 1000; // 5 minutes

async function replaySpool() {
  const spooled = await getSpooledItems();
  
  if (spooled.length === 0) return;
  
  console.log(`[replay] ${spooled.length} item(s) in spool`);

  for (const data of spooled) {
    try {
      await writeAndPush(data.items, data.batchId, data.messageId);
      await removeSpool(data.batchId);
      console.log(`[replay] success: ${data.batchId}`);
    } catch (err) {
      console.error(`[replay] failed: ${data.batchId}`, err.message);
    }
  }
}

async function main() {
  console.log('[bot] starting...');

  // Init git repo
  await initRepo();

  // Replay any pending spool items
  await replaySpool();

  // Start replay timer
  setInterval(replaySpool, REPLAY_INTERVAL);

  // Start Discord client
  const client = createClient();
  await client.login(config.discord.token);

  console.log('[bot] ready');
}

main().catch((err) => {
  console.error('[bot] fatal error:', err);
  process.exit(1);
});
