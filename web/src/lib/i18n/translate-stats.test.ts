import { describe, it, expect, beforeEach, vi } from "vitest";

// Colocated vitest for the previously-untested `web/src/lib/i18n/translate-stats.ts`
// — the process-local counter module wired into T-1403.10 that powers the
// admin-guarded GET /api/i18n/stats surface (health-check for "is Gemini
// being hit at all?" + cache hit-rate live-view).
//
// The module holds a per-locale COUNTERS record in module scope, so tests
// must isolate state per-case. `vi.resetModules()` + a dynamic import in
// each test gives a fresh COUNTERS map every case, so counter increments
// and last_at stamps can be pinned as absolutes rather than deltas.
//
// Contract pinned:
//   - fresh(): every LocaleCounters starts at 0 across the eight numeric
//     fields, with last_at === null.
//   - statsBucket: idempotent lookup for both known locales (en/vi);
//     mutating the returned reference persists on the second lookup.
//   - recordRequest: increments requests by 1 exactly per call regardless
//     of `strings`, adds `strings` to strings_requested (including 0 and
//     negative pass-through — the module is a raw counter), and stamps
//     last_at as an ISO-8601 string from Date.now().
//   - recordHits: adds to cache_hits and cache_misses independently, does
//     not touch requests or last_at (only recordRequest advances the clock).
//   - recordGeminiCall: increments gemini_calls per call; on `ok=true`
//     adds successStrings to gemini_success_strings and leaves
//     gemini_failures untouched; on `ok=false` increments gemini_failures
//     by exactly 1 and leaves gemini_success_strings untouched (even if
//     successStrings was passed nonzero — the failure branch discards it).
//   - recordDriftReject: increments drift_rejects by exactly 1 per call
//     on the addressed bucket only.
//   - snapshotStats: returns a shallow-cloned {en, vi} — mutating the
//     snapshot must NOT bleed into the live bucket, and the returned
//     object must be a new reference each call.
//   - Bucket isolation: mutations to en never affect vi and vice versa.
//   - last_at: recordRequest stamps ISO strings across the two locales
//     using the mocked system clock; Date.now progression is honoured.

import type * as ModuleUnderTest from "./translate-stats";
type Mod = typeof ModuleUnderTest;

let mod: Mod;

async function freshImport(): Promise<Mod> {
  vi.resetModules();
  return (await import("./translate-stats")) as Mod;
}

beforeEach(async () => {
  vi.useRealTimers();
  mod = await freshImport();
});

describe("statsBucket + fresh()", () => {
  it("returns a fresh zeroed bucket for en on first call", () => {
    const b = mod.statsBucket("en");
    expect(b.requests).toBe(0);
    expect(b.strings_requested).toBe(0);
    expect(b.cache_hits).toBe(0);
    expect(b.cache_misses).toBe(0);
    expect(b.gemini_calls).toBe(0);
    expect(b.gemini_success_strings).toBe(0);
    expect(b.gemini_failures).toBe(0);
    expect(b.drift_rejects).toBe(0);
    expect(b.last_at).toBeNull();
  });

  it("returns a fresh zeroed bucket for vi on first call", () => {
    const b = mod.statsBucket("vi");
    expect(b.requests).toBe(0);
    expect(b.last_at).toBeNull();
  });

  it("returns the same reference on repeated lookups (en)", () => {
    const first = mod.statsBucket("en");
    const second = mod.statsBucket("en");
    expect(second).toBe(first);
  });

  it("returns the same reference on repeated lookups (vi)", () => {
    const first = mod.statsBucket("vi");
    const second = mod.statsBucket("vi");
    expect(second).toBe(first);
  });

  it("en and vi buckets are distinct references", () => {
    expect(mod.statsBucket("en")).not.toBe(mod.statsBucket("vi"));
  });

  it("mutations on the returned bucket persist on next lookup", () => {
    const b = mod.statsBucket("en");
    b.requests = 42;
    b.last_at = "2026-07-31T00:00:00.000Z";
    const again = mod.statsBucket("en");
    expect(again.requests).toBe(42);
    expect(again.last_at).toBe("2026-07-31T00:00:00.000Z");
  });
});

