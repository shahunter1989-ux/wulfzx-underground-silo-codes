import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const NUKACRYPT_URL = "https://nukacrypt.com/api/codes";
export const FO76SILO_URL = "https://fo76silo.com/nuke-codes.json";
export const defaultOutputPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../data/silo-codes.json"
);

function assertEightDigitCode(label, value) {
  if (!/^\d{8}$/.test(value)) {
    throw new Error(`${label} code must be 8 digits. Received: ${value}`);
  }
}

function validDate(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is invalid: ${value}`);
  return date;
}

export function toPacificIso(utcValue) {
  const date = validDate(utcValue, "Source date");
  const pacificParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "shortOffset"
  }).formatToParts(date);
  const partMap = Object.fromEntries(pacificParts.map((part) => [part.type, part.value]));
  const offsetMatch = partMap.timeZoneName.replace("GMT", "").match(/^([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!offsetMatch) throw new Error(`Unsupported time zone offset: ${partMap.timeZoneName}`);
  const offset = `${offsetMatch[1]}${offsetMatch[2].padStart(2, "0")}:${offsetMatch[3] || "00"}`;
  return `${partMap.year}-${partMap.month}-${partMap.day}T${partMap.hour}:${partMap.minute}:${partMap.second}${offset}`;
}

export function buildNukaCryptConfig(sourceData, now = new Date()) {
  const alpha = sourceData?.ALPHA;
  const bravo = sourceData?.BRAVO;
  const charlie = sourceData?.CHARLIE;
  assertEightDigitCode("Alpha", alpha);
  assertEightDigitCode("Bravo", bravo);
  assertEightDigitCode("Charlie", charlie);
  const validFromDate = validDate(sourceData.date, "NukaCrypt date");
  const validToDate = new Date(validFromDate.getTime() + 7 * 86400000);
  if (validToDate <= validFromDate) throw new Error("Invalid NukaCrypt validity window.");
  return {
    alpha,
    bravo,
    charlie,
    validFrom: toPacificIso(validFromDate.toISOString()),
    validTo: toPacificIso(validToDate.toISOString()),
    requiredItem: "Nuclear Keycard",
    status: "AUTHORIZED",
    source: NUKACRYPT_URL,
    lastUpdated: now.toISOString(),
    verification: "single-source",
    verifiedAt: null,
    sources: [NUKACRYPT_URL]
  };
}

export function normalizeFo76Silo(sourceData) {
  const alpha = sourceData?.codes?.alpha;
  const bravo = sourceData?.codes?.bravo;
  const charlie = sourceData?.codes?.charlie;
  assertEightDigitCode("FO76Silo Alpha", alpha);
  assertEightDigitCode("FO76Silo Bravo", bravo);
  assertEightDigitCode("FO76Silo Charlie", charlie);
  const validFrom = validDate(sourceData.sinceIso, "FO76Silo sinceIso").toISOString();
  const validTo = validDate(sourceData.nextResetIso, "FO76Silo nextResetIso").toISOString();
  if (Date.parse(validTo) <= Date.parse(validFrom)) throw new Error("Invalid FO76Silo validity window.");
  return { alpha, bravo, charlie, validFrom, validTo };
}

function sameCodes(left, right) {
  return ["alpha", "bravo", "charlie"].every((key) => left[key] === right[key]);
}

function sameWindow(left, right) {
  return Date.parse(left.validFrom) === Date.parse(right.validFrom) &&
    Date.parse(left.validTo) === Date.parse(right.validTo);
}

export function crossCheckConfig(config, fo76Data, now = new Date()) {
  const comparison = normalizeFo76Silo(fo76Data);
  if (sameWindow(config, comparison) && !sameCodes(config, comparison)) {
    throw new Error("FO76Silo and NukaCrypt disagree for the same active window; refusing to overwrite verified data.");
  }
  if (sameWindow(config, comparison) && sameCodes(config, comparison)) {
    return {
      ...config,
      verification: "dual-source",
      verifiedAt: now.toISOString(),
      sources: [NUKACRYPT_URL, FO76SILO_URL]
    };
  }
  return config;
}

export async function fetchJsonWithRetry(url, { fetchImpl = fetch, attempts = 2, timeoutMs = 8000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("Request timed out.")), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        headers: {
          Accept: url === NUKACRYPT_URL ? "*/*" : "application/json",
          "User-Agent": "WulfzxUndergroundSiloCodes/2.0"
        },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`${url} returned ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error(`${url} failed`);
}

export function hasMeaningfulChange(currentConfig, nextConfig) {
  if (!currentConfig) return true;
  return ["alpha", "bravo", "charlie", "validFrom", "validTo", "verification"].some(
    (key) => currentConfig[key] !== nextConfig[key]
  );
}

async function readExistingConfig(outputPath) {
  try {
    return JSON.parse(await readFile(outputPath, "utf8"));
  } catch {
    return null;
  }
}

async function writeAtomically(outputPath, config) {
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`);
    await rename(temporaryPath, outputPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

export async function updateSiloCodes({
  fetchImpl = fetch,
  outputPath = defaultOutputPath,
  now = new Date()
} = {}) {
  const nukaData = await fetchJsonWithRetry(NUKACRYPT_URL, { fetchImpl });
  let nextConfig = buildNukaCryptConfig(nukaData, now);
  try {
    const fo76Data = await fetchJsonWithRetry(FO76SILO_URL, { fetchImpl });
    nextConfig = crossCheckConfig(nextConfig, fo76Data, now);
  } catch (error) {
    if (String(error?.message).includes("disagree")) throw error;
    console.warn(`FO76Silo cross-check unavailable; retaining NukaCrypt update. ${error?.message || error}`);
  }

  const currentConfig = await readExistingConfig(outputPath);
  if (!hasMeaningfulChange(currentConfig, nextConfig)) {
    return { changed: false, config: currentConfig };
  }
  await writeAtomically(outputPath, nextConfig);
  return { changed: true, config: nextConfig };
}

export async function main() {
  const result = await updateSiloCodes();
  console.log(result.changed
    ? `Updated silo codes: Alpha ${result.config.alpha}, Bravo ${result.config.bravo}, Charlie ${result.config.charlie} (${result.config.verification})`
    : "Silo codes are already current.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
