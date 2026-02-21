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
  const { queryNotebook, getNotebookId, getOrCreateMonthlyNotebook, createPodcast, getPodcastStatus, downloadAudio, listNotebooks } = await import('../../batch-processor/src/notebooklm-http.js');
  notebookLMClient = { queryNotebook, getNotebookId, getOrCreateMonthlyNotebook, createPodcast, getPodcastStatus, downloadAudio, listNotebooks };
  console.log('[commands] NotebookLM client loaded');
} catch (err) {
  console.log('[commands] NotebookLM client not available:', err.message);
}

// Import LinkedIn client if available
let linkedInAvailable = false;
try {
  const { isLinkedInConfigured } = await import('./linkedin-api.js');
  linkedInAvailable = await isLinkedInConfigured();
  console.log(`[commands] LinkedIn client: ${linkedInAvailable ? 'configured' : 'not configured'}`);
} catch (err) {
  console.log('[commands] LinkedIn client not available:', err.message);
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
    .setName('notebooks')
    .setDescription('Liste tous les notebooks NotebookLM'),
  
  new SlashCommandBuilder()
    .setName('insights')
    .setDescription('Fait émerger les insights philosophiques de toutes les sources')
    .addStringOption(option =>
      option.setName('focus')
        .setDescription('Angle d\'analyse spécifique (ex: "IA et éthique", "tendances business")')
        .setRequired(false)
    ),
  
  new SlashCommandBuilder()
    .setName('choice_notebook')
    .setDescription('Choisir le notebook NotebookLM à utiliser pour les sources'),
  
  new SlashCommandBuilder()
    .setName('reset_notebook')
    .setDescription('Revenir au notebook mensuel par défaut'),
  
  new SlashCommandBuilder()
    .setName('status')
    .setDescription('Affiche le notebook actuellement sélectionné'),
  
  new SlashCommandBuilder()
    .setName('info')
    .setDescription('Liste toutes les commandes disponibles'),
  
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Pose une question sur toutes les sources du notebook actif')
    .addStringOption(option =>
      option.setName('question')
        .setDescription('Ta question')
        .setRequired(true)
    ),
  
  new SlashCommandBuilder()
    .setName('thread')
    .setDescription('Génère un thread Twitter/LinkedIn prêt à poster')
    .addStringOption(option =>
      option.setName('sujet')
        .setDescription('Sujet du thread (ex: "agents IA", "vibe coding")')
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('plateforme')
        .setDescription('Plateforme cible')
        .setRequired(false)
        .addChoices(
          { name: '🐦 Twitter/X (tweets courts)', value: 'twitter' },
          { name: '💼 LinkedIn (post long)', value: 'linkedin' },
          { name: '📝 Les deux', value: 'both' }
        )
    )
    .addStringOption(option =>
      option.setName('sources')
        .setDescription('Quelles sources utiliser')
        .setRequired(false)
        .addChoices(
          { name: '📚 Toutes les sources du notebook', value: 'all' },
          { name: '🕐 Sources de cette semaine', value: 'week' },
          { name: '📅 Sources d\'aujourd\'hui', value: 'today' },
          { name: '🔗 La dernière source ajoutée', value: 'last' }
        )
    )
    .addStringOption(option =>
      option.setName('ton')
        .setDescription('Ton du contenu')
        .setRequired(false)
        .addChoices(
          { name: '🎓 Expert (données, analyse)', value: 'expert' },
          { name: '🔥 Provocateur (opinions tranchées)', value: 'provocateur' },
          { name: '📖 Storytelling (narratif, vécu)', value: 'storytelling' },
          { name: '💡 Pédagogue (vulgarisation)', value: 'pedagogue' }
        )
    )
    .addStringOption(option =>
      option.setName('contexte')
        .setDescription('Contexte additionnel (ex: "je suis freelance IA", "pour mon audience dev")')
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
 * Handle /notebooks command - List all NotebookLM notebooks
 */
async function handleNotebooksCommand(interaction) {
  await interaction.deferReply();
  
  try {
    if (!notebookLMClient) {
      await interaction.editReply('❌ NotebookLM client non disponible.');
      return;
    }
    
    console.log('[commands] /notebooks listing all notebooks...');
    
    const notebooks = await notebookLMClient.listNotebooks(200);
    
    if (!notebooks || notebooks.length === 0) {
      await interaction.editReply('📚 Aucun notebook trouvé.');
      return;
    }
    
    // Sort by most recent first (assuming they have a created_at or similar field)
    notebooks.sort((a, b) => {
      // If there's a date field, use it, otherwise keep original order
      if (a.created_at && b.created_at) {
        return new Date(b.created_at) - new Date(a.created_at);
      }
      return 0;
    });
    
    let reply = `📚 **Notebooks NotebookLM** (${notebooks.length} total)\n\n`;
    
    for (const notebook of notebooks) {
      const title = notebook.title || 'Sans titre';
      const id = notebook.id;
      const sourceCount = notebook.source_count || 0;
      
      // Build NotebookLM URL
      const notebookUrl = `https://notebooklm.google.com/notebook/${id}`;
      
      reply += `📖 **[${title}](${notebookUrl})**\n`;
      reply += `   • ID: \`${id}\`\n`;
      reply += `   • Sources: ${sourceCount}\n`;
      
      if (notebook.created_at) {
        const date = new Date(notebook.created_at);
        reply += `   • Créé: ${date.toLocaleDateString('fr-FR')}\n`;
      }
      
      reply += `\n`;
    }
    
    reply += `\n💡 *Clique sur un titre pour ouvrir le notebook dans NotebookLM*`;
    
    await sendLongReply(interaction, reply);
    
  } catch (err) {
    console.error('[commands] /notebooks error:', err.message);
    await interaction.editReply(`❌ Erreur: ${err.message}`);
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
 * Main command dispatcher - routes to appropriate handler
 */
export async function handleCommand(interaction) {
  if (!interaction.isChatInputCommand()) return;
  
  const commandName = interaction.commandName;
  
  console.log(`[commands] handling command: /${commandName}`);
  
  try {
    switch (commandName) {
      case 'last':
        await handleLastCommand(interaction);
        break;
      case 'stats':
        await handleStatsCommand(interaction);
        break;
      case 'notebooks':
        await handleNotebooksCommand(interaction);
        break;
      case 'insights':
        await handleInsightsCommand(interaction);
        break;
      case 'podcast':
        await handlePodcastCommand(interaction);
        break;
      case 'thread':
        await handleThreadCommand(interaction);
        break;
      case 'choice_notebook':
        await handleChoiceNotebookCommand(interaction);
        break;
      case 'reset_notebook':
        await handleResetNotebookCommand(interaction);
        break;
      case 'status':
        await handleStatusCommand(interaction);
        break;
      case 'info':
        await handleInfoCommand(interaction);
        break;
      case 'ask':
        await handleAskCommand(interaction);
        break;
      default:
        await interaction.reply(`❌ Commande inconnue: /${commandName}`);
    }
  } catch (err) {
    console.error(`[commands] error handling /${commandName}:`, err.message);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(`❌ Erreur: ${err.message}`);
    } else if (interaction.deferred) {
      await interaction.editReply(`❌ Erreur: ${err.message}`);
    }
  }
}

/**
 * Handle /choice_notebook command - Select which notebook to use
 */
async function handleChoiceNotebookCommand(interaction) {
  await interaction.deferReply();
  
  try {
    if (!notebookLMClient) {
      await interaction.editReply('❌ NotebookLM client non disponible.');
      return;
    }
    
    console.log('[commands] /choice_notebook listing notebooks...');
    
    // Get all notebooks
    const notebooks = await notebookLMClient.listNotebooks(200);
    
    if (!notebooks || notebooks.length === 0) {
      await interaction.editReply('📚 Aucun notebook trouvé.');
      return;
    }
    
    // Sort by most recent first
    notebooks.sort((a, b) => {
      if (a.created_at && b.created_at) {
        return new Date(b.created_at) - new Date(a.created_at);
      }
      return 0;
    });
    
    // Create select menu with notebooks (max 25 options)
    const { StringSelectMenuBuilder, ActionRowBuilder } = await import('discord.js');
    
    // Filter notebooks with valid titles and create options
    const validNotebooks = notebooks
      .filter(nb => nb.id && nb.title && nb.title.trim())
      .slice(0, 25);
    
    if (validNotebooks.length === 0) {
      await interaction.editReply('📚 Aucun notebook avec un titre valide trouvé.');
      return;
    }
    
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('notebook_select')
      .setPlaceholder('Choisir un notebook...')
      .addOptions(
        validNotebooks.map(nb => ({
          label: (nb.title || 'Sans titre').substring(0, 100),
          value: nb.id,
          description: `${nb.source_count || 0} sources`.substring(0, 100),
          emoji: '📖'
        }))
      );
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    // Show menu
    await interaction.editReply({
      content: '📚 **Sélectionne un notebook à utiliser :**\n\n*Toutes les futures sources iront dans ce notebook.*',
      components: [row]
    });
    
  } catch (err) {
    console.error('[commands] /choice_notebook error:', err.message);
    await interaction.editReply(`❌ Erreur: ${err.message}`);
  }
}

/**
 * Handle notebook selection from select menu
 */
export async function handleNotebookSelection(interaction) {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== 'notebook_select') return;
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const notebookId = interaction.values[0];
    
    // Get notebook details
    const notebooks = await notebookLMClient.listNotebooks(200);
    const selected = notebooks.find(nb => nb.id === notebookId);
    
    if (!selected) {
      await interaction.editReply('❌ Notebook non trouvé');
      return;
    }
    
    // Save selection
    const { setSelectedNotebook } = await import('./notebookSelector.js');
    await setSelectedNotebook(
      notebookId,
      selected.title,
      selected.url,
      interaction.user.id
    );
    
    // Confirm to user
    await interaction.editReply({
      content: `✅ **Notebook sélectionné :**\n\n📖 ${selected.title}\n📊 ${selected.source_count || 0} sources\n\n*Toutes les futures sources iront dans ce notebook.*`
    });
    
    console.log(`[commands] notebook selected by ${interaction.user.username}: ${selected.title}`);
    
  } catch (err) {
    console.error('[commands] notebook selection error:', err.message);
    await interaction.editReply(`❌ Erreur: ${err.message}`);
  }
}

/**
 * Handle /reset_notebook command - Reset to default monthly notebook
 */
async function handleResetNotebookCommand(interaction) {
  await interaction.deferReply();
  
  try {
    const { resetNotebookSelection, getSelectedNotebook } = await import('./notebookSelector.js');
    
    // Check if there's a selection to reset
    const current = await getSelectedNotebook();
    
    if (!current) {
      await interaction.editReply('ℹ️ Aucun notebook personnalisé sélectionné. Le comportement par défaut est déjà actif.');
      return;
    }
    
    // Reset selection
    await resetNotebookSelection();
    
    await interaction.editReply({
      content: `✅ **Notebook réinitialisé**\n\n📅 Les sources iront maintenant dans le notebook mensuel par défaut.\n\n*Ancien notebook : ${current.selectedNotebookTitle}*`
    });
    
    console.log(`[commands] notebook reset by ${interaction.user.username}`);
    
  } catch (err) {
    console.error('[commands] /reset_notebook error:', err.message);
    await interaction.editReply(`❌ Erreur: ${err.message}`);
  }
}

/**
 * Handle /status command - Show current notebook selection
 */
async function handleStatusCommand(interaction) {
  await interaction.deferReply();
  
  try {
    const { getSelectedNotebook } = await import('./notebookSelector.js');
    const current = await getSelectedNotebook();
    
    if (!current) {
      // Default behavior
      const now = new Date();
      const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                          'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
      const monthName = monthNames[now.getMonth()];
      const year = now.getFullYear();
      
      await interaction.editReply({
        content: `📊 **Statut du Bot**\n\n📅 **Notebook actif :** Veille Tech - ${monthName} ${year} (par défaut)\n\n💡 *Utilise \`/choice_notebook\` pour sélectionner un notebook spécifique.*`
      });
      return;
    }
    
    // Custom notebook selected
    const lastUpdated = new Date(current.lastUpdated).toLocaleString('fr-FR');
    
    let reply = `📊 **Statut du Bot**\n\n`;
    reply += `📖 **Notebook actif :** ${current.selectedNotebookTitle}\n`;
    reply += `🔗 **Lien :** [Ouvrir dans NotebookLM](${current.selectedNotebookUrl})\n`;
    reply += `📅 **Sélectionné le :** ${lastUpdated}\n`;
    reply += `👤 **Par :** <@${current.updatedBy}>\n\n`;
    reply += `💡 *Utilise \`/reset_notebook\` pour revenir au notebook mensuel par défaut.*`;
    
    await interaction.editReply(reply);
    
  } catch (err) {
    console.error('[commands] /status error:', err.message);
    await interaction.editReply(`❌ Erreur: ${err.message}`);
  }
}

/**
 * Handle /info command - List all available commands
 */
async function handleInfoCommand(interaction) {
  await interaction.deferReply();
  
  try {
    let reply = `ℹ️ **Commandes Disponibles**\n\n`;
    
    reply += `**📚 Gestion des Sources**\n`;
    reply += `• \`/last\` - Affiche le résumé de la dernière URL traitée\n`;
    reply += `• \`/stats\` - Statistiques de la veille (nombre de fiches, etc.)\n\n`;
    
    reply += `**📖 NotebookLM**\n`;
    reply += `• \`/notebooks\` - Liste tous les notebooks NotebookLM\n`;
    reply += `• \`/choice_notebook\` - Choisir un notebook spécifique pour les sources\n`;
    reply += `• \`/reset_notebook\` - Revenir au notebook mensuel par défaut\n`;
    reply += `• \`/status\` - Affiche le notebook actuellement sélectionné\n\n`;
    
    reply += `**🔮 Analyse & Insights**\n`;
    reply += `• \`/insights [focus]\` - Génère des insights philosophiques à partir des sources\n`;
    reply += `  *Paramètre optionnel :* \`focus\` - Angle d'analyse spécifique\n`;
    reply += `• \`/ask <question>\` - Pose une question sur toutes les sources du notebook actif\n\n`;
    
    reply += `**🎙️ Génération de Contenu**\n`;
    reply += `• \`/thread <sujet> [plateforme]\` - Génère un thread Twitter/LinkedIn prêt à poster\n`;
    reply += `  *Plateformes :* Twitter, LinkedIn, Les deux\n`;
    reply += `• \`/podcast [format] [durée] [focus]\` - Génère un podcast audio\n`;
    reply += `  *Formats :* Deep Dive, Brief, Critique, Débat\n`;
    reply += `  *Durées :* Court (~5 min), Normal (~10 min), Long (~15 min)\n\n`;
    
    reply += `**ℹ️ Aide**\n`;
    reply += `• \`/info\` - Affiche cette liste de commandes\n\n`;
    
    reply += `---\n`;
    reply += `💡 **Astuce :** Poste simplement un lien dans le canal pour l'ajouter automatiquement à la veille !`;
    
    await interaction.editReply(reply);
    
  } catch (err) {
    console.error('[commands] /info error:', err.message);
    await interaction.editReply(`❌ Erreur: ${err.message}`);
  }
}

// Store pending threads for LinkedIn publish button
const pendingThreads = new Map();

/**
 * Handle /thread command - Generate a Twitter/LinkedIn thread from sources
 */
async function handleThreadCommand(interaction) {
  await interaction.deferReply();
  
  try {
    if (!notebookLMClient) {
      await interaction.editReply('❌ NotebookLM client non disponible.');
      return;
    }
    
    const sujet = interaction.options.getString('sujet');
    const plateforme = interaction.options.getString('plateforme') || 'both';
    const sourcesFilter = interaction.options.getString('sources') || 'all';
    const ton = interaction.options.getString('ton') || 'expert';
    const contexte = interaction.options.getString('contexte') || '';
    
    const platformeLabel = { twitter: 'Twitter/X', linkedin: 'LinkedIn', both: 'Twitter/X + LinkedIn' };
    const sourcesLabel = { all: 'Toutes', week: 'Cette semaine', today: "Aujourd'hui", last: 'Dernière source' };
    const tonLabel = { expert: '🎓 Expert', provocateur: '🔥 Provocateur', storytelling: '📖 Storytelling', pedagogue: '💡 Pédagogue' };
    
    await interaction.editReply(`🧵 *Génération du thread en cours...*\n\n**Sujet :** ${sujet}\n**Plateforme :** ${platformeLabel[plateforme]}\n**Sources :** ${sourcesLabel[sourcesFilter]}\n**Ton :** ${tonLabel[ton]}`);
    
    console.log(`[commands] /thread sujet="${sujet}" plateforme=${plateforme} sources=${sourcesFilter} ton=${ton}`);
    
    const { getOrCreateMonthlyNotebook } = await import('../../batch-processor/src/notebooklm-http.js');
    const notebookId = await getOrCreateMonthlyNotebook();
    
    // Resolve source IDs based on filter
    const sourceIds = await resolveSourceIds(sourcesFilter);
    
    // Build prompt
    const prompt = buildThreadPrompt(sujet, plateforme, ton, contexte);
    
    // Query NotebookLM
    const result = await notebookLMClient.queryNotebook(notebookId, prompt, sourceIds);
    
    if (!result || !result.answer) {
      await interaction.editReply('❌ Pas de réponse de NotebookLM. Réessayez plus tard.');
      return;
    }
    
    // Extract LinkedIn content for the publish button
    let linkedInContent = null;
    if (plateforme === 'linkedin' || plateforme === 'both') {
      linkedInContent = extractLinkedInContent(result.answer, plateforme);
    }
    
    // Build response
    let response = `🧵 **Thread : ${sujet}**\n📱 *${platformeLabel[plateforme]}* • ${tonLabel[ton]}\n\n${result.answer}`;
    
    response += `\n\n---\n`;
    const sourceInfo = sourceIds ? `${sourceIds.length} sources sélectionnées` : `${result.sourceCount || 'toutes les'} sources`;
    response += `*Généré à partir de ${sourceInfo}*`;
    
    // Build buttons
    const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
    const buttons = [];
    
    if (linkedInContent && linkedInAvailable) {
      const threadId = `thread_${Date.now()}`;
      pendingThreads.set(threadId, { content: linkedInContent, sujet, createdAt: Date.now() });
      
      // Clean old entries (> 1h)
      for (const [key, val] of pendingThreads) {
        if (Date.now() - val.createdAt > 3600000) pendingThreads.delete(key);
      }
      
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`linkedin_publish_${threadId}`)
          .setLabel('📤 Publier sur LinkedIn')
          .setStyle(ButtonStyle.Primary)
      );
    } else if (linkedInContent && !linkedInAvailable) {
      response += ` • ⚠️ *LinkedIn non configuré*`;
    }
    
    if (buttons.length > 0) {
      const row = new ActionRowBuilder().addComponents(...buttons);
      const chunks = splitIntoChunks(response);
      await interaction.editReply({ content: chunks[0], components: [row] });
      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp(`*(suite ${i + 1}/${chunks.length})*\n\n${chunks[i]}`);
      }
    } else {
      await sendLongReply(interaction, response, true);
    }
    
  } catch (err) {
    console.error('[commands] /thread error:', err.message);
    await interaction.editReply(`❌ Erreur: ${err.message}`);
  }
}