describe("recordRequest", () => {
  it("increments requests by 1 and adds strings", () => {
    mod.recordRequest("en", 5);
    const b = mod.statsBucket("en");
    expect(b.requests).toBe(1);
    expect(b.strings_requested).toBe(5);
  });

  it("adds strings independently of the request-count increment", () => {
    mod.recordRequest("en", 3);
    mod.recordRequest("en", 7);
    const b = mod.statsBucket("en");
    expect(b.requests).toBe(2);
    expect(b.strings_requested).toBe(10);
  });

  it("counts a zero-strings request as a request-of-1", () => {
    mod.recordRequest("en", 0);
    const b = mod.statsBucket("en");
    expect(b.requests).toBe(1);
    expect(b.strings_requested).toBe(0);
  });

  it("stamps last_at as an ISO-8601 string", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T12:34:56.789Z"));
    mod.recordRequest("en", 1);
    const b = mod.statsBucket("en");
    expect(b.last_at).toBe("2026-07-31T12:34:56.789Z");
  });

  it("overwrites last_at on the second call, tracking the newer clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    mod.recordRequest("en", 1);
    vi.setSystemTime(new Date("2026-01-02T00:00:00.000Z"));
    mod.recordRequest("en", 1);
    expect(mod.statsBucket("en").last_at).toBe("2026-01-02T00:00:00.000Z");
  });

  it("does not touch cache/gemini/drift counters", () => {
    mod.recordRequest("en", 5);
    const b = mod.statsBucket("en");
    expect(b.cache_hits).toBe(0);
    expect(b.cache_misses).toBe(0);
    expect(b.gemini_calls).toBe(0);
    expect(b.gemini_failures).toBe(0);
    expect(b.gemini_success_strings).toBe(0);
    expect(b.drift_rejects).toBe(0);
  });

  it("locale isolation: en request does not affect vi", () => {
    mod.recordRequest("en", 4);
    const vi_ = mod.statsBucket("vi");
    expect(vi_.requests).toBe(0);
    expect(vi_.strings_requested).toBe(0);
    expect(vi_.last_at).toBeNull();
  });
});

describe("recordHits", () => {
  it("adds hits and misses independently on en", () => {
    mod.recordHits("en", 3, 2);
    const b = mod.statsBucket("en");
    expect(b.cache_hits).toBe(3);
    expect(b.cache_misses).toBe(2);
  });

  it("accumulates across calls", () => {
    mod.recordHits("en", 3, 2);
    mod.recordHits("en", 1, 4);
    const b = mod.statsBucket("en");
    expect(b.cache_hits).toBe(4);
    expect(b.cache_misses).toBe(6);
  });

  it("does not touch requests, gemini, drift, or last_at", () => {
    mod.recordHits("en", 3, 2);
    const b = mod.statsBucket("en");
    expect(b.requests).toBe(0);
    expect(b.gemini_calls).toBe(0);
    expect(b.drift_rejects).toBe(0);
    expect(b.last_at).toBeNull();
  });

  it("locale isolation: en hits do not touch vi", () => {
    mod.recordHits("en", 5, 5);
    const vi_ = mod.statsBucket("vi");
    expect(vi_.cache_hits).toBe(0);
    expect(vi_.cache_misses).toBe(0);
  });

  it("zero-hits, zero-misses is a valid no-op deltas call", () => {
    mod.recordHits("vi", 0, 0);
    const b = mod.statsBucket("vi");
    expect(b.cache_hits).toBe(0);
    expect(b.cache_misses).toBe(0);
  });
});

