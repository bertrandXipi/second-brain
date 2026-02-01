/**
 * Gère la sélection du notebook NotebookLM
 * Stockage simple en JSON
 */

import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, '..', 'notebook-config.json');

/**
 * Lire la config actuelle
 */
export async function getSelectedNotebook() {
  try {
    const content = await readFile(CONFIG_FILE, 'utf-8');
    const config = JSON.parse(content);
    console.log('[notebookSelector] loaded config:', config.selectedNotebookTitle);
    return config;
  } catch (err) {
    // Fichier n'existe pas ou erreur de parsing
    console.log('[notebookSelector] no config file found, using default behavior');
    return null;
  }
}

/**
 * Sauvegarder un nouveau choix
 */
export async function setSelectedNotebook(notebookId, title, url, userId) {
  const config = {
    selectedNotebookId: notebookId,
    selectedNotebookTitle: title,
    selectedNotebookUrl: url,
    lastUpdated: new Date().toISOString(),
    updatedBy: userId
  };
  
  try {
    await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    console.log(`[notebookSelector] notebook changed to: ${title}`);
    return config;
  } catch (err) {
    console.error('[notebookSelector] failed to save config:', err.message);
    throw err;
  }
}

/**
 * Récupérer l'ID du notebook à utiliser
 * Retourne l'ID sélectionné, ou null si aucun
 */
export async function getNotebookIdToUse() {
  const config = await getSelectedNotebook();
  return config?.selectedNotebookId || null;
}

/**
 * Réinitialiser la sélection (revenir au comportement par défaut)
 */
export async function resetNotebookSelection() {
  try {
    // Supprimer le fichier de config
    const fs = await import('fs');
    fs.promises.unlink(CONFIG_FILE).catch(() => {
      // Fichier n'existe pas, c'est ok
    });
    console.log('[notebookSelector] notebook selection reset');
    return true;
  } catch (err) {
    console.error('[notebookSelector] failed to reset:', err.message);
    throw err;
  }
}