/**
 * Handle LinkedIn publish button click
 */
export async function handleLinkedInPublish(interaction) {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('linkedin_publish_')) return;
  
  await interaction.deferReply({ ephemeral: true });
  
  try {
    const threadId = interaction.customId.replace('linkedin_publish_', '');
    const pending = pendingThreads.get(threadId);
    
    if (!pending) {
      await interaction.editReply('❌ Thread expiré. Régénère avec `/thread`.');
      return;
    }
    
    console.log(`[commands] publishing to LinkedIn: "${pending.sujet}"`);
    
    const { publishToLinkedIn } = await import('./linkedin-api.js');
    const result = await publishToLinkedIn(pending.content);
    
    // Remove from pending
    pendingThreads.delete(threadId);
    
    if (result.success) {
      await interaction.editReply(`✅ **Publié sur LinkedIn !**\n\n🔗 ${result.postUrl}`);
      console.log(`[commands] LinkedIn post published: ${result.postId}`);
    } else {
      await interaction.editReply('❌ Échec de la publication.');
    }
    
  } catch (err) {
    console.error('[commands] LinkedIn publish error:', err.message);
    await interaction.editReply(`❌ Erreur: ${err.message}`);
  }
}

/**
 * Resolve source IDs based on filter type
 */
async function resolveSourceIds(filter) {
  if (filter === 'all') return null;
  
  try {
    const processedDir = path.join(WORKDIR, PROCESSED_PATH);
    const files = await readdir(processedDir);
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    
    if (jsonFiles.length === 0) return null;
    
    const items = [];
    for (const f of jsonFiles) {
      try {
        const content = await readFile(path.join(processedDir, f), 'utf-8');
        const data = JSON.parse(content);
        if (data.source_id) items.push(data);
      } catch { /* skip */ }
    }
    
    if (items.length === 0) return null;
    
    items.sort((a, b) => new Date(b.processed_at || b.created_at) - new Date(a.processed_at || a.created_at));
    
    const now = new Date();
    
    switch (filter) {
      case 'last':
        return items[0]?.source_id ? [items[0].source_id] : null;
        
      case 'today': {
        const todayStr = now.toISOString().split('T')[0];
        const ids = items
          .filter(i => (i.processed_at || i.created_at || '').startsWith(todayStr))
          .map(i => i.source_id);
        return ids.length > 0 ? ids : null;
      }
      
      case 'week': {
        const weekAgo = new Date(now.getTime() - 7 * 86400000);
        const ids = items
          .filter(i => new Date(i.processed_at || i.created_at) >= weekAgo)
          .map(i => i.source_id);
        return ids.length > 0 ? ids : null;
      }
      
      default:
        return null;
    }
  } catch (err) {
    console.error('[commands] resolveSourceIds error:', err.message);
    return null;
  }
}

