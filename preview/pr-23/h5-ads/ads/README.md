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

## SDK-owned Mock UI (development only)

The Mock provider now creates and removes its own Shadow DOM dialog through
`MockAdOverlay.js`. Integrating games **must not** supply `mockRoot`, Mock
dialog HTML or mock-specific CSS. The mobile UI occupies the viewport; on
desktop it is a centered dialog. The provider uses the manifest-backed
`assets/mock/265552.mp4` (about 30 seconds); copy the manifest and creative
into the adopting game's development-only preview asset output and check the
actual URL, MIME type, playback and license/provenance. The Mock overlay has
no game-specific wording such as "revive" or "spin".

The video auto-plays muted inline when the browser allows it, or offers a
Play button. Ordinary native seeking is disabled. The X button **before**
completion pauses the video and asks: "광고를 닫으면 보상을 받을 수 없습니다.
종료하시겠습니까?" Choosing "계속 시청" resumes playback; "종료하기"
returns `user-close` without reward. When the video finishes naturally, the
explicit "보상 받기" button must be pressed to produce the normalized success
triple. Closing after the end but before pressing claim does not reward.
Load errors and timeout return failure without a reward. Lifecycle hooks
remain game-owned; never mutate gameplay state inside the provider.

Example game initialization:
```js
const ads = new AdsService({
  environment: buildAdEnvironment,
  publisherId: '', // mock-only development
  manifestUrl: './assets/mock/manifest.json',
  fallbackAds: [{
    id: 'ad-001',
    video: 'assets/mock/265552.mp4',
    clickUrl: 'https://fiverocksgames.github.io/game-hub/',
    formats: ['rewarded', 'interstitial'],
    weight: 1
  }]
});
const result = await ads.showRewarded('daily_spin');
// Only the game may grant a spin, on the exact success triple.
```

Production remains fail-closed: this feature is not live ad enablement or
server-side reward verification. UI unit tests simulate browser events;
mobile/desktop playback and focus/accessibility require separate device testing.


## Mock presentation vs. Google H5 ad UI

The development mock is deliberately **not** Google's actual rendered ad or
an official UI replica. Its browser-viewport video, clearly marked mock label,
close affordance, and rewarded completion flow are a visual/behavioral approximation
for game integration. The mock has no separate advertiser-site CTA. Clicking or tapping the video opens the manifest's validated advertiser URL in a new tab; this click-through never grants a reward. Keyboard users may open the URL with Enter or Space when the video is focused. On narrow screens the full source frame is preserved
(`object-fit: contain`) and unused space is black. The reward button becomes
usable only after video `ended` and still requires an explicit click, per the
current FiveRocks test-flow decision; actual Google H5 rewarded entitlement is
signaled by its `adViewed` callback, and its ad UI is controlled by Google.
Do not overlay this mock UI on Google creative or treat the mock as Google
certification. See the official Ad Placement API docs and policies for real ads.
