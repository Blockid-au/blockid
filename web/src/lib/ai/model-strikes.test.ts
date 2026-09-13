// Colocated vitest for S31-A model-registry hygiene (model-strikes.ts).
// Pure functions only — the cron wiring is pinned in ai-health-check.

import { describe, expect, it } from "vitest";
import type { HealthResult } from "./health-check";
import {
  DEFAULT_PRUNE_STRIKES,
  PRUNE_MEMORY_DAYS,
  applyHealthResults,
  compactStrikes,
  pruneDeadModels,
  recentlyPruned,
  strikeKey,
} from "./model-strikes";

function r(provider: string, model: string, status: HealthResult["status"]): HealthResult {
  return { provider, model, status, healthy: status === "healthy", quota_exceeded: status === "quota_exceeded", latency_ms: 1, http_status: 0, checked_at: "x" };
}

const T0 = new Date("2026-09-13T00:00:00Z");

describe("applyHealthResults", () => {
  it("counts consecutive non-healthy checks and forgets a model the moment it answers", () => {
    let s = applyHealthResults({}, [r("openrouter", "a:free", "not_found"), r("groq", "b", "quota_exceeded"), r("groq", "c", "healthy")], T0);
    expect(s).toEqual({
      "openrouter::a:free": { strikes: 1, last_status: "not_found", last_at: T0.toISOString() },
      "groq::b": { strikes: 1, last_status: "quota_exceeded", last_at: T0.toISOString() },
    });
    s = applyHealthResults(s, [r("openrouter", "a:free", "timeout"), r("groq", "b", "healthy")], T0);
    expect(s["openrouter::a:free"].strikes).toBe(2);
    expect(s["groq::b"]).toBeUndefined();
  });
});

describe("pruneDeadModels", () => {
  it("removes models at the threshold (default 3), stamps pruned_at, leaves survivors and non-list keys alone", () => {
    expect(DEFAULT_PRUNE_STRIKES).toBe(3);
    const strikes = {
      "openrouter::dead:free": { strikes: 3, last_status: "not_found", last_at: "x" },
      "openrouter::flaky:free": { strikes: 2, last_status: "timeout", last_at: "x" },
      "groq::gone": { strikes: 5, last_status: "not_found", last_at: "x", pruned_at: "2026-09-10T00:00:00.000Z" },
    };
    const cfg = { updatedAt: "t", openrouter: ["dead:free", "flaky:free", "good:free"], groq: ["gone", "ok"], cerebras: ["c1"] };
    const out = pruneDeadModels(cfg, strikes, 3, T0);
    expect(out.config).toEqual({ updatedAt: "t", openrouter: ["flaky:free", "good:free"], groq: ["ok"], cerebras: ["c1"] });
    expect(out.removed).toEqual({ openrouter: ["dead:free"], groq: ["gone"] });
    expect(out.strikes["openrouter::dead:free"].pruned_at).toBe(T0.toISOString());
    expect(out.strikes["groq::gone"].pruned_at).toBe("2026-09-10T00:00:00.000Z"); // first prune date kept
    expect(out.strikes["openrouter::flaky:free"].pruned_at).toBeUndefined();
  });

  it("empties a list when every model is dead (ai-client then uses curated defaults)", () => {
    const out = pruneDeadModels({ groq: ["x"] }, { "groq::x": { strikes: 9, last_status: "not_found", last_at: "x" } }, 3, T0);
    expect(out.config.groq).toEqual([]);
  });
});

describe("recentlyPruned / compactStrikes", () => {
  it("remembers pruned ids for 7 days per provider and forgets older ones", () => {
    expect(PRUNE_MEMORY_DAYS).toBe(7);
    const strikes = {
      [strikeKey("openrouter", "a:free")]: { strikes: 3, last_status: "not_found", last_at: "x", pruned_at: "2026-09-12T00:00:00.000Z" },
      [strikeKey("openrouter", "old:free")]: { strikes: 3, last_status: "not_found", last_at: "x", pruned_at: "2026-09-01T00:00:00.000Z" },
      [strikeKey("groq", "b")]: { strikes: 1, last_status: "timeout", last_at: "2026-09-12T00:00:00.000Z" },
    };
    const mem = recentlyPruned(strikes, T0);
    expect([...(mem.openrouter ?? [])]).toEqual(["a:free"]);
    expect(mem.groq).toBeUndefined();
    const compact = compactStrikes(strikes, T0);
    expect(Object.keys(compact).sort()).toEqual(["groq::b", "openrouter::a:free"]);
  });
});
