#!/usr/bin/env node
/**
 * Test script to verify NotebookLM MCP connection
 * Usage: node test-notebooklm.js
 */

import { spawn } from 'child_process';

async function callMCP(tool, args = {}) {
  return new Promise((resolve, reject) => {
    const mcp = spawn('/Users/bertrand/.local/bin/notebooklm-mcp', [], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    mcp.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    mcp.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    mcp.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`MCP exited with code ${code}\nStderr: ${stderr}`));
      } else {
        try {
          // Parse JSON-RPC responses from stdout
          const lines = stdout.trim().split('\n');
          const responses = lines.map(line => {
            try {
              return JSON.parse(line);
            } catch {
              return null;
            }
          }).filter(Boolean);
          
          resolve(responses);
        } catch (err) {
          reject(new Error(`Failed to parse MCP response: ${err.message}\nStdout: ${stdout}`));
        }
      }
    });

    // Send JSON-RPC request
    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: tool,
        arguments: args
      }
    };

    mcp.stdin.write(JSON.stringify(request) + '\n');
    mcp.stdin.end();
  });
}

async function testNotebookList() {
  console.log('[test] Testing NotebookLM MCP connection...');
  console.log('[test] Calling notebook_list...\n');

  try {
    const result = await callMCP('notebook_list');
    console.log('[test] ✅ Success!');
    console.log('[test] Response:', JSON.stringify(result, null, 2));
    
    // Try to extract notebook info
    if (result && result.length > 0) {
      const response = result.find(r => r.result);
      if (response && response.result) {
        console.log('\n[test] Notebooks found:');
        console.log(response.result);
      }
    }
  } catch (err) {
    console.error('[test] ❌ Failed:', err.message);
    process.exit(1);
  }
}

testNotebookList();
