/**
 * Slash commands for the veille bot
 */

import { SlashCommandBuilder, REST, Routes } from 'discord.js';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { config } from './config.js';
import { wrap as safeWrap, wrapComponent } from './safeHandler.js';
import { getHealth } from './health.js';

// Lazy NotebookLM/LinkedIn loaders — a heavy/optional module that fails to load
// must NOT crash boot or kill the gateway.
let _notebookLMClient;
async function ensureNotebookLMClient() {
  if (_notebookLMClient !== undefined) return _notebookLMClient;
  try {
    const m = await import('../../batch-processor/src/notebooklm-http.js');
    _notebookLMClient = {
      queryNotebook: m.queryNotebook,
      getNotebookId: m.getNotebookId,
      getOrCreateMonthlyNotebook: m.getOrCreateMonthlyNotebook,
      createPodcast: m.createPodcast,
      getPodcastStatus: m.getPodcastStatus,
      downloadAudio: m.downloadAudio,
      listNotebooks: m.listNotebooks,
    };
    notebookLMClient = _notebookLMClient;
    console.log('[commands] NotebookLM client loaded');
  } catch (err) {
    _notebookLMClient = null;
    notebookLMClient = null;
    console.error('[commands] NotebookLM client load failed:', err.message);
  }
  return _notebookLMClient;
}

let _linkedInAvailable;
async function ensureLinkedInAvailable() {
  if (_linkedInAvailable !== undefined) return _linkedInAvailable;
  try {
    const { isLinkedInConfigured } = await import('./linkedin-api.js');
    _linkedInAvailable = await isLinkedInConfigured();
    linkedInAvailable = _linkedInAvailable;
    console.log(`[commands] LinkedIn client: ${_linkedInAvailable ? 'configured' : 'not configured'}`);
  } catch (err) {
    _linkedInAvailable = false;
    linkedInAvailable = false;
    console.error('[commands] LinkedIn client load failed:', err.message);
  }
  return _linkedInAvailable;
}

