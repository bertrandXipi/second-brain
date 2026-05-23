import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wrap, wrapComponent } from '../src/safeHandler.js';

function makeFakeInteraction() {
  const calls = { deferReply: 0, deferUpdate: 0, reply: 0, editReply: 0, followUp: 0 };
  const i = {
    calls,
    deferred: false,
    replied: false,
    async deferReply() { calls.deferReply++; i.deferred = true; },
    async deferUpdate() { calls.deferUpdate++; i.deferred = true; },
    async reply(_arg) { calls.reply++; i.replied = true; },
    async editReply(_arg) { calls.editReply++; },
    async followUp(_arg) { calls.followUp++; },
  };
  return i;
}

test('wrap calls the inner handler and propagates success', async () => {
  let inner = 0;
  const wrapped = wrap('ok', async () => { inner++; });
  const fake = makeFakeInteraction();
  await wrapped(fake);
  assert.equal(inner, 1);
});

test('wrap catches errors and replies with an error message', async () => {
  const wrapped = wrap('boom', async () => { throw new Error('kaboom'); });
  const fake = makeFakeInteraction();
  // Pre-defer to simulate the common case
  await fake.deferReply();
  await wrapped(fake);
  // The wrapper must have edited the reply (since deferred=true)
  assert.equal(fake.calls.editReply, 1);
});

test('wrap forces a deferReply if the handler is slow', async () => {
  const wrapped = wrap('slow', async (i) => {
    // Simulate slow handler that forgot to deferReply
    await new Promise(r => setTimeout(r, 2700));
    await i.editReply('done');
  });
  const fake = makeFakeInteraction();
  await wrapped(fake);
  // The safeHandler should have forced a deferReply itself
  assert.ok(fake.calls.deferReply >= 1, 'expected forced deferReply');
});

test('wrap replies ephemerally when interaction has neither replied nor deferred', async () => {
  const wrapped = wrap('errFast', async () => { throw new Error('fast'); });
  const fake = makeFakeInteraction();
  await wrapped(fake);
  // Without prior defer, the wrapper should use reply with ephemeral payload
  assert.ok(fake.calls.reply >= 1 || fake.calls.editReply >= 1 || fake.calls.followUp >= 1);
});

// --- wrapComponent (buttons / select menus) ---

test('wrapComponent runs the handler successfully', async () => {
  let inner = 0;
  const wrapped = wrapComponent('comp_ok', async () => { inner++; });
  const fake = makeFakeInteraction();
  await wrapped(fake);
  assert.equal(inner, 1);
});

test('wrapComponent forces deferUpdate if the handler is slow', async () => {
  const wrapped = wrapComponent('comp_slow', async () => {
    await new Promise(r => setTimeout(r, 2700));
  });
  const fake = makeFakeInteraction();
  await wrapped(fake);
  assert.ok(fake.calls.deferUpdate >= 1, 'expected forced deferUpdate');
  // wrapComponent must NEVER call deferReply (would show "Bot is thinking…")
  assert.equal(fake.calls.deferReply, 0, 'wrapComponent must not deferReply');
});

test('wrapComponent does not force deferUpdate if the handler already deferred', async () => {
  const wrapped = wrapComponent('comp_fast', async (i) => {
    await i.deferUpdate();
  });
  const fake = makeFakeInteraction();
  await wrapped(fake);
  // Handler deferred once; the timer should NOT have fired (handler returned fast)
  assert.equal(fake.calls.deferUpdate, 1);
});

test('wrapComponent catches errors and replies via followUp when deferred', async () => {
  const wrapped = wrapComponent('comp_boom', async (i) => {
    await i.deferUpdate();
    throw new Error('component kaboom');
  });
  const fake = makeFakeInteraction();
  await wrapped(fake);
  assert.equal(fake.calls.followUp, 1, 'expected followUp for error reply');
  assert.equal(fake.calls.editReply, 0, 'must not editReply (would change original message)');
});

test('wrapComponent catches errors and replies via reply when not deferred', async () => {
  // Handler throws BEFORE deferring — the wrapper should fall back to reply()
  const wrapped = wrapComponent('comp_boom_fast', async () => {
    throw new Error('instant kaboom');
  });
  const fake = makeFakeInteraction();
  await wrapped(fake);
  assert.ok(fake.calls.reply >= 1 || fake.calls.followUp >= 1, 'expected an error reply path');
});
