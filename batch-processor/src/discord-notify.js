const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

export async function notifyDiscord(processed, failed, fiches) {
  if (!WEBHOOK_URL) {
    console.log('[notify] no webhook configured, skipping');
    return;
  }

  const fichesText = fiches.length > 0 
    ? fiches.map(f => `• ${f}`).join('\n')
    : 'Aucune fiche créée';

  const content = `**📚 Batch terminé**
✅ Traités: ${processed}
❌ Échoués: ${failed}

**Fiches créées:**
${fichesText}`;

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
