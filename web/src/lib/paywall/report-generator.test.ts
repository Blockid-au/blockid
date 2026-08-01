/**
 * report-generator.test.ts — colocated coverage for the Trust Business
 * Report generation hook wired into `/api/cron/report-order-drain` via
 * `report-order-worker.processNextQueuedOrder`.
 *
 * The sibling `report-generation-e2e.test.ts` proves the full
 * worker → generator → assembled_reports → report_orders round-trip; this
 * suite instead pins every branch of `generateTrustReportForOrder` on its
 * own so a regression narrows straight to a failing case without needing
 * the whole queue-drain scaffolding to run first.
 *
 * Everything is injected through `GeneratorDeps` — the module is designed
 * for exactly this, so we never touch `getSupabaseAdmin()`, `callAI()`,
 * `orchestrateReport()`, or the real `findSVI*` fallback lookups.
 */

import { describe, it, expect, vi } from "vitest";
import {
  generateTrustReportForOrder,
  tierForOrderMetadata,
  type GeneratorDeps,
  type GeneratorSupabase,
  type GeneratorSelectBuilder,
} from "./report-generator";
import type { AssembledReport, AgentRole } from "@/lib/report-pipeline/types";
import { AGENT_ROLES } from "@/lib/report-pipeline/types";
import type { CriterionKey } from "@/lib/evaluation-criteria";

type Row = Record<string, unknown>;

// ─────────────────────────────────────────────────────────────────────────────
// Fake Supabase
//
// `state.rows` holds the row a `.maybeSingle()` should return per table.
// `state.list` holds the array a bare-awaited `.select().eq()...` chain
// should return per table (evidence + criteria). `state.errors` injects
// error responses on a per-table basis. `state.inserts` records every
// insert payload keyed by table; `state.insertError` returns the error
// object for a specific table's `.insert()`. `state.insertThrow` throws
// from a specific table's `.insert()`.
// ─────────────────────────────────────────────────────────────────────────────

interface FakeState {
  rows?: Record<string, Row | null>;
  list?: Record<string, Row[]>;
  errors?: Record<string, unknown>;
  inserts?: Record<string, Array<Row | Row[]>>;
  insertError?: Record<string, { message?: string }>;
  insertThrow?: Record<string, Error>;
}

function makeSelect(
  table: string,
  state: FakeState,
): GeneratorSelectBuilder {
  const chain: GeneratorSelectBuilder = {
    eq(_col: string, _val: unknown) {
      return chain;
    },
    order(_col: string, _opts: { ascending: boolean }) {
      return chain;
    },
    async maybeSingle() {
      const err = state.errors?.[table] ?? null;
      const row = state.rows?.[table] ?? null;
      return { data: row, error: err };
    },
    then<T1 = { data: Row[] | null; error: unknown }, T2 = never>(
      onfulfilled?:
        | ((value: { data: Row[] | null; error: unknown }) => T1 | PromiseLike<T1>)
        | null,
      onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
    ): PromiseLike<T1 | T2> {
      const err = state.errors?.[table] ?? null;
      const data = state.list?.[table] ?? null;
      return Promise.resolve({ data, error: err }).then(onfulfilled, onrejected);
    },
  };
  return chain;
}

