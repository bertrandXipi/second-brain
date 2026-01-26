/**
 * Slash commands for the veille bot
 */

import { SlashCommandBuilder, REST, Routes } from 'discord.js';
import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { config } from './config.js';

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
 * Define slash commands
 */
export const commands = [
  new SlashCommandBuilder()
    .setName('last')
    .setDescription('Affiche le résumé de la dernière URL traitée'),
  
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Statistiques de la veille'),
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
      await interaction.editReply(reply);
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
    await interaction.editReply(reply);
    
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
  
  // Add summary if available
  if (item.summary) {
    reply += `\n**Résumé:**\n`;
    let summary = item.summary;
    // Truncate if too long for Discord (2000 char limit)
    if (summary.length > 1400) {
      summary = summary.slice(0, 1400) + '...\n\n*[Résumé tronqué]*';
    }
    reply += summary;
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
      let summary = summaryMatch[1].trim();
      // Truncate if too long for Discord (2000 char limit)
      if (summary.length > 1500) {
        summary = summary.slice(0, 1500) + '...\n\n*[Résumé tronqué]*';
      }
      reply += `**Résumé:**\n${summary}`;
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
    default:
      await interaction.reply('Commande inconnue');
  }
}