// Shared snapshots kept up to date by the ensure*() helpers above so the existing
// inline code that reads `notebookLMClient`/`linkedInAvailable` directly keeps working.
let notebookLMClient = null;
let linkedInAvailable = false;

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
    .setName('health')
    .setDescription('État de santé du bot (gateway, mémoire, uptime)'),
  
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
    )
    .addStringOption(option =>
      option.setName('funnel')
        .setDescription('Étape du funnel marketing (défaut: MOFU)')
        .setRequired(false)
        .addChoices(
          { name: '🌱 TOFU — Notoriété (audience froide, tendances, questions ouvertes)', value: 'tofu' },
          { name: '🔥 MOFU — Considération (méthodes, retours d\'expérience, engagement)', value: 'mofu' },
          { name: '🎯 BOFU — Conversion (résultats, preuves, CTA direct)', value: 'bofu' }
        )
    )
    .addStringOption(option =>
      option.setName('media')
        .setDescription('Ajouter un visuel généré par NotebookLM au post LinkedIn')
        .setRequired(false)
        .addChoices(
          { name: '🖼️ Infographie (image attachée au post)', value: 'infographic' },
          { name: '📊 Slides (lien Google Slides dans le post)', value: 'slides' },
          { name: '❌ Aucun (texte seul)', value: 'none' }
        )
    ),
  
  new SlashCommandBuilder()
    .setName('devlog')
    .setDescription('Génère un post LinkedIn "build in public" à partir de tes commits GitHub')
    .addIntegerOption(option =>
      option.setName('jours')
        .setDescription('Nombre de jours à regarder en arrière (défaut: 1 = aujourd\'hui)')
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(30)
    )
    .addStringOption(option =>
      option.setName('contexte')
        .setDescription('Contexte additionnel (ex: "je lance un SaaS", "semaine de refacto")')
        .setRequired(false)
    )
    .addStringOption(option =>
      option.setName('media')
        .setDescription('Ajouter un visuel généré par NotebookLM au post LinkedIn')
        .setRequired(false)
        .addChoices(
          { name: '🖼️ Infographie (image attachée au post)', value: 'infographic' },
          { name: '📊 Slides (lien Google Slides dans le post)', value: 'slides' },
          { name: '❌ Aucun (texte seul)', value: 'none' }
        )
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

// Dispatch table — every handler runs through safeWrap so:
//  - deferReply is forced before Discord's 3s timeout
//  - exceptions always produce a user-visible reply (no more "Application ne répond plus")
const COMMAND_HANDLERS = {
  last: safeWrap('last', handleLastCommand),
  stats: safeWrap('stats', handleStatsCommand),
  notebooks: safeWrap('notebooks', async (i) => { await ensureNotebookLMClient(); return handleNotebooksCommand(i); }),
  insights: safeWrap('insights', async (i) => { await ensureNotebookLMClient(); return handleInsightsCommand(i); }),
  podcast: safeWrap('podcast', async (i) => { await ensureNotebookLMClient(); return handlePodcastCommand(i); }),
  thread: safeWrap('thread', async (i) => { await ensureNotebookLMClient(); await ensureLinkedInAvailable(); return handleThreadCommand(i); }),
  devlog: safeWrap('devlog', async (i) => { await ensureNotebookLMClient(); await ensureLinkedInAvailable(); return handleDevlogCommand(i); }),
  choice_notebook: safeWrap('choice_notebook', async (i) => { await ensureNotebookLMClient(); return handleChoiceNotebookCommand(i); }),
  reset_notebook: safeWrap('reset_notebook', handleResetNotebookCommand),
  status: safeWrap('status', handleStatusCommand),
  info: safeWrap('info', handleInfoCommand),
  ask: safeWrap('ask', async (i) => { await ensureNotebookLMClient(); return handleAskCommand(i); }),
  health: safeWrap('health', handleHealthCommand),
};

export async function handleCommand(interaction) {
  if (!interaction.isChatInputCommand()) return;
  const commandName = interaction.commandName;
  console.log(`[commands] handling command: /${commandName}`);

  const handler = COMMAND_HANDLERS[commandName];
  if (!handler) {
    try {
      await interaction.reply({ content: `❌ Commande inconnue: /${commandName}`, ephemeral: true });
    } catch {}
    return;
  }
  await handler(interaction);
}

/**
 * Handle /health command — surfaces the watchdog state inside Discord.
 */
async function handleHealthCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const h = getHealth();
  const wsLabel = { 0: 'READY', 1: 'CONNECTING', 2: 'RECONNECTING', 3: 'IDLE', 4: 'NEARLY', 5: 'DISCONNECTED', 6: 'WAITING_FOR_GUILDS', 7: 'IDENTIFYING', 8: 'RESUMING' }[h.ws_status] || `unknown(${h.ws_status})`;
  const uptimeMin = Math.round(h.uptime_ms / 60000);
  const lastEventSec = Math.round(h.last_event_age_ms / 1000);
  const notebookLM = await ensureNotebookLMClient();
  const linkedIn = await ensureLinkedInAvailable();

  let reply = `🩺 **État du bot**\n\n`;
  reply += h.healthy ? `✅ **Healthy**\n` : `❌ **Unhealthy**\n`;
  reply += `\n**Gateway:** ${wsLabel}\n`;
  reply += `**Ping WS:** ${h.ws_ping_ms}ms\n`;
  reply += `**Dernier événement:** ${h.last_event_kind} (il y a ${lastEventSec}s)\n`;
  reply += `**Uptime:** ${uptimeMin} min\n`;
  reply += `**RSS / Heap:** ${h.rss_mb}MB / ${h.heap_mb}MB\n`;
  reply += `\n**Modules:**\n`;
  reply += `• NotebookLM: ${notebookLM ? '✅' : '❌'}\n`;
  reply += `• LinkedIn: ${linkedIn ? '✅' : '❌'}\n`;
  await interaction.editReply(reply);
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
 * Handle notebook selection from select menu — wrapped by wrapComponent
 * (deferUpdate ack, ephemeral follow-ups, exceptions caught).
 */
export const handleNotebookSelection = wrapComponent('notebook_select', async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== 'notebook_select') return;

  await interaction.deferUpdate();

  // Ensure NotebookLM client is loaded before we use it (the select menu
  // may fire long after /choice_notebook if the user lets it sit).
  await ensureNotebookLMClient();
  if (!notebookLMClient) {
    await interaction.followUp({ content: '❌ NotebookLM client non disponible.', ephemeral: true });
    return;
  }

  const notebookId = interaction.values[0];
  const notebooks = await notebookLMClient.listNotebooks(200);
  const selected = notebooks.find(nb => nb.id === notebookId);

  if (!selected) {
    await interaction.followUp({ content: '❌ Notebook non trouvé', ephemeral: true });
    return;
  }

  const { setSelectedNotebook } = await import('./notebookSelector.js');
  await setSelectedNotebook(
    notebookId,
    selected.title,
    selected.url,
    interaction.user.id
  );

  await interaction.followUp({
    content: `✅ **Notebook sélectionné :**\n\n📖 ${selected.title}\n📊 ${selected.source_count || 0} sources\n\n*Toutes les futures sources iront dans ce notebook.*`,
    ephemeral: true,
  });

  console.log(`[commands] notebook selected by ${interaction.user.username}: ${selected.title}`);
});

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
    const funnel = interaction.options.getString('funnel') || 'mofu';
    const mediaType = interaction.options.getString('media') || 'none';
    
    const platformeLabel = { twitter: 'Twitter/X', linkedin: 'LinkedIn', both: 'Twitter/X + LinkedIn' };
    const sourcesLabel = { all: 'Toutes', week: 'Cette semaine', today: "Aujourd'hui", last: 'Dernière source' };
    const tonLabel = { expert: '🎓 Expert', provocateur: '🔥 Provocateur', storytelling: '📖 Storytelling', pedagogue: '💡 Pédagogue' };
    const funnelLabel = { tofu: '🌱 TOFU', mofu: '🔥 MOFU', bofu: '🎯 BOFU' };
    const mediaLabel = mediaType === 'infographic' ? ' + 🖼️ infographie' : mediaType === 'slides' ? ' + 📊 slides' : '';

    await interaction.editReply(`🧵 *Génération du thread en cours...*\n\n**Sujet :** ${sujet}\n**Plateforme :** ${platformeLabel[plateforme]}\n**Sources :** ${sourcesLabel[sourcesFilter]}\n**Ton :** ${tonLabel[ton]}\n**Funnel :** ${funnelLabel[funnel]}${mediaLabel ? `\n**Média :** ${mediaLabel}` : ''}`);
    
    console.log(`[commands] /thread sujet="${sujet}" plateforme=${plateforme} sources=${sourcesFilter} ton=${ton} funnel=${funnel} media=${mediaType}`);
    
    const { getOrCreateMonthlyNotebook } = await import('../../batch-processor/src/notebooklm-http.js');
    const notebookId = await getOrCreateMonthlyNotebook();
    
    // Resolve source IDs based on filter
    const sourceIds = await resolveSourceIds(sourcesFilter);
    
    // Build prompt
    const prompt = buildThreadPrompt(sujet, plateforme, ton, contexte, funnel);
    
    // Query NotebookLM + generate media in parallel
    const [postResult, mediaResult] = await Promise.allSettled([
      notebookLMClient.queryNotebook(notebookId, prompt, sourceIds),
      mediaType !== 'none' ? generateMedia(notebookId, mediaType, sujet) : Promise.resolve(null),
    ]);

    const result = postResult.status === 'fulfilled' ? postResult.value : null;
    const media = mediaResult.status === 'fulfilled' ? mediaResult.value : null;
    if (mediaResult.status === 'rejected') {
      console.error('[commands] /thread media generation failed:', mediaResult.reason?.message);
    }
    
    if (!result || !result.answer) {
      await interaction.editReply('❌ Pas de réponse de NotebookLM. Réessayez plus tard.');
      return;
    }
    
    // Strip NotebookLM citation numbers like [1], [2], [1,2], [1][2] etc.
    const cleanAnswer = result.answer.replace(/\s*\[\d+(?:,\s*\d+)*\](\[\d+(?:,\s*\d+)*\])*/g, '').trim();
    
    // Extract LinkedIn content for the publish button
    let linkedInContent = null;
    if (plateforme === 'linkedin' || plateforme === 'both') {
      linkedInContent = extractLinkedInContent(cleanAnswer, plateforme);
    }
    
    // Build response
    let response = `🧵 **Thread : ${sujet}**\n📱 *${platformeLabel[plateforme]}* • ${tonLabel[ton]}\n\n${cleanAnswer}`;
    
    if (media?.type === 'slides' && media.slidesUrl) {
      response += `\n\n📊 [Voir les slides](${media.slidesUrl})`;
    }

    response += `\n\n---\n`;
    const sourceInfo = sourceIds ? `${sourceIds.length} sources sélectionnées` : `${result.sourceCount || 'toutes les'} sources`;
    response += `*Généré à partir de ${sourceInfo}*`;
    
    // Build buttons
    const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
    const buttons = [];
    
    if (linkedInContent && linkedInAvailable) {
      const threadId = `thread_${Date.now()}`;
      pendingThreads.set(threadId, { content: linkedInContent, sujet, createdAt: Date.now(), media });
      
      // Clean old entries (> 1h)
      for (const [key, val] of pendingThreads) {
        if (Date.now() - val.createdAt > 3600000) pendingThreads.delete(key);
      }
      
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`linkedin_publish_${threadId}`)
          .setLabel(media?.type === 'infographic' ? '📤 Publier sur LinkedIn (avec image)' : '📤 Publier sur LinkedIn')
          .setStyle(ButtonStyle.Primary)
      );
    } else if (linkedInContent && !linkedInAvailable) {
      response += ` • ⚠️ *LinkedIn non configuré*`;
    }
    
    const chunks = splitIntoChunks(response);

    // If we have an infographic, attach it to the Discord message
    if (media?.type === 'infographic' && media.imageBuffer) {
      const { AttachmentBuilder } = await import('discord.js');
      const attachment = new AttachmentBuilder(media.imageBuffer, { name: 'infographie.png' });
      const replyOptions = { content: chunks[0], files: [attachment] };
      if (buttons.length > 0) replyOptions.components = [new ActionRowBuilder().addComponents(...buttons)];
      await interaction.editReply(replyOptions);
    } else if (buttons.length > 0) {
      const row = new ActionRowBuilder().addComponents(...buttons);
      await interaction.editReply({ content: chunks[0], components: [row] });
    } else {
      await interaction.editReply(chunks[0]);
    }

    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp(`*(suite ${i + 1}/${chunks.length})*\n\n${chunks[i]}`);
    }

    if (mediaResult.status === 'rejected') {
      await interaction.followUp(`⚠️ *La génération du média a échoué : ${mediaResult.reason?.message}. Le post texte est prêt.*`);
    }
    
  } catch (err) {
    console.error('[commands] /thread error:', err.message);
    await interaction.editReply(`❌ Erreur: ${err.message}`);
  }
}

