#!/usr/bin/env node
/**
 * Test script to add a source to NotebookLM
 * This demonstrates the V2 workflow
 */

const TEST_URL = 'https://www.reddit.com/r/kiroIDE/s/zI40hIoBao';
const NOTEBOOK_ID = 'c4dba600-dd91-4027-ba33-8ad93f971a31'; // Veille Tech - Janvier 2026

console.log('[test] Testing NotebookLM source addition...');
console.log(`[test] Notebook ID: ${NOTEBOOK_ID}`);
console.log(`[test] Test URL: ${TEST_URL}\n`);

console.log('[test] ⚠️  This test requires Kiro MCP tools');
console.log('[test] Run this from Kiro context, not standalone Node.js\n');

console.log('[test] Expected workflow:');
console.log('  1. Get or create monthly notebook (Veille Tech - Janvier 2026)');
console.log('  2. Add URL as source to notebook');
console.log('  3. Get source ID and notebook URL');
console.log('  4. Generate markdown with NotebookLM links\n');

console.log('[test] To test manually with Kiro:');
console.log('  - Use mcp_notebooklm_notebook_add_url tool');
console.log(`  - notebook_id: ${NOTEBOOK_ID}`);
console.log(`  - url: ${TEST_URL}`);
