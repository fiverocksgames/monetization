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

async function startAd(options = {}) {
  const ui = fakeDocument();
  const oldDoc = globalThis.document;
  const oldFetch = globalThis.fetch;
  const oldWindow = globalThis.window;
  const opened = [];
  globalThis.window = { open: (...args) => { opened.push(args); return {}; } };
  globalThis.document = ui.doc;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({
    schemaVersion: 1, ads: [{ id: 'ad-001', formats: ['rewarded'], weight: 1,
      video: 'assets/mock/265552.mp4', clickUrl: 'https://example.org/' }]
  }) });
  const provider = new MockAdsProvider({ manifestUrl: './assets/mock/manifest.json', ...options });
  const result = provider.show('rewarded');
  await new Promise(resolve => setImmediate(resolve));
  return { ...ui, result, opened, restore() { globalThis.document = oldDoc; globalThis.fetch = oldFetch; globalThis.window = oldWindow; } };
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

test('creative tap opens advertiser in a new tab and does not grant a reward', async () => {
  const ui = await startAd();
  try {
    let settled = false;
    ui.result.then(() => { settled = true; });
    ui.video.emit('click');
    await Promise.resolve();
    assert.deepEqual(ui.opened, [['https://example.org/', '_blank', 'noopener,noreferrer']]);
    assert.equal(ui.claim.disabled, true);
    assert.equal(settled, false);
    ui.close.emit('click');
    ui.video.emit('click'); // Confirmation overlay prevents background click-through.
    assert.equal(ui.opened.length, 1);
    ui.resume.emit('click');
    ui.video.emit('keydown', { key: 'Enter', preventDefault() {} });
    assert.equal(ui.opened.length, 2);
    ui.video.emit('ended');
    ui.claim.emit('click');
    assert.deepEqual(await ui.result, { completed: true, rewarded: true, reason: 'success' });
  } finally { ui.restore(); }
});

test('explicit HTTPS static MP4 is streamed by video src without fetching binary into the game', async () => {
  const url = 'https://fiverocksgames.github.io/monetization/preview/h5-ads/assets/mock/265552.mp4';
  const ui = await startAd({ videoUrlOverride: url });
  try {
    assert.equal(ui.video.src, url);
    assert.equal(ui.claim.disabled, true);
    ui.video.emit('click');
    assert.equal(ui.opened.length, 1);
    ui.video.emit('ended');
    ui.claim.emit('click');
    assert.deepEqual(await ui.result, { completed: true, rewarded: true, reason: 'success' });
  } finally { ui.restore(); }
});

test('unsafe static MP4 override fails closed without displaying an ad', async () => {
  for (const value of ['http://example.org/video.mp4', 'javascript:alert(1)', 'https://example.org/video.mp4?token=a']) {
    assert.equal(MockAdsProvider.validPublicVideoUrl(value), '');
    const ui = await startAd({ videoUrlOverride: value });
    try {
      assert.deepEqual(await ui.result, { completed: false, rewarded: false, reason: 'unavailable' });
      assert.equal(ui.host.hidden, true);
    } finally { ui.restore(); }
  }
});
