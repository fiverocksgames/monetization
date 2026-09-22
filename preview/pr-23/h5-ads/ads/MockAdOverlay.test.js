import test from 'node:test';
import assert from 'node:assert/strict';
import { MockAdsProvider } from './MockAdsProvider.js';

function node() {
  const listeners = new Map();
  return {
    hidden: false, disabled: false, textContent: '', style: {},
    isConnected: true, offsetParent: {},
    listeners,
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
    emit(type, event = {}) { listeners.get(type)?.(event); },
    focus() { globalThis.document.focused = this; },
    remove() { this.isConnected = false; },
    setAttribute() {}, removeAttribute() {}
  };
}

function fakeDocument() {
  const video = Object.assign(node(), {
    duration: 30, currentTime: 0, error: null,
    pauseCount: 0, playCount: 0,
    play() { this.playCount++; return Promise.resolve(); },
    pause() { this.pauseCount++; },
    load() {}
  });
  const close = node(), claim = node(), play = node(), confirm = node();
  claim.disabled = true; // fake DOM does not parse the HTML disabled attribute
  confirm.hidden = true;
  const resume = node(), quit = node(), status = node();
  const buttons = [close, play, claim];
  const card = { querySelectorAll() { return buttons; } };
  confirm.querySelectorAll = () => [resume, quit];
  const nodes = { '.video': video, '#status': status, '.play': play,
    '.claim': claim, '.close': close, '.confirm': confirm,
    '.resume': resume, '.quit': quit, '.card': card };
  const shadow = Object.assign(node(), {
    activeElement: close,
    querySelector(selector) { return nodes[selector]; }
  });
  const host = Object.assign(node(), {
    hidden: true,
    attachShadow() { this.shadowRoot = shadow; return shadow; }
  });
  const doc = {
    baseURI: 'https://example.org/preview/pr-22/',
    focused: null,
    activeElement: node(),
    body: { style: { overflow: '' }, appendChild() {} },
    createElement(name) { assert.equal(name, 'div'); return host; }
  };
  return { doc, host, shadow, video, close, claim, play, confirm, resume, quit, status };
}

async function startAd() {
  const ui = fakeDocument();
  const oldDoc = globalThis.document;
  const oldFetch = globalThis.fetch;
  globalThis.document = ui.doc;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({
    schemaVersion: 1, ads: [{ id: 'ad-001', formats: ['rewarded'], weight: 1,
      video: 'assets/mock/265552.mp4', clickUrl: 'https://example.org/' }]
  }) });
  const provider = new MockAdsProvider({ manifestUrl: './assets/mock/manifest.json' });
  const result = provider.show('rewarded');
  await new Promise(resolve => setImmediate(resolve));
  return { ...ui, result, restore() { globalThis.document = oldDoc; globalThis.fetch = oldFetch; } };
}

test('SDK owns overlay; pre-completion close requires confirmation; cancel means no reward', async () => {
  const ui = await startAd();
  try {
    assert.equal(ui.host.hidden, false);
    assert.equal(ui.video.src, 'https://example.org/preview/pr-22/assets/mock/265552.mp4');
    assert.equal(ui.claim.disabled, true);
    ui.close.emit('click');
    assert.equal(ui.confirm.hidden, false);
    assert.ok(ui.video.pauseCount > 0);
    ui.quit.emit('click');
    assert.deepEqual(await ui.result, { completed: false, rewarded: false, reason: 'user-close' });
    assert.equal(ui.host.hidden, true);
  } finally { ui.restore(); }
});

test('keep watching resumes ad; ended alone does not reward; claim rewards once', async () => {
  const ui = await startAd();
  try {
    ui.close.emit('click');
    ui.resume.emit('click');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ui.confirm.hidden, true);
    assert.ok(ui.video.playCount >= 2);
    let settled = false;
    ui.result.then(() => { settled = true; });
    ui.video.emit('ended');
    await Promise.resolve();
    assert.equal(settled, false);
    assert.equal(ui.claim.disabled, false);
    ui.claim.emit('click');
    assert.deepEqual(await ui.result, { completed: true, rewarded: true, reason: 'success' });
    ui.claim.emit('click');
    assert.equal(ui.host.hidden, true);
  } finally { ui.restore(); }
});

test('closing after playback but before claiming is still unrewarded', async () => {
  const ui = await startAd();
  try {
    ui.video.emit('ended');
    ui.close.emit('click');
    assert.deepEqual(await ui.result, { completed: false, rewarded: false, reason: 'user-close' });
  } finally { ui.restore(); }
});
