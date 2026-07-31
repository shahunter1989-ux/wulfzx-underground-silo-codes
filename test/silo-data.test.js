import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeFo76Silo,
  normalizeMirror,
  resolveSources
} from "../silo-data.js";

const fo = {
  site: "FO76Silo",
  source: "https://fo76silo.com/",
  codes: { alpha: "11112222", bravo: "33334444", charlie: "55556666" },
  sinceIso: "2026-08-06T00:00:00.000Z",
  nextResetIso: "2026-08-13T00:00:00.000Z",
  generatedAt: "2026-08-06T00:04:00.000Z"
};

const mirror = {
  alpha: "11112222",
  bravo: "33334444",
  charlie: "55556666",
  validFrom: "2026-08-05T17:00:00-07:00",
  validTo: "2026-08-12T17:00:00-07:00",
  source: "https://nukacrypt.com/api/codes",
  lastUpdated: "2026-08-06T00:05:00.000Z"
};

const states = [
  { id: "fo76silo", label: "FO76Silo", href: "https://fo76silo.com/", status: "CURRENT" },
  { id: "mirror", label: "Mirror", href: "/data", status: "CURRENT" }
];

test("normalizes both public feed formats", () => {
  assert.deepEqual(normalizeFo76Silo(fo).alpha, normalizeMirror(mirror).alpha);
  assert.equal(normalizeFo76Silo(fo).validFrom, normalizeMirror(mirror).validFrom);
});

test("rejects malformed codes and date windows", () => {
  assert.throws(() => normalizeFo76Silo({ ...fo, codes: { ...fo.codes, alpha: "123" } }));
  assert.throws(() => normalizeMirror({ ...mirror, validTo: mirror.validFrom }));
});

test("returns VERIFIED for agreement and LIVE for one source", () => {
  const primary = normalizeFo76Silo(fo);
  const secondary = normalizeMirror(mirror);
  const now = Date.parse("2026-08-07T00:00:00.000Z");
  const verified = resolveSources({
    candidates: [{ id: "fo76silo", config: primary }, { id: "mirror", config: secondary }],
    sourceStates: states
  }, null, now);
  assert.equal(verified.status, "VERIFIED");
  assert.equal(verified.canCopy, true);
  const live = resolveSources({
    candidates: [{ id: "fo76silo", config: primary }],
    sourceStates: states.slice(0, 1)
  }, null, now);
  assert.equal(live.status, "LIVE");
});

test("retains the last agreed result and disables copy on conflict", () => {
  const primary = normalizeFo76Silo(fo);
  const secondary = normalizeMirror({ ...mirror, alpha: "99990000" });
  const previous = normalizeMirror(mirror);
  const result = resolveSources({
    candidates: [{ id: "fo76silo", config: primary }, { id: "mirror", config: secondary }],
    sourceStates: states
  }, previous, Date.parse("2026-08-07T00:00:00.000Z"));
  assert.equal(result.status, "CONFLICT");
  assert.equal(result.config.alpha, previous.alpha);
  assert.equal(result.canCopy, false);
});

test("returns FALLBACK when both fail and EXPIRED when data is stale", () => {
  assert.equal(resolveSources({ candidates: [], sourceStates: [] }, null).status, "FALLBACK");
  const result = resolveSources({
    candidates: [{ id: "fo76silo", config: normalizeFo76Silo(fo) }],
    sourceStates: states.slice(0, 1)
  }, null, Date.parse("2026-08-14T00:00:00.000Z"));
  assert.equal(result.status, "EXPIRED");
});
