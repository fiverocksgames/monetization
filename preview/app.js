const fallbackGames = [
  { id: "hub", name: "Game Hub", runtime: "static", enabled: true },
  { id: "math-rain", name: "Math Rain", runtime: "react", enabled: true },
  { id: "memory-game", name: "Memory Game", runtime: "react", enabled: true },
  { id: "make-it-max", name: "Make It Max", runtime: "react", enabled: true }
];

const state = {
  games: fallbackGames,
  stats: { opportunities: 0, shown: 0, skipped: 0, rewarded: 0, failed: 0 },
  lastInterstitialAt: 0,
  delayedAnchorTimer: null,
  activeGame: null,
  activeAdRequest: null,
  activeAdScenario: null
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function showAd(kind, request = null) {
  if (!$("ad-overlay").classList.contains("hidden")) {
    if (request) {
      request.source.postMessage({
        type: "fiverocks:monetization:response",
        requestId: request.requestId,
        rewarded: false,
        reason: "busy"
      }, "*");
    }
    return;
  }

  state.activeAdRequest = request;
  state.activeAdScenario = $("scenario").value;
  state.stats.opportunities++;
  updateStats();

  const scenario = state.activeAdScenario;
  const latency = Number($("latency").value || 0);

  if (kind === "interstitial") {
    const cooldownMs = Number($("cooldown").value || 0) * 1000;
    if (Date.now() - state.lastInterstitialAt < cooldownMs) {
      state.stats.skipped++;
      updateStats();
      return;
    }
  }

  $("ad-kind").textContent = kind === "rewarded" ? "Rewarded Ad" : "Interstitial Ad";
  $("ad-status").textContent = "Loading…";
  $("ad-close").disabled = true;
  $("ad-overlay").classList.remove("hidden");

  await delay(latency);

  if (scenario === "no-fill" || scenario === "load-error") {
    state.stats.failed++;
    $("ad-status").textContent = scenario === "no-fill" ? "No Fill" : "Load Error";
    $("ad-close").disabled = false;
    updateStats();
    return;
  }

  state.stats.shown++;
  if (kind === "interstitial") state.lastInterstitialAt = Date.now();

  $("ad-status").textContent = scenario === "user-close"
    ? "User may close now"
    : kind === "rewarded"
      ? "Ad completed · reward granted"
      : "Ad completed";
  $("ad-close").disabled = false;

  if (kind === "rewarded" && scenario === "success") {
    state.stats.rewarded++;
  }
  updateStats();
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
$("open-debug").addEventListener("click", () => $("debug-panel").classList.toggle("hidden"));
$("close-debug").addEventListener("click", () => $("debug-panel").classList.add("hidden"));
$("game-frame").addEventListener("load", handleGameFrameNavigation);
window.addEventListener("message", (event) => {
  const frameWindow = $("game-frame").contentWindow;
  if (!state.activeGame || event.source !== frameWindow) return;

  const data = event.data;
  if (!data || data.type !== "fiverocks:monetization:request") return;
  if (data.format !== "rewarded" || typeof data.requestId !== "string") {
    event.source.postMessage({
      type: "fiverocks:monetization:response",
      requestId: data.requestId,
      rewarded: false,
      reason: "unavailable"
    }, "*");
    return;
  }

  showAd("rewarded", {
    source: event.source,
    requestId: data.requestId,
    format: data.format,
    placement: data.placement
  });
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
  state.activeAdRequest = null;
  state.activeAdScenario = null;

  if (request) {
    const rewarded = request.format === "rewarded" && scenario === "success";
    request.source.postMessage({
      type: "fiverocks:monetization:response",
      requestId: request.requestId,
      rewarded,
      reason: rewarded ? undefined : scenario
    }, "*");
  }
});
$("anchor-close").addEventListener("click", () => $("anchor-banner").classList.add("hidden"));
$("banner-mode").addEventListener("change", applyBannerMode);
$("anchor-delay").addEventListener("change", applyBannerMode);

await loadRegistry();
await loadBuildMetadata();
renderHub();
updateStats();
history.replaceState({ labView: "hub" }, "", location.pathname + location.search);
applyBannerMode();
