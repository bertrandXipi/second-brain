/**
 * NotebookLM HTTP Client
 * Calls NotebookLM MCP server via HTTP transport with SSE
 * Handles session management properly
 */

const MCP_SERVER_URL = process.env.NOTEBOOKLM_MCP_URL || 'http://127.0.0.1:8000/mcp';

let sessionId = null;

/**
 * Parse SSE response and extract data
 */
function parseSSEResponse(text) {
  const lines = text.split('\n');
  const results = [];
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6));
        results.push(data);
      } catch (e) {
        // Skip invalid JSON
      }
    }
  }
  
  return results;
}

/**
 * Initialize MCP session
 */
async function initSession() {
  if (sessionId) return sessionId;
  
  console.log(`[notebooklm-http] initializing session with: ${MCP_SERVER_URL}`);
  
  const response = await fetch(MCP_SERVER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'veille-bot',
          version: '1.0.0'
        }
      }
    })
  });

  // Extract session ID from response header
  const mcpSessionId = response.headers.get('mcp-session-id');
  if (mcpSessionId) {
    sessionId = mcpSessionId;
    console.log(`[notebooklm-http] session ID from header: ${sessionId}`);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Init failed: ${response.status} - ${text}`);
  }

  const text = await response.text();
  const results = parseSSEResponse(text);
  
  for (const data of results) {
    if (data.result && data.result.sessionId) {
      sessionId = data.result.sessionId;
      console.log(`[notebooklm-http] session ID from body: ${sessionId}`);
    }
  }
  
  if (!sessionId) {
    sessionId = 'default';
  }
  
  console.log(`[notebooklm-http] session initialized: ${sessionId}`);
  return sessionId;
}

/**
 * Call MCP tool via HTTP
 */
async function callMCPTool(toolName, args) {
  await initSession();
  
  console.log(`[notebooklm-http] calling tool: ${toolName}`);
  
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  
  // Add session ID header if we have one
  if (sessionId && sessionId !== 'default') {
    headers['mcp-session-id'] = sessionId;
  }
  
  const response = await fetch(MCP_SERVER_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MCP HTTP error: ${response.status} - ${text}`);
  }

  const text = await response.text();
  const results = parseSSEResponse(text);
  
  for (const data of results) {
    if (data.error) {
      throw new Error(`MCP error: ${data.error.message}`);
    }
    if (data.result) {
      // Parse content
      if (data.result.content && data.result.content.length > 0) {
        const textContent = data.result.content.find(c => c.type === 'text');
        if (textContent) {
          try {
            return JSON.parse(textContent.text);
          } catch {
            return { text: textContent.text };
          }
        }
      }
      return data.result;
    }
  }
  
  throw new Error('No valid response from MCP server');
}

/**
 * List all notebooks
 */
export async function listNotebooks(maxResults = 100) {
  console.log('[notebooklm-http] listing notebooks...');
  
  const listResult = await callMCPTool('notebook_list', { max_results: maxResults });
  
  if (listResult.status === 'success') {
    console.log(`[notebooklm-http] found ${listResult.notebooks.length} notebooks`);
    return listResult.notebooks;
  }
  
  throw new Error('Failed to list notebooks');
}

/**
 * Get or create monthly notebook
 * Priority:
 * 1. User-selected notebook (via /choice_notebook)
 * 2. Special case: February 2026 uses existing notebook
 * 3. Default: Create/use monthly notebook
 */
export async function getOrCreateMonthlyNotebook() {
  console.log('[notebooklm-http] getting or creating monthly notebook...');
  
  // 1. Check if user has selected a notebook
  try {
    const { getNotebookIdToUse } = await import('../../discord-ingest-bot/src/notebookSelector.js');
    const selectedId = await getNotebookIdToUse();
    
    if (selectedId) {
      console.log(`[notebooklm-http] using user-selected notebook: ${selectedId}`);
      return selectedId;
    }
  } catch (err) {
    console.log('[notebooklm-http] notebookSelector not available:', err.message);
  }
  
  const now = new Date();
  const month = now.getMonth(); // 0-indexed (0 = January, 1 = February)
  const year = now.getFullYear();
  
  // 2. Special case: February 2026 - use existing notebook
  if (year === 2026 && month === 1) {
    const feb2026NotebookId = '5ac37432-e593-4bb7-b761-a4301800efc4';
    console.log(`[notebooklm-http] February 2026 - using existing notebook: ${feb2026NotebookId}`);
    return feb2026NotebookId;
  }
  
  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const monthName = monthNames[month];
  const notebookTitle = `Veille Tech - ${monthName} ${year}`;
  
  console.log(`[notebooklm-http] looking for notebook: "${notebookTitle}"`);
  
  // List notebooks
  const listResult = await callMCPTool('notebook_list', { max_results: 200 });
  
  if (listResult.status === 'success') {
    const existingNotebook = listResult.notebooks.find(nb => nb.title === notebookTitle);
    
    if (existingNotebook) {
      console.log(`[notebooklm-http] found existing notebook: ${existingNotebook.id}`);
      return existingNotebook.id;
    }
  }
  
  // Create new notebook
  console.log(`[notebooklm-http] creating new notebook: "${notebookTitle}"`);
  const createResult = await callMCPTool('notebook_create', { title: notebookTitle });
  
  if (createResult.status === 'success') {
    console.log(`[notebooklm-http] created notebook: ${createResult.notebook.id}`);
    return createResult.notebook.id;
  }
  
  throw new Error('Failed to create notebook');
}

