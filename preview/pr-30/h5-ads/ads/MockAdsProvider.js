import { MockAdOverlay } from './MockAdOverlay.js';

// Development-only HTML5 mock provider. Overlay and playback are SDK-owned.
export class MockAdsProvider {
  constructor({ root, manifestUrl = 'assets/mock/manifest.json', fallbackAds = [], log = () => {}, clickUrlOverride = '', videoUrlOverride = '' }) {
    this.root = root;
    this.manifestUrl = manifestUrl;
    this.ads = fallbackAds;
    this.log = log;
    this.clickUrlOverride = clickUrlOverride;
    this.videoUrlOverride = videoUrlOverride;
    this.lastAdId = '';
    this.loaded = this.loadManifest();
  }

  static validUrl(value) {
    if (!value || typeof value !== 'string') return '';
    try {
      const url = new URL(value);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
    } catch (_) { return ''; }
  }

  static validPublicVideoUrl(value) {
    if (typeof value !== 'string' || !value) return '';
    try {
      const url = new URL(value);
      // Only explicitly configured HTTPS MP4 resources; never inherit a video's
      // destination from untrusted manifest data or a runtime page query.
      return url.protocol === 'https:' && !url.username && !url.password &&
        !url.search && !url.hash && url.pathname.endsWith('.mp4')
        ? url.href : '';
    } catch (_) { return ''; }
  }

