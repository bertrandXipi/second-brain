/**
 * Slash commands for the veille bot
 */

import { SlashCommandBuilder, REST, Routes } from 'discord.js';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { config } from './config.js';

// Import NotebookLM client if available
let notebookLMClient = null;
try {
  const { queryNotebook, getNotebookId, getOrCreateMonthlyNotebook, createPodcast, getPodcastStatus, downloadAudio } = await import('../../batch-processor/src/notebooklm-http.js');
  notebookLMClient = { queryNotebook, getNotebookId, getOrCreateMonthlyNotebook, createPodcast, getPodcastStatus, downloadAudio };
  console.log('[commands] NotebookLM client loaded');
} catch (err) {
  console.log('[commands] NotebookLM client not available:', err.message);
}

const WORKDIR = './workdir/repo';
const PROCESSED_PATH = 'mobile-share/processed';
const FICHES_PATH = 'fiches';

// Store last processed item for /last command
let lastProcessedItem = null;

export function setLastProcessed(item) {
  lastProcessedItem = item;
}

export function getLastProcessed() {
  return lastProcessedItem;
}

/**
 * Split long text into chunks for Discord (max 2000 chars per message)
 */
function splitIntoChunks(text, maxLength = 1900) {
  const chunks = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    
    // Find a good break point (paragraph, sentence, or word)
    let breakPoint = remaining.lastIndexOf('\n\n', maxLength);
    if (breakPoint === -1 || breakPoint < maxLength / 2) {
      breakPoint = remaining.lastIndexOf('\n', maxLength);
    }
    if (breakPoint === -1 || breakPoint < maxLength / 2) {
      breakPoint = remaining.lastIndexOf('. ', maxLength);
      if (breakPoint !== -1) breakPoint += 1; // Include the period
    }
    if (breakPoint === -1 || breakPoint < maxLength / 2) {
      breakPoint = remaining.lastIndexOf(' ', maxLength);
    }
    if (breakPoint === -1) {
      breakPoint = maxLength;
    }
    
    chunks.push(remaining.slice(0, breakPoint).trim());
    remaining = remaining.slice(breakPoint).trim();
  }
  
  return chunks;
}

/**
 * Send a long reply split into multiple messages
 */
async function sendLongReply(interaction, text, isFollowUp = false) {
  const chunks = splitIntoChunks(text);
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const isLast = i === chunks.length - 1;
    const prefix = chunks.length > 1 && i > 0 ? `*(suite ${i + 1}/${chunks.length})*\n\n` : '';
    
    if (i === 0 && !isFollowUp) {
      await interaction.editReply(prefix + chunk);
    } else {
      await interaction.followUp(prefix + chunk);
    }
  }
}

/**
 * Define slash commands
 */
export const commands = [
  new SlashCommandBuilder()
    .setName('last')
    .setDescription('Affiche le résumé de la dernière URL traitée'),
  
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Statistiques de la veille'),
  
  new SlashCommandBuilder()
    .setName('insights')
    .setDescription('Fait émerger les insights philosophiques de toutes les sources')
    .addStringOption(option =>
      option.setName('focus')
        .setDescription('Angle d\'analyse spécifique (ex: "IA et éthique", "tendances business")')
        .setRequired(false)
    ),
  
  new SlashCommandBuilder()
    .setName('podcast')
    .setDescription('Génère un podcast audio à partir des sources de veille')
    .addStringOption(option =>
      option.setName('format')
        .setDescription('Format du podcast')
        .setRequired(false)
        .addChoices(
          { name: '🎙️ Deep Dive (analyse approfondie)', value: 'deep_dive' },
          { name: '⚡ Brief (résumé rapide)', value: 'brief' },
          { name: '🔍 Critique (analyse critique)', value: 'critique' },
          { name: '💬 Débat (deux points de vue)', value: 'debate' }
        )
    )
    .addStringOption(option =>
      option.setName('duree')
        .setDescription('Durée du podcast')
        .setRequired(false)
        .addChoices(
          { name: '🕐 Court (~5 min)', value: 'short' },
          { name: '🕑 Normal (~10 min)', value: 'default' },
          { name: '🕒 Long (~15 min)', value: 'long' }
        )
    )
    .addStringOption(option =>
      option.setName('focus')
        .setDescription('Sujet ou angle spécifique (ex: "tendances IA", "outils no-code")')
        .setRequired(false)
    ),
];

/**
 * Register slash commands with Discord
 */
export async function registerCommands(clientId) {
  const rest = new REST({ version: '10' }).setToken(config.discord.token);
  
  try {
    console.log('[commands] registering slash commands...');
    
    await rest.put(
      Routes.applicationGuildCommands(clientId, config.security.allowedGuildId),
      { body: commands.map(c => c.toJSON()) }
    );
    
    console.log('[commands] slash commands registered');
  } catch (err) {
    console.error('[commands] failed to register:', err.message);
  }
}

