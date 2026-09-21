# H5 Ads provider abstraction (development probe)

The Asteroid Run gameplay uses only `AdsService.showInterstitial('level_complete')` and
`AdsService.showRewarded('revive')`. Providers own Google callbacks, mock inventory,
click-through, and normalized outcomes. The game owns placement timing, pause/resume,
and the single revive decision. This module does not replace the shared browser
`packages/core` Contract v0.2 transport or the Unity Android adapter.

## Policy

- `development` (default for this explicitly development-only probe): if a test
  publisher ID has initialized Google H5 Ads, attempt Google; otherwise use the
  manifest-driven mock provider. When Google returns a no-fill/unavailable response
  before an ad starts, fallback to mock. Never show a second mock after a Google
  creative has started, including dismissed or failed rewarded requests.
- `production` (explicit `window.H5_ADS_PROBE_CONFIG.environment = 'production'`):
  fail closed with `{completed:false,rewarded:false,reason:'unavailable'}`. Live
  Google Ads, publisher IDs, consent, house-ad/reward policy, and production
  fallback are NOT enabled or authorized by this probe.
- Only one request is in flight; concurrent calls return `busy`. Provider failure
  cannot issue a revive. Only `completed:true`, `rewarded:true`, `reason:'success'`
  from the exact rewarded request authorizes the game's single revive.
- Interstitial failure does not block level completion; rewarded failure does not
  award a revive. Google testing always sets `data-adbreak-test='on'`.

## Mock creative inventory

The provider reads `assets/mock/manifest.json`, supports per-creative landing
URLs, eligible formats, positive numeric weights, and immediate repeat avoidance.
It preserves the current `ad-001` creative at `assets/mock/265552.mp4` and
`https://fiverocksgames.github.io/game-hub/`. Query/global `mockClickUrl`
can override the destination in development for diagnostics.
The video must emit its natural `ended` event before the action grants
a normalized successful rewarded outcome. A click never grants a reward.

## Validation

Run `npm test --prefix lab/h5-ads` (Node 22) for the service policy and mock
selection tests. The `H5 Ads Provider Contract` workflow runs them on PRs.
PR preview build/publish validates the static preview separately. CI success
does not establish device playback, real Google inventory delivery, or permission
to enable production ads.
