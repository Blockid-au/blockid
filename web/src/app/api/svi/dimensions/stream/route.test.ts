// POST /api/svi/dimensions/stream (S-R3): thin SSE over runReportPipeline.
//
// Pins:
//   - 401 anonymous; explicit body.projectId verified through the project
//     scope (404 non-member / 403 below viewer); no project → own data
//   - the SSE wire keeps the vocabulary the streaming client parsed since
//     Wave 24 (context → dimension_start → dimension_complete → progress →
//     criteria_synthesis_start → criteria_synthesis → done) with the richer
//     events alongside; fatal_error on a thrown run; the stream always closes
//   - free tier: no credit check, no spend; paid tier: 402 before the run,
//     spend AFTER a delivered (non-cached) report only
//   - REPORT_GENERATOR=legacy_stream hands the request to route.legacy.ts

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeScopeState } from "@/test/project-scope-mock";
import type { StreamEvent } from "@/lib/report-pipeline/run-report-pipeline";

const scopeState = vi.hoisted(() => ({
  projectId: "proj-1" as string | null,
  role: "owner" as "owner" | "admin" | "editor" | "viewer",
  nonMember: false,
  callerEmail: "caller@x.test",
  callerId: "user-caller",
  ownerEmail: "owner@x.test",
  ownerId: "user-owner",
  calls: [] as Array<{ fn: string; email?: string; projectId: string | null; opts?: unknown }>,
  accountId: "acct-1" as string | null,
  account: { id: "acct-1", startup_name: "P" } as Record<string, unknown> | null,
  analysis: { raw_input: "x", analysis_json: {} } as Record<string, unknown> | null,
  lastMinRole: undefined as string | undefined,
}));
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});

const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test" } as { id: string; email: string } | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));

const credits = vi.hoisted(() => ({ canAfford: vi.fn(), spendCredits: vi.fn() }));
vi.mock("@/lib/credits", () => ({
  canAfford: (...a: unknown[]) => credits.canAfford(...a),
  spendCredits: (...a: unknown[]) => credits.spendCredits(...a),
  FEATURE_COSTS: { enhanced_report_standard: 3, enhanced_report_premium: 7, enhanced_report_investor: 10 },
}));

const runner = vi.hoisted(() => ({
  calls: [] as Array<Record<string, unknown>>,
  mode: "ok" as "ok" | "cache" | "throw" | "fatal" | "save_failed",
}));
vi.mock("@/lib/report-pipeline/run-report-pipeline", () => ({
  runReportPipeline: async (input: Record<string, unknown>) => {
    runner.calls.push(input);
    const send = input.onEvent as (e: StreamEvent) => void;
    if (runner.mode === "throw") throw new Error("boom");
    if (runner.mode === "fatal") {
      send({ type: "fatal_error", message: "No SVI analysis found — run an analysis first" });
      return { ok: false, error: "no_analysis", message: "No SVI analysis found — run an analysis first" };
    }
    if (runner.mode === "cache") {
      send({ type: "context", industry: "SaaS", stage: "Seed", stageIndex: 2, phaseId: "", tier: "free", estimatedCalls: 0, estimatedSeconds: 0, dims: [] });
      send({ type: "cache_hit", ageMs: 10, dims: 8, criteria: 13 });
      send({ type: "done", totalMs: 5, fromCache: true, reportId: null, snapshotId: null, calls: 0, costAud: 0, degradedSections: [], deadlineHit: false });
      return { ok: true, fromCache: true, accountId: "acct-1", reportId: null, snapshotId: null, dimResults: [], chapters: [], criterionResults: [], report: null, calls: 0, costAud: 0, totalMs: 5, deadlineHit: false };
    }
    const dims = (input.dims as string[] | undefined) ?? ["tre", "mpc", "ftv", "ptd", "cgh", "iri", "lco", "svm"];
    send({ type: "context", industry: "SaaS", stage: "Seed", stageIndex: 2, phaseId: "validation", tier: input.tier as never, estimatedCalls: 24, estimatedSeconds: 120, dims: dims as never });
    send({ type: "gather_complete", evidenceRows: 3, connectors: ["valuation"] });
    if (dims.length === 8) send({ type: "criteria_synthesis_start", total: 13 });
    dims.forEach((d, i) => {
      send({ type: "dimension_start", dimension: d, label: d.toUpperCase(), dim: d as never, ownerAgent: "cro" });
      send({ type: "dimension_complete", dimension: d, label: d.toUpperCase(), score: 60, markdown: "md", insights: ["a", "b"], priority: "medium", dim: d as never });
      send({ type: "progress", completed: i + 1, total: dims.length });
    });
    send({ type: "valuation_complete", chapter: {} as never });
    if (dims.length === 8) send({ type: "criteria_synthesis", criteria: [] });
    send({ type: "executive_complete", summary: "s" });
    send({ type: "audit_complete", groundedShare: 0.9, revised: 0 });
    send({ type: "done", saveStatus: runner.mode === "save_failed" ? "save_failed" : "saved", totalMs: 100, fromCache: false, reportId: "rpt-1", snapshotId: "snap-1", calls: 24, costAud: 0.03, degradedSections: [], deadlineHit: false });
    return { ok: true, saveStatus: runner.mode === "save_failed" ? "save_failed" : "saved", fromCache: false, accountId: "acct-1", reportId: "rpt-1", snapshotId: "snap-1", dimResults: [], chapters: [], criterionResults: [], report: null, calls: 24, costAud: 0.03, totalMs: 100, deadlineHit: false };
  },
}));

