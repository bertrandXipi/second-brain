#!/usr/bin/env node
/**
 * LinkedIn OAuth2 Authentication Script
 * 
 * Run this once to get your access token:
 *   node scripts/linkedin-auth.js
 * 
 * It starts a local server, opens the LinkedIn auth page,
 * and saves the tokens to discord-ingest-bot/.linkedin-tokens.json
 */

import 'dotenv/config';
import http from 'http';
import { writeFile } from 'fs/promises';
import { execSync } from 'child_process';
import path from 'path';

const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID;
const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET;
const REDIRECT_PORT = 3456;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const TOKEN_FILE = path.join(process.cwd(), 'discord-ingest-bot', '.linkedin-tokens.json');

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in discord-ingest-bot/.env');
  process.exit(1);
}

const SCOPES = ['openid', 'profile', 'w_member_social'].join(' ');

const authUrl = `https://www.linkedin.com/oauth/v2/authorization?` +
  `response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&scope=${encodeURIComponent(SCOPES)}&state=veille-bot-auth`;

console.log('\n🔗 LinkedIn OAuth2 Authentication\n');
console.log('Opening browser...\n');

// Open browser
try {
  execSync(`open "${authUrl}"`);
} catch {
  console.log(`Open this URL manually:\n${authUrl}\n`);
}

// Start local server to catch the callback
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);
  
  if (url.pathname !== '/callback') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  
  if (error) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<h1>❌ Error: ${error}</h1><p>${url.searchParams.get('error_description')}</p>`);
    server.close();
    process.exit(1);
  }
  
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html' });
    res.end('<h1>❌ No authorization code received</h1>');
    return;
  }
  
  console.log('✅ Authorization code received, exchanging for token...');
  
  try {
    // Exchange code for token
    const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      })
    });
    
    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${tokenResponse.status} - ${errText}`);
    }
    
    const tokenData = await tokenResponse.json();
    
    // Save tokens
    const tokens = {
      access_token: tokenData.access_token,
      expires_in: tokenData.expires_in,
      refresh_token: tokenData.refresh_token || null,
      scope: tokenData.scope,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    
    await writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2));
    
    console.log(`\n✅ Tokens saved to ${TOKEN_FILE}`);
    console.log(`   Access token expires in: ${Math.round(tokenData.expires_in / 86400)} days`);
    if (tokenData.refresh_token) {
      console.log('   Refresh token: ✅ available');
    }
    
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>✅ Authentification LinkedIn réussie !</h1><p>Tu peux fermer cette page.</p>');
    
  } catch (err) {
    console.error('❌', err.message);
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`<h1>❌ Error</h1><p>${err.message}</p>`);
  }
  
  server.close();
  setTimeout(() => process.exit(0), 1000);
});

server.listen(REDIRECT_PORT, () => {
  console.log(`⏳ Waiting for LinkedIn callback on http://localhost:${REDIRECT_PORT}/callback ...\n`);
});