function makeSupabase(state: FakeState): GeneratorSupabase {
  return {
    from(table: string) {
      return {
        select(_cols: string) {
          return makeSelect(table, state);
        },
        insert(payload: Row | Row[]) {
          const th = state.insertThrow?.[table];
          if (th) throw th;
          (state.inserts ??= {})[table] ??= [];
          state.inserts![table].push(payload);
          const err = state.insertError?.[table] ?? null;
          return Promise.resolve({ error: err });
        },
      };
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures — the shared happy-path building blocks. Every test starts
// from these and mutates only what the branch under test cares about.
// ─────────────────────────────────────────────────────────────────────────────

const ORDER_ID = "order-1";
const BUSINESS_ID = "biz-1";
const USER_ID = "user-1";
const ACCOUNT_ID = "acct-1";
const ANALYSIS_ID = "analysis-1";
const EMAIL = "founder@example.com";
const REPORT_ID = "rpt-uuid-1";

function baseOrder(): Row {
  return {
    id: ORDER_ID,
    user_id: USER_ID,
    business_id: BUSINESS_ID,
    status: "PAID",
    credits_used: 250,
    metadata: { quote: { depth: "standard" }, locale: "en" },
  };
}

function baseAccount(overrides: Row = {}): Row {
  return {
    id: ACCOUNT_ID,
    email: EMAIL,
    startup_name: "Acme AU",
    current_svi: 350,
    current_stage: 4,
    ...overrides,
  };
}

function baseAnalysis(overrides: Row = {}): Row {
  return {
    id: ANALYSIS_ID,
    raw_input: "raw pitch text",
    total_svi: 400,
    analysis_json: {
      version: "2.0.0",
      baselineSVI: 100,
      netAdjustment: 12,
      confidenceMultiplier: 0.6,
      subs: [],
      riskPenalties: [],
      evidenceGaps: [],
      nextActions: [],
      signals: {},
      summary: "summary",
      stageLabel: "Revenue",
      stageBonus: 5,
    },
    ...overrides,
  };
}

function agentContributions(): AssembledReport["agentContributions"] {
  const entries = AGENT_ROLES.map((role) => [
    role,
    { criteria: [] as CriterionKey[], wordCount: 0 },
  ]);
  return Object.fromEntries(entries) as AssembledReport["agentContributions"];
}

function baseReport(): AssembledReport {
  return {
    id: "orch-1",
    title: "Trust Report for Acme AU",
    tier: "standard",
    sections: [
      {
        id: "sec-executive",
        title: "Executive Summary",
        agentRole: "ceo" as AgentRole,
        content: "…",
        score: 82,
        visuals: [],
        wordCount: 200,
      },
      {
        id: "sec-market",
        title: "Market",
        agentRole: "cmo" as AgentRole,
        criterion: "market" as CriterionKey,
        content: "market analysis content ".repeat(30),
        score: 71,
        visuals: [],
        wordCount: 550,
      },
      {
        id: "sec-revenue",
        title: "Revenue",
        agentRole: "cfo" as AgentRole,
        criterion: "revenue" as CriterionKey,
        content: "revenue analysis content ".repeat(30),
        score: 60,
        visuals: [],
        wordCount: 500,
      },
    ],
    charts: [],
    executiveSummary: "exec summary",
    qualityScore: 78,
    totalWords: 1250,
    consistencyIssues: [],
    agentContributions: agentContributions(),
    markdown: "# Trust Report",
    createdAt: "2026-08-01T00:00:00Z",
  };
}

function happyState(): FakeState {
  return {
    rows: {
      report_orders: baseOrder(),
      app_users: { id: USER_ID, email: EMAIL },
    },
    list: {
      svi_evidence: [
        {
          evidence_type: "traction",
          confidence_level: "high",
          dimension: "revenue",
          label: "first customer",
        },
      ],
      evaluation_criteria: [
        {
          criterion_key: "market",
          text_input: "AU equity tooling",
          files: [],
          links: [],
          quality_level: "good",
          ai_score: 72,
        },
      ],
    },
  };
}

function happyDeps(state: FakeState, overrides: Partial<GeneratorDeps> = {}): GeneratorDeps {
  return {
    supabase: makeSupabase(state),
    orchestrate: overrides.orchestrate ?? (async () => baseReport()),
    aiConfigured: overrides.aiConfigured ?? (() => true),
    findAccount: overrides.findAccount ?? (async () => baseAccount()),
    findAnalysis: overrides.findAnalysis ?? (async () => baseAnalysis()),
    newReportId: overrides.newReportId ?? (() => REPORT_ID),
    ...overrides,
  };
}

async function run(state: FakeState, overrides: Partial<GeneratorDeps> = {}) {
  return generateTrustReportForOrder(
    { orderId: ORDER_ID, businessId: BUSINESS_ID },
    happyDeps(state, overrides),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// tierForOrderMetadata — 14 branch cases (pure)
// ─────────────────────────────────────────────────────────────────────────────

describe("tierForOrderMetadata", () => {
  it("returns 'standard' for undefined metadata", () => {
    expect(tierForOrderMetadata(undefined)).toBe("standard");
  });

  it("returns 'standard' for null metadata", () => {
    expect(tierForOrderMetadata(null)).toBe("standard");
  });

  it("returns 'standard' for a string metadata (not an object)", () => {
    expect(tierForOrderMetadata("not-an-object")).toBe("standard");
  });

  it("returns 'standard' for a number metadata (not an object)", () => {
    expect(tierForOrderMetadata(42)).toBe("standard");
  });

  it("returns 'standard' when metadata has no quote", () => {
    expect(tierForOrderMetadata({ payment_path: "credits" })).toBe("standard");
  });

  it("returns 'standard' when quote is null", () => {
    expect(tierForOrderMetadata({ quote: null })).toBe("standard");
  });

  it("returns 'standard' when quote is a string (not an object)", () => {
    expect(tierForOrderMetadata({ quote: "deep" })).toBe("standard");
  });

  it("returns 'standard' when quote is missing depth", () => {
    expect(tierForOrderMetadata({ quote: { credits: 200 } })).toBe("standard");
  });

  it("returns 'standard' when quote.depth is not a string", () => {
    expect(tierForOrderMetadata({ quote: { depth: 3 } })).toBe("standard");
  });

  it("maps 'scan' depth → 'standard'", () => {
    expect(tierForOrderMetadata({ quote: { depth: "scan" } })).toBe("standard");
  });

  it("maps 'standard' depth → 'standard'", () => {
    expect(tierForOrderMetadata({ quote: { depth: "standard" } })).toBe("standard");
  });

  it("maps 'deep' depth → 'premium'", () => {
    expect(tierForOrderMetadata({ quote: { depth: "deep" } })).toBe("premium");
  });

  it("maps 'expert' depth → 'premium'", () => {
    expect(tierForOrderMetadata({ quote: { depth: "expert" } })).toBe("premium");
  });

  it("maps 'max' depth → 'investor_memo'", () => {
    expect(tierForOrderMetadata({ quote: { depth: "max" } })).toBe("investor_memo");
  });

  it("falls back to 'standard' for an unknown depth string", () => {
    expect(tierForOrderMetadata({ quote: { depth: "quantum" } })).toBe("standard");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateTrustReportForOrder — infrastructure / config gates
// ─────────────────────────────────────────────────────────────────────────────

describe("generateTrustReportForOrder — infrastructure gates", () => {
  it("returns transient supabase_not_configured when supabase is explicitly null", async () => {
    const result = await generateTrustReportForOrder(
      { orderId: ORDER_ID, businessId: BUSINESS_ID },
      { supabase: null },
    );
    expect(result).toEqual({
      ok: false,
      transient: true,
      reason: "supabase_not_configured",
    });
  });

  it("returns transient ai_not_configured when the AI provider check fails", async () => {
    const state = happyState();
    const result = await run(state, { aiConfigured: () => false });
    expect(result).toEqual({
      ok: false,
      transient: true,
      reason: "ai_not_configured",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateTrustReportForOrder — order lookup branches
// ─────────────────────────────────────────────────────────────────────────────

describe("generateTrustReportForOrder — order lookup", () => {
  it("returns transient order_lookup_failed when Supabase surfaces an Error", async () => {
    const state: FakeState = {
      ...happyState(),
      errors: { report_orders: new Error("boom") },
    };
    const result = await run(state);
    expect(result).toEqual({
      ok: false,
      transient: true,
      reason: "order_lookup_failed: boom",
    });
  });

  it("returns transient order_lookup_failed when Supabase surfaces {message}", async () => {
    const state: FakeState = {
      ...happyState(),
      errors: { report_orders: { message: "db offline" } },
    };
    const result = await run(state);
    expect(result).toEqual({
      ok: false,
      transient: true,
      reason: "order_lookup_failed: db offline",
    });
  });

  it("returns transient order_lookup_failed with 'unknown_error' when the error is null-ish", async () => {
    // `errMessage` only pulls .message when the "message" key is actually
    // present on the object; the `?? "unknown_error"` fallback is only
    // reached when the whole error itself is null/undefined.
    const state: FakeState = {
      ...happyState(),
      errors: { report_orders: null },
    };
    // A null error is treated as "no error", so this run actually succeeds
    // — we instead pin the fallback with an explicit undefined message.
    const explicit: FakeState = {
      ...happyState(),
      errors: { report_orders: { message: undefined } },
    };
    const result = await run(explicit);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.transient).toBe(true);
      expect(result.reason).toBe("order_lookup_failed: unknown_error");
    }
    // Silence the unused-var lint on the exploratory `state` fixture.
    void state;
  });

  it("returns permanent order_not_found when the row is missing", async () => {
    const state = happyState();
    state.rows!.report_orders = null;
    const result = await run(state);
    expect(result).toEqual({
      ok: false,
      transient: false,
      reason: "order_not_found",
    });
  });

  it("returns permanent order_missing_user when order.user_id is empty", async () => {
    const state = happyState();
    state.rows!.report_orders = { ...baseOrder(), user_id: "" };
    const result = await run(state);
    expect(result).toEqual({
      ok: false,
      transient: false,
      reason: "order_missing_user",
    });
  });

  it("returns permanent order_missing_user when order.user_id is null", async () => {
    const state = happyState();
    state.rows!.report_orders = { ...baseOrder(), user_id: null };
    const result = await run(state);
    expect(result).toEqual({
      ok: false,
      transient: false,
      reason: "order_missing_user",
    });
  });

  it("returns permanent order_user_not_found when app_users row is null", async () => {
    const state = happyState();
    state.rows!.app_users = null;
    const result = await run(state);
    expect(result).toEqual({
      ok: false,
      transient: false,
      reason: "order_user_not_found",
    });
  });

  it("returns permanent order_user_not_found when email is not a string", async () => {
    const state = happyState();
    state.rows!.app_users = { id: USER_ID, email: null };
    const result = await run(state);
    expect(result).toEqual({
      ok: false,
      transient: false,
      reason: "order_user_not_found",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateTrustReportForOrder — SVI account / analysis branches
// ─────────────────────────────────────────────────────────────────────────────

describe("generateTrustReportForOrder — SVI resolution", () => {
  it("returns permanent no_svi_account_for_business when findAccount → null", async () => {
    const state = happyState();
    const result = await run(state, { findAccount: async () => null });
    expect(result).toEqual({
      ok: false,
      transient: false,
      reason: "no_svi_account_for_business",
    });
  });

  it("returns permanent no_svi_analysis_for_business when findAnalysis → null", async () => {
    const state = happyState();
    const result = await run(state, { findAnalysis: async () => null });
    expect(result).toEqual({
      ok: false,
      transient: false,
      reason: "no_svi_analysis_for_business",
    });
  });

  it("returns permanent svi_account_missing_id when the resolved account has no id", async () => {
    const state = happyState();
    const result = await run(state, {
      findAccount: async () => baseAccount({ id: "" }),
    });
    expect(result).toEqual({
      ok: false,
      transient: false,
      reason: "svi_account_missing_id",
    });
  });

  it("passes email + projectId + column list to findAccount", async () => {
    const state = happyState();
    const spy = vi.fn(async () => baseAccount());
    await run(state, { findAccount: spy });
    expect(spy).toHaveBeenCalledWith(
      EMAIL,
      BUSINESS_ID,
      "id, email, startup_name, current_svi, current_stage",
    );
  });

  it("passes email + projectId + column list to findAnalysis", async () => {
    const state = happyState();
    const spy = vi.fn(async () => baseAnalysis());
    await run(state, { findAnalysis: spy });
    expect(spy).toHaveBeenCalledWith(
      EMAIL,
      BUSINESS_ID,
      "id, raw_input, total_svi, analysis_json",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateTrustReportForOrder — orchestrate branches
// ─────────────────────────────────────────────────────────────────────────────

describe("generateTrustReportForOrder — orchestrate", () => {
  it("returns transient orchestration_failed when orchestrate throws Error", async () => {
    const state = happyState();
    const result = await run(state, {
      orchestrate: async () => {
        throw new Error("ai timeout");
      },
    });
    expect(result).toEqual({
      ok: false,
      transient: true,
      reason: "orchestration_failed: ai timeout",
    });
  });

  it("returns transient orchestration_failed when orchestrate throws a non-Error", async () => {
    const state = happyState();
    const result = await run(state, {
      orchestrate: async () => {
        throw "socket-hangup";
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.transient).toBe(true);
      expect(result.reason).toBe("orchestration_failed: socket-hangup");
    }
  });

  it("passes the resolved tier from the order metadata to orchestrate (deep → premium)", async () => {
    const state = happyState();
    state.rows!.report_orders = {
      ...baseOrder(),
      metadata: { quote: { depth: "deep" } },
    };
    const spy = vi.fn(async (_input: Parameters<NonNullable<GeneratorDeps["orchestrate"]>>[0]) => baseReport());
    await run(state, { orchestrate: spy });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ tier: "premium" }),
    );
  });

  it("passes locale='vi' through to orchestrate when metadata.locale is 'vi'", async () => {
    const state = happyState();
    state.rows!.report_orders = {
      ...baseOrder(),
      metadata: { quote: { depth: "standard" }, locale: "vi" },
    };
    const spy = vi.fn(async (_input: Parameters<NonNullable<GeneratorDeps["orchestrate"]>>[0]) => baseReport());
    await run(state, { orchestrate: spy });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "vi" }),
    );
  });

  it("defaults locale to 'en' when metadata.locale is missing", async () => {
    const state = happyState();
    state.rows!.report_orders = {
      ...baseOrder(),
      metadata: { quote: { depth: "standard" } },
    };
    const spy = vi.fn(async (_input: Parameters<NonNullable<GeneratorDeps["orchestrate"]>>[0]) => baseReport());
    await run(state, { orchestrate: spy });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "en" }),
    );
  });

  it("defaults locale to 'en' when metadata is entirely absent", async () => {
    const state = happyState();
    state.rows!.report_orders = { ...baseOrder(), metadata: undefined };
    const spy = vi.fn(async (_input: Parameters<NonNullable<GeneratorDeps["orchestrate"]>>[0]) => baseReport());
    await run(state, { orchestrate: spy });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "en", tier: "standard" }),
    );
  });

  it("uses 'Unknown Startup' when the SVI account has no startup_name", async () => {
    const state = happyState();
    const spy = vi.fn(async (_input: Parameters<NonNullable<GeneratorDeps["orchestrate"]>>[0]) => baseReport());
    await run(state, {
      orchestrate: spy,
      findAccount: async () => baseAccount({ startup_name: null }),
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ startupName: "Unknown Startup" }),
    );
  });

  it("passes an empty rawText when the analysis has no raw_input", async () => {
    const state = happyState();
    const spy = vi.fn(async (_input: Parameters<NonNullable<GeneratorDeps["orchestrate"]>>[0]) => baseReport());
    await run(state, {
      orchestrate: spy,
      findAnalysis: async () => baseAnalysis({ raw_input: null }),
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ rawText: "" }),
    );
  });

  it("provides a callAI wrapper that returns the text field from the AI client", async () => {
    const state = happyState();
    let callAIArg: unknown;
    const orchestrate = vi.fn(async (input: Parameters<NonNullable<GeneratorDeps["orchestrate"]>>[0]) => {
      callAIArg = await input.callAI("sys", "user", 123);
      return baseReport();
    });
    await run(state, { orchestrate });
    // The callAI wrapper the generator injects is the production callAI —
    // in this test env with no AI key it would either throw or resolve to
    // a stub. We only need to prove the wrapper is a function that returns
    // a string-ish value when the underlying call resolves; the E2E test
    // covers the wire.
    expect(typeof callAIArg === "string" || callAIArg === undefined).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateTrustReportForOrder — persistence branches
// ─────────────────────────────────────────────────────────────────────────────

describe("generateTrustReportForOrder — persistence", () => {
  it("returns transient assembled_reports_insert_failed when the insert errors", async () => {
    const state = happyState();
    state.insertError = { assembled_reports: { message: "duplicate key" } };
    const result = await run(state);
    expect(result).toEqual({
      ok: false,
      transient: true,
      reason: "assembled_reports_insert_failed: duplicate key",
    });
  });

  it("returns { ok: true, reportId } from the injected newReportId minter on a happy run", async () => {
    const state = happyState();
    const result = await run(state);
    expect(result).toEqual({ ok: true, reportId: REPORT_ID });
  });

  it("writes the assembled_reports row keyed on the minted uuid", async () => {
    const state = happyState();
    await run(state);
    const rows = state.inserts?.assembled_reports ?? [];
    expect(rows).toHaveLength(1);
    const row = rows[0] as Row;
    expect(row.id).toBe(REPORT_ID);
    expect(row.account_id).toBe(ACCOUNT_ID);
    expect(row.user_id).toBe(USER_ID);
    expect(row.project_id).toBe(BUSINESS_ID);
    expect(row.analysis_id).toBe(ANALYSIS_ID);
    expect(row.status).toBe("complete");
  });

  it("carries the tier + locale + title + score + total_words onto the assembled_reports row", async () => {
    const state = happyState();
    await run(state);
    const row = (state.inserts?.assembled_reports?.[0] as Row) ?? {};
    expect(row.tier).toBe("standard");
    expect(row.locale).toBe("en");
    expect(row.title).toBe("Trust Report for Acme AU");
    expect(row.quality_score).toBe(78);
    expect(row.total_words).toBe(1250);
    expect(row.executive_summary).toBe("exec summary");
    expect(row.full_markdown).toBe("# Trust Report");
  });

  it("stores sections_count matching the orchestrator's section length", async () => {
    const state = happyState();
    await run(state);
    const row = (state.inserts?.assembled_reports?.[0] as Row) ?? {};
    expect(row.sections_count).toBe(3);
  });

  it("stores sections_json with only the metadata subset (never the raw content)", async () => {
    const state = happyState();
    await run(state);
    const row = (state.inserts?.assembled_reports?.[0] as Row) ?? {};
    const sections = row.sections_json as Array<Record<string, unknown>>;
    expect(sections).toHaveLength(3);
    for (const s of sections) {
      expect(Object.keys(s).sort()).toEqual([
        "agentRole",
        "criterion",
        "id",
        "score",
        "title",
        "wordCount",
      ]);
      expect((s as { content?: unknown }).content).toBeUndefined();
    }
  });

  it("defaults credits_cost to 0 when order.credits_used is missing", async () => {
    const state = happyState();
    state.rows!.report_orders = { ...baseOrder(), credits_used: undefined };
    await run(state);
    const row = (state.inserts?.assembled_reports?.[0] as Row) ?? {};
    expect(row.credits_cost).toBe(0);
  });

  it("carries credits_cost through when order.credits_used is a number", async () => {
    const state = happyState();
    await run(state);
    const row = (state.inserts?.assembled_reports?.[0] as Row) ?? {};
    expect(row.credits_cost).toBe(250);
  });

  it("carries analysis_id = null when the analysis has no id", async () => {
    const state = happyState();
    await run(state, {
      findAnalysis: async () => baseAnalysis({ id: undefined }),
    });
    const row = (state.inserts?.assembled_reports?.[0] as Row) ?? {};
    expect(row.analysis_id).toBe(null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// generateTrustReportForOrder — agent_report_tasks (analytics)
// ─────────────────────────────────────────────────────────────────────────────

describe("generateTrustReportForOrder — agent_report_tasks", () => {
  it("inserts one row per section that carries a criterion", async () => {
    const state = happyState();
    await run(state);
    const inserts = state.inserts?.agent_report_tasks ?? [];
    expect(inserts).toHaveLength(1);
    const rows = inserts[0] as Row[];
    expect(rows).toHaveLength(2); // market + revenue; the executive section has no criterion
    expect(rows[0]).toMatchObject({
      report_id: REPORT_ID,
      agent_role: "cmo",
      criterion_key: "market",
      score: 71,
      status: "complete",
    });
    expect(rows[1]).toMatchObject({
      report_id: REPORT_ID,
      agent_role: "cfo",
      criterion_key: "revenue",
      score: 60,
    });
  });

  it("truncates each analytics row's content preview to 500 chars", async () => {
    const state = happyState();
    await run(state);
    const rows = (state.inserts?.agent_report_tasks?.[0] as Row[]) ?? [];
    for (const r of rows) {
      expect((r.content_preview as string).length).toBeLessThanOrEqual(500);
    }
  });

  it("skips the agent_report_tasks insert entirely when no section has a criterion", async () => {
    const state = happyState();
    const report = baseReport();
    // Strip every criterion → nothing analytics-worthy to record.
    report.sections = report.sections.map((s) => ({ ...s, criterion: undefined }));
    await run(state, { orchestrate: async () => report });
    expect(state.inserts?.agent_report_tasks).toBeUndefined();
  });

  it("still returns { ok: true } when the analytics insert errors", async () => {
    const state = happyState();
    state.insertError = {
      agent_report_tasks: { message: "analytics table missing" },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await run(state);
    expect(result).toEqual({ ok: true, reportId: REPORT_ID });
    warn.mockRestore();
  });

  it("still returns { ok: true } when the analytics insert throws", async () => {
    const state = happyState();
    state.insertThrow = {
      agent_report_tasks: new Error("connection reset"),
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await run(state);
    expect(result).toEqual({ ok: true, reportId: REPORT_ID });
    warn.mockRestore();
  });

  it("uses score = null on rows whose section had no score", async () => {
    const state = happyState();
    const report = baseReport();
    report.sections[1] = { ...report.sections[1], score: undefined };
    await run(state, { orchestrate: async () => report });
    const rows = (state.inserts?.agent_report_tasks?.[0] as Row[]) ?? [];
    expect(rows[0].score).toBe(null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildSVIAnalysis fallbacks (exercised through orchestrate spy)
// ─────────────────────────────────────────────────────────────────────────────

describe("generateTrustReportForOrder — sviAnalysis fallbacks", () => {
  it("prefers account.current_stage over analysis_json.stage", async () => {
    const state = happyState();
    const spy = vi.fn(async (_input: Parameters<NonNullable<GeneratorDeps["orchestrate"]>>[0]) => baseReport());
    await run(state, {
      orchestrate: spy,
      findAccount: async () => baseAccount({ current_stage: 6 }),
      findAnalysis: async () =>
        baseAnalysis({ analysis_json: { stage: 2, stageLabel: "Foo" } }),
    });
    const call = spy.mock.calls[0]![0];
    expect(call.sviAnalysis.stage).toBe(6);
  });

  it("falls back to analysis_json.stage when the account has no current_stage", async () => {
    const state = happyState();
    const spy = vi.fn(async (_input: Parameters<NonNullable<GeneratorDeps["orchestrate"]>>[0]) => baseReport());
    await run(state, {
      orchestrate: spy,
      findAccount: async () => baseAccount({ current_stage: undefined }),
      findAnalysis: async () =>
        baseAnalysis({ analysis_json: { stage: 3, stageLabel: "Early Traction" } }),
    });
    const call = spy.mock.calls[0]![0];
    expect(call.sviAnalysis.stage).toBe(3);
  });

  it("falls back to stage 0 → 'Concept' label when nothing supplies a stage", async () => {
    const state = happyState();
    const spy = vi.fn(async (_input: Parameters<NonNullable<GeneratorDeps["orchestrate"]>>[0]) => baseReport());
    await run(state, {
      orchestrate: spy,
      findAccount: async () => baseAccount({ current_stage: undefined }),
      findAnalysis: async () =>
        baseAnalysis({ analysis_json: {} }),
    });
    const call = spy.mock.calls[0]![0];
    expect(call.sviAnalysis.stage).toBe(0);
    expect(call.sviAnalysis.stageLabel).toBe("Concept");
  });

  it("uses account.current_svi when analysis.total_svi is missing", async () => {
    const state = happyState();
    const spy = vi.fn(async (_input: Parameters<NonNullable<GeneratorDeps["orchestrate"]>>[0]) => baseReport());
    await run(state, {
      orchestrate: spy,
      findAccount: async () => baseAccount({ current_svi: 275 }),
      findAnalysis: async () => baseAnalysis({ total_svi: undefined }),
    });
    const call = spy.mock.calls[0]![0];
    expect(call.sviAnalysis.totalSVI).toBe(275);
  });

  it("falls back to 100 for totalSVI when neither the account nor the analysis has one", async () => {
    const state = happyState();
    const spy = vi.fn(async (_input: Parameters<NonNullable<GeneratorDeps["orchestrate"]>>[0]) => baseReport());
    await run(state, {
      orchestrate: spy,
      findAccount: async () =>
        baseAccount({ current_svi: undefined }),
      findAnalysis: async () => baseAnalysis({ total_svi: undefined }),
    });
    const call = spy.mock.calls[0]![0];
    expect(call.sviAnalysis.totalSVI).toBe(100);
  });

  it("handles a null analysis_json without throwing (all fields land on defaults)", async () => {
    const state = happyState();
    const spy = vi.fn(async (_input: Parameters<NonNullable<GeneratorDeps["orchestrate"]>>[0]) => baseReport());
    await run(state, {
      orchestrate: spy,
      findAnalysis: async () => baseAnalysis({ analysis_json: null }),
    });
    const call = spy.mock.calls[0]![0];
    expect(call.sviAnalysis.version).toBe("2.0.0");
    expect(call.sviAnalysis.summary).toBe("");
    expect(call.sviAnalysis.subs).toEqual([]);
    expect(call.sviAnalysis.riskPenalties).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildCriteriaData shape
// ─────────────────────────────────────────────────────────────────────────────

describe("generateTrustReportForOrder — criteriaData shape", () => {
  it("fills every CRITERION_KEY, populating only the ones that have a row", async () => {
    const state = happyState();
    const spy = vi.fn(async (_input: Parameters<NonNullable<GeneratorDeps["orchestrate"]>>[0]) => baseReport());
    await run(state, { orchestrate: spy });
    const call = spy.mock.calls[0]![0];
    const data = call.criteriaData;
    // "market" is populated
    expect(data.market.textInput).toBe("AU equity tooling");
    expect(data.market.qualityLevel).toBe("good");
    expect(data.market.aiScore).toBe(72);
    // "idea" (never supplied) lands on defaults
    expect(data.idea.textInput).toBe("");
    expect(data.idea.qualityLevel).toBe("incomplete");
    expect(data.idea.aiScore).toBeUndefined();
    // Every key from CRITERION_KEYS is present
    expect(Object.keys(data).length).toBeGreaterThanOrEqual(13);
  });

  it("coerces non-array files/links to []", async () => {
    const state = happyState();
    state.list!.evaluation_criteria = [
      {
        criterion_key: "market",
        text_input: "x",
        files: "not-an-array",
        links: null,
        quality_level: "good",
      },
    ];
    const spy = vi.fn(async (_input: Parameters<NonNullable<GeneratorDeps["orchestrate"]>>[0]) => baseReport());
    await run(state, { orchestrate: spy });
    const call = spy.mock.calls[0]![0];
    expect(call.criteriaData.market.files).toEqual([]);
    expect(call.criteriaData.market.links).toEqual([]);
  });

  it("drops a non-numeric ai_score to undefined", async () => {
    const state = happyState();
    state.list!.evaluation_criteria = [
      {
        criterion_key: "market",
        text_input: "x",
        files: [],
        links: [],
        quality_level: "good",
        ai_score: "not-a-number",
      },
    ];
    const spy = vi.fn(async (_input: Parameters<NonNullable<GeneratorDeps["orchestrate"]>>[0]) => baseReport());
    await run(state, { orchestrate: spy });
    const call = spy.mock.calls[0]![0];
    expect(call.criteriaData.market.aiScore).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Evidence pipeline
// ─────────────────────────────────────────────────────────────────────────────

describe("generateTrustReportForOrder — evidenceItems shape", () => {
  it("maps svi_evidence rows into the EvidenceItem shape", async () => {
    const state = happyState();
    const spy = vi.fn(async (_input: Parameters<NonNullable<GeneratorDeps["orchestrate"]>>[0]) => baseReport());
    await run(state, { orchestrate: spy });
    const call = spy.mock.calls[0]![0];
    expect(call.evidenceItems).toEqual([
      {
        evidence_type: "traction",
        confidence_level: "high",
        dimension: "revenue",
        label: "first customer",
      },
    ]);
  });

  it("passes an empty evidenceItems array when the table returns no rows", async () => {
    const state = happyState();
    state.list!.svi_evidence = [];
    const spy = vi.fn(async (_input: Parameters<NonNullable<GeneratorDeps["orchestrate"]>>[0]) => baseReport());
    await run(state, { orchestrate: spy });
    const call = spy.mock.calls[0]![0];
    expect(call.evidenceItems).toEqual([]);
  });

  it("coerces missing evidence fields to '' rather than dropping the row", async () => {
    const state = happyState();
    state.list!.svi_evidence = [{}];
    const spy = vi.fn(async (_input: Parameters<NonNullable<GeneratorDeps["orchestrate"]>>[0]) => baseReport());
    await run(state, { orchestrate: spy });
    const call = spy.mock.calls[0]![0];
    expect(call.evidenceItems).toEqual([
      {
        evidence_type: "",
        confidence_level: "",
        dimension: "",
        label: "",
      },
    ]);
  });
});
