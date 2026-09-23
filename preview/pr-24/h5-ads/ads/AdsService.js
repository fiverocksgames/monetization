import { GoogleAdsProvider } from './GoogleAdsProvider.js';
import { MockAdsProvider } from './MockAdsProvider.js';

// Game-facing Contract v0.2-style service. The game chooses placements, never providers.
export class AdsService {
  constructor({ environment = 'development', publisherId = '', mockRoot, manifestUrl, fallbackAds = [], mockClickUrl = '', mockVideoUrl = '', log = () => {}, onStatus = () => {} } = {}) {
    this.environment = environment;
    this.log = log;
    this.onStatus = onStatus;
    this.busy = false;
    this.google = new GoogleAdsProvider({ publisherId, log, onStatus });
    this.mock = environment === 'development'
      ? new MockAdsProvider({ root: mockRoot, manifestUrl, fallbackAds, clickUrlOverride: mockClickUrl, videoUrlOverride: mockVideoUrl, log })
      : null;
    if (environment === 'development' && publisherId) this.google.initialize();
    else onStatus(environment === 'development' ? 'Mock fallback' : 'Production disabled');
  }

  async request(format, placement, lifecycle = {}) {
    if (this.busy) return { completed: false, rewarded: false, reason: 'busy' };
    this.busy = true;
    let started = false;
    const hooks = {
      onStart: () => { started = true; lifecycle.onStart?.(); },
      onFinish: () => lifecycle.onFinish?.()
    };
    const unavailable = { completed: false, rewarded: false, reason: 'unavailable' };
    try {
      // Production provider enablement/consent is a separate release decision.
      // Do not convert a test publisher ID into a live ad request.
      if (this.environment !== 'development') return unavailable;
      const result = this.google.ready
        ? await this.google.show(format, { placement, ...hooks })
        : unavailable;
      if (result.completed || started || !this.mock) return result;
      this.log('ad:fallback-to-mock', { format, placement, reason: result.reason });
      return await this.mock.show(format, hooks);
    } catch (error) {
      this.log('ad:providerError', { format, placement, message: String(error) });
      return { completed: false, rewarded: false, reason: 'provider-error' };
    } finally {
      this.busy = false;
    }
  }

  showInterstitial(placement = 'level_complete', hooks) {
    return this.request('interstitial', placement, hooks);
  }

  showRewarded(placement = 'revive', hooks) {
    return this.request('rewarded', placement, hooks);
  }
}
