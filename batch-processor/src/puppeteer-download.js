/**
 * Download NotebookLM audio using Puppeteer with authenticated Chrome profile
 */

import puppeteer from 'puppeteer-core';
import { homedir } from 'os';
import path from 'path';
import { mkdir, writeFile, readFile, unlink } from 'fs/promises';

const CHROME_PATH = process.platform === 'darwin' 
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : '/usr/bin/google-chrome-stable';

const CHROME_PROFILE_PATH = path.join(homedir(), '.notebooklm-mcp', 'chrome-profile');
const DOWNLOAD_DIR = '/tmp/notebooklm-downloads';

/**
 * Download audio from NotebookLM using the authenticated Chrome profile
 * @param {string} notebookId - Notebook UUID
 * @param {string} artifactId - Audio artifact UUID
 * @returns {Promise<Buffer>} - Audio file buffer
 */
export async function downloadAudioWithPuppeteer(notebookId, artifactId) {
  console.log(`[puppeteer] downloading audio for artifact ${artifactId}...`);
  
  // Ensure download directory exists
  await mkdir(DOWNLOAD_DIR, { recursive: true });
  
  let browser = null;
  
  try {
    // Launch Chrome with the MCP profile
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      userDataDir: CHROME_PROFILE_PATH,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        `--download.default_directory=${DOWNLOAD_DIR}`
      ]
    });
    
    const page = await browser.newPage();
    
    // Set download behavior
    const client = await page.createCDPSession();
    await client.send('Page.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: DOWNLOAD_DIR
    });
    
    // Navigate to the notebook
    const notebookUrl = `https://notebooklm.google.com/notebook/${notebookId}`;
    console.log(`[puppeteer] navigating to ${notebookUrl}...`);
    
    await page.goto(notebookUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait for page to load
    await page.waitForTimeout(3000);
    
    // Check if we're logged in
    const pageContent = await page.content();
    if (pageContent.includes('Sign in') || pageContent.includes('accounts.google.com')) {
      throw new Error('Not logged in to Google - need to re-authenticate');
    }
    
    // Click on Studio tab to see audio overviews
    console.log('[puppeteer] clicking Studio tab...');
    const studioTab = await page.$('button[aria-label*="Studio"], [data-tab="studio"]');
    if (studioTab) {
      await studioTab.click();
      await page.waitForTimeout(2000);
    }
    
    // Find the audio artifact and click download
    // Look for download button near the artifact
    console.log('[puppeteer] looking for download button...');
    
    // Try to find download button by various selectors
    const downloadSelectors = [
      `button[aria-label*="Download"]`,
      `button[aria-label*="download"]`,
      `[data-artifact-id="${artifactId}"] button[aria-label*="Download"]`,
      `.audio-overview button[aria-label*="Download"]`,
      `mat-icon-button[aria-label*="Download"]`
    ];
    
    let downloadButton = null;
    for (const selector of downloadSelectors) {
      downloadButton = await page.$(selector);
      if (downloadButton) {
        console.log(`[puppeteer] found download button with selector: ${selector}`);
        break;
      }
    }
    
    if (!downloadButton) {
      // Take screenshot for debugging
      await page.screenshot({ path: '/tmp/notebooklm-debug.png', fullPage: true });
      console.log('[puppeteer] screenshot saved to /tmp/notebooklm-debug.png');
      throw new Error('Could not find download button');
    }
    
    // Click download
    console.log('[puppeteer] clicking download...');
    await downloadButton.click();
    
    // Wait for download to complete
    console.log('[puppeteer] waiting for download...');
    await page.waitForTimeout(10000);
    
    // Find the downloaded file
    const { readdir } = await import('fs/promises');
    const files = await readdir(DOWNLOAD_DIR);
    const audioFile = files.find(f => f.endsWith('.m4a') || f.endsWith('.mp3') || f.endsWith('.wav'));
    
    if (!audioFile) {
      throw new Error('Downloaded file not found');
    }
    
    const filePath = path.join(DOWNLOAD_DIR, audioFile);
    console.log(`[puppeteer] reading downloaded file: ${filePath}`);
    
    const buffer = await readFile(filePath);
    
    // Clean up
    await unlink(filePath);
    
    console.log(`[puppeteer] downloaded ${buffer.length} bytes`);
    return buffer;
    
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Alternative: Download by intercepting network requests
 */
export async function downloadAudioByIntercept(notebookId, audioUrl) {
  console.log(`[puppeteer] intercepting download for ${audioUrl.substring(0, 60)}...`);
  
  let browser = null;
  
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      userDataDir: CHROME_PROFILE_PATH,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    
    // First navigate to NotebookLM to establish session
    console.log('[puppeteer] establishing session...');
    await page.goto(`https://notebooklm.google.com/notebook/${notebookId}`, { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });
    
    // Now fetch the audio URL with the authenticated session
    console.log('[puppeteer] fetching audio...');
    const response = await page.evaluate(async (url) => {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const blob = await res.blob();
      const reader = new FileReader();
      return new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }, audioUrl);
    
    // Convert base64 to buffer
    const base64Data = response.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    
    console.log(`[puppeteer] downloaded ${buffer.length} bytes`);
    return buffer;
    
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
