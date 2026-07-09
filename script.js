// Weekly silo code config. Update this block when the codes rotate.
const siloConfig = {
  alpha: "32078894",
  bravo: "54410637",
  charlie: "90574792",
  validFrom: "2026-07-08T17:00:00-07:00",
  validTo: "2026-07-15T17:00:00-07:00",
  requiredItem: "Nuclear Keycard",
  status: "AUTHORIZED"
};

let activeSiloConfig = { ...siloConfig };

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
  visitorZone: document.getElementById("visitorZone"),
  visitorTime: document.getElementById("visitorTime"),
  visitorDate: document.getElementById("visitorDate"),
  visitorDayOfYear: document.getElementById("visitorDayOfYear"),
  worldClockGrid: document.getElementById("worldClockGrid")
};

const visitorTimeZone =
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

const timeFormatterCache = new Map();

function getTimeFormatter(timeZone) {
  if (!timeFormatterCache.has(timeZone)) {
    timeFormatterCache.set(
      timeZone,
      new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
        timeZone
      })
    );
  }

  return timeFormatterCache.get(timeZone);
}

function formatValidRange(fromValue, toValue) {
  const from = new Date(fromValue);
  const to = new Date(toValue);
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

  return `${dateFormatter.format(from)} \u2013 ${endFormatter.format(to)}`;
}

function formatResetText(toValue) {
  const reset = new Date(toValue);
  const resetFormatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
    timeZoneName: "short"
  });

  return `Next reset \u2014 ${resetFormatter.format(reset)}`;
}

function isValidSiloConfig(config) {
  return (
    config &&
    /^\d{8}$/.test(config.alpha) &&
    /^\d{8}$/.test(config.bravo) &&
    /^\d{8}$/.test(config.charlie) &&
    !Number.isNaN(new Date(config.validFrom).getTime()) &&
    !Number.isNaN(new Date(config.validTo).getTime())
  );
}

function renderConfig(config = activeSiloConfig) {
  elements.alphaCode.textContent = config.alpha;
  elements.bravoCode.textContent = config.bravo;
  elements.charlieCode.textContent = config.charlie;
  elements.validRange.textContent = formatValidRange(
    config.validFrom,
    config.validTo
  );
  elements.resetText.textContent = formatResetText(config.validTo);
  elements.requiredItem.textContent = config.requiredItem || siloConfig.requiredItem;
  elements.statusText.textContent = config.status || siloConfig.status;
}

async function loadSiloConfig() {
  if (window.location.protocol === "file:") {
    return;
  }

  try {
    const response = await fetch(`data/silo-codes.json?v=${Date.now()}`, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`Silo code data returned ${response.status}`);
    }

    const remoteConfig = await response.json();

    if (!isValidSiloConfig(remoteConfig)) {
      throw new Error("Silo code data is invalid.");
    }

    activeSiloConfig = {
      ...siloConfig,
      ...remoteConfig
    };
    renderConfig();
    updateCountdown();
  } catch (error) {
    console.warn("Using fallback silo code config.", error);
  }
}

function getDayOfYear(date) {
  const start = Date.UTC(date.getFullYear(), 0, 1);
  const today = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());

  return Math.floor((today - start) / 86400000) + 1;
}

function renderWorldClockRows() {
  elements.worldClockGrid.innerHTML = worldClockConfig
    .map(
      (clock, index) => {
        const clockPriority = [0, 1, 2, 5].includes(index)
          ? "world-clock-primary"
          : "world-clock-secondary";

        return `
        <div class="world-clock-row ${clockPriority}" data-clock-index="${index}">
          <span class="world-clock-place">${clock.label}</span>
          <span class="world-clock-country">${clock.country}</span>
          <span class="world-clock-zone">${clock.timeZone}</span>
          <time class="world-clock-time" data-world-time="${index}">--:--:--</time>
        </div>
      `;
      }
    )
    .join("");
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
  const target = new Date(activeSiloConfig.validTo).getTime();
  const remaining = target - Date.now();

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

renderConfig();
renderWorldClockRows();
updateCountdown();
updateTelemetry();
loadSiloConfig();
window.setInterval(updateCountdown, 1000);
window.setInterval(updateTelemetry, 1000);
