const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

export async function notifyDiscord(processed, failed, fiches, stats = {}) {
  if (!WEBHOOK_URL) {
    console.log('[notify] no webhook configured, skipping');
    return;
  }

  const { rateLimited = 0, pending = 0, noTranscript = 0 } = stats;

  const fichesText = fiches.length > 0 
    ? fiches.slice(0, 10).map(f => `• ${f}`).join('\n') + (fiches.length > 10 ? `\n... et ${fiches.length - 10} autres` : '')
    : 'Aucune fiche créée';

  let statusEmoji = '✅';
  if (failed > 0 || rateLimited > 0) statusEmoji = '⚠️';
  if (processed === 0 && failed > 0) statusEmoji = '❌';

  const content = `${statusEmoji} **Batch terminé**

**Résultats:**
✅ Traités avec succès: **${processed}**
❌ Échoués: **${failed}**
${rateLimited > 0 ? `⏳ Rate limit (en attente): **${rateLimited}**` : ''}
${pending > 0 ? `📋 Restants en file: **${pending}**` : ''}
${noTranscript > 0 ? `⚠️ Vidéos sans transcription: **${noTranscript}**` : ''}

**Fiches créées:**
${fichesText}

🕐 ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`;

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    console.log('[notify] discord notified');
  } catch (err) {
    console.error('[notify] failed:', err.message);
  }
}

export async function notifyError(error, context = '') {
  if (!WEBHOOK_URL) {
    console.log('[notify] no webhook configured, skipping error notification');
    return;
  }

  const timestamp = new Date().toISOString();
  const errorMsg = error.message || String(error);
  const content = `🚨 **ERREUR BATCH PROCESSOR** 🚨

**Contexte:** ${context || 'Erreur fatale'}
**Date:** ${timestamp}
**Erreur:** ${errorMsg}

⚠️ Le batch processor a échoué. Vérifiez les logs pour plus de détails.`;

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    console.log('[notify] error notification sent to discord');
  } catch (err) {
    console.error('[notify] failed to send error notification:', err.message);
  }
}

export async function notifyHealthCheck(pendingCount, lastRunSuccess) {
  if (!WEBHOOK_URL) {
    return;
  }

  const status = lastRunSuccess ? '✅' : '❌';
  const content = `**🔍 Health Check**
${status} Statut: ${lastRunSuccess ? 'OK' : 'ERREUR'}
📋 Liens en attente: ${pendingCount}
🕐 ${new Date().toISOString()}`;

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    console.error('[notify] health check failed:', err.message);
  }
}

export async function notifyBatchStart(itemCount) {
  if (!WEBHOOK_URL) {
    return;
  }

  const content = `🚀 **Batch démarré**

📋 ${itemCount} lien(s) à traiter
⏱️ Début: ${new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}

_Traitement en cours..._`;

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    console.log('[notify] batch start notified');
  } catch (err) {
    console.error('[notify] failed to notify batch start:', err.message);
  }
}

export async function notifyProgress(current, total, lastProcessed) {
  if (!WEBHOOK_URL) {
    return;
  }

  const percent = Math.round((current / total) * 100);
  const content = `⏳ **Progression: ${percent}%**

${current}/${total} traités
Dernier: ${lastProcessed}`;

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
  } catch (err) {
    console.error('[notify] failed to notify progress:', err.message);
  }
}
