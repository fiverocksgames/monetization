const fallbackGames = [
  { id: "hub", name: "Game Hub", runtime: "static", enabled: true },
  { id: "math-rain", name: "Math Rain", runtime: "vanilla", enabled: true },
  { id: "memory-game", name: "Memory Game", runtime: "vanilla", enabled: true },
  { id: "make-it-max", name: "Make It Max", runtime: "react", enabled: true }
];

const state = {
  games: fallbackGames,
  stats: { opportunities: 0, shown: 0, skipped: 0, rewarded: 0, failed: 0 },
  lastInterstitialAt: 0,
  delayedAnchorTimer: null
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

function openGame(game) {
  $("hub-view").classList.add("hidden");
  $("game-view").classList.remove("hidden");
  $("current-game").textContent = game.name;
  $("game-frame").src = gameUrl(game);
  hideHubAds();
}

function showHub() {
  $("game-frame").src = "about:blank";
  $("game-view").classList.add("hidden");
  $("hub-view").classList.remove("hidden");
  applyBannerMode();
}

function updateStats() {
  $("stats").textContent = JSON.stringify(state.stats, null, 2);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function showAd(kind) {
  state.stats.opportunities++;
  updateStats();

  const scenario = $("scenario").value;
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

$("back-hub").addEventListener("click", showHub);
$("show-interstitial").addEventListener("click", () => showAd("interstitial"));
$("show-rewarded").addEventListener("click", () => showAd("rewarded"));
$("test-interstitial").addEventListener("click", () => showAd("interstitial"));
$("test-rewarded").addEventListener("click", () => showAd("rewarded"));
$("open-debug").addEventListener("click", () => $("debug-panel").classList.toggle("hidden"));
$("ad-close").addEventListener("click", () => $("ad-overlay").classList.add("hidden"));
$("anchor-close").addEventListener("click", () => $("anchor-banner").classList.add("hidden"));
$("banner-mode").addEventListener("change", applyBannerMode);
$("anchor-delay").addEventListener("change", applyBannerMode);

await loadRegistry();
await loadBuildMetadata();
renderHub();
updateStats();
applyBannerMode();
