export const FO76_SILO_URL = "https://fo76silo.com/nuke-codes.json";
export const MIRROR_URL = "data/silo-codes.json";
export const MIRROR_PUBLIC_URL =
  "https://shahunter1989-ux.github.io/wulfzx-underground-silo-codes/data/silo-codes.json";
export const CACHE_KEY = "wulfzx-underground:last-verified:v1";

export const BUNDLED_CONFIG = {
  alpha: "89778792",
  bravo: "30910055",
  charlie: "70360840",
  validFrom: "2026-07-30T00:00:00.000Z",
  validTo: "2026-08-06T00:00:00.000Z",
  lastUpdated: "2026-07-31T05:18:24.000Z",
  sources: [{ id: "bundled", label: "Bundled verified fallback", href: FO76_SILO_URL }]
};

const SOURCE_META = {
  fo76silo: { id: "fo76silo", label: "FO76Silo", href: FO76_SILO_URL },
  mirror: {
    id: "mirror",
    label: "Wulfzx · NukaCrypt mirror",
    href: MIRROR_PUBLIC_URL
  }
};

function assertCode(label, value) {
  if (!/^\d{8}$/.test(value)) throw new Error(`${label} code must be eight digits.`);
}

function iso(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date.`);
  return date.toISOString();
}

function validateWindow(validFrom, validTo) {
  if (Date.parse(validTo) <= Date.parse(validFrom)) {
    throw new Error("The reset must be after the start of the code window.");
  }
}

function normalizedConfig({ alpha, bravo, charlie, validFrom, validTo, lastUpdated, sources }) {
  assertCode("Alpha", alpha);
  assertCode("Bravo", bravo);
  assertCode("Charlie", charlie);
  const normalizedFrom = iso(validFrom, "validFrom");
  const normalizedTo = iso(validTo, "validTo");
  const normalizedUpdated = iso(lastUpdated, "lastUpdated");
  validateWindow(normalizedFrom, normalizedTo);
  return {
    alpha,
    bravo,
    charlie,
    validFrom: normalizedFrom,
    validTo: normalizedTo,
    lastUpdated: normalizedUpdated,
    sources
  };
}

export function normalizeFo76Silo(input) {
  if (!input || typeof input !== "object" || !input.codes) throw new Error("FO76Silo payload is incomplete.");
  return normalizedConfig({
    alpha: input.codes.alpha,
    bravo: input.codes.bravo,
    charlie: input.codes.charlie,
    validFrom: input.sinceIso,
    validTo: input.nextResetIso,
    lastUpdated: input.generatedAt,
    sources: [{
      id: "fo76silo",
      label: input.site || "FO76Silo",
      href: input.source || FO76_SILO_URL
    }]
  });
}

export function normalizeMirror(input) {
  if (!input || typeof input !== "object") throw new Error("Mirror payload is incomplete.");
  return normalizedConfig({
    alpha: input.alpha,
    bravo: input.bravo,
    charlie: input.charlie,
    validFrom: input.validFrom,
    validTo: input.validTo,
    lastUpdated: input.lastUpdated,
    sources: [{
      id: "mirror",
      label: "Wulfzx · NukaCrypt mirror",
      href: SOURCE_META.mirror.href
    }]
  });
}

export function isCurrent(config, now = Date.now()) {
  return now >= Date.parse(config.validFrom) && now < Date.parse(config.validTo);
}

export function codesMatch(left, right) {
  return ["alpha", "bravo", "charlie"].every((key) => left[key] === right[key]);
}

export function resolveSources(snapshot, previousVerified, now = Date.now()) {
  const active = snapshot.candidates.filter((candidate) => isCurrent(candidate.config, now));
  if (active.length === 2) {
    if (codesMatch(active[0].config, active[1].config)) {
      const newest = active.reduce((best, candidate) =>
        Date.parse(candidate.config.lastUpdated) > Date.parse(best.config.lastUpdated) ? candidate : best
      );
      return {
        config: {
          ...newest.config,
          sources: active.flatMap((candidate) => candidate.config.sources)
        },
        status: "VERIFIED",
        canCopy: true,
        sourceStates: snapshot.sourceStates
      };
    }
    return {
      config: previousVerified || active.find((candidate) => candidate.id === "fo76silo")?.config || active[0].config,
      status: "CONFLICT",
      canCopy: false,
      sourceStates: snapshot.sourceStates
    };
  }

  if (active.length === 1) {
    return {
      config: active[0].config,
      status: "LIVE",
      canCopy: true,
      sourceStates: snapshot.sourceStates
    };
  }

  if (snapshot.candidates.length) {
    const newest = snapshot.candidates.reduce((best, candidate) =>
      Date.parse(candidate.config.validFrom) > Date.parse(best.config.validFrom) ? candidate : best
    );
    return {
      config: newest.config,
      status: "EXPIRED",
      canCopy: false,
      sourceStates: snapshot.sourceStates
    };
  }

  return {
    config: previousVerified || BUNDLED_CONFIG,
    status: "FALLBACK",
    canCopy: false,
    sourceStates: snapshot.sourceStates
  };
}

async function fetchJsonWithRetry(url, { fetchImpl, signal, cacheBust }) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const parentAbort = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", parentAbort, { once: true });
    const timeout = globalThis.setTimeout(() => controller.abort(new Error("Request timed out.")), 8000);
    try {
      const requestUrl = cacheBust ? `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}` : url;
      const response = await fetchImpl(requestUrl, {
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
    } finally {
      globalThis.clearTimeout(timeout);
      signal?.removeEventListener("abort", parentAbort);
    }
  }
  throw lastError || new Error("Source request failed.");
}

export async function fetchSourceSnapshot({ fetchImpl = fetch, signal, now = Date.now() } = {}) {
  const requests = [
    fetchJsonWithRetry(FO76_SILO_URL, { fetchImpl, signal, cacheBust: false }).then(normalizeFo76Silo),
    fetchJsonWithRetry(MIRROR_URL, { fetchImpl, signal, cacheBust: true }).then(normalizeMirror)
  ];
  const results = await Promise.allSettled(requests);
  const ids = ["fo76silo", "mirror"];
  const candidates = [];
  const sourceStates = results.map((result, index) => {
    const id = ids[index];
    const meta = SOURCE_META[id];
    if (result.status === "rejected") {
      return { ...meta, status: "UNAVAILABLE", message: result.reason?.message || "Source unavailable." };
    }
    candidates.push({ id, config: result.value });
    return {
      ...meta,
      status: isCurrent(result.value, now) ? "CURRENT" : "STALE",
      lastUpdated: result.value.lastUpdated
    };
  });
  return { candidates, sourceStates };
}

export function readLastVerified(storage = window.localStorage) {
  try {
    const raw = storage.getItem(CACHE_KEY);
    return raw ? normalizedConfig(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeLastVerified(config, storage = window.localStorage) {
  storage.setItem(CACHE_KEY, JSON.stringify(normalizedConfig(config)));
}
