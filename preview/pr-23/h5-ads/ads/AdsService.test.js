import test from 'node:test';
import assert from 'node:assert/strict';
import { AdsService } from './AdsService.js';
import { MockAdsProvider } from './MockAdsProvider.js';

function outcome(completed = false, rewarded = false, reason = 'unavailable') {
  return { completed, rewarded, reason };
}

test('production fails closed without initializing Google or Mock', async () => {
  const service = new AdsService({ environment: 'production', publisherId: 'ca-pub-1234567890123456' });
  assert.equal(service.mock, null);
  assert.equal(service.google.initialized, false);
  assert.deepEqual(await service.showRewarded('revive'), outcome());
  assert.deepEqual(await service.showInterstitial('level_complete'), outcome());
});

test('development falls back to mock when Google is unavailable', async () => {
  const service = new AdsService({ environment: 'development', fallbackAds: [] });
  let calls = 0;
  service.mock = {
    show: async (format, hooks) => {
      calls++;
      hooks.onStart();
      hooks.onFinish();
      return outcome(true, format === 'rewarded', 'success');
    }
  };
  let starts = 0;
  let finishes = 0;
  const result = await service.showRewarded('revive', {
    onStart: () => starts++,
    onFinish: () => finishes++
  });
  assert.deepEqual(result, outcome(true, true, 'success'));
  assert.equal(calls, 1);
  assert.equal(starts, 1);
  assert.equal(finishes, 1);
});

test('started real ad failure never chains to a second mock ad', async () => {
  const service = new AdsService({ environment: 'development', fallbackAds: [] });
  service.google.ready = true;
  service.google.show = async (_format, hooks) => {
    hooks.onStart();
    hooks.onFinish();
    return outcome(false, false, 'user-close');
  };
  service.mock = { show: () => { throw new Error('must not invoke mock after an ad starts'); } };
  assert.deepEqual(await service.showRewarded('revive'), outcome(false, false, 'user-close'));
});

test('concurrent requests return busy, rather than showing two ads', async () => {
  const service = new AdsService({ environment: 'development', fallbackAds: [] });
  let resolveFirst;
  service.mock = { show: () => new Promise(resolve => { resolveFirst = resolve; }) };
  const first = service.showInterstitial('level_complete');
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(await service.showRewarded('revive'), outcome(false, false, 'busy'));
  resolveFirst(outcome(true, false, 'success'));
  assert.deepEqual(await first, outcome(true, false, 'success'));
});

test('mock selection honors format and avoids back-to-back repeats', () => {
  const provider = Object.create(MockAdsProvider.prototype);
  provider.ads = [
    { id: 'a', weight: 1, formats: ['rewarded'] },
    { id: 'b', weight: 3, formats: ['rewarded', 'interstitial'] },
    { id: 'c', weight: 1, formats: ['interstitial'] }
  ];
  provider.log = () => {};
  provider.lastAdId = '';
  const first = provider.select('rewarded');
  const second = provider.select('rewarded');
  assert.notEqual(first.id, second.id);
  const interstitial = provider.select('interstitial');
  assert.ok(['b', 'c'].includes(interstitial.id));
});

test('mock URL and video manifest validation fail closed', () => {
  assert.equal(MockAdsProvider.validUrl('javascript:alert(1)'), '');
  assert.equal(MockAdsProvider.normalize({
    id: 'bad', video: '../other.mp4', clickUrl: 'https://example.com',
    formats: ['rewarded'], weight: 1
  }), null);
  assert.equal(MockAdsProvider.normalize({
    id: 'valid', video: 'assets/mock/265552.mp4',
    clickUrl: 'https://fiverocksgames.github.io/game-hub/',
    formats: ['rewarded', 'interstitial'], weight: 1
  }).id, 'valid');
});