/**
 * Check if URL is Twitter/X.com
 */
function isTwitterUrl(url) {
  return url.includes('twitter.com') || url.includes('x.com');
}

/**
 * Add URL to NotebookLM
 * For Twitter/X.com: directly fetch content and add as text (NotebookLM cannot access Twitter)
 * For other URLs: try URL first, fallback to text if it fails (e.g., LinkedIn)
 */
export async function addToNotebookLM(url, content, metadata = {}) {
  console.log(`[notebooklm-http] adding source: ${url}`);

  // Twitter/X.com: ALWAYS use text mode (NotebookLM is blocked by Twitter)
  if (isTwitterUrl(url)) {
    console.log(`[notebooklm-http] Twitter detected - using direct text mode (NotebookLM cannot access Twitter)`);
    return await addAsText(url, metadata);
  }

  try {
    // Get or create monthly notebook
    const notebookId = await getOrCreateMonthlyNotebook();
    
    // Try to add URL as source
    const result = await callMCPTool('notebook_add_url', {
      notebook_id: notebookId,
      url: url
    });
    
    if (result.status === 'success') {
      console.log(`[notebooklm-http] source added: ${result.source.id}`);
      
      return {
        notebook_id: notebookId,
        source_id: result.source.id,
        title: result.source.title || metadata.title || 'Untitled',
        url: url,
        notebook_url: `https://notebooklm.google.com/notebook/${notebookId}`,
        source_url: result.source.url || `https://notebooklm.google.com/notebook/${notebookId}`,
        tags: metadata.tags || []
      };
    }
    
    throw new Error(`Failed to add source: ${result.error || 'Unknown error'}`);

  } catch (urlError) {
    console.log(`[notebooklm-http] URL add failed, trying text fallback: ${urlError.message}`);
    return await addAsText(url, metadata);
  }
}

/**
 * Add content as text to NotebookLM (fetch content ourselves)
 */
async function addAsText(url, metadata = {}) {
  try {
    const { fetchAndExtract } = await import('./fetch-content.js');
    const { title, content: fetchedContent } = await fetchAndExtract(url);
    
    console.log(`[notebooklm-http] fetched content (${fetchedContent.length} chars), adding as text...`);
    
    const notebookId = await getOrCreateMonthlyNotebook();
    const textResult = await callMCPTool('notebook_add_text', {
      notebook_id: notebookId,
      text: fetchedContent,
      title: title || metadata.title || 'Sans titre',
    });

    if (textResult.status === 'success') {
      console.log(`[notebooklm-http] text source added: ${textResult.source.id}`);

      return {
        notebook_id: notebookId,
        source_id: textResult.source.id,
        title: title || metadata.title || 'Sans titre',
        url: url,
        notebook_url: `https://notebooklm.google.com/notebook/${notebookId}`,
        source_url: `https://notebooklm.google.com/notebook/${notebookId}`,
        tags: metadata.tags || [],
        fallback: true,
      };
    }
    
    throw new Error(`Failed to add text source: ${textResult.error || 'Unknown error'}`);
    
  } catch (fallbackError) {
    console.error(`[notebooklm-http] text add failed: ${fallbackError.message}`);
    throw new Error(`Failed to add source as text: ${fallbackError.message}`);
  }
}

/**
 * Get detailed analysis from NotebookLM
 */
export async function getDetailedAnalysis(notebookId, sourceId) {
  console.log('[notebooklm-http] getting detailed analysis...');
  
  try {
    // Get keywords first (fast)
    const descResult = await callMCPTool('source_describe', { source_id: sourceId });
    const keywords = descResult.status === 'success' ? (descResult.keywords || []) : [];
    
    // Get detailed analysis via query (comprehensive)
    const queryResult = await callMCPTool('notebook_query', {
      notebook_id: notebookId,
      source_ids: [sourceId],
      query: `Analyse en profondeur ce contenu. Rédige un rapport détaillé en français qui couvre:

1. Le contexte et les idées principales
2. Les différents points de vue ou arguments présentés
3. Les détails techniques, exemples concrets et données mentionnées
4. Les problèmes, défis ou limitations identifiés
5. Les solutions, recommandations ou perspectives proposées
6. Une synthèse critique et les implications pratiques

Le rapport doit être complet, structuré, et faire au moins 500 mots. Utilise des titres markdown (###) pour structurer.`
    });
    
    if (queryResult.status === 'success') {
      return {
        summary: queryResult.answer,
        keywords: keywords,
        conversation_id: queryResult.conversation_id
      };
    }
    
    // Fallback to source_describe
    if (descResult.status === 'success') {
      return {
        summary: descResult.summary,
        keywords: keywords
      };
    }
    
    return null;
  } catch (err) {
    console.error('[notebooklm-http] error getting analysis:', err.message);
    return null;
  }
}

