// Google H5 Games Ads adapter: all SDK callbacks terminate in normalized outcomes.
export class GoogleAdsProvider {
  constructor({ publisherId = '', log = () => {}, onStatus = () => {} } = {}) {
    this.publisherId = publisherId;
    this.log = log;
    this.onStatus = onStatus;
    this.ready = false;
    this.failed = false;
    this.initialized = false;
  }

  initialize() {
    if (this.initialized || !/^ca-pub-\d{16}$/.test(this.publisherId)) return;
    this.initialized = true;
    this.onStatus('Waiting ready');
    window.adsbygoogle = window.adsbygoogle || [];
    window.adBreak = window.adConfig = function (options) { window.adsbygoogle.push(options); };
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.dataset.adbreakTest = 'on'; // This provider is test-only.
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(this.publisherId);
    script.onerror = () => { this.failed = true; this.onStatus('SDK load failed'); this.log('sdk:error'); };
    document.head.appendChild(script);
    try {
      window.adConfig({
        preloadAdBreaks: 'on',
        sound: 'on',
        onReady: () => { this.ready = true; this.onStatus('Ready'); this.log('sdk:onReady'); }
      });
    } catch (error) {
      this.failed = true;
      this.onStatus('Unavailable');
      this.log('sdk:configError', { message: String(error) });
    }
  }

  async show(format, { placement, onStart = () => {}, onFinish = () => {} } = {}) {
    if (!this.ready || this.failed) return { completed: false, rewarded: false, reason: 'unavailable' };
    return new Promise(resolve => {
      let started = false;
      let viewed = false;
      let after = false;
      let done = false;
      let status = '';
      let settled = false;
      const finish = outcome => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        if (started && !after) onFinish();
        resolve(outcome);
      };
      const normalize = () => {
        if (format === 'rewarded') {
          const success = viewed && started && after;
          return { completed: success, rewarded: success, reason: success ? 'success' : status === 'dismissed' ? 'user-close' : status === 'notReady' ? 'unavailable' : 'no-fill' };
        }
        const success = started && after;
        return { completed: success, rewarded: false, reason: success ? 'success' : 'no-fill' };
      };
      const timeout = setTimeout(() => finish({ completed: false, rewarded: false, reason: 'timeout' }), 90000);
      try {
        window.adBreak({
          type: format === 'rewarded' ? 'reward' : 'next',
          name: 'asteroid_' + placement,
          ...(format === 'rewarded' ? {
            beforeReward: showAd => showAd(),
            adViewed: () => { viewed = true; this.log('google:adViewed', { placement }); },
            adDismissed: () => { this.log('google:adDismissed', { placement }); }
          } : {}),
          beforeAd: () => { started = true; onStart(); this.log('google:beforeAd', { format, placement }); },
          afterAd: () => {
            after = true;
            onFinish();
            this.log('google:afterAd', { format, placement });
            if (done) finish(normalize());
          },
          adBreakDone: info => {
            done = true;
            status = info && info.breakStatus || 'unknown';
            this.log('google:adBreakDone', { format, placement, status });
            if (!started || after) finish(normalize());
          }
        });
      } catch (error) {
        this.log('google:requestError', { message: String(error) });
        finish({ completed: false, rewarded: false, reason: 'provider-error' });
      }
    });
  }
}
