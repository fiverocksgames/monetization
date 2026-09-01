const fallbackGames = [
  { id: "hub", name: "Game Hub", runtime: "static", enabled: true },
  { id: "math-rain", name: "Math Rain", runtime: "react", enabled: true },
  { id: "memory-game", name: "Memory Game", runtime: "react", enabled: true },
  { id: "make-it-max", name: "Make It Max", runtime: "react", enabled: true }
];

const CONTRACT_VERSION = 2;
const REQUEST_TYPE = "fiverocks:monetization:request";
const RESPONSE_TYPE = "fiverocks:monetization:response";
const EVENT_TYPE = "fiverocks:monetization:event";

const state = {
  games: fallbackGames,
  stats: { opportunities: 0, shown: 0, skipped: 0, rewarded: 0, failed: 0 },
  lastInterstitialAt: 0,
  delayedAnchorTimer: null,
  activeGame: null,
  activeAdRequest: null,
  activeAdScenario: null,
  activeAdContext: null,
  events: []
};

const $ = (id) => document.getElementById(id);

async function loadRegistry() {
  try {
    const response = await fetch("./config/games.json", { cache: "no-store" });
    if (!response.ok) throw new Error("registry unavailable");
    const registry = await response.json();
    state.games = registry.games.filter((g) => g.enabled);
  } catch {
    state.games = fallbackGames;
  }
}

