#!/usr/bin/env node

/**
 * Test NotebookLM MCP connection and list notebooks
 * Usage: node scripts/test-notebooklm-connection.js
 */

import { listNotebooks } from '../batch-processor/src/notebooklm-http.js';

async function main() {
  console.log('🔍 Testing NotebookLM MCP connection...\n');
  
  const mcpUrl = process.env.NOTEBOOKLM_MCP_URL || 'http://127.0.0.1:8000/mcp';
  console.log(`📡 MCP Server URL: ${mcpUrl}\n`);
  
  try {
    console.log('📚 Listing notebooks...');
    const notebooks = await listNotebooks(100);
    
    console.log(`\n✅ Success! Found ${notebooks.length} notebooks:\n`);
    
    notebooks.forEach((nb, index) => {
      console.log(`${index + 1}. ${nb.title}`);
      console.log(`   ID: ${nb.id}`);
      console.log(`   URL: https://notebooklm.google.com/notebook/${nb.id}`);
      if (nb.source_count !== undefined) {
        console.log(`   Sources: ${nb.source_count}`);
      }
      console.log('');
    });
    
    // Check for current month notebook
    const now = new Date();
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                        'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const currentMonthName = monthNames[now.getMonth()];
    const currentYear = now.getFullYear();
    const expectedTitle = `Veille Tech - ${currentMonthName} ${currentYear}`;
    
    const currentMonthNotebook = notebooks.find(nb => nb.title === expectedTitle);
    
    if (currentMonthNotebook) {
      console.log(`✅ Current month notebook found: "${expectedTitle}"`);
      console.log(`   ID: ${currentMonthNotebook.id}`);
    } else {
      console.log(`ℹ️  Current month notebook not found: "${expectedTitle}"`);
      console.log(`   It will be created automatically on first source add.`);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nTroubleshooting:');
    console.error('1. Check that the MCP server is running');
    console.error('2. Verify NOTEBOOKLM_MCP_URL in .env');
    console.error('3. Run: notebooklm-mcp-auth to authenticate');
    console.error('4. Check server logs for errors');
    process.exit(1);
  }
}

main();