const legacy = vi.hoisted(() => ({ calls: 0 }));
vi.mock("./route.legacy", () => ({
  legacyStreamPOST: async () => {
    legacy.calls += 1;
    return new Response("data: {\"type\":\"legacy\"}\n\n", { headers: { "Content-Type": "text/event-stream" } });
  },
}));

import { POST } from "./route";

function req(body: Record<string, unknown> = {}) {
  return new Request("http://x/api/svi/dimensions/stream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

async function readEvents(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split("\n\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("data: "))
    .map((l) => JSON.parse(l.slice(6)) as Record<string, unknown>);
}

beforeEach(() => {
  Object.assign(scopeState, makeScopeState({ account: { id: "acct-1", startup_name: "P" }, analysis: { raw_input: "x", analysis_json: {} } }));
  auth.user = { id: "user-caller", email: "caller@x.test" };
  credits.canAfford.mockReset().mockResolvedValue({ allowed: true, balance: 10, cost: 3 });
  credits.spendCredits.mockReset().mockResolvedValue({ ok: true, balance: 7 });
  runner.calls.length = 0;
  runner.mode = "ok";
  legacy.calls = 0;
  delete process.env.REPORT_GENERATOR;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.REPORT_GENERATOR;
});

describe("POST /api/svi/dimensions/stream — auth + scope", () => {
  it("401 for an anonymous caller", async () => {
    auth.user = null;
    const res = await POST(req({ projectId: "proj-1" }));
    expect(res.status).toBe(401);
    expect(runner.calls).toHaveLength(0);
  });

  it("verifies an explicit projectId through the scope: non-member → 404, nothing runs", async () => {
    scopeState.nonMember = true;
    const res = await POST(req({ projectId: "proj-1" }));
    expect(res.status).toBe(404);
    expect(runner.calls).toHaveLength(0);
  });

  it("a member (viewer) streams the OWNER's record with the caller bound as callerEmail", async () => {
    scopeState.role = "viewer";
    const res = await POST(req({ projectId: "proj-1" }));
    expect(res.status).toBe(200);
    await res.text();
    expect(runner.calls[0]).toMatchObject({ userId: "user-caller", ownerEmail: "owner@x.test", callerEmail: "caller@x.test", ownerUserId: "user-owner", projectId: "proj-1", tier: "free" });
  });

  it("no project → the caller's own record", async () => {
    scopeState.projectId = null;
    const res = await POST(req({}));
    expect(res.status).toBe(200);
    await res.text();
    expect(runner.calls[0]).toMatchObject({ ownerEmail: "caller@x.test", projectId: null });
  });
});

describe("POST /api/svi/dimensions/stream — SSE wire", () => {
  it("streams the legacy vocabulary in order (context → dimension_start/complete/progress ×8 → criteria_synthesis_start … criteria_synthesis → done) with the S-R3 events alongside, then closes", async () => {
    const res = await POST(req({ projectId: "proj-1", mode: "sequential" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    expect(res.headers.get("x-report-generator")).toBe("pipeline");
    const events = await readEvents(res);
    const types = events.map((e) => e.type);
    // The exact list the old client relied on, in the old order.
    const legacyOnly = types.filter((t) => ["context", "dimension_start", "dimension_complete", "progress", "criteria_synthesis_start", "criteria_synthesis", "done"].includes(t as string));
    expect(legacyOnly[0]).toBe("context");
    expect(legacyOnly[1]).toBe("criteria_synthesis_start");
    expect(legacyOnly.slice(2, 5)).toEqual(["dimension_start", "dimension_complete", "progress"]);
    expect(legacyOnly.filter((t) => t === "dimension_complete")).toHaveLength(8);
    expect(legacyOnly.at(-2)).toBe("criteria_synthesis");
    expect(legacyOnly.at(-1)).toBe("done");
    // Richer S-R3 events ride alongside without displacing the legacy ones.
    expect(types).toEqual(expect.arrayContaining(["gather_complete", "valuation_complete", "executive_complete", "audit_complete"]));
    const dc = events.find((e) => e.type === "dimension_complete")!;
    expect(dc).toMatchObject({ dimension: "tre", label: "TRE", score: 60, markdown: "md", insights: ["a", "b"], priority: "medium", dim: "tre" });
    expect(events.at(-1)).toMatchObject({ type: "done", fromCache: false, reportId: "rpt-1", snapshotId: "snap-1" });
  });

  it("dims:[…] is forwarded for a stored-input partial re-run; unknown dims are dropped", async () => {
    const res = await POST(req({ projectId: "proj-1", dims: ["cgh", "nope"] }));
    const events = await readEvents(res);
    expect(runner.calls[0]).toMatchObject({ dims: ["cgh"], deckText: null });
    expect(events.filter((e) => e.type === "dimension_complete")).toHaveLength(1);
    expect(events.some((e) => e.type === "criteria_synthesis_start")).toBe(false);
  });

  it("a thrown run becomes fatal_error and the stream still closes", async () => {
    runner.mode = "throw";
    const res = await POST(req({ projectId: "proj-1" }));
    const events = await readEvents(res);
    expect(events).toEqual([{ type: "fatal_error", message: "boom" }]);
  });

  it("a pipeline-level failure (no analysis) is a fatal_error from the runner, nothing charged", async () => {
    runner.mode = "fatal";
    const res = await POST(req({ projectId: "proj-1", tier: "standard" }));
    const events = await readEvents(res);
    expect(events.at(-1)).toMatchObject({ type: "fatal_error" });
    expect(credits.spendCredits).not.toHaveBeenCalled();
  });
});

describe("POST /api/svi/dimensions/stream — credits / tier", () => {
  it("free tier (default): no credit check, no spend", async () => {
    const res = await POST(req({ projectId: "proj-1" }));
    await res.text();
    expect(credits.canAfford).not.toHaveBeenCalled();
    expect(credits.spendCredits).not.toHaveBeenCalled();
    expect(res.headers.get("x-report-tier-cost")).toBe("0");
  });

  it("standard tier: 402 before any run when the caller cannot afford it", async () => {
    credits.canAfford.mockResolvedValue({ allowed: false, balance: 0, cost: 3 });
    const res = await POST(req({ projectId: "proj-1", tier: "standard" }));
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ ok: false, error: "Insufficient credits", cost: 3, tier: "standard" });
    expect(runner.calls).toHaveLength(0);
  });

  it("standard tier: credits are spent AFTER a delivered report (never for a cache replay)", async () => {
    const res = await POST(req({ projectId: "proj-1", tier: "standard" }));
    await res.text();
    expect(credits.canAfford).toHaveBeenCalledWith("user-caller", "enhanced_report_standard");
    expect(credits.spendCredits).toHaveBeenCalledWith("user-caller", "enhanced_report_standard", expect.objectContaining({ tier: "standard", reportId: "rpt-1", calls: 24 }));
    expect(res.headers.get("x-report-tier-cost")).toBe("3");

    credits.spendCredits.mockClear();
    runner.mode = "cache";
    const cached = await POST(req({ projectId: "proj-1", tier: "standard", deckText: "d" }));
    const events = await readEvents(cached);
    expect(events.map((e) => e.type)).toEqual(["context", "cache_hit", "done"]);
    expect(credits.spendCredits).not.toHaveBeenCalled();
  });
});

describe("POST /api/svi/dimensions/stream — REPORT_GENERATOR=legacy_stream", () => {
  it("hands the request to the previous generator (route.legacy.ts) for one release", async () => {
    process.env.REPORT_GENERATOR = "legacy_stream";
    const res = await POST(req({ projectId: "proj-1" }));
    expect(legacy.calls).toBe(1);
    expect(runner.calls).toHaveLength(0);
    expect(await res.text()).toContain("legacy");
  });
  it("keeps the generation debit contract when a usable report could not be saved", async () => {
    runner.mode = "save_failed";
    const events = await readEvents(await POST(req({ tier: "standard" })));
    expect(events.at(-1)).toMatchObject({ type: "done", saveStatus: "save_failed" });
    expect(credits.spendCredits).toHaveBeenCalledTimes(1);
    expect(credits.spendCredits).toHaveBeenCalledWith("user-caller", "enhanced_report_standard", expect.objectContaining({ reportId: "rpt-1" }));
  });
  it("does not charge a disconnected caller even when generation succeeds but saving fails", async () => {
    runner.mode = "save_failed";
    const controller = new AbortController();
    controller.abort();
    const request = new Request("http://x/api/svi/dimensions/stream", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tier: "standard" }), signal: controller.signal });
    await readEvents(await POST(request));
    expect(credits.spendCredits).not.toHaveBeenCalled();
  });

});


describe("G30 explicit deck input at the HTTP boundary", () => {
  it("rejects blank deck text rather than invoking a report on stored analysis", async () => {
    for (const deckText of ["", " ", "\n\t"]) {
      const res = await POST(req({ projectId: "proj-1", tier: "standard", deckText }));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ ok: false, error: "needs_input" });
    }
    expect(runner.calls).toHaveLength(0);
    expect(credits.canAfford).not.toHaveBeenCalled();
    expect(credits.spendCredits).not.toHaveBeenCalled();
  });

  it("rejects partial new-deck requests without silently buying a full analysis", async () => {
    for (const dims of [["tre"], ["cgh", "nope"], Array(8).fill("cgh")]) {
      const res = await POST(req({ projectId: "proj-1", tier: "premium", deckText: "New business deck", dims }));
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ ok: false, error: "full_analysis_required", message: expect.stringContaining("full analysis") });
    }
    expect(runner.calls).toHaveLength(0);
    expect(credits.canAfford).not.toHaveBeenCalled();
    expect(credits.spendCredits).not.toHaveBeenCalled();
  });

  it("allows a full new-deck run and retains the exact received text", async () => {
    const deckText = "  New business\nMRR A$12,000.  ";
    const res = await POST(req({ projectId: "proj-1", deckText }));
    expect(res.status).toBe(200);
    await res.text();
    expect(runner.calls[0]).toMatchObject({ deckText, dims: undefined });
  });
});
