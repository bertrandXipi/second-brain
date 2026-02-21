#!/usr/bin/env node

/**
 * Script pour ajouter toutes les URLs d'un fichier à un notebook NotebookLM
 * Usage: node scripts/add-urls-to-notebook.js <notebook-id> <urls-file>
 */

const fs = require('fs');
const path = require('path');

// Simuler les appels MCP NotebookLM
async function addUrlToNotebook(notebookId, url) {
  console.log(`📎 Ajout de: ${url}`);
  
  // Cette fonction sera appelée via MCP dans Kiro
  // Pour l'instant, on affiche juste les commandes à exécuter
  return {
    notebookId,
    url,
    command: `mcp_notebooklm_notebook_add_url`,
    params: { notebook_id: notebookId, url }
  };
}

async function main() {
  const notebookId = process.argv[2] || '968a9497-9823-449e-9440-be8f02d454cf';
  const urlsFile = process.argv[3] || 'urls.txt';
  
  console.log(`📚 Notebook ID: ${notebookId}`);
  console.log(`📄 Fichier URLs: ${urlsFile}\n`);
  
  // Lire le fichier
  const content = fs.readFileSync(urlsFile, 'utf-8');
  const urls = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && line.startsWith('http'));
  
  console.log(`✅ ${urls.length} URLs trouvées\n`);
  
  // Afficher les URLs à ajouter
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`[${i + 1}/${urls.length}] ${url}`);
  }
  
  console.log(`\n⚠️  Pour ajouter ces URLs, utilise les commandes MCP dans Kiro`);
  console.log(`Notebook: https://notebooklm.google.com/notebook/${notebookId}`);
}

main().catch(console.error);