/**
 * Handle /last command - show last processed URL summary
 */
async function handleLastCommand(interaction) {
  await interaction.deferReply();
  
  try {
    // Try to get from memory first
    if (lastProcessedItem) {
      const reply = formatLastItem(lastProcessedItem);
      await sendLongReply(interaction, reply);
      return;
    }
    
    // Otherwise, find the most recent processed file
    const processedDir = path.join(WORKDIR, PROCESSED_PATH);
    const files = await readdir(processedDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    if (jsonFiles.length === 0) {
      await interaction.editReply('Aucune URL traitée récemment.');
      return;
    }
    
    // Sort by modification time (most recent first)
    const filesWithStats = await Promise.all(
      jsonFiles.map(async (f) => {
        const filePath = path.join(processedDir, f);
        const content = await readFile(filePath, 'utf-8');
        const data = JSON.parse(content);
        return { file: f, data, time: new Date(data.processed_at || data.created_at) };
      })
    );
    
    filesWithStats.sort((a, b) => b.time - a.time);
    const latest = filesWithStats[0];
    
    // Find the corresponding fiche
    const ficheContent = await findFicheForItem(latest.data);
    
    const reply = formatProcessedItem(latest.data, ficheContent);
    await sendLongReply(interaction, reply);
    
  } catch (err) {
    console.error('[commands] /last error:', err.message);
    await interaction.editReply(`Erreur: ${err.message}`);
  }
}

/**
 * Handle /stats command
 */
async function handleStatsCommand(interaction) {
  await interaction.deferReply();
  
  try {
    const processedDir = path.join(WORKDIR, PROCESSED_PATH);
    const fichesDir = path.join(WORKDIR, FICHES_PATH);
    
    const processedFiles = await readdir(processedDir);
    const processedCount = processedFiles.filter(f => f.endsWith('.json')).length;
    
    // Count fiches by month
    const months = await readdir(fichesDir);
    let totalFiches = 0;
    const monthCounts = {};
    
    for (const month of months) {
      const monthDir = path.join(fichesDir, month);
      try {
        const fiches = await readdir(monthDir);
        const count = fiches.filter(f => f.endsWith('.md')).length;
        totalFiches += count;
        monthCounts[month] = count;
      } catch {
        // Skip if not a directory
      }
    }
    
    let reply = `📊 **Statistiques Veille**\n\n`;
    reply += `📄 **Total fiches:** ${totalFiches}\n`;
    reply += `✅ **URLs traitées:** ${processedCount}\n\n`;
    reply += `**Par mois:**\n`;
    
    Object.entries(monthCounts)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 5)
      .forEach(([month, count]) => {
        reply += `• ${month}: ${count} fiches\n`;
      });
    
    await interaction.editReply(reply);
    
  } catch (err) {
    console.error('[commands] /stats error:', err.message);
    await interaction.editReply(`Erreur: ${err.message}`);
  }
}

/**
 * Handle /insights command - Query NotebookLM for philosophical insights
 */