/**
 * Close MCP client connection
 */
export async function closeMCPClient() {
  sessionId = null;
}

/**
 * Get the configured notebook ID from environment
 */
export function getNotebookId() {
  return process.env.NOTEBOOKLM_NOTEBOOK_ID || null;
}

/**
 * Query NotebookLM with a custom prompt
 */
export async function queryNotebook(notebookId, query, sourceIds = null) {
  console.log(`[notebooklm-http] querying notebook ${notebookId}...`);
  
  try {
    const params = {
      notebook_id: notebookId,
      query: query,
      timeout: 180 // 3 minutes for complex queries
    };
    
    if (sourceIds) {
      params.source_ids = sourceIds;
    }
    
    const result = await callMCPTool('notebook_query', params);
    
    if (result.status === 'success') {
      // Try to get source count
      let sourceCount = null;
      try {
        const notebookInfo = await callMCPTool('notebook_get', { notebook_id: notebookId });
        if (notebookInfo.status === 'success' && notebookInfo.sources) {
          sourceCount = notebookInfo.sources.length;
        }
      } catch (e) {
        // Ignore
      }
      
      return {
        answer: result.answer,
        conversation_id: result.conversation_id,
        sourceCount: sourceCount
      };
    }
    
    throw new Error(result.error || 'Query failed');
  } catch (err) {
    console.error('[notebooklm-http] query error:', err.message);
    throw err;
  }
}

/**
 * Create audio podcast from notebook sources
 * @param {string} notebookId - Notebook UUID
 * @param {object} options - Podcast options
 * @param {string} options.format - deep_dive | brief | critique | debate
 * @param {string} options.length - short | default | long
 * @param {string} options.language - BCP-47 code (default: fr)
 * @param {string} options.focus - Optional focus prompt
 */
export async function createPodcast(notebookId, options = {}) {
  const { 
    format = 'deep_dive', 
    length = 'default', 
    language = 'fr',
    focus = ''
  } = options;
  
  console.log(`[notebooklm-http] creating podcast: format=${format}, length=${length}, lang=${language}`);
  if (focus) console.log(`[notebooklm-http] focus: ${focus}`);
  
  try {
    const result = await callMCPTool('audio_overview_create', {
      notebook_id: notebookId,
      format: format,
      length: length,
      language: language,
      focus_prompt: focus,
      confirm: true
    });
    
    if (result.status === 'success') {
      return {
        artifact_id: result.artifact_id,
        status: result.generation_status || 'in_progress',
        notebook_url: result.notebook_url
      };
    }
    
    throw new Error(result.error || result.message || 'Failed to create podcast');
  } catch (err) {
    console.error('[notebooklm-http] podcast creation error:', err.message);
    throw err;
  }
}

/**
 * Check podcast generation status
 * @param {string} notebookId - Notebook UUID
 * @param {string} artifactId - Artifact UUID to check (optional, returns latest audio if not provided)
 */
export async function getPodcastStatus(notebookId, artifactId = null) {
  console.log(`[notebooklm-http] checking podcast status for notebook ${notebookId}...`);
  
  try {
    const result = await callMCPTool('studio_status', {
      notebook_id: notebookId
    });
    
    if (result.status === 'success') {
      // Find the specific artifact or the latest audio
      let artifact = null;
      
      if (artifactId) {
        artifact = result.artifacts.find(a => a.artifact_id === artifactId);
      } else {
        // Find latest audio artifact
        artifact = result.artifacts
          .filter(a => a.type === 'audio')
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
      }
      
      if (artifact) {
        return {
          artifact_id: artifact.artifact_id,
          title: artifact.title,
          status: artifact.status,
          audio_url: artifact.audio_url,
          duration_seconds: artifact.duration_seconds,
          created_at: artifact.created_at,
          notebook_url: result.notebook_url
        };
      }
      
      return { status: 'not_found' };
    }
    
    throw new Error(result.error || 'Failed to get status');
  } catch (err) {
    console.error('[notebooklm-http] status check error:', err.message);
    throw err;
  }
}

/**
 * Download audio file from URL (follows redirects)
 * @param {string} audioUrl - URL of the audio file
 * @returns {Promise<{buffer: Buffer, contentType: string}>} - Audio file buffer and content type
 */
export async function downloadAudio(audioUrl) {
  console.log(`[notebooklm-http] downloading audio from: ${audioUrl.substring(0, 80)}...`);
  
  try {
    // Follow redirects
    const response = await fetch(audioUrl, {
      redirect: 'follow'
    });
    
    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }
    
    const contentType = response.headers.get('content-type') || 'audio/mp4';
    console.log(`[notebooklm-http] content-type: ${contentType}`);
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log(`[notebooklm-http] downloaded ${buffer.length} bytes`);
    return { buffer, contentType };
  } catch (err) {
    console.error('[notebooklm-http] download error:', err.message);
    throw err;
  }
}
