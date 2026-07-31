import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  FO76SILO_URL,
  NUKACRYPT_URL,
  buildNukaCryptConfig,
  crossCheckConfig,
  updateSiloCodes
} from "../scripts/update-silo-codes.mjs";

const nuka = {
  date: "2026-08-06 00:00:00Z",
  ALPHA: "11112222",
  BRAVO: "33334444",
  CHARLIE: "55556666"
};

const fo = {
  codes: { alpha: "11112222", bravo: "33334444", charlie: "55556666" },
  sinceIso: "2026-08-06T00:00:00.000Z",
  nextResetIso: "2026-08-13T00:00:00.000Z"
};

function response(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

test("builds and dual-source verifies a valid NukaCrypt config", () => {
  const now = new Date("2026-08-06T00:05:00.000Z");
  const config = crossCheckConfig(buildNukaCryptConfig(nuka, now), fo, now);
  assert.equal(config.verification, "dual-source");
  assert.equal(config.validFrom, "2026-08-05T17:00:00-07:00");
});

test("refuses a same-window source conflict", () => {
  const config = buildNukaCryptConfig(nuka);
  assert.throws(() => crossCheckConfig(config, {
    ...fo,
    codes: { ...fo.codes, alpha: "99990000" }
  }), /disagree/);
});

test("writes atomically, skips unchanged data, and tolerates unavailable cross-check", async () => {
  const directory = await mkdtemp(join(tmpdir(), "wulfzx-silo-"));
  const outputPath = join(directory, "silo-codes.json");
  const now = new Date("2026-08-06T00:05:00.000Z");
  const goodFetch = async (url) => response(url === NUKACRYPT_URL ? nuka : fo);
  try {
    const first = await updateSiloCodes({ fetchImpl: goodFetch, outputPath, now });
    assert.equal(first.changed, true);
    assert.equal(JSON.parse(await readFile(outputPath, "utf8")).verification, "dual-source");
    const second = await updateSiloCodes({ fetchImpl: goodFetch, outputPath, now });
    assert.equal(second.changed, false);

    await writeFile(outputPath, JSON.stringify({ ...first.config, alpha: "00000000" }));
    const degradedFetch = async (url) => url === NUKACRYPT_URL
      ? response(nuka)
      : response({}, false, 503);
    const degraded = await updateSiloCodes({ fetchImpl: degradedFetch, outputPath, now });
    assert.equal(degraded.changed, true);
    assert.equal(degraded.config.verification, "single-source");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
