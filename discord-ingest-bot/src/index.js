import 'dotenv/config';
import { config } from './config.js';
import { createClient } from './discord.js';
import { initRepo, writeAndPush, gitLock } from './gitWriter.js';
import { getSpooledItems, removeSpool } from './spool.js';
import { attachClient, startHealthServer, startWatchdog, markEvent } from './health.js';

const REPLAY_INTERVAL = 5 * 60 * 1000; // 5 minutes

let clientRef = null;
let shuttingDown = false;

function shutdown(code, reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.error(`[bot] shutdown (${reason}) — exit ${code}`);
  // Give logs a moment to flush, then die so systemd restarts us
  setTimeout(() => process.exit(code), 200);
  // Hard kill safety net if something hangs
  setTimeout(() => process.kill(process.pid, 'SIGKILL'), 5000).unref?.();
}

// Fatal-error handlers: log and exit so systemd brings us back clean
process.on('uncaughtException', (err) => {
  console.error('[bot] uncaughtException:', err?.stack || err?.message || err);
  shutdown(1, 'uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  // unhandled rejections used to be swallowed — that's how zombies happen.
  // Log and exit so systemd restarts us with a clean WebSocket.
  console.error('[bot] unhandledRejection:', reason?.stack || reason?.message || reason);
  shutdown(1, 'unhandledRejection');
});

process.on('SIGTERM', () => shutdown(0, 'SIGTERM'));
process.on('SIGINT', () => shutdown(0, 'SIGINT'));

async function replaySpool() {
  const spooled = await getSpooledItems();

  if (spooled.length === 0) return;

  console.log(`[replay] ${spooled.length} item(s) in spool`);

  const release = await gitLock.acquire();
  try {
    for (const data of spooled) {
      try {
        await writeAndPush(data.items, data.batchId, data.messageId);
        await removeSpool(data.batchId);
        console.log(`[replay] success: ${data.batchId}`);
      } catch (err) {
        console.error(`[replay] failed: ${data.batchId}`, err.message);
      }
    }
  } finally {
    release();
  }
}

async function main() {
  console.log('[bot] starting...');
  markEvent('boot');

  await initRepo();

  await replaySpool();
  setInterval(replaySpool, REPLAY_INTERVAL).unref?.();

  clientRef = createClient();
  attachClient(clientRef);

  // Healthcheck HTTP server + watchdog. On zombie → exit, systemd restarts.
  startHealthServer();
  startWatchdog({
    onZombie: (h) => {
      console.error('[bot] watchdog zombie detected:', JSON.stringify(h));
      shutdown(1, 'watchdog');
    },
  });

  await clientRef.login(config.discord.token);

  console.log('[bot] ready');
  markEvent('ready');
}

main().catch((err) => {
  console.error('[bot] fatal error during boot:', err?.stack || err?.message || err);
  process.exit(1);
});
