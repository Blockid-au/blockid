// Colocated vitest for S31-A model-registry hygiene (model-strikes.ts).
// Pure functions only — the cron wiring is pinned in ai-health-check.

import { describe, expect, it } from "vitest";
import type { HealthResult } from "./health-check";
import {
  DEAD_RUNG_HOURS,
  DEFAULT_PRUNE_STRIKES,
  PRUNE_MEMORY_DAYS,
  applyHealthResults,
  classifyDeadRung,
  compactStrikes,
  deadRungs,
  isDeadRung,
  markDeadRung,
  providerCapacity,
  pruneDeadModels,
  recentlyPruned,
  strikeKey,
  unfundedProviders,
  type StrikeFile,
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

// ── G29-A — dead rungs. Fixtures are the `failed:` lines of the 2026-09-21
// showcase re-runs (scratchpad showcase-rerun5/6/7.log), verbatim heads. ──

const LOG_2026_09_21 = {
  sambanovaPayment: 'HTTP 402: {"error":{"balance_units":0,"billing_portal_url":"https://cloud.sambanova.ai/plans/billing","code":"PAYMENT_METHOD_REQUIRED","message":"A payment method is required. Add one at https://cloud.sambanova',
  cerebrasPayment: 'HTTP 402: {"message":"Payment required to access this resource. Visit your billing tab.","type":"payment_required_error","param":"quota","code":"payment_required"}',
  cerebrasArchived: 'HTTP 404: {"message":"Model gemma-4-31b is archived and unavailable for the organization.","type":"model_archived_error","param":"model","code":"model_archived"}',
  cerebrasNotFound: 'HTTP 404: {"message":"Model does not exist or you do not have access to it.","type":"not_found_error","param":"model","code":"model_not_found"}',
  sambanovaNotFound: 'HTTP 404: {"error":{"code":"model_not_found","message":"The model `Qwen3-235B-A22B-Instruct-2507` does not exist or you do not have access to it.","param":"model","type":"invalid_request_error"},"request_id":"2',
  gemini429: "HTTP 429: {",
  groq413: 'HTTP 413: {"error":{"message":"Request too large for model `qwen/qwen3.8-27b` in organization `org_x` service tier `on_demand` on input tokens per minute (ITPM): Limit 7000, Requested 8',
  groq429: 'HTTP 429: {"error":{"message":"Request too large for model `qwen/qwen3.8-27b` in organization `org_x` service tier `on_demand` on output tokens per minute (OTPM): Limit 1000, Requested ',
  deepinfraTimeout: "Worker timeout (120s)",
  deepinfraBusy: 'HTTP 429: {"error":{"message":"Model busy, retry later","type":"invalid_request_error","param":null,"code":"engine_overloaded"}}',
  gemini503: "HTTP 503: {\"error\":{\"code\":503,\"message\":\"The model is overloaded. Please try again later.\",\"status\":\"UNAVAILABLE\"}}",
};

const T1 = new Date("2026-09-21T10:00:00Z");

describe("G29-A classifyDeadRung — the 2026-09-21 log lines", () => {
  it("402 / payment_required / PAYMENT_METHOD_REQUIRED → payment_required", () => {
    expect(classifyDeadRung({ message: LOG_2026_09_21.sambanovaPayment })).toBe("payment_required");
    expect(classifyDeadRung({ message: LOG_2026_09_21.cerebrasPayment })).toBe("payment_required");
    expect(classifyDeadRung({ status: 402, message: "" })).toBe("payment_required");
  });
  it("404 model_archived → model_archived; 404 model_not_found / does not exist → model_not_found", () => {
    expect(classifyDeadRung({ message: LOG_2026_09_21.cerebrasArchived })).toBe("model_archived");
    expect(classifyDeadRung({ message: LOG_2026_09_21.cerebrasNotFound })).toBe("model_not_found");
    expect(classifyDeadRung({ message: LOG_2026_09_21.sambanovaNotFound })).toBe("model_not_found");
    expect(classifyDeadRung({ status: 404, message: '{"error":"No endpoints found for x:free"}' })).toBe("model_not_found");
    // health-check shape: status + body without the HTTP prefix
    expect(classifyDeadRung({ status: 404, message: "Not Found" })).toBe("model_not_found");
  });
  it("429 / 413 / 503 / worker timeout / engine_overloaded are NOT dead rungs (transient — keep their cooldowns)", () => {
    for (const m of [LOG_2026_09_21.gemini429, LOG_2026_09_21.groq413, LOG_2026_09_21.groq429, LOG_2026_09_21.deepinfraTimeout, LOG_2026_09_21.deepinfraBusy, LOG_2026_09_21.gemini503]) {
      expect(classifyDeadRung({ message: m })).toBeNull();
    }
    expect(classifyDeadRung({ status: 429, message: "quota exceeded" })).toBeNull();
    expect(classifyDeadRung({ status: 401, message: "invalid api key" })).toBeNull();
    expect(classifyDeadRung({})).toBeNull();
  });
});

describe("G29-A markDeadRung / isDeadRung / deadRungs", () => {
  it("stamps dead_until = now + 24 h, keeps pruned_at, counts a strike; lapses after the window", () => {
    expect(DEAD_RUNG_HOURS).toBe(24);
    const prior = { "cerebras::gemma-4-31b": { strikes: 1, last_status: "timeout", last_at: "x", pruned_at: "2026-09-14T02:00:10.419Z" } };
    const s = markDeadRung(prior, "cerebras", "gemma-4-31b", "model_archived", T1);
    expect(s["cerebras::gemma-4-31b"]).toEqual({
      strikes: 2, last_status: "model_archived", last_at: T1.toISOString(), pruned_at: "2026-09-14T02:00:10.419Z",
      dead_until: "2026-09-22T10:00:00.000Z", dead_reason: "model_archived", dead_at: T1.toISOString(),
    });
    expect(isDeadRung(s, "cerebras", "gemma-4-31b", T1)).toBe(true);
    expect(isDeadRung(s, "cerebras", "gemma-4-31b", new Date("2026-09-22T09:59:59Z"))).toBe(true);
    expect(isDeadRung(s, "cerebras", "gemma-4-31b", new Date("2026-09-22T10:00:00Z"))).toBe(false); // retried once after the window
    expect(isDeadRung(s, "cerebras", "other", T1)).toBe(false);
    expect(deadRungs(s, T1)).toEqual({ cerebras: new Set(["gemma-4-31b"]) });
    expect(deadRungs(s, new Date("2026-09-23T00:00:00Z"))).toEqual({});
    expect(prior["cerebras::gemma-4-31b"].dead_until).toBeUndefined(); // pure
  });
});

describe("G29-A applyHealthResults + pruneDeadModels — one dead probe drops the rung at once, one healthy probe clears it", () => {
  function hr(provider: string, model: string, status: HealthResult["status"], http: number, error?: string): HealthResult {
    return { provider, model, status, healthy: status === "healthy", quota_exceeded: status === "quota_exceeded", latency_ms: 1, http_status: http, error, checked_at: "x" };
  }
  it("a 402 / 404 probe is dead immediately (not after 3 strikes); a 429 probe is a plain strike", () => {
    const s = applyHealthResults({}, [
      hr("cerebras", "gpt-oss-120b", "quota_exceeded", 402, LOG_2026_09_21.cerebrasPayment.slice(10)),
      hr("cerebras", "gemma-4-31b", "not_found", 404, LOG_2026_09_21.cerebrasArchived.slice(10)),
      hr("groq", "qwen/qwen3.8-27b", "quota_exceeded", 429, "rate limit"),
    ], T1);
    expect(s["cerebras::gpt-oss-120b"]).toMatchObject({ strikes: 1, dead_reason: "payment_required", dead_until: "2026-09-22T10:00:00.000Z" });
    expect(s["cerebras::gemma-4-31b"]).toMatchObject({ strikes: 1, dead_reason: "model_archived" });
    expect(s["groq::qwen/qwen3.8-27b"]).toEqual({ strikes: 1, last_status: "quota_exceeded", last_at: T1.toISOString() });
    const out = pruneDeadModels({ cerebras: ["gemma-4-31b", "gpt-oss-120b", "llama-3.1-8b"], groq: ["qwen/qwen3.8-27b"] }, s, 3, T1);
    expect(out.config).toEqual({ cerebras: ["llama-3.1-8b"], groq: ["qwen/qwen3.8-27b"] });
    expect(out.removed).toEqual({ cerebras: ["gemma-4-31b", "gpt-oss-120b"] });
    expect(out.strikes["cerebras::gemma-4-31b"].pruned_at).toBe(T1.toISOString());
    // recentlyPruned: the dead rungs stay out of discovery even before pruned_at is stamped.
    expect([...(recentlyPruned(s, T1).cerebras ?? [])].sort()).toEqual(["gemma-4-31b", "gpt-oss-120b"]);
    expect(recentlyPruned(s, T1).groq).toBeUndefined();
  });
  it("a timeout inside the dead window keeps the dead stamp; a healthy probe forgets the rung", () => {
    let s = applyHealthResults({}, [hr("sambanova", "DeepSeek-V3.2", "quota_exceeded", 402, LOG_2026_09_21.sambanovaPayment.slice(10))], T1);
    s = applyHealthResults(s, [hr("sambanova", "DeepSeek-V3.2", "timeout", 0, "timeout after 5000ms")], new Date(T1.getTime() + 30 * 60_000));
    expect(s["sambanova::DeepSeek-V3.2"]).toMatchObject({ strikes: 2, last_status: "timeout", dead_reason: "payment_required", dead_until: "2026-09-22T10:00:00.000Z" });
    s = applyHealthResults(s, [hr("sambanova", "DeepSeek-V3.2", "healthy", 200)], new Date(T1.getTime() + 60 * 60_000));
    expect(s["sambanova::DeepSeek-V3.2"]).toBeUndefined();
  });
  it("compactStrikes keeps a live dead rung even when its last_at is older than the memory window", () => {
    const old = new Date("2026-08-01T00:00:00Z");
    const s = { "x::m": { strikes: 1, last_status: "model_not_found", last_at: old.toISOString(), dead_until: "2026-09-22T10:00:00.000Z" as string } };
    expect(Object.keys(compactStrikes(s, T1))).toEqual(["x::m"]);
    expect(Object.keys(compactStrikes({ "x::m": { strikes: 1, last_status: "timeout", last_at: old.toISOString() } }, T1))).toEqual([]);
  });
});

describe("G29-A providerCapacity — the 2026-09-21 chain", () => {
  const ladders = {
    cerebras: ["gemma-4-31b", "gpt-oss-120b", "qwen-3-32b", "llama-3.3-70b", "llama-3.1-8b"],
    sambanova: ["DeepSeek-R1", "Qwen3-235B-A22B-Instruct-2507", "DeepSeek-V3.2", "DeepSeek-V3.1", "gpt-oss-120b", "gemma-4-31B-it", "Meta-Llama-3.3-70B-Instruct", "Meta-Llama-3.1-8B-Instruct", "DeepSeek-V3-0324"],
    groq: ["qwen/qwen3.8-27b", "openai/gpt-oss-120b"],
    deepinfra: ["deepseek-ai/DeepSeek-V4-Flash", "deepseek-ai/DeepSeek-V3.2"],
  };
  function chain(): StrikeFile {
    let s: StrikeFile = {};
    s = markDeadRung(s, "cerebras", "gemma-4-31b", "model_archived", T1);
    s = markDeadRung(s, "cerebras", "qwen-3-32b", "model_not_found", T1);
    s = markDeadRung(s, "cerebras", "llama-3.3-70b", "model_not_found", T1);
    s = markDeadRung(s, "cerebras", "gpt-oss-120b", "payment_required", T1);
    for (const m of ["DeepSeek-V3.2", "DeepSeek-V3.1", "gpt-oss-120b", "gemma-4-31B-it", "Meta-Llama-3.3-70B-Instruct"]) s = markDeadRung(s, "sambanova", m, "payment_required", T1);
    s = markDeadRung(s, "sambanova", "Qwen3-235B-A22B-Instruct-2507", "model_not_found", T1);
    s = markDeadRung(s, "sambanova", "DeepSeek-V3-0324", "model_not_found", T1);
    return s;
  }
  it("Cerebras (402 on one rung) and SambaNova (402 on every rung) are unfunded; Groq / DeepInfra (429 / timeouts only) stay ok", () => {
    const cap = providerCapacity(chain(), ladders, T1);
    expect(cap.cerebras).toEqual({ state: "unfunded", reason: "payment_required", dead: ["gemma-4-31b", "gpt-oss-120b", "qwen-3-32b", "llama-3.3-70b"], total: 5, until: "2026-09-22T10:00:00.000Z" });
    expect(cap.sambanova).toMatchObject({ state: "unfunded", reason: "payment_required", total: 9 });
    expect(cap.sambanova.dead).toHaveLength(7);
    expect(cap.groq).toEqual({ state: "ok", dead: [], total: 2, until: null });
    expect(cap.deepinfra).toEqual({ state: "ok", dead: [], total: 2, until: null });
    expect(unfundedProviders(cap)).toEqual(["cerebras", "sambanova"]);
  });
  it("every rung 404 (no 402) → unfunded all_rungs_dead; some rungs dead → degraded; the window lapsing → ok again", () => {
    let s: StrikeFile = {};
    for (const m of ladders.groq) s = markDeadRung(s, "groq", m, "model_not_found", T1);
    expect(providerCapacity(s, { groq: ladders.groq }, T1).groq).toMatchObject({ state: "unfunded", reason: "all_rungs_dead", total: 2 });
    const partial = markDeadRung({}, "groq", "qwen/qwen3.8-27b", "model_not_found", T1);
    expect(providerCapacity(partial, { groq: ladders.groq }, T1).groq).toEqual({ state: "degraded", dead: ["qwen/qwen3.8-27b"], total: 2, until: "2026-09-22T10:00:00.000Z" });
    expect(providerCapacity(s, { groq: ladders.groq }, new Date("2026-09-22T10:00:01Z")).groq).toEqual({ state: "ok", dead: [], total: 2, until: null });
    // a 402 on a rung that has since left the ladder still marks the account unfunded
    const gone = markDeadRung({}, "cerebras", "old-model", "payment_required", T1);
    expect(providerCapacity(gone, { cerebras: ["llama-3.1-8b"] }, T1).cerebras).toMatchObject({ state: "unfunded", reason: "payment_required", dead: [] });
    expect(providerCapacity(gone, { cerebras: [] }, T1)).toEqual({});
  });
});
