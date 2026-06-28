// Weekly silo code config. Update this block when the codes rotate.
const siloConfig = {
  alpha: "48880142",
  bravo: "20284491",
  charlie: "38280383",
  validFrom: "2026-06-24T17:00:00-07:00",
  validTo: "2026-07-01T17:00:00-07:00",
  resetText: "Every Tuesday \u2014 5:00 PM PDT",
  requiredItem: "Nuclear Keycard",
  status: "AUTHORIZED"
};

const elements = {
  alphaCode: document.getElementById("alphaCode"),
  bravoCode: document.getElementById("bravoCode"),
  charlieCode: document.getElementById("charlieCode"),
  validRange: document.getElementById("validRange"),
  resetText: document.getElementById("resetText"),
  requiredItem: document.getElementById("requiredItem"),
  statusText: document.getElementById("statusText"),
  countdownText: document.getElementById("countdownText")
};

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

function renderConfig() {
  elements.alphaCode.textContent = siloConfig.alpha;
  elements.bravoCode.textContent = siloConfig.bravo;
  elements.charlieCode.textContent = siloConfig.charlie;
  elements.validRange.textContent = formatValidRange(
    siloConfig.validFrom,
    siloConfig.validTo
  );
  elements.resetText.textContent = siloConfig.resetText;
  elements.requiredItem.textContent = siloConfig.requiredItem;
  elements.statusText.textContent = siloConfig.status;
}

function updateCountdown() {
  const target = new Date(siloConfig.validTo).getTime();
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
updateCountdown();
window.setInterval(updateCountdown, 1000);