async function loadBuildMetadata() {
  try {
    const response = await fetch("./DEPLOYMENT_PROVENANCE.json", { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    const sha = data.sourceCommit || data.sourceSha;
    if (sha) $("build-id").textContent = `Build ${sha.slice(0, 7)}`;
  } catch {}
}

function gameUrl(game) {
  return `./games/${game.id}/`;
}

function renderHub() {
  const grid = $("game-grid");
  grid.innerHTML = "";
  for (const game of state.games) {
    if (game.id === "hub") continue;
    const card = document.createElement("article");
    card.className = "game-card";
    card.innerHTML = `
      <span class="runtime">${game.runtime}</span>
      <h3>${game.name}</h3>
      <p>Monetization Lab 내부 복제본에서 광고 흐름을 테스트합니다.</p>
      <button type="button">Play in Lab</button>
    `;
    card.querySelector("button").addEventListener("click", () => openGame(game));
    grid.append(card);
  }
}

function openGame(game, { pushHistory = true } = {}) {
  state.activeGame = game;
  $("hub-view").classList.add("hidden");
  $("game-view").classList.remove("hidden");
  $("current-game").textContent = game.name;
  $("game-frame").src = gameUrl(game);
  hideHubAds();

  if (pushHistory) {
    history.pushState({ labView: "game", gameId: game.id }, "", `#game=${encodeURIComponent(game.id)}`);
  }
}

function showHub({ replaceHistory = false } = {}) {
  state.activeGame = null;
  $("game-frame").src = "about:blank";
  $("game-view").classList.add("hidden");
  $("hub-view").classList.remove("hidden");
  applyBannerMode();

  const method = replaceHistory ? "replaceState" : "pushState";
  history[method]({ labView: "hub" }, "", location.pathname + location.search);
}

function handleGameFrameNavigation() {
  if (!state.activeGame) return;

  try {
    const frame = $("game-frame");
    const frameUrl = new URL(frame.contentWindow.location.href);
    if (frameUrl.href === "about:blank") return;

    const expectedPrefix = new URL(gameUrl(state.activeGame), location.href).pathname;
    if (!frameUrl.pathname.startsWith(expectedPrefix)) {
      showHub({ replaceHistory: true });
    }
  } catch {
    showHub({ replaceHistory: true });
  }
}

function updateStats() {
  $("stats").textContent = JSON.stringify(state.stats, null, 2);
}

function renderEvents() {
  const recent = state.events.slice(-20).reverse().map((event) => ({
    time: event.timestamp.slice(11, 19),
    event: event.event,
    game: event.gameId,
    placement: event.placement,
    scenario: event.scenario,
    reason: event.reason
  }));
  $("events").textContent = recent.length
    ? recent.map((event) => JSON.stringify(event)).join("\n")
    : "No ad events yet.";
}

function recordAdEvent(event, details = {}) {
  const item = {
    timestamp: new Date().toISOString(),
    event,
    gameId: details.gameId || state.activeGame?.id || "lab",
    format: details.format || "unknown",
    placement: details.placement || "manual",
    requestId: details.requestId || null,
    scenario: details.scenario || null,
    reason: details.reason || null
  };

  state.events.push(item);
  if (state.events.length > 100) state.events.shift();

  if (event === "ad_opportunity") state.stats.opportunities++;
  if (event === "ad_shown") state.stats.shown++;
  if (event === "ad_rewarded") state.stats.rewarded++;
  if (event === "ad_failed") {
    state.stats.failed++;
    if (item.reason === "busy" || item.reason === "cooldown") state.stats.skipped++;
  }

  updateStats();
  renderEvents();
}

function respondToRequest(request, rewarded, reason) {
  if (!request?.source) return;

  const response = {
    type: RESPONSE_TYPE,
    requestId: request.requestId,
    completed: reason === "success",
    rewarded,
    reason
  };

  if (request.schemaVersion === CONTRACT_VERSION) {
    Object.assign(response, {
      schemaVersion: CONTRACT_VERSION,
      gameId: request.gameId,
      format: request.format,
      placement: request.placement
    });
  }

  request.source.postMessage(response, request.origin || location.origin);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function showAd(kind, request = null) {
  const scenario = $("scenario").value;
  const context = request
    ? {
        gameId: request.gameId,
        format: request.format,
        placement: request.placement,
        requestId: request.requestId,
        scenario
      }
    : {
        gameId: state.activeGame?.id || "lab",
        format: kind,
        placement: "manual",
        requestId: crypto.randomUUID(),
        scenario
      };

  if (!request) {
    recordAdEvent("ad_opportunity", context);
    recordAdEvent("ad_requested", context);
  }

  if (!$("ad-overlay").classList.contains("hidden")) {
    recordAdEvent("ad_failed", { ...context, reason: "busy" });
    respondToRequest(request, false, "busy");
    return;
  }

  state.activeAdRequest = request;
  state.activeAdScenario = scenario;
  state.activeAdContext = context;

  const latency = Number($("latency").value || 0);

  if (kind === "interstitial") {
    const cooldownMs = Number($("cooldown").value || 0) * 1000;
    if (Date.now() - state.lastInterstitialAt < cooldownMs) {
      recordAdEvent("ad_failed", { ...context, reason: "cooldown" });
      respondToRequest(request, false, "cooldown");
      state.activeAdRequest = null;
      state.activeAdScenario = null;
      state.activeAdContext = null;
      return;
    }
  }

  $("ad-kind").textContent = kind === "rewarded" ? "Rewarded Ad" : "Interstitial Ad";
  $("ad-status").textContent = "Loading…";
  $("ad-close").disabled = true;
  $("ad-overlay").classList.remove("hidden");

  await delay(latency);

  if (scenario === "no-fill" || scenario === "load-error") {
    recordAdEvent("ad_failed", { ...context, reason: scenario });
    $("ad-status").textContent = scenario === "no-fill" ? "No Fill" : "Load Error";

    if (kind === "interstitial" && request) {
      $("ad-overlay").classList.add("hidden");
      state.activeAdRequest = null;
      state.activeAdScenario = null;
      state.activeAdContext = null;
      respondToRequest(request, false, scenario);
      return;
    }

    $("ad-close").disabled = false;
    return;
  }

  recordAdEvent("ad_loaded", context);
  recordAdEvent("ad_shown", context);
  if (kind === "interstitial") state.lastInterstitialAt = Date.now();

  $("ad-status").textContent = scenario === "user-close"
    ? "User may close now"
    : kind === "rewarded"
      ? "Ad completed · reward granted"
      : "Ad completed";
  $("ad-close").disabled = false;
}
function hideHubAds() {
  clearTimeout(state.delayedAnchorTimer);
  $("inline-banner").classList.add("hidden");
  $("anchor-banner").classList.add("hidden");
}

function applyBannerMode() {
  hideHubAds();
  if ($("hub-view").classList.contains("hidden")) return;

  const mode = $("banner-mode").value;
  if (mode === "inline") {
    $("inline-banner").classList.remove("hidden");
  } else if (mode === "anchor") {
    $("anchor-banner").classList.remove("hidden");
  } else if (mode === "delayed-anchor") {
    const delayMs = Number($("anchor-delay").value || 0);
    state.delayedAnchorTimer = setTimeout(() => {
      if (!$("hub-view").classList.contains("hidden") && $("banner-mode").value === "delayed-anchor") {
        $("anchor-banner").classList.remove("hidden");
      }
    }, delayMs);
  }
}

$("back-hub").addEventListener("click", () => history.back());
$("show-interstitial").addEventListener("click", () => showAd("interstitial"));
$("show-rewarded").addEventListener("click", () => showAd("rewarded"));
$("test-interstitial").addEventListener("click", () => showAd("interstitial"));
$("test-rewarded").addEventListener("click", () => showAd("rewarded"));
$("open-debug").addEventListener("click", () => {
  $("debug-panel").classList.remove("hidden");
  $("debug-panel").classList.remove("minimized");
  $("minimize-debug").textContent = "−";
  $("minimize-debug").setAttribute("aria-label", "디버그 패널 최소화");
});
$("close-debug").addEventListener("click", () => $("debug-panel").classList.add("hidden"));
$("minimize-debug").addEventListener("click", () => {
  const minimized = $("debug-panel").classList.toggle("minimized");
  $("minimize-debug").textContent = minimized ? "□" : "−";
  $("minimize-debug").setAttribute("aria-label", minimized ? "디버그 패널 복원" : "디버그 패널 최소화");
});
$("game-frame").addEventListener("load", handleGameFrameNavigation);
window.addEventListener("message", (event) => {
  const frameWindow = $("game-frame").contentWindow;
  if (!state.activeGame || event.source !== frameWindow || event.origin !== location.origin) return;

  const data = event.data;
  if (!data) return;

  if (data.type === EVENT_TYPE) {
    if (data.schemaVersion !== CONTRACT_VERSION
      || data.gameId !== state.activeGame.id
      || data.event !== "ad_opportunity"
      || typeof data.placement !== "string"
      || typeof data.format !== "string") return;

    recordAdEvent("ad_opportunity", {
      gameId: data.gameId,
      format: data.format,
      placement: data.placement,
      requestId: data.eventId
    });
    return;
  }

  if (data.type !== REQUEST_TYPE) return;

  const isV2 = data.schemaVersion === CONTRACT_VERSION;
  const isLegacy = data.schemaVersion == null || data.schemaVersion === 1;
  const gameId = isV2 ? data.gameId : state.activeGame.id;
  const placement = data.placement === "retry" ? "revive" : data.placement;

  const formatAllowed = isV2
    ? data.format === "rewarded" || data.format === "interstitial"
    : data.format === "rewarded";

  if ((!isV2 && !isLegacy)
    || gameId !== state.activeGame.id
    || !formatAllowed
    || typeof data.requestId !== "string"
    || typeof placement !== "string") {
    const invalidRequest = {
      source: event.source,
      origin: event.origin,
      schemaVersion: isV2 ? CONTRACT_VERSION : 1,
      requestId: data.requestId,
      gameId: gameId || state.activeGame.id,
      format: data.format,
      placement: placement || "unknown"
    };
    recordAdEvent("ad_failed", { ...invalidRequest, reason: "unavailable" });
    respondToRequest(invalidRequest, false, "unavailable");
    return;
  }

  const request = {
    source: event.source,
    origin: event.origin,
    schemaVersion: isV2 ? CONTRACT_VERSION : 1,
    requestId: data.requestId,
    gameId,
    format: data.format,
    placement
  };

  // v0.1 clients did not report opportunities separately.
  if (isLegacy) recordAdEvent("ad_opportunity", request);
  recordAdEvent("ad_requested", request);
  showAd(data.format, request);
});
window.addEventListener("popstate", (event) => {
  if (event.state?.labView === "game" && event.state.gameId) {
    const game = state.games.find((item) => item.id === event.state.gameId);
    if (game) {
      openGame(game, { pushHistory: false });
      return;
    }
  }

  state.activeGame = null;
  $("game-frame").src = "about:blank";
  $("game-view").classList.add("hidden");
  $("hub-view").classList.remove("hidden");
  applyBannerMode();
});
$("ad-close").addEventListener("click", () => {
  $("ad-overlay").classList.add("hidden");
  const request = state.activeAdRequest;
  const scenario = state.activeAdScenario;
  const context = state.activeAdContext;
  state.activeAdRequest = null;
  state.activeAdScenario = null;
  state.activeAdContext = null;

  if (!context) return;

  const rewarded = context.format === "rewarded" && scenario === "success";
  if (rewarded) recordAdEvent("ad_rewarded", { ...context, reason: "success" });
  recordAdEvent("ad_closed", {
    ...context,
    reason: rewarded ? "success" : scenario
  });
  respondToRequest(request, rewarded, rewarded ? "success" : scenario);
});
$("anchor-close").addEventListener("click", () => $("anchor-banner").classList.add("hidden"));
$("banner-mode").addEventListener("change", applyBannerMode);
$("anchor-delay").addEventListener("change", applyBannerMode);
$("copy-events").addEventListener("click", async () => {
  const payload = [
    "FiveRocks Monetization Lab Debug Log",
    JSON.stringify({ stats: state.stats }),
    ...state.events.map((event) => JSON.stringify(event))
  ].join("\n");

  let copied = false;
  try {
    await navigator.clipboard.writeText(payload);
    copied = true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = payload;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    copied = document.execCommand("copy");
    textarea.remove();
  }

  const button = $("copy-events");
  const original = "Copy";
  button.textContent = copied ? "Copied" : "Copy failed";
  window.setTimeout(() => { button.textContent = original; }, 1200);
});
$("clear-events").addEventListener("click", () => {
  state.events = [];
  renderEvents();
});

await loadRegistry();
await loadBuildMetadata();
renderHub();
updateStats();
renderEvents();
history.replaceState({ labView: "hub" }, "", location.pathname + location.search);
applyBannerMode();
