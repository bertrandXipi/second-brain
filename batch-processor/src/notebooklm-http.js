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
 * Get or create monthly notebook
 */
export async function getOrCreateMonthlyNotebook() {
  console.log('[notebooklm-http] getting or creating monthly notebook...');
  
  const now = new Date();
  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                      'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
  const monthName = monthNames[now.getMonth()];
  const year = now.getFullYear();
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
 * Add URL to NotebookLM
 * Falls back to text content if URL fails (e.g., LinkedIn)
 */
export async function addToNotebookLM(url, content, metadata = {}) {
  console.log(`[notebooklm-http] adding source: ${url}`);

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
    
    // Fallback: fetch content and add as text
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
      console.error(`[notebooklm-http] fallback also failed: ${fallbackError.message}`);
      throw new Error(`Failed to add source (URL and text fallback): ${fallbackError.message}`);
    }
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
