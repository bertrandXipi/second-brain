#!/usr/bin/env node

/**
 * Script pour importer les sources préparées dans NotebookLM
 * À exécuter APRÈS bulk-add-to-notebooklm.js
 * 
 * Ce script génère les commandes MCP à exécuter dans Kiro
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCES_DIR = path.join(__dirname, '..', 'notebooklm-sources');

async function main() {
  console.log(`📥 Import to NotebookLM\n`);
  
  if (!fs.existsSync(SOURCES_DIR)) {
    console.log(`❌ Dossier ${SOURCES_DIR} introuvable`);
    console.log(`   Exécute d'abord: node scripts/bulk-add-to-notebooklm.js`);
    return;
  }
  
  const files = fs.readdirSync(SOURCES_DIR)
    .filter(f => f.endsWith('.json'))
    .sort();
  
  if (files.length === 0) {
    console.log(`❌ Aucune source trouvée dans ${SOURCES_DIR}`);
    return;
  }
  
  console.log(`✅ ${files.length} sources à importer\n`);
  
  // Générer le script de commandes MCP
  const commands = [];
  
  for (const file of files) {
    const filepath = path.join(SOURCES_DIR, file);
    const source = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    
    commands.push({
      tool: 'mcp_notebooklm_notebook_add_text',
      params: {
        notebook_id: source.notebookId,
        title: source.title,
        text: source.text
      },
      sourceFile: file,
      sourceUrl: source.sourceUrl
    });
  }
  
  // Sauvegarder les commandes
  const commandsFile = path.join(__dirname, '..', 'notebooklm-import-commands.json');
  fs.writeFileSync(commandsFile, JSON.stringify(commands, null, 2));
  
  console.log(`📝 Commandes générées: ${commandsFile}\n`);
  console.log(`⚠️  INSTRUCTIONS POUR KIRO:\n`);
  console.log(`1. Ouvre Kiro`);
  console.log(`2. Exécute les commandes MCP suivantes:\n`);
  
  // Afficher les 3 premières commandes comme exemple
  console.log(`Exemple (3 premières sources):\n`);
  for (let i = 0; i < Math.min(3, commands.length); i++) {
    const cmd = commands[i];
    console.log(`// Source ${i + 1}: ${cmd.sourceUrl}`);
    console.log(`mcp_notebooklm_notebook_add_text({`);
    console.log(`  notebook_id: "${cmd.params.notebook_id}",`);
    console.log(`  title: "${cmd.params.title}",`);
    console.log(`  text: "..." // ${cmd.params.text.length} caractères`);
    console.log(`})\n`);
  }
  
  console.log(`... et ${commands.length - 3} autres sources\n`);
  console.log(`📊 Total: ${commands.length} sources à importer`);
  console.log(`\n💡 TIP: Tu peux aussi utiliser un script pour automatiser l'import via MCP`);
}

main().catch(console.error);
