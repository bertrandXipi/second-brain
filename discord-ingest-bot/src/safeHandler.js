/**
 * Safe wrapper for Discord slash-command handlers.
 *
 * Guarantees:
 *  - deferReply() is called within Discord's 3s ack window
 *  - any thrown error is caught, logged, and produces a user-visible error reply
 *    (instead of "L'application ne répond plus")
 *  - last-event tracker is bumped so the watchdog sees activity
 */
import { markEvent } from './health.js';

const ACK_DEADLINE_MS = 2500;

export function wrap(name, handler, opts = {}) {
  const deferOpts = opts.ephemeral ? { ephemeral: true } : {};
  return async function safeWrapped(interaction) {
    markEvent(`cmd:${name}`);
    const start = Date.now();

    // Defer right away so Discord knows we're handling the interaction.
    const ackTimer = setTimeout(async () => {
      try {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply(deferOpts);
          console.warn(`[safe] forced deferReply for ${name} after ${Date.now() - start}ms`);
        }
      } catch (e) {
        console.error(`[safe] forced defer failed for ${name}:`, e.message);
      }
    }, ACK_DEADLINE_MS);

    try {
      await handler(interaction);
    } catch (err) {
      console.error(`[safe] ${name} threw:`, err?.stack || err?.message || err);
      const msg = `❌ Erreur dans ${name}: ${err?.message || 'unknown'}`;
      try {
        if (interaction.deferred) {
          await interaction.editReply(msg);
        } else if (!interaction.replied) {
          await interaction.reply({ content: msg, ephemeral: true });
        } else {
          await interaction.followUp({ content: msg, ephemeral: true });
        }
      } catch (replyErr) {
        console.error(`[safe] failed to deliver error reply for ${name}:`, replyErr.message);
      }
    } finally {
      clearTimeout(ackTimer);
    }
  };
}
