// run-report-pipeline (S-R3, spec §C.1 / §C.12): the ONE generator behind
// the stream route — orchestrator events → the legacy wire vocabulary the
// streaming client parses, the same-deck cache keyed deck_hash +
// pipeline_version, persistence of today's snapshot + report_v2, and the
// fire-and-forget notify / email.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import type { CriterionCard, DimensionChapter } from "@/lib/report-v2/schema";
import { PIPELINE_VERSION, type OrchestratorInput, type PipelineEvent } from "./orchestrator";
import {
  cardToLegacy,
  chapterToLegacy,
  chapterToMarkdown,
  doneEvent,
  hashDeck,
  scopedDeckCacheKey,
  DECK_CACHE_VERSION,
  syntheticDeckContext,
  newWireState,
  priorityForScore,
  runReportPipeline,
  toWireEvents,
  type RunPipelineDeps,
  type StreamEvent,
} from "./run-report-pipeline";
import type { AssembledReport } from "./types";
import type { LoadContextResult } from "./run-for-project";

// Every default-persistence test uses local transport substitutes, never a DB.
const persistenceDb = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => persistenceDb.value }));
const defaultTransport = vi.hoisted(() => vi.fn());
vi.mock("@/lib/ai-client", () => ({ callAI: defaultTransport }));

// ── Fixtures ────────────────────────────────────────────────────────────────

const demo = demoReportV2();
const chapterOf = (dim: string): DimensionChapter => demo.dimensions.find((d) => d.dim === dim)!;
// The 13 unique cards (the orchestrator's criterionCardsFromChapters dedupes across dims).
const cards: CriterionCard[] = Array.from(new Map(demo.dimensions.flatMap((d) => d.criteria).map((c) => [c.key, c])).values());

function ctxOk() {
  return {
    ok: true as const,
    ctx: {
      projectId: "proj-1",
      account: { id: "acct-1", email: "owner@x.test", startup_name: "Acme", current_svi: 118, current_stage: 3, user_id: "owner-1" },
      latestAnalysis: { id: "an-1", raw_input: "Acme sells widgets", total_svi: 118, analysis_json: null },
      evidenceItems: [],
      criteriaData: {} as never,
      sviAnalysis: { totalSVI: 118, stageLabel: "Early Traction", stage: 3, sector: "saas", sectorLabel: "SaaS", subs: [], signals: {} } as never,
    },
  };
}

/** A fake orchestrator that emits the §C.12 vocabulary for the requested dims. */
function fakeOrchestrate(opts: { dims?: string[]; degradeAll?: boolean } = {}) {
  const calls: OrchestratorInput[] = [];
  const orchestrate = async (input: OrchestratorInput): Promise<AssembledReport> => {
    calls.push(input);
    const dims = input.dims ?? demo.dimensions.map((d) => d.dim);
    const emit = (e: PipelineEvent) => input.onEvent?.(e);
    emit({ type: "context", industry: "SaaS", stage: 3, stageLabel: "Early Traction", phaseId: "validation", tier: input.tierV2 ?? "standard", estimatedCalls: 2 + 13 + dims.length + 1, estimatedSeconds: 120, dims: dims as never });
    emit({ type: "progress", completed: 5, total: 100, phase: "gathering" });
    emit({ type: "gather_complete", evidenceRows: 4, connectors: ["competitiveResearch", "valuation"] });
    dims.forEach((dim) => emit({ type: "dimension_start", dim: dim as never, ownerAgent: chapterOf(dim).ownerAgent }));
    dims.forEach((dim) => {
      const chapter = opts.degradeAll ? { ...chapterOf(dim), degraded: true, degradeReason: "budget: cap" } : chapterOf(dim);
      if (chapter.degraded) emit({ type: "error", dim: dim as never, message: chapter.degradeReason ?? "degraded", degraded: true });
      emit({ type: "dimension_complete", dim: dim as never, chapter });
    });
    emit({ type: "valuation_complete", chapter: demo.valuation });
    emit({ type: "criteria_synthesis", criteria: cards });
    emit({ type: "executive_complete", summary: "Exec summary" });
    emit({ type: "audit_complete", groundedShare: 0.9, revised: 1 });
    emit({ type: "progress", completed: 100, total: 100, phase: "complete" });
    emit({ type: "done", reportId: "rpt-1", totalMs: 1234, calls: 24, costAud: 0.03, costUsd: 0.02, costReportedCalls: 24, degradedSections: [], deadlineHit: false, budgetOverruns: 0, verdictTrimmed: 0, autoCited: 0 });
    return {
      id: "rpt-1",
      title: "Acme",
      tier: "standard",
      sections: [],
      charts: [],
      executiveSummary: "Exec summary",
      qualityScore: 70,
      totalWords: 1000,
      consistencyIssues: [],
      agentContributions: {} as never,
      markdown: "",
      createdAt: "2026-09-16T00:00:00.000Z",
      llmCalls: 24,
      reportV2: { ...demo, source: "pipeline", pipelineVersion: PIPELINE_VERSION },
      finalDimensionChapters: dims.map(dim => chapterOf(dim)),
      fullyDegraded: opts.degradeAll ?? false,
    };
  };
  return { orchestrate, calls };
}

/** Deck-cache DB stub: `rows` is the stored svi_deck_cache row (or null). */
function fakeDb(row: Record<string, unknown> | null) {
  const upserts: Record<string, unknown>[] = [];
  const db: NonNullable<RunPipelineDeps["db"]> = {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
      upsert: async (r) => {
        upserts.push(r);
        return { error: null };
      },
    }),
  };
  return { db, upserts };
}