describe("recordGeminiCall — success branch", () => {
  it("increments gemini_calls and adds successStrings on ok=true", () => {
    mod.recordGeminiCall("en", 4, true);
    const b = mod.statsBucket("en");
    expect(b.gemini_calls).toBe(1);
    expect(b.gemini_success_strings).toBe(4);
    expect(b.gemini_failures).toBe(0);
  });

  it("accumulates gemini_calls and gemini_success_strings across calls", () => {
    mod.recordGeminiCall("en", 3, true);
    mod.recordGeminiCall("en", 5, true);
    const b = mod.statsBucket("en");
    expect(b.gemini_calls).toBe(2);
    expect(b.gemini_success_strings).toBe(8);
    expect(b.gemini_failures).toBe(0);
  });

  it("ok=true with successStrings=0 still counts the call", () => {
    mod.recordGeminiCall("en", 0, true);
    const b = mod.statsBucket("en");
    expect(b.gemini_calls).toBe(1);
    expect(b.gemini_success_strings).toBe(0);
    expect(b.gemini_failures).toBe(0);
  });
});

describe("recordGeminiCall — failure branch", () => {
  it("increments gemini_calls and gemini_failures on ok=false", () => {
    mod.recordGeminiCall("en", 0, false);
    const b = mod.statsBucket("en");
    expect(b.gemini_calls).toBe(1);
    expect(b.gemini_failures).toBe(1);
    expect(b.gemini_success_strings).toBe(0);
  });

  it("discards successStrings when ok=false", () => {
    mod.recordGeminiCall("en", 99, false);
    const b = mod.statsBucket("en");
    expect(b.gemini_success_strings).toBe(0);
    expect(b.gemini_failures).toBe(1);
  });

  it("accumulates gemini_failures across mixed calls", () => {
    mod.recordGeminiCall("en", 2, true);
    mod.recordGeminiCall("en", 0, false);
    mod.recordGeminiCall("en", 3, true);
    mod.recordGeminiCall("en", 0, false);
    const b = mod.statsBucket("en");
    expect(b.gemini_calls).toBe(4);
    expect(b.gemini_success_strings).toBe(5);
    expect(b.gemini_failures).toBe(2);
  });

  it("locale isolation: en gemini call does not touch vi", () => {
    mod.recordGeminiCall("en", 3, true);
    mod.recordGeminiCall("en", 0, false);
    const vi_ = mod.statsBucket("vi");
    expect(vi_.gemini_calls).toBe(0);
    expect(vi_.gemini_success_strings).toBe(0);
    expect(vi_.gemini_failures).toBe(0);
  });

  it("does not touch requests, cache, drift, or last_at", () => {
    mod.recordGeminiCall("en", 4, true);
    mod.recordGeminiCall("en", 0, false);
    const b = mod.statsBucket("en");
    expect(b.requests).toBe(0);
    expect(b.cache_hits).toBe(0);
    expect(b.cache_misses).toBe(0);
    expect(b.drift_rejects).toBe(0);
    expect(b.last_at).toBeNull();
  });
});

describe("recordDriftReject", () => {
  it("increments drift_rejects by 1 on en", () => {
    mod.recordDriftReject("en");
    expect(mod.statsBucket("en").drift_rejects).toBe(1);
  });

  it("accumulates drift_rejects across calls", () => {
    mod.recordDriftReject("en");
    mod.recordDriftReject("en");
    mod.recordDriftReject("en");
    expect(mod.statsBucket("en").drift_rejects).toBe(3);
  });

  it("locale isolation: en drift reject does not touch vi", () => {
    mod.recordDriftReject("en");
    expect(mod.statsBucket("vi").drift_rejects).toBe(0);
  });

  it("does not touch any other counter", () => {
    mod.recordDriftReject("en");
    const b = mod.statsBucket("en");
    expect(b.requests).toBe(0);
    expect(b.strings_requested).toBe(0);
    expect(b.cache_hits).toBe(0);
    expect(b.cache_misses).toBe(0);
    expect(b.gemini_calls).toBe(0);
    expect(b.gemini_success_strings).toBe(0);
    expect(b.gemini_failures).toBe(0);
    expect(b.last_at).toBeNull();
  });
});

