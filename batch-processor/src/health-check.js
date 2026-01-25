import 'dotenv/config';
import { readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { config } from './config.js';
import { notifyError, notifyHealthCheck } from './discord-notify.js';

const MAX_PENDING_THRESHOLD = 5;
const MAX_FAILED_THRESHOLD = 10;
const MAX_HOURS_SINCE_LAST_RUN = 8;

async function checkHealth() {
  console.log('[health] checking system health...');
  
  const issues = [];
  
  // Check pending items
  const pendingDir = path.join(config.workdir, config.paths.pending);
  if (existsSync(pendingDir)) {
    const files = await readdir(pendingDir);
    const pendingCount = files.filter(f => f.endsWith('.json')).length;
    
    console.log(`[health] pending items: ${pendingCount}`);
    
    if (pendingCount > MAX_PENDING_THRESHOLD) {
      issues.push(`⚠️ ${pendingCount} liens en attente (seuil: ${MAX_PENDING_THRESHOLD})`);
    }
  }
  
  // Check failed items
  const failedDir = path.join(config.workdir, config.paths.failed);
  if (existsSync(failedDir)) {
    const files = await readdir(failedDir);
    const failedCount = files.filter(f => f.endsWith('.json')).length;
    
    console.log(`[health] failed items: ${failedCount}`);
    
    if (failedCount > MAX_FAILED_THRESHOLD) {
      issues.push(`❌ ${failedCount} liens échoués (seuil: ${MAX_FAILED_THRESHOLD})`);
    }
  }
  
  // Check last successful run (by checking log file modification time)
  const logFile = './batch.log';
  if (existsSync(logFile)) {
    const stats = await stat(logFile);
    const hoursSinceLastRun = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
    
    console.log(`[health] hours since last run: ${hoursSinceLastRun.toFixed(1)}`);
    
    if (hoursSinceLastRun > MAX_HOURS_SINCE_LAST_RUN) {
      issues.push(`⏰ Dernière exécution il y a ${hoursSinceLastRun.toFixed(1)}h (seuil: ${MAX_HOURS_SINCE_LAST_RUN}h)`);
    }
  }
  
  // Report issues
  if (issues.length > 0) {
    const error = new Error(issues.join('\n'));
    await notifyError(error, '🔍 Health Check - Problèmes détectés');
    console.log('[health] issues found:', issues);
    process.exit(1);
  } else {
    console.log('[health] ✅ all checks passed');
    // Optionally notify success
    // await notifyHealthCheck(0, true);
  }
}

checkHealth().catch(async (err) => {
  console.error('[health] check failed:', err);
  await notifyError(err, 'Échec du health check');
  process.exit(1);
});