/**
 * Handle LinkedIn publish button click — wrapped by wrapComponent.
 */
export const handleLinkedInPublish = wrapComponent('linkedin_publish', async (interaction) => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('linkedin_publish_')) return;

  await interaction.deferUpdate();

  const threadId = interaction.customId.replace('linkedin_publish_', '');
  const pending = pendingThreads.get(threadId);

  if (!pending) {
    await interaction.followUp({ content: '❌ Thread expiré. Régénère avec `/thread`.', ephemeral: true });
    return;
  }

  console.log(`[commands] publishing to LinkedIn: "${pending.sujet}"`);

  const { publishToLinkedIn, publishWithImage, uploadImage } = await import('./linkedin-api.js');

  let result;
  if (pending.media?.type === 'infographic' && pending.media.imageBuffer) {
    await interaction.followUp({ content: '⏳ *Upload de l\'image sur LinkedIn...*', ephemeral: true });
    const assetUrn = await uploadImage(pending.media.imageBuffer, pending.media.contentType || 'image/png');
    result = await publishWithImage(pending.content, assetUrn);
  } else {
    result = await publishToLinkedIn(pending.content);
  }

  pendingThreads.delete(threadId);

  if (result.success) {
    await interaction.followUp({ content: `✅ **Publié sur LinkedIn !**\n\n🔗 ${result.postUrl}`, ephemeral: true });
    console.log(`[commands] LinkedIn post published: ${result.postId}`);
  } else {
    await interaction.followUp({ content: '❌ Échec de la publication.', ephemeral: true });
  }
});

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
function buildThreadPrompt(sujet, plateforme, ton, contexte, funnel = 'mofu') {
  const tonInstructions = {
    expert: 'Ton expert : utilise des données chiffrées, des références précises, un vocabulaire technique accessible. Montre ton expertise sans être pédant.',
    provocateur: 'Ton provocateur : prends position, challenge les idées reçues, utilise des formulations qui interpellent. Sois audacieux mais argumenté.',
    storytelling: 'Ton storytelling : raconte une histoire, utilise le "je", partage une expérience ou un parcours. Crée de l\'émotion et de l\'identification.',
    pedagogue: 'Ton pédagogue : vulgarise, utilise des analogies, structure en étapes claires. Rends le complexe simple et actionnable.',
  };

  const contexteBlock = contexte ? `\n\nContexte de l'auteur : ${contexte}` : '';
  let base;

  if (plateforme === 'twitter') base = buildTwitterPrompt(sujet);
  else if (plateforme === 'linkedin') base = buildLinkedInPrompt(sujet, funnel);
  else base = buildBothPrompt(sujet, funnel);

  return base + `\n\n${tonInstructions[ton] || ''}${contexteBlock}`;
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

function buildLinkedInPrompt(sujet, funnel = 'mofu') {
  const bofu_cta = process.env.BOFU_CTA || 'DM si tu veux qu\'on en parle.';

  const funnelInstructions = {
    tofu: `ÉTAPE DU FUNNEL : TOFU (Notoriété)
Objectif : toucher une audience froide qui ne te connaît pas encore.
- Hook : observation surprenante, question ouverte, tendance émergente sur le sujet
- Ton : curieux et accessible, pas d'expertise affichée frontalement
- Contenu : tendances, chiffres du secteur, questions qui font réfléchir
- Pas de méthode personnelle, pas de "voici comment je fais"
- CTA : question ouverte large ("Et vous, vous avez remarqué ça ?")
- Pas de promotion, pas de lien`,

    mofu: `ÉTAPE DU FUNNEL : MOFU (Considération)
Objectif : engager une audience qui te suit déjà, montrer ton expertise.
- Hook : constat concret tiré de ton expérience ou des sources
- Ton : expert qui partage, narration à la première personne
- Contenu : méthode concrète, retour d'expérience, comparatif, "voici comment je fais"
- Liste avec → pour les points actionnables
- CTA : question qui invite à partager leur expérience ("Comment tu gères ça de ton côté ?")`,

    bofu: `ÉTAPE DU FUNNEL : BOFU (Conversion)
Objectif : convertir une audience chaude en action concrète.
- Hook : résultat chiffré ou transformation visible
- Ton : direct, preuves sociales, confiance
- Contenu : résultats obtenus, avant/après, cas concret avec chiffres des sources
- Montre la transformation, pas juste la méthode
- CTA direct et sans ambiguïté : "${bofu_cta}"
- P.S. avec lien ou action concrète si pertinent`,
  };

  return `À partir des sources de ce notebook, génère un post LinkedIn prêt à poster sur le sujet : "${sujet}"

${funnelInstructions[funnel] || funnelInstructions.mofu}

STRUCTURE (dans cet ordre) :
1. Hook : 1-3 lignes max.
2. Contexte/problème : 2-4 lignes.
3. Pivot : une ligne de transition courte.
4. Méthode ou preuves : liste avec → (3-5 points).
5. Conclusion : 1-2 lignes.
6. CTA adapté au funnel ci-dessus.

RÈGLES DE FORME :
- Une idée = une ligne. Jamais plus de 3 lignes consécutives sans saut.
- Listes avec → uniquement.
- Langage direct et familier-pro.
- MAX 3 emojis sur tout le post.
- 2-3 hashtags à la toute fin.
- Entre 800 et 1400 caractères.
- Langue : français.

INTERDICTIONS : ne jamais écrire "Mais (et c'est un gros MAIS)" ni aucune variante. Pas d'emojis en début de chaque ligne. Pas de chiffres inventés.

Post prêt à copier-coller.`;
}

function buildBothPrompt(sujet, funnel = 'mofu') {
  return `À partir des sources de ce notebook, génère du contenu prêt à poster sur le sujet : "${sujet}"

Génère les DEUX formats suivants :

---
## 🐦 VERSION TWITTER/X (Thread)

Règles : chaque tweet MAX 280 caractères, numéroté (1/, 2/...), 6-12 tweets, hook accrocheur en premier, CTA en dernier, emojis avec parcimonie, données concrètes des sources. Ton expert accessible. Français.

---
## 💼 VERSION LINKEDIN (Post)

${buildLinkedInPrompt(sujet, funnel).split('\n').slice(2).join('\n')}

---

Génère les deux versions complètes, prêtes à copier-coller.`;
}

/**
 * Generate a NotebookLM media artifact (infographic or slides) and return attachment info.
 * Runs in background — caller should already have sent a status message.
 * @param {string} notebookId
 * @param {'infographic'|'slides'} mediaType
 * @param {string} focus - optional focus prompt
 * @returns {{ type, imageBuffer, contentType, slidesUrl } | null}
 */
async function generateMedia(notebookId, mediaType, focus = '') {
  const { createInfographic, createSlideDeck, waitForStudioArtifact, downloadFile } = await import('../../batch-processor/src/notebooklm-http.js');

  if (mediaType === 'infographic') {
    const { artifact_id } = await createInfographic(notebookId, { focus, language: 'fr' });
    console.log(`[commands] infographic artifact started: ${artifact_id}`);
    const artifact = await waitForStudioArtifact(notebookId, artifact_id);
    const imageUrl = artifact.infographic_url || artifact.image_url || artifact.url;
    if (!imageUrl) throw new Error(`No image URL in completed infographic artifact: ${JSON.stringify(artifact)}`);
    const { buffer, contentType } = await downloadFile(imageUrl);
    return { type: 'infographic', imageBuffer: buffer, contentType };
  }

  if (mediaType === 'slides') {
    const { artifact_id } = await createSlideDeck(notebookId, { focus, language: 'fr' });
    console.log(`[commands] slides artifact started: ${artifact_id}`);
    const artifact = await waitForStudioArtifact(notebookId, artifact_id);
    const slidesUrl = artifact.slide_deck_url || artifact.slides_url || artifact.url || artifact.drive_url;
    if (!slidesUrl) throw new Error(`No slides URL in completed artifact: ${JSON.stringify(artifact)}`);
    return { type: 'slides', slidesUrl };
  }

  return null;
}

/**
 * Handle /devlog command - Generate a LinkedIn "build in public" post from GitHub commits
 */
async function handleDevlogCommand(interaction) {
  await interaction.deferReply();

  try {
    const jours = interaction.options.getInteger('jours') || 1;
    const contexte = interaction.options.getString('contexte') || '';
    const mediaType = interaction.options.getString('media') || 'none';

    const periodeLabel = jours === 1 ? "aujourd'hui" : `ces ${jours} derniers jours`;
    await interaction.editReply(`🔨 *Récupération de tes commits GitHub (${periodeLabel})...*`);

    const { getRecentCommits, formatCommitsForPrompt } = await import('./github-api.js');
    const repoCommits = await getRecentCommits(jours);

    const totalCommits = repoCommits.reduce((sum, r) => sum + r.commits.length, 0);
    console.log(`[commands] /devlog found ${totalCommits} commits across ${repoCommits.length} repos`);

    if (totalCommits === 0) {
      await interaction.editReply(`😴 Aucun commit trouvé ${periodeLabel}. Repos pushés demain !`);
      return;
    }

    const mediaLabel = mediaType === 'infographic' ? ' + 🖼️ infographie' : mediaType === 'slides' ? ' + 📊 slides' : '';
    await interaction.editReply(`🔨 *${totalCommits} commits trouvés sur ${repoCommits.length} repos — génération du post LinkedIn${mediaLabel}...*`);

    const commitsSummary = formatCommitsForPrompt(repoCommits);
    const contexteBlock = contexte ? `\n\nContexte : ${contexte}` : '';

    const prompt = `Tu es un builder/développeur indie qui partage son avancement quotidien sur LinkedIn en mode "build in public".

Voici mes commits GitHub ${periodeLabel} :

${commitsSummary}${contexteBlock}

Génère un post LinkedIn "build in public" à partir de ces commits.

STRUCTURE (dans cet ordre) :
1. Hook : 1-3 lignes. Ce que j'ai fait/résolu, formulé de façon directe et concrète.
2. Contexte : le problème que ça résout ou le défi que j'ai rencontré (2-4 lignes).
3. Pivot : une ligne de transition courte ("Ce que j'ai changé :" ou "Comment j'ai résolu ça :").
4. Détail : liste avec → (3-5 points concrets tirés des commits).
5. Conclusion : 1-2 lignes. Résultat ou apprentissage.
6. CTA : question ouverte.

RÈGLES DE FORME :
- Une idée = une ligne. Jamais plus de 3 lignes consécutives sans saut.
- Listes avec → uniquement.
- Langage direct et familier-pro. Pas de jargon, pas de formules toutes faites.
- MAX 3 emojis sur tout le post.
- 2-3 hashtags à la toute fin (#buildinpublic #indiehacker ou similaires).
- Entre 600 et 1200 caractères.
- Langue : français.

INTERDICTIONS ABSOLUES :
- Ne jamais écrire "Mais (et c'est un gros MAIS)" ni aucune variante de cette tournure.
- Pas d'emojis en début de chaque ligne.
- Pas de "Voici pourquoi", "La vérité c'est que", "Ce que personne ne dit".
- Pas de chiffres inventés — utilise uniquement ce qui est dans les commits.

Post prêt à copier-coller directement dans LinkedIn.`;

    // Generate post text and media in parallel
    const notebookId = await notebookLMClient.getOrCreateMonthlyNotebook();

    const [postResult, mediaResult] = await Promise.allSettled([
      notebookLMClient.queryNotebook(notebookId, prompt),
      mediaType !== 'none' ? generateMedia(notebookId, mediaType, `Devlog ${periodeLabel} : ${repoCommits.map(r => r.repo).join(', ')}`) : Promise.resolve(null),
    ]);

    const postContent = postResult.status === 'fulfilled'
      ? postResult.value?.answer?.replace(/\s*\[\d+(?:,\s*\d+)*\](\[\d+(?:,\s*\d+)*\])*/g, '').trim()
      : null;

    if (!postContent) {
      await interaction.editReply('❌ Impossible de générer le post. Réessayez plus tard.');
      return;
    }

    const media = mediaResult.status === 'fulfilled' ? mediaResult.value : null;
    if (mediaResult.status === 'rejected') {
      console.error('[commands] media generation failed:', mediaResult.reason?.message);
    }

    // Build response text
    let response = `🔨 **Devlog : ${periodeLabel}**\n`;
    response += `📊 *${totalCommits} commits sur ${repoCommits.length} repos*\n`;
    if (media?.type === 'slides' && media.slidesUrl) {
      response += `📊 [Voir les slides](${media.slidesUrl})\n`;
    }
    response += `\n${postContent}`;
    response += `\n\n---\n*Repos : ${repoCommits.map(r => r.repo).join(', ')}*`;

    // Store for LinkedIn publish button
    const threadId = `devlog_${Date.now()}`;
    pendingThreads.set(threadId, { content: postContent, sujet: `devlog ${periodeLabel}`, createdAt: Date.now(), media });

    const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = await import('discord.js');
    const buttons = [];

    if (linkedInAvailable) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(`linkedin_publish_${threadId}`)
          .setLabel(media?.type === 'infographic' ? '📤 Publier sur LinkedIn (avec image)' : '📤 Publier sur LinkedIn')
          .setStyle(ButtonStyle.Primary)
      );
    }

    const chunks = splitIntoChunks(response);

    // If we have an infographic, attach it to the first Discord message
    if (media?.type === 'infographic' && media.imageBuffer) {
      const { AttachmentBuilder } = await import('discord.js');
      const attachment = new AttachmentBuilder(media.imageBuffer, { name: 'infographie.png' });
      const replyOptions = { content: chunks[0], files: [attachment] };
      if (buttons.length > 0) {
        replyOptions.components = [new ActionRowBuilder().addComponents(...buttons)];
      }
      await interaction.editReply(replyOptions);
    } else {
      const replyOptions = { content: chunks[0] };
      if (buttons.length > 0) {
        replyOptions.components = [new ActionRowBuilder().addComponents(...buttons)];
      }
      await interaction.editReply(replyOptions);
    }

    for (let i = 1; i < chunks.length; i++) {
      await interaction.followUp(`*(suite ${i + 1}/${chunks.length})*\n\n${chunks[i]}`);
    }

    if (mediaResult.status === 'rejected') {
      await interaction.followUp(`⚠️ *La génération du média a échoué : ${mediaResult.reason?.message}. Le post texte est prêt.*`);
    }

  } catch (err) {
    console.error('[commands] /devlog error:', err.message);
    await interaction.editReply(`❌ Erreur: ${err.message}`);
  }
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