function deps(extra: Partial<RunPipelineDeps> = {}): RunPipelineDeps & { calls: OrchestratorInput[]; persisted: unknown[]; notified: unknown[]; emailed: unknown[] } {
  const fake = fakeOrchestrate();
  const persisted: unknown[] = [];
  const notified: unknown[] = [];
  const emailed: unknown[] = [];
  return {
    calls: fake.calls,
    persisted,
    notified,
    emailed,
    loadContext: async () => ctxOk() as unknown as LoadContextResult,
    orchestrate: fake.orchestrate as never,
    callAI: async () => "unused",
    db: null,
    persistSnapshot: async (args) => {
      persisted.push(args);
      return { snapshotId: "snap-1", reportV2Saved: true };
    },
    notify: async (args) => {
      notified.push(args);
      return true;
    },
    sendEmail: async (args) => {
      emailed.push(args);
      return { ok: true };
    },
    now: () => 1_000,
    ...extra,
  };
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// ── Pure projections ────────────────────────────────────────────────────────

describe("legacy projections", () => {
  it("chapterToLegacy keeps the Wave-24 card shape: dimension / label / score / markdown / 2 insights / priority / market_benchmark", () => {
    const ch = chapterOf("tre");
    const legacy = chapterToLegacy(ch);
    expect(legacy.dimension).toBe("tre");
    expect(legacy.label).toBe("Traction & Revenue Evidence");
    expect(legacy.score).toBe(ch.score);
    expect(legacy.priority).toBe(priorityForScore(ch.score));
    expect(legacy.insights).toHaveLength(2);
    expect(legacy.insights[0]).not.toMatch(/\[ev:|\[unevidenced\]/);
    expect(legacy.insights.every((s) => s.split(/\s+/).length <= 16)).toBe(true);
    expect(legacy.market_benchmark).toMatch(/^Stage \d cohort: p25 \d+ · p50 \d+ · p75 \d+/);
    expect(legacy.markdown).toBe(chapterToMarkdown(ch));
    expect(legacy.markdown).toMatch(/\*\*Strengths \(with evidence\):\*\*/);
    expect(legacy.markdown).toMatch(/\*\*Gaps \(what's missing or unverifiable\):\*\*/);
    expect(legacy.markdown).toMatch(/\*\*Next Step \(concrete, this-week action\):\*\*/);
  });

  it("priorityForScore: < 50 high, < 70 medium, else low; a degraded chapter says so in its markdown", () => {
    expect([priorityForScore(20), priorityForScore(55), priorityForScore(80)]).toEqual(["high", "medium", "low"]);
    expect(chapterToMarkdown({ ...chapterOf("mpc"), degraded: true, degradeReason: "budget: cap" })).toMatch(/Deterministic card — budget: cap/);
  });

  it("cardToLegacy maps a CriterionCard onto the 13-criterion wire row (primary_dimension + weight from the catalogue)", () => {
    const card = cards.find((c) => c.key === "revenue")!;
    const row = cardToLegacy(card);
    expect(row).toMatchObject({ key: "revenue", primary_dimension: "tre", weight: expect.any(Number), score: card.score, verdict: card.verdict, next_action: card.nextAction });
    expect(row.strengths.length).toBeLessThanOrEqual(2);
    expect(row.gaps.length).toBeLessThanOrEqual(2);
  });
});

describe("toWireEvents — orchestrator vocabulary → wire vocabulary", () => {
  it("translates every event, counts the legacy progress per landed dim, starts criteria synthesis before the first chapter and holds `done` for the runner", async () => {
    const state = newWireState(demo.dimensions.map((d) => d.dim));
    const out: StreamEvent[] = [];
    const fake = fakeOrchestrate();
    const collect = (e: PipelineEvent) => out.push(...toWireEvents(e, state));
    // Drive the fake through onEvent only.
    await fake.orchestrate({ onEvent: collect, tierV2: "free" } as unknown as OrchestratorInput);
    {
      {
        const types = out.map((e) => e.type);
        expect(types[0]).toBe("context");
        const ctx = out[0] as Extract<StreamEvent, { type: "context" }>;
        expect(ctx.stage).toBe("Early Traction"); // the LABEL, as the legacy client expects
        expect(ctx.stageIndex).toBe(3);
        expect(types).toContain("pipeline_progress");
        expect(types).not.toContain("done"); // the runner emits done after persisting
        expect(types.indexOf("criteria_synthesis_start")).toBeLessThan(types.indexOf("dimension_start"));
        expect(types.filter((t) => t === "dimension_start")).toHaveLength(8);
        expect(types.filter((t) => t === "dimension_complete")).toHaveLength(8);
        const progress = out.filter((e): e is Extract<StreamEvent, { type: "progress" }> => e.type === "progress");
        expect(progress.map((p) => p.completed)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(progress.every((p) => p.total === 8)).toBe(true);
        const dc = out.find((e): e is Extract<StreamEvent, { type: "dimension_complete" }> => e.type === "dimension_complete")!;
        expect(dc).toMatchObject({ dimension: dc.dim, label: expect.any(String), score: expect.any(Number), markdown: expect.any(String), priority: expect.any(String) });
        expect(dc.chapter?.dim).toBe(dc.dim);
        expect(types.indexOf("valuation_complete")).toBeGreaterThan(types.lastIndexOf("dimension_complete"));
        expect(types.indexOf("criteria_synthesis")).toBeGreaterThan(types.indexOf("valuation_complete"));
        const cs = out.find((e): e is Extract<StreamEvent, { type: "criteria_synthesis" }> => e.type === "criteria_synthesis")!;
        expect(cs.criteria).toHaveLength(13);
        expect(cs.criteria.every((c) => typeof c.primary_dimension === "string" && typeof c.next_action === "string")).toBe(true);
        expect(types).toContain("executive_complete");
        expect(types).toContain("audit_complete");
        expect(state.done?.reportId).toBe("rpt-1");
        const done = doneEvent(state, 1234, false) as Extract<StreamEvent, { type: "done" }>;
        expect(done).toMatchObject({ type: "done", fromCache: false, reportId: "rpt-1", calls: 24, costAud: 0.03, deadlineHit: false });
      }
    }
  });

  it("a partial run (one dim) never emits criteria_synthesis_start and counts progress against the requested dims", () => {
    const state = newWireState(["cgh"]);
    const out: StreamEvent[] = [];
    toWireEvents({ type: "dimension_start", dim: "cgh", ownerAgent: "cfo" }, state).forEach((e) => out.push(e));
    toWireEvents({ type: "dimension_complete", dim: "cgh", chapter: chapterOf("cgh") }, state).forEach((e) => out.push(e));
    expect(out.map((e) => e.type)).toEqual(["dimension_start", "dimension_complete", "progress"]);
    expect(out[2]).toMatchObject({ completed: 1, total: 1 });
  });

  it("error events keep the legacy `dimension` field and carry degraded:true; errors without a dim are dropped", () => {
    const state = newWireState(["tre"]);
    expect(toWireEvents({ type: "error", dim: "tre", message: "budget", degraded: true }, state)).toEqual([{ type: "error", dimension: "tre", message: "budget", dim: "tre", degraded: true }]);
    expect(toWireEvents({ type: "error", message: "x", degraded: true }, state)).toEqual([]);
  });
});

// ── Runner ──────────────────────────────────────────────────────────────────

describe("runReportPipeline", () => {
  it("applies the report provider policy through the default AI adapter", async () => {
    defaultTransport.mockResolvedValueOnce({ text: "fixture", cost_usd: 0, via: "deepinfra", model: "fixture" });
    const fake = fakeOrchestrate();
    const d = deps({
      callAI: undefined,
      orchestrate: async (input) => {
        if (typeof input.callAI !== "function") throw new Error("Expected callable AI adapter");
        await input.callAI("system", "user", 128, "classify");
        return fake.orchestrate(input);
      },
    });
    const result = await runReportPipeline({ userId: "user-1", ownerEmail: "owner@x.test", projectId: "proj-1", tier: "free", persist: false, onEvent: () => {}, deps: d });
    expect(result.ok).toBe(true);
    expect(defaultTransport).toHaveBeenCalledWith(expect.objectContaining({ policy: "blockid-report-v1", taskClass: "classify", agentId: "svi:acct-1:proj-1", userId: "user-1" }));
  });

  it("full run: loads the context, runs the orchestrator with the tier / owner / callAI, persists today's snapshot + report_v2, emits done with the snapshot id, notifies and emails", async () => {
    const d = deps();
    const events: StreamEvent[] = [];
    const res = await runReportPipeline({ userId: "user-1", ownerEmail: "owner@x.test", callerEmail: "user@x.test", ownerUserId: "owner-1", projectId: "proj-1", tier: "free", onEvent: (e) => events.push(e), deps: d });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(d.calls[0]).toMatchObject({ accountId: "acct-1", userId: "user-1", ownerUserId: "owner-1", projectId: "proj-1", tier: "standard", tierV2: "free", startupName: "Acme", rawText: "Acme sells widgets" });
    expect(d.calls[0].dims).toBeUndefined();
    expect(d.persisted).toHaveLength(1);
    expect(d.persisted[0]).toMatchObject({ dimResults: expect.arrayContaining([expect.objectContaining({ dimension: "tre" })]), criterionResults: expect.any(Array) });
    expect((d.persisted[0] as { reportV2: { pipelineVersion: string } }).reportV2.pipelineVersion).toBe(PIPELINE_VERSION);
    const done = events.at(-1) as Extract<StreamEvent, { type: "done" }>;
    expect(done.type).toBe("done");
    expect(done).toMatchObject({ fromCache: false, reportId: "rpt-1", snapshotId: "snap-1", saveStatus: "saved", calls: 24 });
    expect(res).toMatchObject({ reportId: "rpt-1", snapshotId: "snap-1", accountId: "acct-1", calls: 24, costAud: 0.03 });
    expect(res.dimResults).toHaveLength(8);
    expect(res.criterionResults).toHaveLength(13);
    // Fire-and-forget side effects settle on the microtask queue.
    await new Promise((r) => setTimeout(r, 0));
    expect(d.notified).toHaveLength(1);
    expect(d.notified[0]).toMatchObject({ userId: "user-1", projectId: "proj-1", kind: "analysis_done", payload: expect.objectContaining({ fromCache: false, dims: 8 }) });
    expect(d.emailed).toHaveLength(1);
    expect(d.emailed[0]).toMatchObject({ userId: "user-1", projectId: "proj-1", industry: "SaaS", stage: "Early Traction" });
    // The event list the old client consumed, in order, with the new ones alongside.
    const types = events.map((e) => e.type);
    expect(types.filter((t) => ["context", "dimension_start", "dimension_complete", "progress", "criteria_synthesis_start", "criteria_synthesis", "done"].includes(t)).length).toBeGreaterThan(20);
    expect(types.at(-1)).toBe("done");
  });

  it("deck run: the deck text replaces the analysis text, the deck cache is written with pipeline_version and no snapshot is persisted (save-snapshot stays the client's step)", async () => {
    const { db, upserts } = fakeDb(null);
    const d = deps({ db });
    const events: StreamEvent[] = [];
    const deckText = "Slide 1: Acme. Slide 2: A$12k MRR.";
    const res = await runReportPipeline({ userId: "user-1", ownerEmail: "owner@x.test", projectId: "proj-1", tier: "free", deckText, onEvent: (e) => events.push(e), deps: d });
    expect(res.ok).toBe(true);
    expect(d.calls[0].rawText).toBe(deckText);
    expect(d.persisted).toHaveLength(0);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({ deck_hash: scopedDeckCacheKey(deckText, "proj-1", "free"), user_id: "user-1", pipeline_version: DECK_CACHE_VERSION, industry: "SaaS", stage: "Early Traction" });
    expect((upserts[0].dim_results as unknown[]).length).toBe(8);
    expect((upserts[0].criterion_results as unknown[]).length).toBe(13);
    expect((events.at(-1) as Extract<StreamEvent, { type: "done" }>).snapshotId).toBeNull();
  });

  it("deck cache replays the final projection written by the runner, not preview copies", async () => {
    const deckText = "same deck";
    const first = fakeDb(null);
    await runReportPipeline({ userId: "user-1", projectId: "proj-1", tier: "free", deckText, deps: deps({ db: first.db }) });
    const row = first.upserts[0];
    const stored = row.dim_results as Array<{ markdown: string; score: number }>;
    stored[0].markdown = "obsolete preview A$12k MRR";
    stored[0].score = 99;
    const d = deps({ db: fakeDb(row).db });
    const events: StreamEvent[] = [];
    const res = await runReportPipeline({ userId: "user-1", projectId: "proj-1", tier: "free", deckText, onEvent: e => events.push(e), deps: d });
    expect(res.ok && res.fromCache).toBe(true);
    expect(d.calls).toHaveLength(0);
    const final = events.find(e => e.type === "final_projection");
    expect(final?.type === "final_projection" && final.projection.dimensions[0].markdown).not.toContain("obsolete preview");
    expect(events.filter(e => e.type === "dimension_complete").map(e => e.markdown).join(" ")).not.toContain("obsolete preview");
    expect(events.at(-1)).toMatchObject({ type: "done", fromCache: true, saveStatus: "not_requested", snapshotId: null });
  });

  it("a cached row from another pipeline version (or the legacy generator: NULL) is a miss", async () => {
    const deckText = "old deck";
    for (const version of [null, "pipeline-v2.0-w4", PIPELINE_VERSION]) {
      const { db } = fakeDb({ deck_hash: hashDeck(deckText), dim_results: [chapterToLegacy(chapterOf("tre"))], criterion_results: [], created_at: new Date(1_000).toISOString(), pipeline_version: version });
      const d = deps({ db });
      const res = await runReportPipeline({ userId: "user-1", ownerEmail: "owner@x.test", projectId: "proj-1", tier: "free", deckText, onEvent: () => undefined, deps: d });
      expect(res.ok && !res.fromCache).toBe(true);
      expect(d.calls).toHaveLength(1);
    }
  });

  it("partial run (dims:['cgh']): W1–W3 seeded from the stored cards, nothing persisted, no notify / email, only the cgh chapter", async () => {
    const d = deps();
    const events: StreamEvent[] = [];
    const res = await runReportPipeline({ userId: "user-1", ownerEmail: "owner@x.test", projectId: "proj-1", tier: "standard", dims: ["cgh"], onEvent: (e) => events.push(e), deps: d });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(d.calls[0].dims).toEqual(["cgh"]);
    expect(res.chapters.map((c) => c.dim)).toEqual(["cgh"]);
    expect(d.persisted).toHaveLength(0);
    await new Promise((r) => setTimeout(r, 0));
    expect(d.notified).toHaveLength(0);
    expect(d.emailed).toHaveLength(0);
    expect(events.filter((e) => e.type === "dimension_complete")).toHaveLength(1);
    expect(events.some((e) => e.type === "criteria_synthesis_start")).toBe(false);
  });

  it("missing account / analysis → fatal_error + ok:false without running the orchestrator", async () => {
    const d = deps({ loadContext: async () => ({ ok: false, error: "no_analysis" }) as never });
    const events: StreamEvent[] = [];
    const res = await runReportPipeline({ userId: "user-1", ownerEmail: "owner@x.test", projectId: null, tier: "free", onEvent: (e) => events.push(e), deps: d });
    expect(res).toMatchObject({ ok: false, error: "no_analysis" });
    expect(events).toEqual([{ type: "fatal_error", message: "No SVI analysis found — run an analysis first" }]);
    expect(d.calls).toHaveLength(0);
  });

  it("deck flow parity: a founder with no stored analysis yet gets an in-memory context scored from the deck (never 'run an analysis first')", async () => {
    const d = deps({ loadContext: async () => ({ ok: false, error: "no_analysis" }) as never });
    const events: StreamEvent[] = [];
    const deckText = "Acme Rail\nFreight scheduling SaaS. MRR A$12,000 from 9 paying customers. Raising A$1.5m.";
    const res = await runReportPipeline({ userId: "user-1", ownerEmail: "owner@x.test", projectId: null, tier: "free", deckText, onEvent: (e) => events.push(e), deps: d });
    expect(res.ok).toBe(true);
    expect(events.some((e) => e.type === "fatal_error")).toBe(false);
    expect(d.calls[0]).toMatchObject({ accountId: "deck:user-1", startupName: "Acme Rail", rawText: deckText });
    expect(d.calls[0].sviAnalysis.totalSVI).toBeGreaterThan(0);
    expect(d.persisted).toHaveLength(0);
  });

  it("a fully degraded report is the ONLY pipeline failure: fatal_error, ok:false, nothing persisted", async () => {
    const fake = fakeOrchestrate({ degradeAll: true });
    const { assertReportUsable } = await import("./orchestrator");
    const d = deps({
      orchestrate: (async (input: OrchestratorInput) => {
        const report = await fake.orchestrate(input);
        assertReportUsable(report);
        return report;
      }) as never,
    });
    const events: StreamEvent[] = [];
    const res = await runReportPipeline({ userId: "user-1", ownerEmail: "owner@x.test", projectId: "proj-1", tier: "free", onEvent: (e) => events.push(e), deps: d });
    expect(res).toMatchObject({ ok: false, error: "fully_degraded" });
    expect(events.at(-1)).toMatchObject({ type: "fatal_error" });
    expect((events.at(-1) as { message: string }).message).toMatch(/nothing is charged/);
    expect(d.persisted).toHaveLength(0);
  });

  it("a failed save preserves generated content but does not announce saved or email", async () => {
    const d = deps({ persistSnapshot: async () => { throw new Error("db write failed"); } });
    const events: StreamEvent[] = [];
    const res = await runReportPipeline({ userId: "user-1", ownerEmail: "owner@x.test", projectId: "proj-1", tier: "free", onEvent: (e) => events.push(e), deps: d });
    expect(res).toMatchObject({ ok: true, saveStatus: "save_failed", report: expect.any(Object) });
    expect(events.at(-1)).toMatchObject({ type: "done", snapshotId: null, saveStatus: "save_failed" });
    expect(events.filter((event) => event.type === "done")).toHaveLength(1);
    expect(d.notified).toHaveLength(0);
    expect(d.emailed).toHaveLength(0);
  });
  it.each([{ snapshotId: null, reportV2Saved: false }, { snapshotId: "partial-snap", reportV2Saved: false }])("reports unacknowledged save honestly: %j", async (outcome) => {
    const d = deps({ persistSnapshot: async () => outcome });
    const events: StreamEvent[] = [];
    const res = await runReportPipeline({ userId: "user-1", ownerEmail: "owner@x.test", projectId: "proj-1", tier: "standard", onEvent: (event) => events.push(event), deps: d });
    expect(res).toMatchObject({ ok: true, saveStatus: "save_failed", snapshotId: outcome.snapshotId, report: expect.any(Object) });
    expect(events.at(-1)).toMatchObject({ type: "done", saveStatus: "save_failed" });
    expect(d.emailed).toHaveLength(0);
    expect(d.notified).toHaveLength(0);
  });
  it("does not mislabel intentionally disabled persistence as a failed save", async () => {
    const d = deps();
    const res = await runReportPipeline({ userId: "user-1", ownerEmail: "owner@x.test", projectId: "proj-1", tier: "free", persist: false, onEvent: () => {}, deps: d });
    expect(res).toMatchObject({ ok: true, saveStatus: "not_requested" });
    expect(d.persisted).toHaveLength(0);
  });

  it.each([false, true])("default adapter requires canonical write acknowledgement (%s)", async (acknowledged) => {
    const legacy = await import("./run-for-project");
    const storage = await import("@/lib/report-v2/storage");
    const upsert = vi.spyOn(legacy, "upsertSnapshotWithToken").mockResolvedValue({ snapshotId: "snap-actual", shareToken: "fixture" });
    const write = vi.spyOn(storage, "writeSnapshotReportV2").mockResolvedValue(acknowledged);
    persistenceDb.value = {};
    const d = deps({ persistSnapshot: undefined });
    try {
      const res = await runReportPipeline({ userId: "user-1", ownerEmail: "owner@x.test", projectId: "proj-1", tier: "standard", onEvent: () => {}, deps: d });
      expect(write).toHaveBeenCalledWith({}, "snap-actual", expect.objectContaining({ snapshotId: "snap-actual", projectId: "proj-1" }));
      expect(res).toMatchObject({ ok: true, snapshotId: "snap-actual", saveStatus: acknowledged ? "saved" : "save_failed" });
      expect(d.emailed).toHaveLength(acknowledged ? 1 : 0);
      expect(d.notified).toHaveLength(acknowledged ? 1 : 0);
    } finally { upsert.mockRestore(); write.mockRestore(); persistenceDb.value = null; }
  });
  it("default adapter treats unavailable canonical storage as save_failed", async () => {
    const legacy = await import("./run-for-project");
    const storage = await import("@/lib/report-v2/storage");
    const upsert = vi.spyOn(legacy, "upsertSnapshotWithToken").mockResolvedValue({ snapshotId: "snap-partial", shareToken: "fixture" });
    const write = vi.spyOn(storage, "writeSnapshotReportV2");
    persistenceDb.value = null;
    const d = deps({ persistSnapshot: undefined });
    try {
      const res = await runReportPipeline({ userId: "user-1", ownerEmail: "owner@x.test", projectId: "proj-1", tier: "standard", onEvent: () => {}, deps: d });
      expect(res).toMatchObject({ ok: true, saveStatus: "save_failed", snapshotId: "snap-partial" });
      expect(write).not.toHaveBeenCalled();
      expect(d.emailed).toHaveLength(0);
    } finally { upsert.mockRestore(); write.mockRestore(); }
  });

});


describe("G30 deck input isolation", () => {
  const request = { userId: "user-1", ownerEmail: "owner@x.test", callerEmail: "member@x.test", projectId: "proj-1", tier: "free" as const, onEvent: () => undefined };

  it("recomputes new deck signals without borrowing old revenue, answers or evidence", async () => {
    const stale = ctxOk();
    const old = syntheticDeckContext(request, "Acme\nMRR A$50,000 from 100 paying customers. Raising A$2m.");
    stale.ctx.sviAnalysis = old.sviAnalysis as never;
    stale.ctx.latestAnalysis = { ...stale.ctx.latestAnalysis, raw_input: old.latestAnalysis.raw_input, analysis_json: old.latestAnalysis.analysis_json as never };
    stale.ctx.evidenceItems = [{ evidence_type: "traction", dimension: "tre", confidence_level: "transaction_data", label: "Old deck claims" }] as never;
    stale.ctx.criteriaData = { revenue: { textInput: "Old revenue A$50,000", aiScore: 99, files: [], links: [], qualityLevel: "complete" } } as never;
    const before = JSON.stringify(stale);
    const d = deps({ loadContext: async () => stale });
    const deckText = "Acme\nWe are exploring an idea. No revenue and no paying customers. No product yet.";
    const result = await runReportPipeline({ ...request, deckText, deps: d });
    expect(result.ok).toBe(true);
    expect(old.sviAnalysis.signals.mrrAud).toBe(50000);
    expect(d.calls[0].sviAnalysis.signals.mrrAud).toBeUndefined();
    expect(d.calls[0].sviAnalysis).not.toEqual(old.sviAnalysis);
    expect(d.calls[0].evidenceItems).toEqual([]);
    expect(d.calls[0].criteriaData.revenue).toMatchObject({ textInput: "", qualityLevel: "incomplete" });
    expect(Object.keys(d.calls[0].criteriaData)).toHaveLength(13);
    expect(d.calls[0]).toMatchObject({ accountId: "acct-1", projectId: "proj-1", startupName: "Acme", userId: "user-1", ownerUserId: "owner-1" });
    expect(JSON.stringify(stale)).toBe(before);
  });

  it("keeps the entire received text and separates documents sharing an 8k prefix", async () => {
    const prefix = "Business context. ".repeat(600);
    const first = prefix + "\nMRR A$12,000.";
    const second = prefix + "\nMRR A$25,000.";
    const { db, upserts } = fakeDb(null);
    const d = deps({ db });
    const a = await runReportPipeline({ ...request, deckText: first, deps: d });
    const b = await runReportPipeline({ ...request, deckText: second, deps: d });
    expect(d.calls[0].rawText).toBe(first);
    expect(d.calls[1].rawText).toBe(second);
    expect(d.calls[0].sviAnalysis.signals.mrrAud).toBe(12000);
    expect(d.calls[1].sviAnalysis.signals.mrrAud).toBe(25000);
    expect(upserts.map((row) => row.deck_hash)).toEqual([scopedDeckCacheKey(first, "proj-1", "free"), scopedDeckCacheKey(second, "proj-1", "free")]);
    expect(upserts[0].deck_hash).not.toBe(upserts[1].deck_hash);
    expect(upserts.every((row) => row.pipeline_version === DECK_CACHE_VERSION)).toBe(true);
    expect(a.ok && a.inputSnapshot).toEqual({ version: "deck-input-v1", textSha256: hashDeck(first), receivedTextChars: first.length, extractionCompleteness: "unknown" });
    expect(b.ok && b.inputSnapshot?.textSha256).toBe(hashDeck(second));
  });

  it("rejects partial new-deck analysis before context, seeds or any model call", async () => {
    const loadContext = vi.fn(async () => ctxOk());
    const callAI = vi.fn(async () => "must not run");
    const d = deps({ loadContext, callAI });
    const events: StreamEvent[] = [];
    const result = await runReportPipeline({ ...request, dims: ["tre"], deckText: "Acme\nNo revenue yet.", onEvent: (event) => events.push(event), deps: d });
    expect(result).toMatchObject({ ok: false, error: "full_analysis_required" });
    expect(events).toEqual([{ type: "fatal_error", message: expect.stringContaining("full analysis") }]);
    expect(loadContext).not.toHaveBeenCalled();
    expect(callAI).not.toHaveBeenCalled();
    expect(d.calls).toHaveLength(0);
    expect(d.persisted).toHaveLength(0);
    expect(d.notified).toHaveLength(0);
    expect(d.emailed).toHaveLength(0);
  });

  it("fails blank document input before loading stale context or invoking an agent", async () => {
    const loadContext = vi.fn(async () => ctxOk());
    const d = deps({ loadContext });
    const result = await runReportPipeline({ ...request, deckText: " \n\t ", deps: d });
    expect(result).toMatchObject({ ok: false, error: "needs_input" });
    expect(loadContext).not.toHaveBeenCalled();
    expect(d.calls).toHaveLength(0);
  });
});

describe("G30 valuation availability wire", () => {
  it("carries unavailable through the chapter event and terminal event without numeric fields", async () => {
    const { unavailableValuation } = await import("@/lib/report-v2/schema");
    const state = newWireState(["tre"]);
    const chapter = unavailableValuation("missing_or_invalid_revenue", "2026-09-22T00:00:00Z", ["current_revenue"]);
    const events = toWireEvents({ type: "valuation_complete", chapter }, state);
    expect(events).toEqual([{ type: "valuation_complete", chapter }]);
    expect(JSON.stringify(events)).not.toMatch(/consensus|lowAud|midAud|highAud/);
    expect(doneEvent(state, 10, false)).toMatchObject({ valuationStatus: "unavailable" });
  });
  it("never turns an absent valuation event into permission for a client SVI-derived estimate", () => {
    expect(doneEvent(newWireState(["tre"]), 10, false)).toMatchObject({ valuationStatus: "unavailable" });
  });
});

describe("canonical final valuation parity", () => {
  it("publishes the final report value after an earlier conflicting chapter and before done", async () => {
    const fake = fakeOrchestrate();
    const final = { ...demo.valuation, consensus: { ...demo.valuation.consensus, lowAud: 11000000, midAud: 12000000, highAud: 13000000 } };
    const events: StreamEvent[] = [];
    const d = deps({ orchestrate: async input => ({ ...await fake.orchestrate(input), reportV2: { ...demo, valuation: final } }) });
    await runReportPipeline({ userId: "user-1", projectId: "proj-1", tier: "free", onEvent: e => events.push(e), deps: d });
    const chapters = events.filter(e => e.type === "valuation_complete");
    expect(chapters[0]).toMatchObject({ chapter: demo.valuation });
    expect(chapters.at(-1)).toEqual({ type: "valuation_complete", chapter: final });
    expect(events.at(-1)).toMatchObject({ type: "done", valuationStatus: "available" });
  });
});

it("partial retry without a valuation event does not overwrite the prior client outcome", async () => {
  const fake = fakeOrchestrate();
  const events: StreamEvent[] = [];
  const d = deps({ orchestrate: async input => fake.orchestrate({ ...input, onEvent: event => { if (event.type !== "valuation_complete") input.onEvent?.(event); } }) });
  await runReportPipeline({ userId: "user-1", projectId: "proj-1", tier: "free", dims: ["tre"], onEvent: event => events.push(event), deps: d });
  expect(events.some(e => e.type === "valuation_complete")).toBe(false);
  expect(events.at(-1)?.type).toBe("done");
  expect(events.at(-1)).toHaveProperty("valuationStatus", undefined);
});

it("final gated dimensions replace preview prose/scores/cards before save and SSE completion", async () => {
  const { applyConsistencyGates } = await import("./consistency-gates");
  const fake = fakeOrchestrate();
  const final = structuredClone(demo);
  const tre = final.dimensions.find(d => d.dim === "tre")!;
  tre.verdict = "A$12k MRR";
  tre.score = 99;
  tre.criteria[0].verdict = "A$12k MRR";
  final.cover.svi.total = 61;
  const early = structuredClone(tre);
  let releaseSave: (() => void) | undefined;
  let saved: Parameters<NonNullable<RunPipelineDeps["persistSnapshot"]>>[0] | undefined;
  const events: StreamEvent[] = [];
  const d = deps({
    orchestrate: async input => {
      const report = await fake.orchestrate({ ...input, onEvent: event => input.onEvent?.(event.type === "dimension_complete" && event.dim === "tre" ? { ...event, chapter: early } : event) });
      applyConsistencyGates({ chapters: new Map(final.dimensions.map(d => [d.dim, d])), dimScores: { tre: 42 }, valuation: null, stage: 3, evidenceRows: [], executiveSummary: "Review the evidence." });
      return { ...report, reportV2: final };
    },
    persistSnapshot: async args => { saved = args; await new Promise<void>(resolve => { releaseSave = resolve; }); return { snapshotId: "saved-final", reportV2Saved: true }; },
  });
  const pending = runReportPipeline({ userId: "user-1", projectId: "proj-1", tier: "free", onEvent: e => events.push(e), deps: d });
  await vi.waitFor(() => expect(releaseSave).toBeTypeOf("function"));
  expect(events.some(e => e.type === "done" || e.type === "final_projection")).toBe(false);
  expect(events.find(e => e.type === "dimension_complete" && e.dimension === "tre")).toMatchObject({ score: 99, markdown: expect.stringContaining("A$12k") });
  expect(saved?.dimResults.find(d => d.dimension === "tre")).toMatchObject({ score: 42 });
  expect(saved?.dimResults.find(d => d.dimension === "tre")?.markdown).not.toContain("A$12k");
  expect(saved?.criterionResults.find(c => c.key === tre.criteria[0].key)?.verdict).toBe(tre.criteria[0].verdict);
  releaseSave!();
  await pending;
  const event = events.find(e => e.type === "final_projection");
  expect(event?.type === "final_projection" && event.projection.dimensions).toEqual(saved?.dimResults);
  expect(event?.type === "final_projection" && event.projection.totalSVI).toBe(61);
  expect(events.at(-1)).toMatchObject({ type: "done", saveStatus: "saved", snapshotId: "saved-final" });
});

it("separates cache identity by assessed project, tier and language", () => {
  const keys = [
    scopedDeckCacheKey("same deck", "one", "free", "en"),
    scopedDeckCacheKey("same deck", "two", "free", "en"),
    scopedDeckCacheKey("same deck", "one", "premium", "en"),
    scopedDeckCacheKey("same deck", "one", "free", "vi"),
  ];
  expect(new Set(keys).size).toBe(4);
});

it("cannot replay a legacy preview merely stamped with the current cache version", async () => {
  const row = { created_at: new Date(1000).toISOString(), pipeline_version: DECK_CACHE_VERSION,
    dim_results: demo.dimensions.map(chapterToLegacy), criterion_results: cards.map(cardToLegacy) };
  const d = deps({ db: fakeDb(row).db });
  const result = await runReportPipeline({ userId: "user-1", projectId: "proj-1", tier: "free", deckText: "same input", deps: d });
  expect(result.ok && result.fromCache).toBe(false);
  expect(d.calls).toHaveLength(1);
});

it("partial preview and audited final retain untouched sections and bypass adapter fallback", async () => {
  const { applyConsistencyGates } = await import("./consistency-gates");
  const { mergeFinalCriteria, replaceFinalDimensions } = await import("./final-projection");
  const fake = fakeOrchestrate();
  const audited = structuredClone(chapterOf("tre"));
  audited.score = 99;
  audited.verdict = "A$12k MRR";
  audited.criteria[0].verdict = "A$12k MRR";
  const preview = structuredClone(audited);
  const untouched = cards.find(c => !preview.criteria.some(selected => selected.key === c.key))!;
  let clientCards = [cardToLegacy(untouched), ...preview.criteria.map(cardToLegacy)];
  let clientDims = { mpc: { score: 73, markdown: "untouched market", expanded: true }, tre: { score: 10, markdown: "previous revenue", expanded: true } };
  const events: StreamEvent[] = [];
  const d = deps({ orchestrate: async input => {
    const report = await fake.orchestrate({ ...input, onEvent: event => {
      if (event.type === "dimension_complete") input.onEvent?.({ ...event, chapter: preview });
      else if (event.type === "criteria_synthesis") input.onEvent?.({ ...event, criteria: preview.criteria });
      else input.onEvent?.(event);
    } });
    applyConsistencyGates({ chapters: new Map([["tre", audited]]), dimScores: { tre: 42 }, valuation: null, stage: 3, evidenceRows: [], executiveSummary: "Review the evidence." });
    const adapter = structuredClone(demo);
    adapter.dimensions.find(c => c.dim === "tre")!.verdict = "ADAPTER FALLBACK";
    return { ...report, reportV2: adapter, finalDimensionChapters: [audited] };
  } });
  await runReportPipeline({ userId: "user-1", projectId: "proj-1", tier: "free", dims: ["tre"], deps: d, onEvent: event => {
    events.push(event);
    if (event.type === "criteria_synthesis") {
      clientCards = mergeFinalCriteria(clientCards, event.criteria, "partial");
      expect(clientCards.find(c => c.key === untouched.key)).toEqual(cardToLegacy(untouched));
    }
    if (event.type === "dimension_complete") clientDims = { ...clientDims, tre: { ...clientDims.tre, score: event.score, markdown: event.markdown } };
    if (event.type === "final_projection") {
      expect(event.projection).toMatchObject({ scope: "partial", totalSVI: null });
      clientCards = mergeFinalCriteria(clientCards, event.projection.criteria, event.projection.scope);
      clientDims = replaceFinalDimensions(clientDims, event.projection) as typeof clientDims;
    }
  } });
  expect(events.find(e => e.type === "dimension_complete")).toMatchObject({ score: 99, markdown: expect.stringContaining("A$12k") });
  expect(clientDims.tre).toMatchObject({ score: 42, expanded: true });
  expect(clientDims.tre.markdown).not.toContain("A$12k");
  expect(clientDims.tre.markdown).not.toContain("ADAPTER FALLBACK");
  expect(clientDims.mpc).toEqual({ score: 73, markdown: "untouched market", expanded: true });
  expect(clientCards.find(c => c.key === untouched.key)).toEqual(cardToLegacy(untouched));
  expect(clientCards.find(c => c.key === audited.criteria[0].key)?.verdict).toBe(audited.criteria[0].verdict);
  expect(events.at(-1)).toMatchObject({ type: "done", saveStatus: "not_requested" });
  expect(d.persisted).toHaveLength(0);
});

it("does not save or complete a partial run without audited selected chapters", async () => {
  const fake = fakeOrchestrate();
  const d = deps({ orchestrate: async input => ({ ...await fake.orchestrate(input), finalDimensionChapters: undefined }) });
  const events: StreamEvent[] = [];
  const result = await runReportPipeline({ userId: "user-1", projectId: "proj-1", tier: "free", dims: ["tre"], deps: d, onEvent: event => events.push(event) });
  expect(result).toMatchObject({ ok: false, error: "pipeline_failed" });
  expect(d.persisted).toHaveLength(0);
  expect(events.some(event => event.type === "fatal_error")).toBe(true);
  expect(events.some(event => event.type === "done" || event.type === "final_projection")).toBe(false);
});