async function handleInsightsCommand(interaction) {
  await interaction.deferReply();
  
  try {
    if (!notebookLMClient) {
      await interaction.editReply('❌ NotebookLM client non disponible.');
      return;
    }
    
    const focusArea = interaction.options.getString('focus');
    
    await interaction.editReply('🔮 *Analyse philosophique en cours... Cela peut prendre quelques instants.*');
    
    // Import getOrCreateMonthlyNotebook directly
    const { getOrCreateMonthlyNotebook } = await import('../../batch-processor/src/notebooklm-http.js');
    const notebookId = await getOrCreateMonthlyNotebook();
    
    let insightsPrompt = `Qu'est-ce qui émerge de toutes les sources présentes dans ce notebook ?

J'aimerais que tu identifies et articules un fil conducteur permettant de faire émerger de nouveaux insights d'un point de vue "philosophique".

Analyse les tendances profondes, les connexions non-évidentes entre les sujets, et les implications plus larges pour notre compréhension du monde technologique actuel.`;

    // Add focus area if provided
    if (focusArea) {
      insightsPrompt += `\n\n**Angle d'analyse spécifique :** ${focusArea}\n\nConcentre ton analyse particulièrement sur cet aspect tout en gardant une vision d'ensemble.`;
    }

    insightsPrompt += `\n\nStructure ta réponse ainsi:
1. **Thèmes émergents** - Les grandes tendances qui se dégagent
2. **Connexions inattendues** - Les liens surprenants entre différentes sources
3. **Tensions et paradoxes** - Les contradictions intéressantes à explorer
4. **Implications philosophiques** - Ce que cela nous dit sur notre époque
5. **Questions ouvertes** - Les interrogations que cela soulève pour l'avenir`;

    console.log('[commands] /insights querying NotebookLM...');
    if (focusArea) {
      console.log(`[commands] focus area: "${focusArea}"`);
    }
    
    const result = await notebookLMClient.queryNotebook(notebookId, insightsPrompt);
    
    if (result && result.answer) {
      // Save insight to git repo
      const { saveInsight } = await import('./gitWriter.js');
      let gitResult = null;
      try {
        gitResult = await saveInsight(result.answer, focusArea, result.sourceCount);
        console.log(`[commands] insight saved: ${gitResult.filename}`);
      } catch (gitErr) {
        console.error('[commands] failed to save insight to git:', gitErr.message);
      }
      
      let response = `🔮 **Insights Philosophiques**`;
      if (focusArea) {
        response += ` - Focus: *${focusArea}*`;
      }
      response += `\n\n${result.answer}`;
      
      // Add footer with metadata
      response += `\n\n---\n`;
      if (result.sourceCount) {
        response += `*Analyse basée sur ${result.sourceCount} sources*`;
      }
      if (gitResult && gitResult.commitHash) {
        response += ` • 📁 Sauvegardé: \`${gitResult.filename}\` (\`${gitResult.commitHash}\`)`;
      } else if (gitResult && gitResult.filename) {
        response += ` • 📁 Sauvegardé: \`${gitResult.filename}\``;
      }
      
      await sendLongReply(interaction, response, true);
    } else {
      await interaction.editReply('❌ Pas de réponse de NotebookLM. Réessayez plus tard.');
    }
    
  } catch (err) {
    console.error('[commands] /insights error:', err.message);
    await interaction.editReply(`❌ Erreur: ${err.message}`);
  }
}

/**
 * Handle /podcast command - Generate audio podcast from NotebookLM
 */
async function handlePodcastCommand(interaction) {
  await interaction.deferReply();
  
  try {
    if (!notebookLMClient) {
      await interaction.editReply('❌ NotebookLM client non disponible.');
      return;
    }
    
    const format = interaction.options.getString('format') || 'deep_dive';
    const length = interaction.options.getString('duree') || 'default';
    const focus = interaction.options.getString('focus') || '';
    
    // Format names for display
    const formatNames = {
      'deep_dive': '🎙️ Deep Dive',
      'brief': '⚡ Brief',
      'critique': '🔍 Critique',
      'debate': '💬 Débat'
    };
    const lengthNames = {
      'short': '~5 min',
      'default': '~10 min',
      'long': '~15 min'
    };
    
    let statusMsg = `🎙️ **Génération du podcast en cours...**\n\n`;
    statusMsg += `📋 Format: ${formatNames[format]}\n`;
    statusMsg += `⏱️ Durée: ${lengthNames[length]}\n`;
    if (focus) {
      statusMsg += `🎯 Focus: *${focus}*\n`;
    }
    statusMsg += `\n⏳ *Cela peut prendre 3-5 minutes...*`;
    
    await interaction.editReply(statusMsg);
    
    console.log(`[commands] /podcast starting: format=${format}, length=${length}, focus="${focus}"`);
    
    // Get notebook ID
    const notebookId = await notebookLMClient.getOrCreateMonthlyNotebook();
    
    // Start podcast generation
    const createResult = await notebookLMClient.createPodcast(notebookId, {
      format,
      length,
      language: 'fr',
      focus
    });
    
    console.log(`[commands] podcast creation started: ${createResult.artifact_id}`);
    
    // Poll for completion (max 10 minutes)
    const maxAttempts = 20;
    const pollInterval = 30000; // 30 seconds
    let attempts = 0;
    let podcastReady = false;
    let podcastData = null;
    
    while (attempts < maxAttempts && !podcastReady) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      attempts++;
      
      console.log(`[commands] checking podcast status (attempt ${attempts}/${maxAttempts})...`);
      
      const status = await notebookLMClient.getPodcastStatus(notebookId, createResult.artifact_id);
      
      if (status.status === 'completed' && status.audio_url) {
        podcastReady = true;
        podcastData = status;
        console.log(`[commands] podcast ready: ${status.audio_url}`);
      } else if (status.status === 'failed') {
        throw new Error('La génération du podcast a échoué');
      } else {
        // Update status message
        const elapsed = attempts * 30;
        await interaction.editReply(statusMsg + `\n\n🔄 *En cours... (${elapsed}s)*`);
      }
    }
    
    if (!podcastReady) {
      await interaction.editReply(`⏰ **Timeout** - Le podcast prend plus de temps que prévu.\n\nVérifie directement sur NotebookLM:\n${createResult.notebook_url}`);
      return;
    }
    
    // Download and send audio
    await interaction.editReply(statusMsg + `\n\n📥 *Téléchargement de l'audio...*`);
    
    const audioBuffer = await notebookLMClient.downloadAudio(podcastData.audio_url);
    
    // Check file size (Discord limit: 25MB for free, 100MB for Nitro)
    const fileSizeMB = audioBuffer.length / (1024 * 1024);
    console.log(`[commands] audio file size: ${fileSizeMB.toFixed(2)} MB`);
    
    if (fileSizeMB > 25) {
      // File too large, send link instead
      await interaction.editReply({
        content: `🎙️ **Podcast généré !**\n\n📋 Format: ${formatNames[format]}\n⏱️ Durée: ${lengthNames[length]}\n${focus ? `🎯 Focus: *${focus}*\n` : ''}\n⚠️ Fichier trop volumineux (${fileSizeMB.toFixed(1)} MB) pour Discord.\n\n🔗 Écoute sur NotebookLM:\n${podcastData.notebook_url}`
      });
    } else {
      // Send audio file
      const { AttachmentBuilder } = await import('discord.js');
      
      const filename = `podcast-veille-${new Date().toISOString().split('T')[0]}.wav`;
      const attachment = new AttachmentBuilder(audioBuffer, { name: filename });
      
      await interaction.editReply({
        content: `🎙️ **Podcast généré !**\n\n📋 Format: ${formatNames[format]}\n⏱️ Durée: ${lengthNames[length]}\n${focus ? `🎯 Focus: *${focus}*\n` : ''}\n🎧 *Écoute directement ci-dessous :*`,
        files: [attachment]
      });
    }
    
    console.log('[commands] /podcast completed successfully');
    
  } catch (err) {
    console.error('[commands] /podcast error:', err.message);
    await interaction.editReply(`❌ Erreur: ${err.message}`);
  }
}