  static normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const video = typeof raw.video === 'string' ? raw.video.trim() : '';
    const clickUrl = MockAdsProvider.validUrl(raw.clickUrl);
    const formats = Array.isArray(raw.formats)
      ? [...new Set(raw.formats.filter(f => ['rewarded', 'interstitial'].includes(f)))]
      : [];
    const weight = raw.weight;
    if (!/^[A-Za-z0-9._-]+$/.test(id) ||
        !/^assets\/mock\/[A-Za-z0-9._/-]+\.mp4$/.test(video) ||
        video.includes('..') || !clickUrl || !formats.length ||
        typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) return null;
    return { id, video, clickUrl, formats, weight };
  }

  async loadManifest() {
    try {
      const response = await fetch(this.manifestUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('manifest HTTP ' + response.status);
      const data = await response.json();
      if (data.schemaVersion !== 1 || !Array.isArray(data.ads)) throw new Error('invalid manifest');
      const ids = new Set();
      const ads = data.ads.map(MockAdsProvider.normalize).filter(ad => {
        if (!ad || ids.has(ad.id)) return false;
        ids.add(ad.id);
        return true;
      });
      if (!ads.length) throw new Error('empty inventory');
      this.ads = ads;
      this.log('mock:manifest', { ids: ads.map(ad => ad.id) });
    } catch (error) {
      this.log('mock:manifest fallback', { message: String(error) });
    }
  }

  select(format) {
    const eligible = this.ads.filter(ad => ad.formats.includes(format));
    const nonRepeat = eligible.filter(ad => ad.id !== this.lastAdId);
    const pool = nonRepeat.length ? nonRepeat : eligible;
    if (!pool.length) return null;
    const total = pool.reduce((sum, ad) => sum + ad.weight, 0);
    let ticket = Math.random() * total;
    const chosen = pool.find(ad => (ticket -= ad.weight) < 0) || pool[pool.length - 1];
    this.lastAdId = chosen.id;
    this.log('mock:selected', { adId: chosen.id, format, eligible: eligible.length });
    return chosen;
  }

  async show(format, { onStart = () => {}, onFinish = () => {} } = {}) {
    await this.loaded;
    const ad = this.select(format);
    if (!ad) return { completed: false, rewarded: false, reason: 'unavailable' };

    // Create UI only when an ad is actually requested. No game-specific DOM/CSS.
    const ui = new MockAdOverlay();
    const video = ui.video;
    if (this.videoUrlOverride && !MockAdsProvider.validPublicVideoUrl(this.videoUrlOverride)) {
      this.log('mock:invalid-public-video-url', { adId: ad.id });
      return { completed: false, rewarded: false, reason: 'unavailable' };
    }
    const clickUrl = MockAdsProvider.validUrl(this.clickUrlOverride) || MockAdsProvider.validUrl(ad.clickUrl);
    let ended = false;
    let settled = false;
    let showing = false;
    let pending = false;
    let timeout;
    let resolveResult;
    const result = new Promise(resolve => { resolveResult = resolve; });
    const cleanups = [];
    const listen = (target, name, handler) => {
      target.addEventListener(name, handler);
      cleanups.push(() => target.removeEventListener(name, handler));
    };
    const finish = outcome => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      cleanups.forEach(cleanup => cleanup());
      video.pause();
      video.removeAttribute('src');
      video.load();
      ui.hide();
      if (showing) onFinish();
      this.log('mock:finished', { adId: ad.id, format, ...outcome });
      resolveResult(outcome);
    };
    const cancelled = { completed: false, rewarded: false, reason: 'user-close' };
    const tryPlay = async () => {
      if (settled || pending || ended || !ui.confirm.hidden) return;
      pending = true;
      ui.play.hidden = true;
      try {
        await video.play();
        this.log('mock:videoStarted', { adId: ad.id, format });
      } catch (error) {
        if (settled) return;
        if (video.error || error?.name === 'NotSupportedError') {
          finish({ completed: false, rewarded: false, reason: 'load-error' });
          return;
        }
        ui.status.textContent = '자동 재생이 차단됐습니다. 영상 재생을 눌러주세요.';
        ui.play.hidden = false;
        ui.play.focus();
      } finally {
        pending = false;
      }
    };
    const confirmClose = () => {
      if (settled || !ui.confirm.hidden) return;
      if (ended) { finish(cancelled); return; }
      video.pause();
      ui.confirm.hidden = false;
      ui.resume.focus();
    };
    const continueWatching = () => {
      if (settled) return;
      ui.confirm.hidden = true;
      ui.close.focus();
      void tryPlay();
    };
    listen(video, 'ended', () => {
      if (settled || !ui.confirm.hidden) return;
      ended = true;
      ui.claim.disabled = false;
      ui.status.textContent = format === 'rewarded'
        ? '영상 시청이 완료되었습니다. 보상 받기를 눌러주세요.'
        : '영상 시청이 완료되었습니다. 계속하기를 눌러주세요.';
      ui.claim.focus();
      this.log('mock:videoEnded', { adId: ad.id, format });
    });
    listen(video, 'error', () => finish({ completed: false, rewarded: false, reason: 'load-error' }));
    listen(video, 'timeupdate', () => {
      if (!ended && Number.isFinite(video.duration)) {
        ui.status.textContent = `광고 재생 중 · ${Math.min(video.currentTime, video.duration).toFixed(0)} / ${video.duration.toFixed(0)}초`;
      }
    });
    listen(ui.claim, 'click', () => {
      if (!ended || !ui.confirm.hidden) return;
      finish({ completed: true, rewarded: format === 'rewarded', reason: 'success' });
    });
    listen(ui.play, 'click', () => { void tryPlay(); });
    // A creative tap is a click-through, never playback completion or reward.
    // Open synchronously in the user gesture to avoid mobile popup blockers.
    const openAdvertiser = () => {
      if (settled || !ui.confirm.hidden || !clickUrl) return;
      const page = window.open(clickUrl, '_blank', 'noopener,noreferrer');
      this.log('mock:clickThrough', { adId: ad.id, host: new URL(clickUrl).host, opened: Boolean(page) });
    };
    listen(video, 'click', openAdvertiser);
    listen(video, 'keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openAdvertiser();
    });
    listen(ui.close, 'click', confirmClose);
    listen(ui.resume, 'click', continueWatching);
    listen(ui.quit, 'click', () => finish(cancelled));
    listen(ui.host.shadowRoot, 'keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); confirmClose(); }
      if (event.key !== 'Tab') return;
      const root = ui.confirm.hidden ? ui.host.shadowRoot.querySelector('.card') : ui.confirm;
      const items = [...root.querySelectorAll('button:not([disabled]):not([hidden])')].filter(el => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && ui.host.shadowRoot.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && ui.host.shadowRoot.activeElement === last) { event.preventDefault(); first.focus(); }
    });

    ui.claim.textContent = format === 'rewarded' ? '보상 받기' : '계속하기';
    video.muted = true;
    video.playsInline = true;
    // Native scrubber is deliberately absent: no seeking past the ad in ordinary UX.
    video.controls = false;
    video.tabIndex = clickUrl ? 0 : -1;
    video.setAttribute('role', clickUrl ? 'link' : 'img');
    video.setAttribute('aria-label', clickUrl ? '광고 영상: 광고주 사이트 열기' : '테스트 광고 영상');
    video.src = MockAdsProvider.validPublicVideoUrl(this.videoUrlOverride) || new URL(ad.video, document.baseURI).href;
    try {
      ui.open();
      showing = true;
      onStart();
      timeout = setTimeout(() => finish({ completed: false, rewarded: false, reason: 'timeout' }), 90000);
      void tryPlay();
    } catch (error) {
      this.log('mock:showError', { adId: ad.id, message: String(error) });
      finish({ completed: false, rewarded: false, reason: 'provider-error' });
    }
    return result;
  }
}
