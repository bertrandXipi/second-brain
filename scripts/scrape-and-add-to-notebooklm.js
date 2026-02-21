#!/usr/bin/env node

/**
 * Scrape help.rise.ai avec Puppeteer et ajouter comme texte dans NotebookLM
 */

import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const NOTEBOOK_ID = '968a9497-9823-449e-9440-be8f02d454cf';
const URLS_FILE = path.join(__dirname, '..', 'urls.txt');
const OUTPUT_DIR = path.join(__dirname, '..', 'rise-ai-content');

async function scrapeUrl(browser, url) {
  const page = await browser.newPage();
  
  try {
    console.log(`[scrape] ${url}`);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Extraire le contenu de l'article
    const content = await page.evaluate(() => {
      // Titre
      const titleEl = document.querySelector('h1, .article-title, [class*="title"]');
      const title = titleEl?.textContent?.trim() || document.title;
      
      // Contenu principal
      const articleEl = document.querySelector('article, .article-body, .content, main, [class*="article"]');
      let text = '';
      
      if (articleEl) {
        // Récupérer le texte propre
        const clone = articleEl.cloneNode(true);
        // Supprimer les scripts, styles, nav
        clone.querySelectorAll('script, style, nav, header, footer, .sidebar').forEach(el => el.remove());
        text = clone.textContent?.trim() || '';
      } else {
        // Fallback: tout le body
        text = document.body?.textContent?.trim() || '';
      }
      
      // Nettoyer le texte
      text = text
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n/g, '\n\n')
        .trim();
      
      return { title, text };
    });
    
    return content;
    
  } catch (error) {
    console.log(`[scrape] ERROR: ${error.message}`);
    return null;
  } finally {
    await page.close();
  }
}

async function main() {
  console.log(`🔍 Scraping help.rise.ai avec Puppeteer\n`);
  
  // Créer le dossier de sortie
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Lire les URLs
  const content = fs.readFileSync(URLS_FILE, 'utf-8');
  const urls = content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && line.startsWith('http'));
  
  console.log(`✅ ${urls.length} URLs à scraper\n`);
  
  // Lancer Chrome
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const results = [];
  
  try {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`[${i + 1}/${urls.length}]`);
      
      const scraped = await scrapeUrl(browser, url);
      
      if (scraped && scraped.text && scraped.text.length > 100) {
        results.push({
          url,
          title: scraped.title,
          text: scraped.text,
          success: true
        });
        
        // Sauvegarder le contenu
        const filename = `${i + 1}-${url.split('/').pop().slice(0, 50)}.json`;
        fs.writeFileSync(
          path.join(OUTPUT_DIR, filename),
          JSON.stringify({
            notebook_id: NOTEBOOK_ID,
            title: scraped.title,
            text: `# ${scraped.title}\n\nSource: ${url}\n\n---\n\n${scraped.text}`,
            url
          }, null, 2)
        );
        
        console.log(`   ✅ ${scraped.title.slice(0, 50)}... (${scraped.text.length} chars)`);
      } else {
        results.push({ url, success: false });
        console.log(`   ❌ Contenu vide ou trop court`);
      }
      
      // Pause entre les requêtes
      await new Promise(r => setTimeout(r, 1000));
    }
  } finally {
    await browser.close();
  }
  
  // Résumé
  const success = results.filter(r => r.success).length;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 RÉSUMÉ: ${success}/${urls.length} URLs scrapées avec succès`);
  console.log(`📁 Contenu sauvegardé dans: ${OUTPUT_DIR}`);
  console.log(`\n⚠️  PROCHAINE ÉTAPE: Ajouter le contenu à NotebookLM comme texte`);
}

main().catch(console.error);
