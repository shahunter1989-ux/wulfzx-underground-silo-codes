import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://nukacrypt.com/api/codes";
const outputPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../data/silo-codes.json"
);

function assertEightDigitCode(label, value) {
  if (!/^\d{8}$/.test(value)) {
    throw new Error(`${label} code must be 8 digits. Received: ${value}`);
  }
}

function toPacificIso(utcValue) {
  const date = new Date(utcValue);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid source date: ${utcValue}`);
  }

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

  const partMap = Object.fromEntries(
    pacificParts.map((part) => [part.type, part.value])
  );
  const offset = partMap.timeZoneName.replace("GMT", "");
  const offsetMatch = offset.match(/^([+-])(\d{1,2})(?::(\d{2}))?$/);

  if (!offsetMatch) {
    throw new Error(`Unsupported time zone offset: ${partMap.timeZoneName}`);
  }

  const normalizedOffset = `${offsetMatch[1]}${offsetMatch[2].padStart(2, "0")}:${offsetMatch[3] || "00"}`;

  return `${partMap.year}-${partMap.month}-${partMap.day}T${partMap.hour}:${partMap.minute}:${partMap.second}${normalizedOffset}`;
}

function buildConfig(sourceData) {
  const alpha = sourceData.ALPHA;
  const bravo = sourceData.BRAVO;
  const charlie = sourceData.CHARLIE;

  assertEightDigitCode("Alpha", alpha);
  assertEightDigitCode("Bravo", bravo);
  assertEightDigitCode("Charlie", charlie);

  const validFromDate = new Date(sourceData.date);
  const validToDate = new Date(validFromDate.getTime() + 7 * 86400000);

  return {
    alpha,
    bravo,
    charlie,
    validFrom: toPacificIso(validFromDate.toISOString()),
    validTo: toPacificIso(validToDate.toISOString()),
    requiredItem: "Nuclear Keycard",
    status: "AUTHORIZED",
    source: SOURCE_URL,
    lastUpdated: new Date().toISOString()
  };
}

async function readExistingConfig() {
  try {
    return JSON.parse(await readFile(outputPath, "utf8"));
  } catch {
    return null;
  }
}

function hasCodeChange(currentConfig, nextConfig) {
  if (!currentConfig) {
    return true;
  }

  return ["alpha", "bravo", "charlie", "validFrom", "validTo"].some(
    (key) => currentConfig[key] !== nextConfig[key]
  );
}

async function main() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      Accept: "*/*",
      "User-Agent": "WulfzxUndergroundSiloCodes/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`NukaCrypt request failed: ${response.status}`);
  }

  const sourceData = await response.json();
  const nextConfig = buildConfig(sourceData);
  const currentConfig = await readExistingConfig();

  if (!hasCodeChange(currentConfig, nextConfig)) {
    console.log("Silo codes are already current.");
    return;
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(nextConfig, null, 2)}\n`);
  console.log(
    `Updated silo codes: Alpha ${nextConfig.alpha}, Bravo ${nextConfig.bravo}, Charlie ${nextConfig.charlie}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
