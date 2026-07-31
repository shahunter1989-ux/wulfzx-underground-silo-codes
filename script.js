import {
  BUNDLED_CONFIG,
  fetchSourceSnapshot,
  readLastVerified,
  resolveSources,
  writeLastVerified
} from "./silo-data.js";

let activeResolution = {
  config: BUNDLED_CONFIG,
  status: "SYNCING",
  canCopy: false,
  sourceStates: []
};

const worldClockConfig = [
  { label: "Los Angeles", country: "USA", timeZone: "America/Los_Angeles" },
  { label: "New York", country: "USA", timeZone: "America/New_York" },
  { label: "London", country: "United Kingdom", timeZone: "Europe/London" },
  { label: "Paris", country: "France", timeZone: "Europe/Paris" },
  { label: "Dubai", country: "UAE", timeZone: "Asia/Dubai" },
  { label: "Tokyo", country: "Japan", timeZone: "Asia/Tokyo" },
  { label: "Sydney", country: "Australia", timeZone: "Australia/Sydney" }
];

const elements = {
  alphaCode: document.getElementById("alphaCode"),
  bravoCode: document.getElementById("bravoCode"),
  charlieCode: document.getElementById("charlieCode"),
  validRange: document.getElementById("validRange"),
  resetText: document.getElementById("resetText"),
  requiredItem: document.getElementById("requiredItem"),
  statusText: document.getElementById("statusText"),
  countdownText: document.getElementById("countdownText"),
  sourceWarning: document.getElementById("sourceWarning"),
  sourceHealth: document.getElementById("sourceHealth"),
  visitorZone: document.getElementById("visitorZone"),
  visitorTime: document.getElementById("visitorTime"),
  visitorDate: document.getElementById("visitorDate"),
  visitorDayOfYear: document.getElementById("visitorDayOfYear"),
  worldClockGrid: document.getElementById("worldClockGrid")
};

const visitorTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const timeFormatterCache = new Map();

function getTimeFormatter(timeZone) {
  if (!timeFormatterCache.has(timeZone)) {
    timeFormatterCache.set(timeZone, new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZone
    }));
  }
  return timeFormatterCache.get(timeZone);
}

function formatValidRange(fromValue, toValue) {
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Los_Angeles"
  });
  const endFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles"
  });
  return `${dateFormatter.format(new Date(fromValue))} – ${endFormatter.format(new Date(toValue))}`;
}

function formatResetText(toValue) {
  return `Next reset — ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short"
  }).format(new Date(toValue))}`;
}

function warningFor(status) {
  if (status === "LIVE") return "Single current source — awaiting independent confirmation.";
  if (status === "CONFLICT") return "Source conflict — last agreed codes shown; copying disabled.";
  if (status === "FALLBACK") return "Both sources unavailable — cached or bundled codes shown; copying disabled.";
  if (status === "EXPIRED") return "Code window expired — wait for a current source before launching.";
  return "";
}

function renderSourceHealth(states) {
  elements.sourceHealth.replaceChildren(...states.map((source) => {
    const link = document.createElement("a");
    link.href = source.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = `${source.label} · ${source.status}${source.lastUpdated ? ` · ${new Date(source.lastUpdated).toLocaleString()}` : ""}`;
    if (source.message) link.title = source.message;
    return link;
  }));
}

function renderResolution(resolution = activeResolution) {
  const { config, status, canCopy, sourceStates } = resolution;
  elements.alphaCode.textContent = config.alpha;
  elements.bravoCode.textContent = config.bravo;
  elements.charlieCode.textContent = config.charlie;
  elements.validRange.textContent = formatValidRange(config.validFrom, config.validTo);
  elements.resetText.textContent = formatResetText(config.validTo);
  elements.requiredItem.textContent = "One Nuclear Keycard";
  elements.statusText.textContent = status;
  [elements.alphaCode, elements.bravoCode, elements.charlieCode].forEach((button) => {
    button.disabled = !canCopy;
  });
  const warning = warningFor(status);
  elements.sourceWarning.hidden = !warning;
  elements.sourceWarning.textContent = warning;
  renderSourceHealth(sourceStates);
}

async function refreshSiloCodes() {
  if (window.location.protocol === "file:") return;
  try {
    const snapshot = await fetchSourceSnapshot();
    activeResolution = resolveSources(snapshot, readLastVerified());
    if (activeResolution.status === "VERIFIED") writeLastVerified(activeResolution.config);
  } catch (error) {
    activeResolution = resolveSources({ candidates: [], sourceStates: [] }, readLastVerified());
    console.warn("Silo synchronization failed.", error);
  }
  renderResolution();
  updateCountdown();
}

async function copyCode(event) {
  const button = event.currentTarget;
  if (button.disabled || !activeResolution.canCopy) return;
  try {
    await navigator.clipboard.writeText(button.textContent);
    const original = elements.statusText.textContent;
    elements.statusText.textContent = `${button.dataset.silo} COPIED`;
    window.setTimeout(() => {
      elements.statusText.textContent = original;
    }, 1200);
  } catch {
    elements.statusText.textContent = "COPY FAILED";
  }
}

function getDayOfYear(date) {
  const start = Date.UTC(date.getFullYear(), 0, 1);
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((today - start) / 86400000) + 1;
}

function renderWorldClockRows() {
  elements.worldClockGrid.innerHTML = worldClockConfig.map((clock, index) => `
    <div class="world-clock-row ${[0, 1, 2, 5].includes(index) ? "world-clock-primary" : "world-clock-secondary"}" data-clock-index="${index}">
      <span class="world-clock-place">${clock.label}</span>
      <span class="world-clock-country">${clock.country}</span>
      <span class="world-clock-zone">${clock.timeZone}</span>
      <time class="world-clock-time" data-world-time="${index}">--:--:--</time>
    </div>
  `).join("");
}

function updateTelemetry() {
  const now = new Date();
  const localDateFormatter = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  elements.visitorZone.textContent = visitorTimeZone;
  elements.visitorTime.textContent = getTimeFormatter(visitorTimeZone).format(now);
  elements.visitorDate.textContent = localDateFormatter.format(now);
  elements.visitorDayOfYear.textContent = `${getDayOfYear(now)} / ${now.getFullYear()}`;
  worldClockConfig.forEach((clock, index) => {
    const timeElement = document.querySelector(`[data-world-time="${index}"]`);
    if (timeElement) {
      timeElement.textContent = getTimeFormatter(clock.timeZone).format(now);
      timeElement.dateTime = now.toISOString();
    }
  });
}

function updateCountdown() {
  const remaining = Date.parse(activeResolution.config.validTo) - Date.now();
  if (remaining <= 0) {
    elements.countdownText.textContent = "AWAITING NEW ENCLAVE AUTHORIZATION";
    return;
  }
  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  elements.countdownText.textContent = `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

[elements.alphaCode, elements.bravoCode, elements.charlieCode].forEach((button) => {
  button.addEventListener("click", copyCode);
});
renderResolution();
renderWorldClockRows();
updateCountdown();
updateTelemetry();
refreshSiloCodes();
window.setInterval(updateCountdown, 1000);
window.setInterval(updateTelemetry, 1000);
window.setInterval(refreshSiloCodes, 15 * 60 * 1000);
window.addEventListener("focus", refreshSiloCodes);
window.addEventListener("online", refreshSiloCodes);
