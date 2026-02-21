#!/usr/bin/env node

/**
 * Scrape help.rise.ai via Jina.ai Reader (contourne Cloudflare)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NOTEBOOK_ID = '968a9497-9823-449e-9440-be8f02d454cf';
const URLS_FILE = path.join(__dirname, '..', 'urls.txt');
const OUTPUT_DIR = path.join(__dirname, '..', 'rise-ai-content');

async function scrapeWithJina(url) {
  const jinaUrl = `https://r.jina.ai/${url}`;
  
  try {
    const response = await fetch(jinaUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(30000)
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const text = await response.text();
    
    // Extraire le titre
    const titleMatch = text.match(/^Title:\s*(.+?)$/m);
    const title = titleMatch ? titleMatch[1].trim() : url.split('/').pop();
    
    // Extraire le contenu markdown
    const contentMatch = text.match(/Markdown Content:\s*([\s\S]+)/);
    const content = contentMatch ? contentMatch[1].trim() : text;
    
    return { title, content };
    
  } catch (error) {
    throw new Error(`Jina failed: ${error.message}`);
  }
}

async function main() {
  console.log(`🔍 Scraping via Jina.ai Reader\n`);
  
  // Nettoyer le dossier
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  // Lire les URLs
  const content = fs.readFileSync(URLS_FILE, 'utf-8');
  const urls = content.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
  
  console.log(`✅ ${urls.length} URLs\n`);
  
  let success = 0;
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`[${i + 1}/${urls.length}] ${url.slice(0, 60)}...`);
    
    try {
      const scraped = await scrapeWithJina(url);
      
      if (scraped.content && scraped.content.length > 100) {
        const filename = `${String(i + 1).padStart(3, '0')}.json`;
        fs.writeFileSync(
          path.join(OUTPUT_DIR, filename),
          JSON.stringify({
            notebook_id: NOTEBOOK_ID,
            title: scraped.title,
            text: `# ${scraped.title}\n\nSource: ${url}\n\n---\n\n${scraped.content}`,
            url
          }, null, 2)
        );
        success++;
        console.log(`   ✅ ${scraped.title.slice(0, 50)}... (${scraped.content.length} chars)`);
      } else {
        console.log(`   ❌ Contenu vide`);
      }
    } catch (error) {
      console.log(`   ❌ ${error.message}`);
    }
    
    // Pause pour éviter le rate limiting
    await new Promise(r => setTimeout(r, 1500));
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 ${success}/${urls.length} OK`);
  console.log(`📁 ${OUTPUT_DIR}`);
}

main().catch(console.error);
