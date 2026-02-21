/**
 * LinkedIn API client
 * Handles OAuth2 token management and post publishing
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const TOKEN_FILE = path.join(process.cwd(), '.linkedin-tokens.json');

let tokens = null;

/**
 * Load tokens from disk
 */
async function loadTokens() {
  if (tokens) return tokens;
  
  if (!existsSync(TOKEN_FILE)) {
    console.log('[linkedin] no tokens file found');
    return null;
  }
  
  try {
    const data = await readFile(TOKEN_FILE, 'utf-8');
    tokens = JSON.parse(data);
    console.log('[linkedin] tokens loaded');
    return tokens;
  } catch (err) {
    console.error('[linkedin] failed to load tokens:', err.message);
    return null;
  }
}

/**
 * Save tokens to disk
 */
async function saveTokens(newTokens) {
  tokens = { ...tokens, ...newTokens, updated_at: new Date().toISOString() };
  await writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2));
  console.log('[linkedin] tokens saved');
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken() {
  const t = await loadTokens();
  if (!t || !t.refresh_token) {
    throw new Error('No refresh token available. Run the auth script first.');
  }
  
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    throw new Error('LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET must be set');
  }
  
  const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: t.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    })
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token refresh failed: ${response.status} - ${text}`);
  }
  
  const data = await response.json();
  
  await saveTokens({
    access_token: data.access_token,
    expires_in: data.expires_in,
    refresh_token: data.refresh_token || t.refresh_token,
  });
  
  console.log('[linkedin] token refreshed');
  return data.access_token;
}

/**
 * Get a valid access token (refresh if needed)
 */
async function getAccessToken() {
  const t = await loadTokens();
  
  if (!t || !t.access_token) {
    throw new Error('No LinkedIn tokens. Run: node scripts/linkedin-auth.js');
  }
  
  // Check if token is expired (with 5 min buffer)
  if (t.updated_at && t.expires_in) {
    const expiresAt = new Date(t.updated_at).getTime() + (t.expires_in * 1000) - 300000;
    if (Date.now() > expiresAt) {
      console.log('[linkedin] token expired, refreshing...');
      return await refreshAccessToken();
    }
  }
  
  return t.access_token;
}

/**
 * Get LinkedIn user profile (to get the person URN)
 */
async function getProfile() {
  const accessToken = await getAccessToken();
  
  const response = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      // Try refresh
      const newToken = await refreshAccessToken();
      const retry = await fetch('https://api.linkedin.com/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${newToken}` }
      });
      if (!retry.ok) throw new Error(`LinkedIn profile failed: ${retry.status}`);
      return await retry.json();
    }
    throw new Error(`LinkedIn profile failed: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Publish a text post on LinkedIn
 * @param {string} text - Post content
 * @returns {object} - { success, postId, postUrl }
 */
export async function publishToLinkedIn(text) {
  console.log('[linkedin] publishing post...');
  
  const accessToken = await getAccessToken();
  
  // Get user sub (person URN)
  const profile = await getProfile();
  const personUrn = `urn:li:person:${profile.sub}`;
  
  console.log(`[linkedin] posting as: ${profile.name} (${personUrn})`);
  
  const postBody = {
    author: personUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: 'NONE'
      }
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
    }
  };
  
  const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(postBody)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    
    // If 401, try refresh and retry once
    if (response.status === 401) {
      console.log('[linkedin] 401, refreshing token and retrying...');
      const newToken = await refreshAccessToken();
      
      const retry = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${newToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(postBody)
      });
      
      if (!retry.ok) {
        const retryError = await retry.text();
        throw new Error(`LinkedIn publish failed after refresh: ${retry.status} - ${retryError}`);
      }
      
      const postId = retry.headers.get('x-restli-id') || 'unknown';
      return { success: true, postId, postUrl: `https://www.linkedin.com/feed/update/${postId}` };
    }
    
    throw new Error(`LinkedIn publish failed: ${response.status} - ${errorText}`);
  }
  
  const postId = response.headers.get('x-restli-id') || 'unknown';
  console.log(`[linkedin] published: ${postId}`);
  
  return {
    success: true,
    postId,
    postUrl: `https://www.linkedin.com/feed/update/${postId}`
  };
}

/**
 * Upload an image to LinkedIn Assets API
 * @param {Buffer} imageBuffer
 * @param {string} contentType - e.g. 'image/png'
 * @returns {string} asset URN
 */
export async function uploadImage(imageBuffer, contentType = 'image/png') {
  console.log('[linkedin] uploading image...');
  const accessToken = await getAccessToken();
  const profile = await getProfile();
  const personUrn = `urn:li:person:${profile.sub}`;

  // Step 1: Register upload
  const registerRes = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: personUrn,
        serviceRelationships: [{
          relationshipType: 'OWNER',
          identifier: 'urn:li:userGeneratedContent',
        }],
      },
    }),
  });

  if (!registerRes.ok) {
    const err = await registerRes.text();
    throw new Error(`LinkedIn register upload failed: ${registerRes.status} - ${err}`);
  }

  const registerData = await registerRes.json();
  const uploadUrl = registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  const assetUrn = registerData.value.asset;

  console.log(`[linkedin] upload URL obtained, asset: ${assetUrn}`);

  // Step 2: Upload binary
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': contentType,
    },
    body: imageBuffer,
  });

  if (!uploadRes.ok && uploadRes.status !== 201) {
    throw new Error(`LinkedIn image upload failed: ${uploadRes.status}`);
  }

  console.log('[linkedin] image uploaded successfully');
  return assetUrn;
}

/**
 * Publish a post with an image on LinkedIn
 * @param {string} text - Post content
 * @param {string} assetUrn - LinkedIn asset URN from uploadImage()
 * @returns {{ success, postId, postUrl }}
 */
export async function publishWithImage(text, assetUrn) {
  console.log('[linkedin] publishing post with image...');
  const accessToken = await getAccessToken();
  const profile = await getProfile();
  const personUrn = `urn:li:person:${profile.sub}`;

  const postBody = {
    author: personUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: 'IMAGE',
        media: [{
          status: 'READY',
          media: assetUrn,
        }],
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(postBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 401) {
      const newToken = await refreshAccessToken();
      const retry = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${newToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(postBody),
      });
      if (!retry.ok) throw new Error(`LinkedIn publish failed: ${retry.status}`);
      const postId = retry.headers.get('x-restli-id') || 'unknown';
      return { success: true, postId, postUrl: `https://www.linkedin.com/feed/update/${postId}` };
    }
    throw new Error(`LinkedIn publish with image failed: ${response.status} - ${errorText}`);
  }

  const postId = response.headers.get('x-restli-id') || 'unknown';
  console.log(`[linkedin] published with image: ${postId}`);
  return { success: true, postId, postUrl: `https://www.linkedin.com/feed/update/${postId}` };
}

/**
 * Check if LinkedIn is configured and tokens exist
 */
export async function isLinkedInConfigured() {
  if (!process.env.LINKEDIN_CLIENT_ID || !process.env.LINKEDIN_CLIENT_SECRET) {
    return false;
  }
  const t = await loadTokens();
  return !!(t && t.access_token);
}
