import { Client, GatewayIntentBits, Events } from 'discord.js';
import { v4 as uuidv4 } from 'uuid';
import simpleGit from 'simple-git';
import { config } from './config.js';
import { parseMessage } from './parser.js';
import { normalizeUrl } from './normalize.js';
import { writeAndPush, gitLock, buildGitHubFileUrl } from './gitWriter.js';
import { writeSpool, removeSpool } from './spool.js';
import { processItem } from './processor.js';
import { registerCommands, handleCommand, handleNotebookSelection, handleLinkedInPublish, setLastProcessed } from './commands.js';
import { markEvent } from './health.js';

const WORKDIR = './workdir/repo';
let git = null;

export function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, async (c) => {
    console.log(`[discord] logged in as ${c.user.tag}`);
    markEvent('clientReady');
    git = simpleGit(WORKDIR);
    await registerCommands(c.user.id);
  });

  client.on(Events.MessageCreate, async (msg) => {
    markEvent('messageCreate');
    await handleMessage(msg);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    markEvent('interactionCreate');
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
    } else if (interaction.isStringSelectMenu()) {
      await handleNotebookSelection(interaction);
    } else if (interaction.isButton()) {
      await handleLinkedInPublish(interaction);
    }
  });

  // Gateway lifecycle — keep watchdog informed and surface silent failures.
  client.on(Events.Error, (err) => {
    console.error('[discord] client error:', err?.stack || err?.message);
  });
  client.on(Events.Warn, (msg) => {
    console.warn('[discord] warn:', msg);
  });
  client.on(Events.ShardError, (err, shardId) => {
    console.error(`[discord] shard ${shardId} error:`, err?.stack || err?.message);
  });
  client.on(Events.ShardDisconnect, (event, shardId) => {
    console.warn(`[discord] shard ${shardId} disconnected: code=${event?.code} reason=${event?.reason}`);
  });
  client.on(Events.ShardReconnecting, (shardId) => {
    console.log(`[discord] shard ${shardId} reconnecting...`);
    markEvent('shardReconnecting');
  });
  client.on(Events.ShardResume, (shardId) => {
    console.log(`[discord] shard ${shardId} resumed`);
    markEvent('shardResume');
  });
  client.on(Events.ShardReady, (shardId) => {
    console.log(`[discord] shard ${shardId} ready`);
    markEvent('shardReady');
  });

  return client;
}

async function handleMessage(message) {
  // Filtering
  if (!shouldProcess(message)) return;

  console.log(`[discord] message_received: ${message.id}`);

  const { urls, tags, note } = parseMessage(message.content);

  if (urls.length === 0) {
    console.log('[discord] no URLs found, ignoring');
    return;
  }

  console.log(`[discord] parsed: ${urls.length} url(s), ${tags.length} tag(s)`);

  const batchId = uuidv4();
  const items = urls.map(url => createPendingItem(url, tags, note, batchId, message));

  // Write to spool first (anti-perte)
  const spoolData = { batchId, items, messageId: message.id };

  try {
    await writeSpool(batchId, spoolData);
  } catch (spoolErr) {
    console.error('[discord] spool write failed:', spoolErr.message);
    try { await ackError(message); } catch {}
    return;
  }

  // Acquire git lock to prevent concurrent pull/push conflicts
  const release = await gitLock.acquire();
  try {
    // V2: Process immediately instead of just writing to pending
    console.log('[discord] processing in real-time...');

    // Abort any stale rebase from a previous crash, then pull latest
    try { await git.rebase(['--abort']); } catch {}
    await git.pull('origin', config.github.branch, ['--rebase']);

    const results = [];
    for (const item of items) {
      try {
        const result = await processItem(item, git, message);
        results.push({ url: item.url, success: true, ...result });
      } catch (err) {
        console.error(`[discord] failed to process ${item.url}:`, err.message);
        results.push({ url: item.url, success: false, error: err.message });
      }
    }

    // Success - remove from spool
    await removeSpool(batchId);

    // Ack on Discord with details
    const successCount = results.filter(r => r.success).length;
    const failedCount = results.length - successCount;

    await ackSuccess(message, successCount, failedCount, results);

  } catch (err) {
    console.error('[discord] error:', err.message);
    try { await ackError(message); } catch {}
    // Keep in spool for retry
  } finally {
    release();
  }
}

function shouldProcess(message) {
  const { security } = config;

  if (message.guildId !== security.allowedGuildId) return false;
  if (message.channelId !== security.allowedChannelId) return false;
  if (!security.allowedAuthorIds.includes(message.author.id)) return false;
  if (security.ignoreBotMessages && message.author.bot) return false;

  return true;
}

function createPendingItem(url, tags, note, batchId, message) {
  return {
    id: uuidv4(),
    batch_id: batchId,
    url: normalizeUrl(url),
    title: null,
    note,
    tags,
    category: null,
    source: 'discord',
    created_at: new Date().toISOString(),
    discord: {
      guild_id: message.guildId,
      channel_id: message.channelId,
      message_id: message.id,
      author_id: message.author.id,
      author_username: message.author.username,
      message_url: `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`,
    },
  };
}

async function ackSuccess(message, successCount, failedCount, results) {
  try {
    // Build detailed delivery confirmation — one line per item with a
    // direct GitHub link to the saved fiche so the user can audit immediately.
    let reply = `✅ **Traitement terminé**\n`;

    for (const r of results) {
      if (r.success) {
        const fileUrl = r.fichePath ? buildGitHubFileUrl(r.fichePath) : null;
        if (fileUrl) {
          reply += `\n✅ Note sauvegardée → [\`${r.fichePath}\`](${fileUrl})`;
        } else {
          reply += `\n✅ Note sauvegardée : ${r.title || 'Fiche'}`;
        }
        if (r.commitHash) reply += ` • \`${r.commitHash}\``;
      } else if (r.queued) {
        reply += `\n⏳ En attente : ${r.url}`;
      } else {
        const short = (r.error || 'erreur inconnue').split('\n')[0].slice(0, 200);
        reply += `\n❌ Erreur sauvegarde : ${short}`;
      }
    }

    await message.reply(reply);
  } catch (err) {
    console.error('[discord] ack error:', err.message);
  }
}

async function ackError(message) {
  try {
    await message.react(config.options.reactOnError);
    await message.reply('Erreur ingestion; retry automatique');
  } catch (err) {
    console.error('[discord] ack error:', err.message);
  }
}
