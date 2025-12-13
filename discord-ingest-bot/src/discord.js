import { Client, GatewayIntentBits, Events } from 'discord.js';
import { v4 as uuidv4 } from 'uuid';
import { config } from './config.js';
import { parseMessage } from './parser.js';
import { normalizeUrl } from './normalize.js';
import { writeAndPush } from './gitWriter.js';
import { writeSpool, removeSpool } from './spool.js';

export function createClient() {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`[discord] logged in as ${c.user.tag}`);
  });

  client.on(Events.MessageCreate, handleMessage);

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
  await writeSpool(batchId, spoolData);

  try {
    const result = await writeAndPush(items, batchId, message.id);
    
    // Success - remove from spool
    await removeSpool(batchId);

    // Ack on Discord
    await ackSuccess(message, urls.length, result.commitHash);

  } catch (err) {
    console.error('[discord] error:', err.message);
    await ackError(message);
    // Keep in spool for retry
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

async function ackSuccess(message, urlCount, commitHash) {
  try {
    await message.react(config.options.reactOnSuccess);
    const hashInfo = commitHash ? ` (commit ${commitHash})` : '';
    await message.reply(`Capturé: ${urlCount} URL(s) → pending${hashInfo}`);
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
