// Colocated vitest for the platform-wide config lib
// (`web/src/lib/platform-config.ts`) — the canonical fixture every
// pricing surface, credit ledger, SVI band, and admin-editable feature
// flag reads. A silent drift in `CONFIG_DEFAULTS.founding_price_cents`,
// a dropped stage-threshold row, or a broken cache would move the
// entire landing hero + checkout price without any red test.
//
// Pins the observable contract:
//   - CONFIG_DEFAULTS shape (pricing/credit/SVI/feature-flag values),
//     svi_weights sum to 100, stage_thresholds cover 0..100 contiguously
//   - founding_price_aud / growth_price_monthly_aud /
//     growth_price_yearly_aud formatting: whole → no decimals, non-whole
//     founding → 2dp, "/mo" and "/yr" suffixes
//   - getPlatformConfig fallback branches: not-configured, admin null,
//     select error, null data, empty data, thrown import — every branch
//     returns CONFIG_DEFAULTS (never throws)
//   - getPlatformConfig merges known keys, drops unknown keys, accepts
//     nested (svi_weights) overrides as-is
//   - Cache: consecutive calls within TTL do not re-hit the DB;
//     invalidatePlatformConfigCache forces a re-fetch; savePlatformConfig
//     invalidates the cache after a successful upsert
//   - savePlatformConfig returns { ok: false, error } on every failure
//     branch (not-configured, admin null, upsert error, thrown), builds
//     one row per patch entry with the correct {key, value, updated_at
//     ISO, updated_by} shape, uses "admin" default updatedBy, upserts
//     with { onConflict: "key" }
//
// Fake `SupabaseClient` records every from/select/upsert call and
// scripts per-test data/error via mutable `state`. `state.configured =
// false` exercises the not-configured guard; `state.adminNull = true`
// exercises the admin-unavailable guard; `state.throwOnConfigured = true`
// exercises the try/catch outer.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── fake Supabase client + shared state ─────────────────────────────

interface UpsertCapture {
  rows: Array<Record<string, unknown>>;
  options: { onConflict?: string } | undefined;
}

interface FakeState {
  configured: boolean;
  adminNull: boolean;
  throwOnConfigured: boolean;
  selectData: Array<{ key: string; value: unknown }> | null;
  selectError: { message: string } | null;
  upsertError: { message: string } | null;
  throwOnUpsert: boolean;
  configuredCalls: number;
  adminCalls: number;
  fromCalls: string[];
  selectCalls: string[];
  upsertCaptures: UpsertCapture[];
}

const state: FakeState = {
  configured: true,
  adminNull: false,
  throwOnConfigured: false,
  selectData: [],
  selectError: null,
  upsertError: null,
  throwOnUpsert: false,
  configuredCalls: 0,
  adminCalls: 0,
  fromCalls: [],
  selectCalls: [],
  upsertCaptures: [],
};

const fakeClient = {
  from(table: string) {
    state.fromCalls.push(table);
    return {
      select(cols: string) {
        state.selectCalls.push(cols);
        return Promise.resolve({
          data: state.selectData,
          error: state.selectError,
        });
      },
      upsert(rows: Array<Record<string, unknown>>, options?: { onConflict?: string }) {
        state.upsertCaptures.push({ rows, options });
        if (state.throwOnUpsert) throw new Error("upsert-threw");
        return Promise.resolve({ error: state.upsertError });
      },
    };
  },
};

const supabaseMock = {
  isSupabaseConfigured: () => {
    state.configuredCalls += 1;
    if (state.throwOnConfigured) throw new Error("cfg-threw");
    return state.configured;
  },
  getSupabaseAdmin: () => {
    state.adminCalls += 1;
    return state.adminNull ? null : fakeClient;
  },
};

// The module resolves the mock via `await import("@/lib/supabase")`;
// mock both the alias and the relative path the resolver may collapse
// to so vitest never bypasses the mock.
vi.mock("@/lib/supabase", () => supabaseMock);
vi.mock("./supabase", () => supabaseMock);

// ─── import under test (after mocks) ────────────────────────────────

import {
  CONFIG_DEFAULTS,
  founding_price_aud,
  growth_price_monthly_aud,
  growth_price_yearly_aud,
  invalidatePlatformConfigCache,
  getPlatformConfig,
  savePlatformConfig,
  type PlatformConfig,
} from "./platform-config";

