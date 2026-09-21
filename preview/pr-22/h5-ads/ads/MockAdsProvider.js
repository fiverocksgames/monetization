// Development-only HTML5 mock provider. No gameplay state is mutated here.
export class MockAdsProvider {
  constructor({ root, manifestUrl = 'assets/mock/manifest.json', fallbackAds = [], log = () => {}, clickUrlOverride = '' }) {
    this.root = root;
    this.manifestUrl = manifestUrl;
    this.ads = fallbackAds;
    this.log = log;
    this.clickUrlOverride = clickUrlOverride;
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
    const root = this.root;
    const video = root.querySelector('#mockAdVideo');
    const title = root.querySelector('#mockAdTitle');
    const message = root.querySelector('#mockAdCountdown');
    const cta = root.querySelector('#mockAdClickThrough');
    const action = root.querySelector('#mockAdAction');
    const url = MockAdsProvider.validUrl(this.clickUrlOverride) || ad.clickUrl;
    let ended = false;
    let settled = false;
    let started = false;
    let resolveResult;
    const result = new Promise(resolve => { resolveResult = resolve; });

    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      video.pause();
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
      video.removeAttribute('src');
      video.load();
      video.onclick = null;
      cta.onclick = null;
      action.onclick = null;
      root.hidden = true;
      if (started) onFinish();
      this.log('mock:finished', { adId: ad.id, format, ...outcome });
      resolveResult(outcome);
    };
    const onEnded = () => {
      ended = true;
      message.textContent = format === 'rewarded' ? 'Reward unlocked.' : 'Mock ad complete.';
      action.disabled = false;
      action.textContent = format === 'rewarded' ? 'Claim Revive' : 'Continue';
      this.log('mock:videoEnded', { adId: ad.id, format });
    };
    const onError = () => finish({ completed: false, rewarded: false, reason: 'load-error' });
    const open = source => {
      if (!url) return;
      window.open(url, '_blank', 'noopener,noreferrer');
      this.log('mock:clickThrough', { adId: ad.id, source, host: new URL(url).host });
    };

    title.textContent = format === 'rewarded' ? 'Mock Rewarded Ad' : 'Mock Interstitial Ad';
    message.textContent = format === 'rewarded' ? 'Watch the full video to unlock the revive.' : 'Watch the mock ad video to continue.';
    cta.disabled = !url;
    cta.textContent = url ? 'Visit advertiser' : 'Advertiser link unavailable';
    cta.onclick = () => open('cta');
    video.onclick = () => open('video');
    video.src = ad.video;
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);
    action.disabled = true;
    action.textContent = format === 'rewarded' ? 'Watch to Revive' : 'Continue';
    action.onclick = () => {
      if (!ended) return;
      finish({ completed: true, rewarded: format === 'rewarded', reason: 'success' });
    };
    root.hidden = false;
    started = true;
    onStart();
    const play = async () => {
      try {
        await video.play();
        this.log('mock:videoStarted', { adId: ad.id, format });
      } catch (error) {
        if (settled) return;
        this.log('mock:autoplayBlocked', { adId: ad.id, message: String(error) });
        message.textContent = 'Tap Play Ad to start the mock video.';
        action.disabled = false;
        action.textContent = 'Play Ad';
        action.onclick = () => {
          action.disabled = true;
          action.textContent = 'Watch the video';
          play();
        };
      }
    };
    play();
    return result;
  }
}
