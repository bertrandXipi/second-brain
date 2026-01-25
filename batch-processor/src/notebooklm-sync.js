/**
 * NotebookLM MCP Integration
 * Uses the jacob-bd/notebooklm-mcp server via Kiro MCP tools
 */

/**
 * Get or create monthly notebook
 * Format: "Veille Tech - Janvier 2026"
 * @returns {Promise<string>} - Notebook ID
 */
export async function getOrCreateMonthlyNotebook() {
  console.log('[notebooklm] getting or creating monthly notebook...');
  
  try {
    const now = new Date();
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const monthName = monthNames[now.getMonth()];
    const year = now.getFullYear();
    const notebookTitle = `Veille Tech - ${monthName} ${year}`;
    
    console.log(`[notebooklm] looking for notebook: "${notebookTitle}"`);
    
    // List notebooks to find current month's notebook
    const { mcp_notebooklm_notebook_list } = await import('../mcp-tools.js');
    const result = await mcp_notebooklm_notebook_list({ max_results: 200 });
    
    if (result.status === 'success') {
      const existingNotebook = result.notebooks.find(nb => nb.title === notebookTitle);
      
      if (existingNotebook) {
        console.log(`[notebooklm] found existing notebook: ${existingNotebook.id}`);
        return existingNotebook.id;
      }
    }
    
    // Create new notebook for this month
    console.log(`[notebooklm] creating new notebook: "${notebookTitle}"`);
    const { mcp_notebooklm_notebook_create } = await import('../mcp-tools.js');
    const createResult = await mcp_notebooklm_notebook_create({ title: notebookTitle });
    
    if (createResult.status === 'success') {
      console.log(`[notebooklm] created notebook: ${createResult.notebook.id}`);
      return createResult.notebook.id;
    }
    
    throw new Error('Failed to create notebook');
    
  } catch (err) {
    console.error('[notebooklm] error getting/creating notebook:', err.message);
    throw err;
  }
}

/**
 * Add a source to NotebookLM
 * @param {string} url - Source URL
 * @param {string} content - Content text (not used, NotebookLM fetches directly)
 * @param {object} metadata - Additional metadata (title, tags, etc)
 * @returns {Promise<object>} - NotebookLM source info
 */
export async function addToNotebookLM(url, content, metadata = {}) {
  console.log(`[notebooklm] adding source: ${url}`);

  try {
    // Get or create monthly notebook
    const notebookId = await getOrCreateMonthlyNotebook();
    
    // Add URL as source to notebook
    const { mcp_notebooklm_notebook_add_url } = await import('../mcp-tools.js');
    const result = await mcp_notebooklm_notebook_add_url({
      notebook_id: notebookId,
      url: url
    });
    
    if (result.status === 'success') {
      console.log(`[notebooklm] source added: ${result.source.id}`);
      
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

  } catch (err) {
    console.error('[notebooklm] error adding source:', err.message);
    throw err;
  }
}

/**
 * Get detailed analysis from NotebookLM (replaces source_describe)
 * @param {string} notebookId - Notebook ID
 * @param {string} sourceId - Source ID in NotebookLM
 * @returns {Promise<object>} - Detailed summary and keywords
 */
export async function getDetailedAnalysis(notebookId, sourceId) {
  console.log('[notebooklm] getting detailed analysis...');
  
  try {
    // First get keywords from source_describe (fast)
    const { mcp_notebooklm_source_describe } = await import('../mcp-tools.js');
    const descResult = await mcp_notebooklm_source_describe({ source_id: sourceId });
    const keywords = descResult.status === 'success' ? (descResult.keywords || []) : [];
    
    // Then get detailed analysis via notebook_query (comprehensive)
    const { mcp_notebooklm_notebook_query } = await import('../mcp-tools.js');
    const queryResult = await mcp_notebooklm_notebook_query({
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
    
    // Fallback to source_describe if query fails
    if (descResult.status === 'success') {
      return {
        summary: descResult.summary,
        keywords: keywords
      };
    }
    
    return null;
  } catch (err) {
    console.error('[notebooklm] error getting analysis:', err.message);
    return null;
  }
}
