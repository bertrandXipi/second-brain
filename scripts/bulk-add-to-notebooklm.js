#!/usr/bin/env node

/**
 * Script pour ajouter des URLs à NotebookLM en contournant les protections
 * 1. Fetch le contenu avec notre système (fetch simple)
 * 2. Ajoute le contenu comme texte dans NotebookLM
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fonction simplifiée de fetch (sans dépendances complexes)
async function fetchAndExtract(url) {
  console.log(`[fetch] ${url}`);
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
      const text = dom.window.document.body?.textContent || '';
      return {
        title: dom.window.document.title || url.split('/').pop(),
        content: text.slice(0, 50000),
      };
    }

    return {
      title: article.title,
      content: article.textContent,
    };
  } catch (error) {
    throw new Error(`Fetch failed: ${error.message}`);
  }
}

const NOTEBOOK_ID = '968a9497-9823-449e-9440-be8f02d454cf';
const URLS_FILE = path.join(__dirname, '..', 'urls.txt');
const BATCH_SIZE = 5; // Traiter 5 URLs à la fois
const DELAY_BETWEEN_BATCHES = 3000; // 3 secondes entre chaque batch

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function addTextToNotebook(notebookId, title, text) {
  console.log(`\n📝 Ajout de: ${title}`);
  console.log(`   Longueur: ${text.length} caractères`);
  
  // Cette fonction sera appelée via MCP dans Kiro
  // Pour l'instant, on génère les fichiers JSON pour traitement manuel
  return {
    notebookId,
    title,
    text: text.slice(0, 50000), // Limite NotebookLM
    command: 'mcp_notebooklm_notebook_add_text'
  };
}

async function processUrl(url, index, total) {
  console.log(`\n[${index}/${total}] 🔍 Traitement: ${url}`);
  
  try {
    // Fetch le contenu avec notre système qui contourne les protections
    const result = await fetchAndExtract(url);
    
    if (!result.content || result.content.length < 100) {
      console.log(`   ⚠️  Contenu trop court ou vide`);
      return null;
    }
    
    // Préparer le texte pour NotebookLM
    const title = result.title || url.split('/').pop() || 'Document';
    const text = `# ${title}\n\nSource: ${url}\n\n---\n\n${result.content}`;
    
    console.log(`   ✅ Contenu récupéré: ${result.content.length} caractères`);
    
    return {
      url,
      title,
      text,
      success: true
    };
    
  } catch (error) {
    console.log(`   ❌ Erreur: ${error.message}`);
    return {
      url,
      error: error.message,
      success: false
    };
  }
}

async function main() {
  console.log(`📚 Bulk Add to NotebookLM`);
  console.log(`   Notebook ID: ${NOTEBOOK_ID}`);
  console.log(`   URLs file: ${URLS_FILE}\n`);
  
  // Lire les URLs
  const content = fs.readFileSync(URLS_FILE, 'utf-8');
  const urls = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && line.startsWith('http'));
  
  console.log(`✅ ${urls.length} URLs trouvées\n`);
  
  const results = [];
  const outputDir = path.join(__dirname, '..', 'notebooklm-sources');
  
  // Créer le dossier de sortie
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Traiter par batch
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, Math.min(i + BATCH_SIZE, urls.length));
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(urls.length / BATCH_SIZE);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 BATCH ${batchNum}/${totalBatches} (${batch.length} URLs)`);
    console.log(`${'='.repeat(60)}`);
    
    // Traiter les URLs du batch en parallèle
    const batchPromises = batch.map((url, idx) => 
      processUrl(url, i + idx + 1, urls.length)
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Sauvegarder les résultats du batch
    const successfulResults = batchResults.filter(r => r && r.success);
    for (const result of successfulResults) {
      const filename = `source-${i + successfulResults.indexOf(result) + 1}.json`;
      const filepath = path.join(outputDir, filename);
      
      fs.writeFileSync(filepath, JSON.stringify({
        notebookId: NOTEBOOK_ID,
        title: result.title,
        text: result.text,
        sourceUrl: result.url,
        timestamp: new Date().toISOString()
      }, null, 2));
    }
    
    // Attendre entre les batches (sauf pour le dernier)
    if (i + BATCH_SIZE < urls.length) {
      console.log(`\n⏳ Pause de ${DELAY_BETWEEN_BATCHES}ms avant le prochain batch...`);
      await sleep(DELAY_BETWEEN_BATCHES);
    }
  }
  
  // Résumé
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 RÉSUMÉ`);
  console.log(`${'='.repeat(60)}`);
  
  const successful = results.filter(r => r && r.success).length;
  const failed = results.filter(r => r && !r.success).length;
  
  console.log(`✅ Succès: ${successful}/${urls.length}`);
  console.log(`❌ Échecs: ${failed}/${urls.length}`);
  
  if (failed > 0) {
    console.log(`\n❌ URLs en échec:`);
    results
      .filter(r => r && !r.success)
      .forEach(r => console.log(`   - ${r.url}: ${r.error}`));
  }
  
  console.log(`\n📁 Sources sauvegardées dans: ${outputDir}`);
  console.log(`\n⚠️  PROCHAINE ÉTAPE:`);
  console.log(`   Utilise le script d'import pour ajouter les sources à NotebookLM:`);
  console.log(`   node scripts/import-to-notebooklm.js`);
}

main().catch(console.error);
