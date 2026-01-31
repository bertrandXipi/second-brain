#!/usr/bin/env node
/**
 * Test downloading NotebookLM audio with authenticated cookies
 */

import { readFile, writeFile } from 'fs/promises';
import { homedir } from 'os';
import path from 'path';

// Latest podcast audio URL from studio_status
const AUDIO_URL = 'https://lh3.googleusercontent.com/notebooklm/ANHLwAyEpGJB93GdTfu7-mF9yT7u7Xly5FfQWleXE5-sli-qUJsIi8wi87QB-SjndaDKeOz2Vt4GBNHXn5wvqeUdHdBu90y80Dfj0ZJONeUOdCEB8FrLzPCRyommyylBIuF9nEgaJy4vyh9s3IPlqqKjUMQfcu6PIw=m140-dv';

async function loadAuthCookies() {
  const authPath = path.join(homedir(), '.notebooklm-mcp', 'auth.json');
  const content = await readFile(authPath, 'utf-8');
  const auth = JSON.parse(content);
  return auth.cookies || {};
}

function buildCookieHeader(cookies) {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

async function testDownload() {
  console.log('Loading auth cookies...');
  const cookies = await loadAuthCookies();
  console.log(`Found ${Object.keys(cookies).length} cookies`);
  
  const cookieHeader = buildCookieHeader(cookies);
  
  console.log('\n--- Test 1: Download WITH cookies ---');
  try {
    const response = await fetch(AUDIO_URL, {
      redirect: 'follow',
      headers: {
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    console.log(`Status: ${response.status}`);
    console.log(`Content-Type: ${response.headers.get('content-type')}`);
    console.log(`Content-Length: ${response.headers.get('content-length')}`);
    
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      console.log(`Downloaded: ${buffer.length} bytes`);
      
      // Check if it's audio or error page
      if (buffer.length > 10000) {
        await writeFile('/tmp/test-podcast-with-cookies.m4a', buffer);
        console.log('✅ Saved to /tmp/test-podcast-with-cookies.m4a');
      } else {
        console.log('⚠️ File too small, might be error page:');
        console.log(buffer.toString('utf-8').substring(0, 500));
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  console.log('\n--- Test 2: Download WITHOUT cookies ---');
  try {
    const response = await fetch(AUDIO_URL, {
      redirect: 'follow'
    });
    
    console.log(`Status: ${response.status}`);
    console.log(`Content-Type: ${response.headers.get('content-type')}`);
    
    if (response.ok) {
      const buffer = Buffer.from(await response.arrayBuffer());
      console.log(`Downloaded: ${buffer.length} bytes`);
      
      if (buffer.length > 10000) {
        await writeFile('/tmp/test-podcast-no-cookies.m4a', buffer);
        console.log('✅ Saved to /tmp/test-podcast-no-cookies.m4a');
      } else {
        console.log('⚠️ File too small:');
        console.log(buffer.toString('utf-8').substring(0, 500));
      }
    }
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testDownload().catch(console.error);