// ─── shared resets ───────────────────────────────────────────────────

beforeEach(() => {
  state.configured = true;
  state.adminNull = false;
  state.throwOnConfigured = false;
  state.selectData = [];
  state.selectError = null;
  state.upsertError = null;
  state.throwOnUpsert = false;
  state.configuredCalls = 0;
  state.adminCalls = 0;
  state.fromCalls = [];
  state.selectCalls = [];
  state.upsertCaptures = [];
  invalidatePlatformConfigCache();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── CONFIG_DEFAULTS shape ───────────────────────────────────────────

describe("CONFIG_DEFAULTS — canonical fixture", () => {
  it("pins the Founding plan name/spots/credits (marketing surface)", () => {
    expect(CONFIG_DEFAULTS.founding_plan_name).toBe("Founding 100");
    expect(CONFIG_DEFAULTS.founding_spots_total).toBe(100);
    expect(CONFIG_DEFAULTS.founding_credits).toBe(100);
  });

  it("pins the current Founding price at 500 cents (A$5, per 2026-06-21 bump)", () => {
    expect(CONFIG_DEFAULTS.founding_price_cents).toBe(500);
  });

  it("pins the free-signup credit grant at 5", () => {
    expect(CONFIG_DEFAULTS.free_credits_on_signup).toBe(5);
  });

  it("pins Growth monthly/yearly cents + monthly credit grant", () => {
    expect(CONFIG_DEFAULTS.growth_price_monthly_cents).toBe(9900);
    expect(CONFIG_DEFAULTS.growth_price_yearly_cents).toBe(95000);
    expect(CONFIG_DEFAULTS.growth_plan_credits_monthly).toBe(200);
  });

  it("pins the referral credit grant (2)", () => {
    expect(CONFIG_DEFAULTS.referral_credits).toBe(2);
  });

  it("pins the LAUNCH100 promo tuple + early-bird deadline", () => {
    expect(CONFIG_DEFAULTS.promo_code).toBe("LAUNCH100");
    expect(CONFIG_DEFAULTS.promo_label).toBe("instant access to Founding 100");
    expect(CONFIG_DEFAULTS.early_bird_deadline).toBe("2026-08-01");
  });

  it("pins credit-cost overrides for the four gated features", () => {
    expect(CONFIG_DEFAULTS.credit_cost_svi_analysis).toBe(0.5);
    expect(CONFIG_DEFAULTS.credit_cost_term_sheet).toBe(1);
    expect(CONFIG_DEFAULTS.credit_cost_rnd_report).toBe(1);
    expect(CONFIG_DEFAULTS.credit_cost_evidence_analyze).toBe(0.5);
  });

  it("pins the eight SVI weight axes (every SviWeights key present)", () => {
    const keys = Object.keys(CONFIG_DEFAULTS.svi_weights).sort();
    expect(keys).toEqual(["cgh", "ftv", "iri", "lco", "mpc", "ptd", "svm", "tre"]);
  });

  it("sums SVI weights to 100 (percentage contract)", () => {
    const w = CONFIG_DEFAULTS.svi_weights;
    const sum = w.ftv + w.mpc + w.ptd + w.tre + w.cgh + w.iri + w.lco + w.svm;
    expect(sum).toBe(100);
  });

  it("ships six stage thresholds (Pre-Idea → Scale)", () => {
    expect(CONFIG_DEFAULTS.stage_thresholds.length).toBe(6);
    const stages = CONFIG_DEFAULTS.stage_thresholds.map((s) => s.stage);
    expect(stages).toEqual([
      "Pre-Idea",
      "Idea",
      "Validation",
      "Early Traction",
      "Growth",
      "Scale",
    ]);
  });

  it("covers 0..100 contiguously (prev.max === next.min, first.min=0, last.max=100)", () => {
    const t = CONFIG_DEFAULTS.stage_thresholds;
    expect(t[0].min).toBe(0);
    expect(t[t.length - 1].max).toBe(100);
    for (let i = 1; i < t.length; i += 1) {
      expect(t[i].min).toBe(t[i - 1].max);
    }
  });

  it("attaches a Tailwind bg+text color class to every stage row", () => {
    for (const row of CONFIG_DEFAULTS.stage_thresholds) {
      expect(row.color).toMatch(/^bg-\S+ text-\S+$/);
    }
  });

  it("pins the three shipped feature flags (founding on, waitlist off, linkedin off)", () => {
    expect(CONFIG_DEFAULTS.founding_plan_active).toBe(true);
    expect(CONFIG_DEFAULTS.waitlist_mode).toBe(false);
    expect(CONFIG_DEFAULTS.linkedin_post_enabled).toBe(false);
  });
});

// ─── pure formatters ────────────────────────────────────────────────

describe("founding_price_aud", () => {
  function cfg(cents: number): PlatformConfig {
    return { ...CONFIG_DEFAULTS, founding_price_cents: cents };
  }

  it("formats a whole-dollar price with no decimals (A$5 for 500c)", () => {
    expect(founding_price_aud(cfg(500))).toBe("A$5");
  });

  it("renders A$1 for the original 100c launch price", () => {
    expect(founding_price_aud(cfg(100))).toBe("A$1");
  });

  it("formats a non-whole price with 2 decimals (A$3.50 for 350c)", () => {
    expect(founding_price_aud(cfg(350))).toBe("A$3.50");
  });

  it("preserves the second decimal on odd cents (A$12.45 for 1245c)", () => {
    expect(founding_price_aud(cfg(1245))).toBe("A$12.45");
  });

  it("formats larger whole dollars with no decimals (A$20 for 2000c)", () => {
    expect(founding_price_aud(cfg(2000))).toBe("A$20");
  });

  it("uses the leading A$ (not $) currency prefix", () => {
    expect(founding_price_aud(cfg(500))).toMatch(/^A\$/);
  });
});

describe("growth_price_monthly_aud + growth_price_yearly_aud", () => {
  it("formats 9900c as A$99/mo", () => {
    expect(growth_price_monthly_aud(CONFIG_DEFAULTS)).toBe("A$99/mo");
  });

  it("formats 95000c as A$950/yr", () => {
    expect(growth_price_yearly_aud(CONFIG_DEFAULTS)).toBe("A$950/yr");
  });

  it("suffixes /mo on the monthly formatter and /yr on the yearly formatter", () => {
    expect(growth_price_monthly_aud(CONFIG_DEFAULTS)).toMatch(/\/mo$/);
    expect(growth_price_yearly_aud(CONFIG_DEFAULTS)).toMatch(/\/yr$/);
  });

  it("respects overridden monthly cents (12000 → A$120/mo)", () => {
    const cfg = { ...CONFIG_DEFAULTS, growth_price_monthly_cents: 12000 };
    expect(growth_price_monthly_aud(cfg)).toBe("A$120/mo");
  });

  it("respects overridden yearly cents (120000 → A$1200/yr)", () => {
    const cfg = { ...CONFIG_DEFAULTS, growth_price_yearly_cents: 120000 };
    expect(growth_price_yearly_aud(cfg)).toBe("A$1200/yr");
  });
});

// ─── getPlatformConfig fallback branches ─────────────────────────────

describe("getPlatformConfig — fallback branches", () => {
  it("returns CONFIG_DEFAULTS when supabase is not configured (no query)", async () => {
    state.configured = false;
    const cfg = await getPlatformConfig();
    expect(cfg).toEqual(CONFIG_DEFAULTS);
    expect(state.fromCalls).toEqual([]);
    expect(state.adminCalls).toBe(0);
  });

  it("returns CONFIG_DEFAULTS when getSupabaseAdmin returns null (no query)", async () => {
    state.adminNull = true;
    const cfg = await getPlatformConfig();
    expect(cfg).toEqual(CONFIG_DEFAULTS);
    expect(state.fromCalls).toEqual([]);
  });

  it("returns CONFIG_DEFAULTS when the select returns an error", async () => {
    state.selectError = { message: "boom" };
    const cfg = await getPlatformConfig();
    expect(cfg).toEqual(CONFIG_DEFAULTS);
    expect(state.fromCalls).toEqual(["platform_config"]);
  });

  it("returns CONFIG_DEFAULTS when data is null (no rows)", async () => {
    state.selectData = null;
    const cfg = await getPlatformConfig();
    expect(cfg).toEqual(CONFIG_DEFAULTS);
  });

  it("returns CONFIG_DEFAULTS when data is an empty array (no overrides yet)", async () => {
    state.selectData = [];
    const cfg = await getPlatformConfig();
    expect(cfg).toEqual(CONFIG_DEFAULTS);
  });

  it("returns CONFIG_DEFAULTS when isSupabaseConfigured throws (outer catch)", async () => {
    state.throwOnConfigured = true;
    const cfg = await getPlatformConfig();
    expect(cfg).toEqual(CONFIG_DEFAULTS);
  });

  it("selects exactly 'key, value' from the platform_config table", async () => {
    await getPlatformConfig();
    expect(state.fromCalls).toEqual(["platform_config"]);
    expect(state.selectCalls).toEqual(["key, value"]);
  });
});

// ─── getPlatformConfig override-merge behaviour ──────────────────────

describe("getPlatformConfig — override merge", () => {
  it("merges a single known override key over CONFIG_DEFAULTS", async () => {
    state.selectData = [{ key: "founding_price_cents", value: 999 }];
    const cfg = await getPlatformConfig();
    expect(cfg.founding_price_cents).toBe(999);
    expect(cfg.founding_plan_name).toBe(CONFIG_DEFAULTS.founding_plan_name);
  });

  it("silently drops unknown keys (does not pollute the config surface)", async () => {
    state.selectData = [
      { key: "not_a_real_key", value: "spam" },
      { key: "founding_credits", value: 250 },
    ];
    const cfg = await getPlatformConfig();
    expect(cfg.founding_credits).toBe(250);
    expect((cfg as unknown as Record<string, unknown>).not_a_real_key).toBeUndefined();
  });

  it("merges multiple known keys in one round-trip", async () => {
    state.selectData = [
      { key: "founding_plan_active", value: false },
      { key: "waitlist_mode", value: true },
      { key: "referral_credits", value: 7 },
    ];
    const cfg = await getPlatformConfig();
    expect(cfg.founding_plan_active).toBe(false);
    expect(cfg.waitlist_mode).toBe(true);
    expect(cfg.referral_credits).toBe(7);
  });

  it("accepts a nested svi_weights override as-is (no shallow-merge surprise)", async () => {
    const weights = {
      ftv: 10, mpc: 10, ptd: 10, tre: 10, cgh: 10, iri: 10, lco: 10, svm: 30,
    };
    state.selectData = [{ key: "svi_weights", value: weights }];
    const cfg = await getPlatformConfig();
    expect(cfg.svi_weights).toEqual(weights);
  });

  it("accepts a stage_thresholds array override as-is", async () => {
    const thresholds = [
      { min: 0, max: 50, stage: "Below", color: "bg-slate-100 text-slate-700" },
      { min: 50, max: 100, stage: "Above", color: "bg-emerald-100 text-emerald-700" },
    ];
    state.selectData = [{ key: "stage_thresholds", value: thresholds }];
    const cfg = await getPlatformConfig();
    expect(cfg.stage_thresholds).toEqual(thresholds);
  });
});

// ─── cache behaviour ─────────────────────────────────────────────────

describe("getPlatformConfig — cache", () => {
  it("caches the merged config across calls within the TTL (single DB fetch)", async () => {
    state.selectData = [{ key: "founding_credits", value: 42 }];
    const a = await getPlatformConfig();
    const b = await getPlatformConfig();
    expect(a).toBe(b); // reference-equal (same cache slot)
    expect(a.founding_credits).toBe(42);
    expect(state.fromCalls).toEqual(["platform_config"]); // exactly one hit
  });

  it("does NOT cache the fallback (config-not-configured path re-runs the guard)", async () => {
    state.configured = false;
    await getPlatformConfig();
    await getPlatformConfig();
    expect(state.configuredCalls).toBe(2);
  });

  it("does NOT cache the fallback (admin-null path re-runs the guard)", async () => {
    state.adminNull = true;
    await getPlatformConfig();
    await getPlatformConfig();
    expect(state.adminCalls).toBe(2);
  });

  it("does NOT cache the fallback (error branch re-queries next call)", async () => {
    state.selectError = { message: "temporary" };
    await getPlatformConfig();
    await getPlatformConfig();
    expect(state.fromCalls.length).toBe(2);
  });

  it("invalidatePlatformConfigCache() forces the next call to re-fetch", async () => {
    state.selectData = [{ key: "founding_credits", value: 10 }];
    await getPlatformConfig();
    invalidatePlatformConfigCache();
    state.selectData = [{ key: "founding_credits", value: 20 }];
    const cfg = await getPlatformConfig();
    expect(cfg.founding_credits).toBe(20);
    expect(state.fromCalls.length).toBe(2);
  });
});

// ─── savePlatformConfig ──────────────────────────────────────────────

describe("savePlatformConfig", () => {
  it("returns { ok: false, error: 'Supabase not configured' } when not configured", async () => {
    state.configured = false;
    const res = await savePlatformConfig({ founding_credits: 99 });
    expect(res).toEqual({ ok: false, error: "Supabase not configured" });
    expect(state.upsertCaptures).toEqual([]);
  });

  it("returns { ok: false, error: 'Supabase admin client unavailable' } when admin is null", async () => {
    state.adminNull = true;
    const res = await savePlatformConfig({ founding_credits: 99 });
    expect(res).toEqual({ ok: false, error: "Supabase admin client unavailable" });
    expect(state.upsertCaptures).toEqual([]);
  });

  it("returns { ok: false, error: msg } when upsert returns an error", async () => {
    state.upsertError = { message: "unique-violation" };
    const res = await savePlatformConfig({ founding_credits: 99 });
    expect(res).toEqual({ ok: false, error: "unique-violation" });
  });

  it("returns { ok: false, error: String(e) } when upsert throws", async () => {
    state.throwOnUpsert = true;
    const res = await savePlatformConfig({ founding_credits: 99 });
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/upsert-threw/);
  });

  it("returns { ok: true } on a clean upsert", async () => {
    const res = await savePlatformConfig({ founding_credits: 99 });
    expect(res).toEqual({ ok: true });
  });

  it("builds one row per patch entry with { key, value, updated_at, updated_by }", async () => {
    await savePlatformConfig({ founding_credits: 99, waitlist_mode: true });
    expect(state.upsertCaptures.length).toBe(1);
    const rows = state.upsertCaptures[0].rows;
    expect(rows.length).toBe(2);
    const byKey = Object.fromEntries(rows.map((r) => [r.key as string, r]));
    expect(byKey.founding_credits.value).toBe(99);
    expect(byKey.waitlist_mode.value).toBe(true);
    for (const row of rows) {
      expect(typeof row.updated_at).toBe("string");
      expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(row.updated_by).toBeDefined();
    }
  });

  it("uses 'admin' as the default updated_by", async () => {
    await savePlatformConfig({ founding_credits: 99 });
    expect(state.upsertCaptures[0].rows[0].updated_by).toBe("admin");
  });

  it("uses the caller-supplied updated_by when provided", async () => {
    await savePlatformConfig({ founding_credits: 99 }, "cfo@example.com");
    expect(state.upsertCaptures[0].rows[0].updated_by).toBe("cfo@example.com");
  });

  it("upserts with { onConflict: 'key' } so admin writes are idempotent per key", async () => {
    await savePlatformConfig({ founding_credits: 99 });
    expect(state.upsertCaptures[0].options).toEqual({ onConflict: "key" });
  });

  it("targets the platform_config table", async () => {
    await savePlatformConfig({ founding_credits: 99 });
    expect(state.fromCalls).toEqual(["platform_config"]);
  });

  it("invalidates the cache after a successful save (next get re-fetches)", async () => {
    state.selectData = [{ key: "founding_credits", value: 10 }];
    const before = await getPlatformConfig();
    expect(before.founding_credits).toBe(10);

    state.selectData = [{ key: "founding_credits", value: 99 }];
    await savePlatformConfig({ founding_credits: 99 });

    const after = await getPlatformConfig();
    expect(after.founding_credits).toBe(99);
    expect(state.selectCalls.length).toBe(2); // both getPlatformConfig hits re-fetched
  });

  it("does NOT invalidate the cache when the save fails (stale cfg preserved)", async () => {
    state.selectData = [{ key: "founding_credits", value: 10 }];
    const before = await getPlatformConfig();
    expect(before.founding_credits).toBe(10);

    state.upsertError = { message: "denied" };
    state.selectData = [{ key: "founding_credits", value: 99 }];
    await savePlatformConfig({ founding_credits: 99 });

    const after = await getPlatformConfig();
    expect(after.founding_credits).toBe(10); // still cached
    expect(state.selectCalls.length).toBe(1); // no re-fetch
  });
});
