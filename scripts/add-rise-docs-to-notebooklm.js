#!/usr/bin/env node

/**
 * Script simple pour générer les commandes d'ajout à NotebookLM
 * Les URLs seront ajoutées directement (NotebookLM fera le fetch)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NOTEBOOK_ID = '968a9497-9823-449e-9440-be8f02d454cf';
const URLS_FILE = path.join(__dirname, '..', 'urls.txt');

async function main() {
  console.log(`📚 Add Rise.ai Docs to NotebookLM`);
  console.log(`   Notebook: https://notebooklm.google.com/notebook/${NOTEBOOK_ID}\n`);
  
  // Lire les URLs
  const content = fs.readFileSync(URLS_FILE, 'utf-8');
  const urls = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && line.startsWith('http'));
  
  console.log(`✅ ${urls.length} URLs trouvées\n`);
  
  // Générer les commandes MCP
  const commands = urls.map((url, i) => ({
    index: i + 1,
    tool: 'mcp_notebooklm_notebook_add_url',
    notebook_id: NOTEBOOK_ID,
    url: url
  }));
  
  // Sauvegarder
  const outputFile = path.join(__dirname, '..', 'notebooklm-add-urls.json');
  fs.writeFileSync(outputFile, JSON.stringify(commands, null, 2));
  
  console.log(`📝 Commandes sauvegardées: ${outputFile}`);
  console.log(`\n📊 Total: ${commands.length} URLs à ajouter`);
  console.log(`\n💡 Ces URLs seront ajoutées via Kiro avec les MCP tools NotebookLM`);
  console.log(`   Notebook ID: ${NOTEBOOK_ID}`);
}

main().catch(console.error);
