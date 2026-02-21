#!/usr/bin/env node

/**
 * Scrape help.rise.ai avec Puppeteer - attend le challenge Cloudflare
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

async function waitForCloudflare(page, maxWait = 15000) {
  const start = Date.now();
  
  while (Date.now() - start < maxWait) {
    const content = await page.content();
    
    // Si on ne voit plus le challenge Cloudflare, c'est bon
    if (!content.includes('Just a moment') && 
        !content.includes('Checking your browser') &&
        !content.includes('cf-browser-verification') &&
        !content.includes('challenge-platform')) {
      return true;
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  return false;
}

async function scrapeUrl(browser, url) {
  const page = await browser.newPage();
  
  // User agent réaliste
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  try {
    console.log(`[scrape] ${url}`);
    
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Attendre que Cloudflare soit passé
    const passed = await waitForCloudflare(page, 20000);
    if (!passed) {
      console.log(`   ⚠️  Cloudflare timeout`);
      return null;
    }
    
    // Attendre le contenu
    await new Promise(r => setTimeout(r, 2000));
    
    // Extraire le contenu
    const content = await page.evaluate(() => {
      // Titre - chercher dans plusieurs endroits
      let title = '';
      const h1 = document.querySelector('article h1, .article-title, h1');
      if (h1) title = h1.textContent?.trim();
      if (!title) title = document.title.replace(' | Rise.ai Help Center', '').trim();
      
      // Contenu - chercher l'article Intercom
      let text = '';
      const articleBody = document.querySelector('.article__body, .intercom-article-body, article, [class*="article-content"]');
      
      if (articleBody) {
        const clone = articleBody.cloneNode(true);
        clone.querySelectorAll('script, style, nav, .article-footer, .article-header').forEach(el => el.remove());
        text = clone.innerText || clone.textContent || '';
      }
      
      // Nettoyer
      text = text.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
      
      return { title, text };
    });
    
    return content;
    
  } catch (error) {
    console.log(`   ❌ ${error.message}`);
    return null;
  } finally {
    await page.close();
  }
}

async function main() {
  console.log(`🔍 Scraping help.rise.ai avec Puppeteer (attend Cloudflare)\n`);
  
  // Nettoyer le dossier
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const content = fs.readFileSync(URLS_FILE, 'utf-8');
  const urls = content.split('\n').map(l => l.trim()).filter(l => l.startsWith('http'));
  
  console.log(`✅ ${urls.length} URLs\n`);
  
  // Lancer Chrome en mode visible pour passer Cloudflare
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: false, // Mode visible pour passer le challenge
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,800'
    ]
  });
  
  let success = 0;
  
  try {
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      console.log(`[${i + 1}/${urls.length}]`);
      
      const scraped = await scrapeUrl(browser, url);
      
      if (scraped && scraped.text && scraped.text.length > 200) {
        const filename = `${String(i + 1).padStart(3, '0')}.json`;
        fs.writeFileSync(
          path.join(OUTPUT_DIR, filename),
          JSON.stringify({
            notebook_id: NOTEBOOK_ID,
            title: scraped.title,
            text: `# ${scraped.title}\n\nSource: ${url}\n\n---\n\n${scraped.text}`,
            url
          }, null, 2)
        );
        success++;
        console.log(`   ✅ ${scraped.title.slice(0, 50)}... (${scraped.text.length} chars)`);
      } else {
        console.log(`   ❌ Contenu vide ou trop court`);
      }
      
      // Pause entre les requêtes
      await new Promise(r => setTimeout(r, 1000));
    }
  } finally {
    await browser.close();
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 ${success}/${urls.length} OK`);
  console.log(`📁 ${OUTPUT_DIR}`);
}

main().catch(console.error);