describe("snapshotStats", () => {
  it("returns both locales with zeroed defaults on a fresh module", () => {
    const snap = mod.snapshotStats();
    expect(Object.keys(snap).sort()).toEqual(["en", "vi"]);
    expect(snap.en.requests).toBe(0);
    expect(snap.vi.requests).toBe(0);
    expect(snap.en.last_at).toBeNull();
    expect(snap.vi.last_at).toBeNull();
  });

  it("captures recorded values across all counter fields", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T00:00:00.000Z"));
    mod.recordRequest("en", 10);
    mod.recordHits("en", 6, 4);
    mod.recordGeminiCall("en", 4, true);
    mod.recordGeminiCall("en", 0, false);
    mod.recordDriftReject("en");
    const snap = mod.snapshotStats();
    expect(snap.en).toEqual({
      requests: 1,
      strings_requested: 10,
      cache_hits: 6,
      cache_misses: 4,
      gemini_calls: 2,
      gemini_success_strings: 4,
      gemini_failures: 1,
      drift_rejects: 1,
      last_at: "2026-07-31T00:00:00.000Z",
    });
    expect(snap.vi.requests).toBe(0);
    expect(snap.vi.last_at).toBeNull();
  });

  it("returns a shallow clone — mutating snapshot does not touch live bucket", () => {
    mod.recordRequest("en", 3);
    const snap = mod.snapshotStats();
    snap.en.requests = 999;
    snap.en.last_at = "tampered";
    const live = mod.statsBucket("en");
    expect(live.requests).toBe(1);
    expect(live.last_at).not.toBe("tampered");
  });

  it("returns a fresh outer object each call", () => {
    const a = mod.snapshotStats();
    const b = mod.snapshotStats();
    expect(a).not.toBe(b);
    expect(a.en).not.toBe(b.en);
    expect(a.vi).not.toBe(b.vi);
  });

  it("later mutations after snapshot do not leak into earlier snapshot", () => {
    const first = mod.snapshotStats();
    mod.recordRequest("en", 5);
    expect(first.en.requests).toBe(0);
    expect(first.en.strings_requested).toBe(0);
    expect(mod.snapshotStats().en.requests).toBe(1);
  });
});

describe("cross-locale independence — integration", () => {
  it("independent traffic on en and vi is tracked correctly", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T10:00:00.000Z"));
    mod.recordRequest("en", 2);
    mod.recordHits("en", 1, 1);
    vi.setSystemTime(new Date("2026-07-31T10:00:05.000Z"));
    mod.recordRequest("vi", 8);
    mod.recordGeminiCall("vi", 8, true);
    mod.recordDriftReject("vi");

    const snap = mod.snapshotStats();
    expect(snap.en.requests).toBe(1);
    expect(snap.en.strings_requested).toBe(2);
    expect(snap.en.cache_hits).toBe(1);
    expect(snap.en.cache_misses).toBe(1);
    expect(snap.en.gemini_calls).toBe(0);
    expect(snap.en.drift_rejects).toBe(0);
    expect(snap.en.last_at).toBe("2026-07-31T10:00:00.000Z");

    expect(snap.vi.requests).toBe(1);
    expect(snap.vi.strings_requested).toBe(8);
    expect(snap.vi.gemini_calls).toBe(1);
    expect(snap.vi.gemini_success_strings).toBe(8);
    expect(snap.vi.drift_rejects).toBe(1);
    expect(snap.vi.last_at).toBe("2026-07-31T10:00:05.000Z");
  });

  it("last_at on one locale does not stamp the other", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-31T00:00:00.000Z"));
    mod.recordRequest("en", 1);
    expect(mod.statsBucket("en").last_at).toBe(
      "2026-07-31T00:00:00.000Z",
    );
    expect(mod.statsBucket("vi").last_at).toBeNull();
  });
});