/**
 * Extract LinkedIn-specific content from the generated thread
 */
function extractLinkedInContent(answer, plateforme) {
  if (plateforme === 'linkedin') return answer.trim();
  
  // For 'both', extract the LinkedIn section
  const match = answer.match(/##\s*💼\s*VERSION LINKEDIN[\s\S]*?\n\n([\s\S]*?)(?=\n---|\n##|$)/i)
    || answer.match(/LINKEDIN[\s\S]*?\n\n([\s\S]*?)(?=\n---|\n##\s*🐦|$)/i);
  
  return match ? match[1].trim() : null;
}

/**
 * Build the prompt for thread generation
 */
function buildThreadPrompt(sujet, plateforme, ton, contexte) {
  const tonInstructions = {
    expert: 'Ton expert : utilise des données chiffrées, des références précises, un vocabulaire technique accessible. Montre ton expertise sans être pédant.',
    provocateur: 'Ton provocateur : prends position, challenge les idées reçues, utilise des formulations qui interpellent. Sois audacieux mais argumenté.',
    storytelling: 'Ton storytelling : raconte une histoire, utilise le "je", partage une expérience ou un parcours. Crée de l\'émotion et de l\'identification.',
    pedagogue: 'Ton pédagogue : vulgarise, utilise des analogies, structure en étapes claires. Rends le complexe simple et actionnable.',
  };
  
  const contexteBlock = contexte ? `\n\nContexte de l'auteur : ${contexte}` : '';
  let base;
  
  if (plateforme === 'twitter') base = buildTwitterPrompt(sujet);
  else if (plateforme === 'linkedin') base = buildLinkedInPrompt(sujet);
  else base = buildBothPrompt(sujet);
  
  return base + `\n\n${tonInstructions[ton]}${contexteBlock}`;
}

function buildTwitterPrompt(sujet) {
  return `À partir des sources de ce notebook, génère un thread Twitter/X prêt à poster sur le sujet : "${sujet}"

Règles strictes :
- Chaque tweet fait MAX 280 caractères
- Le premier tweet est un hook accrocheur qui donne envie de lire la suite
- Numérote chaque tweet (1/, 2/, 3/... )
- Entre 6 et 12 tweets
- Utilise des emojis avec parcimonie (1-2 par tweet max)
- Le dernier tweet est un CTA (call to action) ou une question ouverte
- Inclus des données chiffrées ou des exemples concrets tirés des sources
- Ton : expert accessible, pas corporate
- Langue : français

Format de sortie :
1/ [tweet]

2/ [tweet]

...`;
}

function buildLinkedInPrompt(sujet) {
  return `À partir des sources de ce notebook, génère un post LinkedIn prêt à poster sur le sujet : "${sujet}"

Règles strictes :
- Le hook (première ligne) doit être percutant et donner envie de cliquer "voir plus"
- Structure avec des sauts de ligne fréquents (une idée par ligne)
- Entre 800 et 1500 caractères
- Utilise des emojis en début de ligne pour structurer
- Inclus des données chiffrées ou exemples concrets tirés des sources
- Termine par une question ouverte pour générer de l'engagement
- Ajoute 3-5 hashtags pertinents à la fin
- Ton : expert qui partage un apprentissage, pas vendeur
- Langue : français

Format : post prêt à copier-coller directement dans LinkedIn.`;
}

function buildBothPrompt(sujet) {
  return `À partir des sources de ce notebook, génère du contenu prêt à poster sur le sujet : "${sujet}"

Génère les DEUX formats suivants :

---
## 🐦 VERSION TWITTER/X (Thread)

Règles : chaque tweet MAX 280 caractères, numéroté (1/, 2/...), 6-12 tweets, hook accrocheur en premier, CTA en dernier, emojis avec parcimonie, données concrètes des sources. Ton expert accessible. Français.

---
## 💼 VERSION LINKEDIN (Post)

Règles : hook percutant en première ligne, sauts de ligne fréquents, 800-1500 caractères, emojis en début de ligne, données concrètes, question ouverte à la fin, 3-5 hashtags. Ton expert qui partage. Français.

---

Génère les deux versions complètes, prêtes à copier-coller.`;
}

/**
 * Handle /ask command - Query all sources in active notebook
 */
async function handleAskCommand(interaction) {
  await interaction.deferReply();
  
  try {
    if (!notebookLMClient) {
      await interaction.editReply('❌ NotebookLM client non disponible.');
      return;
    }
    
    const question = interaction.options.getString('question');
    
    await interaction.editReply(`🔍 *Recherche dans les sources... Cela peut prendre quelques instants.*\n\n**Question :** ${question}`);
    
    console.log(`[commands] /ask query: "${question}"`);
    
    // Get the active notebook ID (respects user selection)
    const { getOrCreateMonthlyNotebook } = await import('../../batch-processor/src/notebooklm-http.js');
    const notebookId = await getOrCreateMonthlyNotebook();
    
    // Query all sources in the notebook
    const result = await notebookLMClient.queryNotebook(notebookId, question);
    
    if (result && result.answer) {
      let response = `💬 **Réponse**\n\n${result.answer}`;
      
      // Add footer with metadata
      response += `\n\n---\n`;
      if (result.sourceCount) {
        response += `*Réponse basée sur ${result.sourceCount} sources*`;
      }
      
      await sendLongReply(interaction, response, true);
    } else {
      await interaction.editReply('❌ Pas de réponse de NotebookLM. Réessayez plus tard.');
    }
    
  } catch (err) {
    console.error('[commands] /ask error:', err.message);
    await interaction.editReply(`❌ Erreur: ${err.message}`);
  }
}