/**
 * Find fiche markdown file for a processed item
 */
async function findFicheForItem(item) {
  try {
    const date = new Date(item.processed_at || item.created_at);
    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthDir = path.join(WORKDIR, FICHES_PATH, month);
    
    const files = await readdir(monthDir);
    
    // Find file that might match this URL (by date)
    const dateStr = date.toISOString().split('T')[0];
    const matchingFiles = files.filter(f => f.startsWith(dateStr));
    
    if (matchingFiles.length > 0) {
      // Return the most recent one
      const fichePath = path.join(monthDir, matchingFiles[matchingFiles.length - 1]);
      return await readFile(fichePath, 'utf-8');
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Format last item from memory
 */
function formatLastItem(item) {
  let reply = `📄 **Dernière URL traitée**\n\n`;
  reply += `**Titre:** ${item.title || 'Sans titre'}\n`;
  reply += `**URL:** ${item.url}\n`;
  if (item.notebookUrl) {
    reply += `**NotebookLM:** [Ouvrir](${item.notebookUrl})\n`;
  }
  if (item.commitHash) {
    reply += `**Commit:** \`${item.commitHash}\`\n`;
  }
  
  // Add full summary - no truncation, will be split into multiple messages
  if (item.summary) {
    reply += `\n**Résumé:**\n${item.summary}`;
  }
  
  return reply;
}

/**
 * Format processed item with fiche content
 */
function formatProcessedItem(item, ficheContent) {
  let reply = `📄 **Dernière URL traitée**\n\n`;
  reply += `**URL:** ${item.url}\n`;
  reply += `**Date:** ${new Date(item.processed_at || item.created_at).toLocaleString('fr-FR')}\n\n`;
  
  if (ficheContent) {
    // Extract summary from fiche (between ## Résumé and next ##)
    const summaryMatch = ficheContent.match(/## Résumé[^\n]*\n([\s\S]*?)(?=\n## |$)/);
    if (summaryMatch) {
      // No truncation - will be split into multiple messages
      reply += `**Résumé:**\n${summaryMatch[1].trim()}`;
    }
  }
  
  return reply;
}

/**
 * Handle all slash command interactions
 */
export async function handleCommand(interaction) {
  if (!interaction.isChatInputCommand()) return;
  
  const { commandName } = interaction;
  
  switch (commandName) {
    case 'last':
      await handleLastCommand(interaction);
      break;
    case 'stats':
      await handleStatsCommand(interaction);
      break;
    case 'insights':
      await handleInsightsCommand(interaction);
      break;
    case 'podcast':
      await handlePodcastCommand(interaction);
      break;
    default:
      await interaction.reply('Commande inconnue');
  }
}
