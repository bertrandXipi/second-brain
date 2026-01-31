#!/usr/bin/env node
/**
 * Test Puppeteer audio download from NotebookLM
 */

import puppeteer from 'puppeteer-core';
import { homedir } from 'os';
import path from 'path';
import { mkdir, writeFile } from 'fs/promises';

const CHROME_PATH = process.platform === 'darwin' 
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  : '/usr/bin/google-chrome-stable';

const CHROME_PROFILE_PATH = path.join(homedir(), '.notebooklm-mcp', 'chrome-profile');

// Test with the latest podcast
const NOTEBOOK_ID = 'c4dba600-dd91-4027-ba33-8ad93f971a31';
const AUDIO_URL = 'https://lh3.googleusercontent.com/notebooklm/ANHLwAyEpGJB93GdTfu7-mF9yT7u7Xly5FfQWleXE5-sli-qUJsIi8wi87QB-SjndaDKeOz2Vt4GBNHXn5wvqeUdHdBu90y80Dfj0ZJONeUOdCEB8FrLzPCRyommyylBIuF9nEgaJy4vyh9s3IPlqqKjUMQfcu6PIw=m140-dv';

async function testDownload() {
  console.log('Testing Puppeteer audio download...');
  console.log(`Chrome path: ${CHROME_PATH}`);
  console.log(`Profile path: ${CHROME_PROFILE_PATH}`);
  
  let browser = null;
  
  try {
    console.log('\nLaunching Chrome...');
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
    const notebookUrl = `https://notebooklm.google.com/notebook/${NOTEBOOK_ID}`;
    console.log(`\nNavigating to ${notebookUrl}...`);
    await page.goto(notebookUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Check if logged in
    const pageContent = await page.content();
    if (pageContent.includes('Sign in') || pageContent.includes('accounts.google.com/v3/signin')) {
      console.log('❌ Not logged in - need to re-authenticate');
      await page.screenshot({ path: '/tmp/notebooklm-login.png' });
      console.log('Screenshot saved to /tmp/notebooklm-login.png');
      return;
    }
    
    console.log('✅ Logged in to NotebookLM');
    
    // Now fetch the audio URL with authenticated session
    console.log(`\nFetching audio from: ${AUDIO_URL.substring(0, 60)}...`);
    
    const audioData = await page.evaluate(async (url) => {
      try {
        const res = await fetch(url, { credentials: 'include' });
        console.log('Fetch status:', res.status);
        if (!res.ok) {
          return { error: `Fetch failed: ${res.status} ${res.statusText}` };
        }
        const blob = await res.blob();
        const reader = new FileReader();
        return new Promise((resolve, reject) => {
          reader.onload = () => resolve({ 
            data: reader.result,
            type: blob.type,
            size: blob.size
          });
          reader.onerror = () => reject(new Error('FileReader error'));
          reader.readAsDataURL(blob);
        });
      } catch (err) {
        return { error: err.message };
      }
    }, AUDIO_URL);
    
    if (audioData.error) {
      console.log(`❌ Error: ${audioData.error}`);
      return;
    }
    
    console.log(`Content-Type: ${audioData.type}`);
    console.log(`Size: ${audioData.size} bytes`);
    
    // Convert base64 to buffer
    const base64Data = audioData.data.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    
    console.log(`Buffer size: ${buffer.length} bytes`);
    
    // Save to file
    const outputPath = '/tmp/test-podcast-puppeteer.m4a';
    await writeFile(outputPath, buffer);
    console.log(`\n✅ Saved to ${outputPath}`);
    
    // Verify it's audio
    const { execSync } = await import('child_process');
    try {
      const fileType = execSync(`file ${outputPath}`).toString();
      console.log(`File type: ${fileType}`);
    } catch (e) {
      console.log('Could not determine file type');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

testDownload();
