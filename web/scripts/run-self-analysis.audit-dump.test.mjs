// G24-D — `--audit-dump`: the self-report captures the orchestrator's
// `audit_complete.dump` and writes one diagnosable document (every
// SectionAuditRecord + the register ids / labels). Tested with fakes — no
// Supabase, no pipeline, no model call.
import { describe, expect, it, vi } from "vitest";
import { BLOCKID_CANONICAL_PROJECT_ID, buildAuditDumpDocument, CRITERION_KEYS, runSelfReport } from "./lib/self-report-core.mjs";

const PROJECTS = [{ id: BLOCKID_CANONICAL_PROJECT_ID, name: "Blockid.au 1", created_at: "2026-08-01T00:00:00Z", snapshots: 180, owner_email: "admin@blockid.au" }];

function fakeDb() {
  return {
    listProjects: vi.fn(async () => PROJECTS),
    findOwnerUserId: vi.fn(async () => "user-admin"),
    findAccount: vi.fn(async () => ({ id: "acc-1", startup_name: "BlockID.au" })),
    listCriteria: vi.fn(async () => CRITERION_KEYS.map((k) => ({ criterion_key: k, text_input: "y".repeat(80) }))),
    upsertCriteria: vi.fn(async () => {}),
  };
}

const DUMP = {
  groundedShare: 0.91,
  criticEvidenceChars: 18_400,
  sections: [
    { sectionId: "executive", uncitedClaims: [], findings: [], revised: false, grounded: true, skipped: undefined, llmAudited: true, hadIssues: false, droppedFindings: ['"strong market pull" — tone'], content: "Thesis [ev:a].", allowedEvidenceIds: ["a"] },
    { sectionId: "dim:tre", uncitedClaims: [], findings: [], revised: false, grounded: true, skipped: "clean", llmAudited: false, hadIssues: false, droppedFindings: [], content: "Verdict.", allowedEvidenceIds: ["a"] },
    { sectionId: "revenue", uncitedClaims: ["Typical ARR is A$50k–A$200k."], findings: ['"Typical ARR is A$50k–A$200k" — fabricated benchmark.'], revised: true, grounded: false, skipped: undefined, llmAudited: true, hadIssues: true, droppedFindings: [], content: "Typical ARR is A$50k–A$200k.", allowedEvidenceIds: ["a", "b"] },
    { sectionId: "idea", uncitedClaims: [], findings: ['"likely builds trust" — unsupported'], revised: true, grounded: false, skipped: undefined, llmAudited: true, hadIssues: true, droppedFindings: [], content: "It likely builds trust.", allowedEvidenceIds: ["a"] },
  ],
  register: [
    { id: "a", label: "Startup description", source: "self_declared", status: "partial" },
    { id: "b", label: "Valuation: CFO 5-method consensus (computed)", source: "connector_other", status: "partial" },
  ],
};

function fakePipeline({ withDump = true } = {}) {
  return {
    criterionDimensions: {},
    runRescoreForProject: vi.fn(),
    runTrustReportForProject: vi.fn(async (args) => {
      args.onEvent({ type: "audit_complete", groundedShare: 0.91, revised: 2, ...(withDump ? { dump: DUMP } : {}) });
      args.onEvent({ type: "done", calls: 40, costUsd: 0.03, degradedSections: ["tre"], deadlineHit: false });
      return { kind: "full", reportId: "rpt-9", snapshotId: "snap-9", shareToken: "tok", reportV2: {}, svi: 138, stage: 3, wordCount: 9000, qualityScore: 80, quality: { snapshotId: "snap-9", calls: 40, costUsd: 0.03, groundedShare: 0.91, degradedSections: 1, autoCited: 20 } };
    }),
    formatTbrQualityLine: (q) => `[tbr-quality] grounded=${q.groundedShare}`,
  };
}

describe("buildAuditDumpDocument", () => {
  it("carries every record field, the register, and a summary that names each ungrounded section with WHY (uncited / critic / both)", () => {
    const doc = buildAuditDumpDocument({ audit: DUMP, run: { reportId: "rpt-9", snapshotId: "snap-9" }, project: PROJECTS[0], tier: "standard", locale: "en", quality: { groundedShare: 0.91 }, now: "2026-09-21T10:00:00.000Z" });
    expect(doc).toMatchObject({ generatedAt: "2026-09-21T10:00:00.000Z", reportId: "rpt-9", snapshotId: "snap-9", tier: "standard", locale: "en", groundedShare: 0.91, dumpAvailable: true, criticEvidenceChars: 18_400 });
    expect(doc.summary).toEqual({
      sections: 4,
      grounded: 2,
      llmAudited: 3,
      ungrounded: [
        { sectionId: "revenue", why: "uncited+critic", uncited: 1, findings: 1 },
        { sectionId: "idea", why: "critic", uncited: 0, findings: 1 },
      ],
    });
    const exec = doc.sections.find((s) => s.sectionId === "executive");
    expect(exec).toEqual({ sectionId: "executive", grounded: true, skipped: null, llmAudited: true, hadIssues: false, revised: false, uncitedClaims: [], findings: [], droppedFindings: ['"strong market pull" — tone'], allowedEvidenceIds: ["a"], content: "Thesis [ev:a]." });
    expect(doc.sections.find((s) => s.sectionId === "dim:tre").skipped).toBe("clean");
    expect(doc.register).toEqual(DUMP.register);
    expect(doc.note).toBeUndefined();
  });

  it("without a dump (pre-G24 pipeline) the document says so and falls back to the quality row's groundedShare", () => {
    const doc = buildAuditDumpDocument({ audit: null, run: { reportId: "r" }, project: null, tier: "standard", locale: "en", quality: { groundedShare: 0.5 } });
    expect(doc.dumpAvailable).toBe(false);
    expect(doc.groundedShare).toBe(0.5);
    expect(doc.sections).toEqual([]);
    expect(doc.note).toMatch(/predates G24-D/);
  });
});

describe("runSelfReport --audit-dump", () => {
  it("writes the document to the requested path after the run, logs the count, and returns auditDumpPath", async () => {
    const writes = [];
    const log = vi.fn();
    const out = await runSelfReport({ db: fakeDb(), pipeline: fakePipeline(), log, auditDump: { path: "/x/tbr-audit-latest.json", write: async (path, json) => { writes.push([path, json]); } } });
    expect(writes).toHaveLength(1);
    expect(writes[0][0]).toBe("/x/tbr-audit-latest.json");
    const doc = JSON.parse(writes[0][1]);
    expect(doc.summary.ungrounded.map((u) => u.sectionId)).toEqual(["revenue", "idea"]);
    expect(doc.reportId).toBe("rpt-9");
    expect(out.auditDumpPath).toBe("/x/tbr-audit-latest.json");
    expect(log.mock.calls.map((c) => c[0]).join("\n")).toContain("audit dump: /x/tbr-audit-latest.json (4 sections, 2 ungrounded)");
  });

  it("no --audit-dump → nothing written, auditDumpPath null; a pipeline without the dump still writes a document that says so", async () => {
    const out = await runSelfReport({ db: fakeDb(), pipeline: fakePipeline(), log: () => {} });
    expect(out.auditDumpPath).toBeNull();
    const writes = [];
    await runSelfReport({ db: fakeDb(), pipeline: fakePipeline({ withDump: false }), log: () => {}, auditDump: { path: "/x/a.json", write: async (p, j) => { writes.push(JSON.parse(j)); } } });
    expect(writes[0].dumpAvailable).toBe(false);
    expect(writes[0].groundedShare).toBe(0.91);
  });
});

// ── G29-B: the dump lands even when the run throws ─────────────────────────
describe("runSelfReport --audit-dump on a degraded run (G29-B)", () => {
  const DIAG = {
    type: "run_diagnostics", degraded: true, error: "report fully degraded: 8 deterministic chapters and a placeholder summary after 16 calls", failedWave: "wave4", deadlineHit: true, deadlineHitWave: "wave1",
    waves: [{ phase: "gathering", startedAtMs: 0, ms: 9000 }, { phase: "wave1", startedAtMs: 9000, ms: 431000 }, { phase: "wave4", startedAtMs: 440000, ms: 40000 }],
    providersStruck: ["deepinfra", "groq"], strikes: { deepinfra: { strikes: 2, timeout: 2, overloaded: 0 }, groq: { strikes: 2, timeout: 0, overloaded: 2 }, gemini: { strikes: 1, timeout: 1, overloaded: 0 } }, calls: 16, totalMs: 480000,
  };

  it("a fake pipeline that throws mid-W2 leaves a dump: degraded:true, the ledger snapshot, the script's wave trail, no sections, and the error re-throws with auditDumpPath", async () => {
    const pipeline = fakePipeline();
    pipeline.runTrustReportForProject = vi.fn(async (args) => {
      args.onEvent({ type: "progress", completed: 5, total: 100, phase: "gathering" });
      args.onEvent({ type: "progress", completed: 15, total: 100, phase: "wave1" });
      args.onEvent({ type: "progress", completed: 45, total: 100, phase: "wave2" });
      args.onEvent({ type: "error", dim: "tre", message: "DeepInfra Worker timeout (120s)", degraded: true });
      // run-for-project's catch emits the ledger before re-throwing.
      args.onEvent({ ...DIAG, error: "W2 dispatcher crashed", failedWave: "wave2", deadlineHit: false, deadlineHitWave: null, calls: null, waves: [{ phase: "wave1", startedAtMs: 0, ms: 30000 }, { phase: "wave2", startedAtMs: 30000, ms: 12000 }] });
      throw new Error("W2 dispatcher crashed");
    });
    const writes = [];
    const log = vi.fn();
    const err = await runSelfReport({ db: fakeDb(), pipeline, log, auditDump: { path: "/x/tbr-audit-latest.json", write: async (path, json) => { writes.push([path, json]); } } }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("W2 dispatcher crashed");
    expect(err.auditDumpPath).toBe("/x/tbr-audit-latest.json");
    expect(writes).toHaveLength(1);
    const doc = JSON.parse(writes[0][1]);
    expect(doc).toMatchObject({ degraded: true, reportId: null, snapshotId: null, dumpAvailable: false, groundedShare: null, quality: null, sections: [], register: [] });
    expect(doc.note).toMatch(/^run degraded — no report persisted: W2 dispatcher crashed \(the run threw before the grounding sweep/);
    expect(doc.summary).toEqual({ sections: 0, grounded: 0, llmAudited: 0, ungrounded: [] });
    expect(doc.diagnostics).toMatchObject({ error: "W2 dispatcher crashed", failedWave: "wave2", deadlineHit: false, deadlineHitWave: null, providersStruck: ["deepinfra", "groq"], calls: null, diagnosticsEventSeen: true });
    expect(doc.diagnostics.strikes).toEqual(DIAG.strikes);
    expect(doc.diagnostics.waves.map((w) => w.phase)).toEqual(["wave1", "wave2"]);
    // The script's own trail: phases in order (the open wave closed at the throw), the error event, no chapters.
    expect(doc.diagnostics.trail.phases.map((p) => p.phase)).toEqual(["gathering", "wave1", "wave2"]);
    expect(doc.diagnostics.trail.phases.every((p) => typeof p.ms === "number" && p.ms >= 0)).toBe(true);
    expect(doc.diagnostics.trail).toMatchObject({ currentPhase: "wave2", chapters: [], errors: [{ dim: "tre", message: "DeepInfra Worker timeout (120s)" }] });
    expect(log.mock.calls.map((c) => c[0]).join("\n")).toContain("audit dump (degraded): /x/tbr-audit-latest.json (0 sections, providers struck deepinfra,groq, deadline wave -)");
  });

  it("ReportFullyDegradedError after the sweep: the dump keeps every audit record collected so far + the ledger + the deadline wave; without --audit-dump nothing is written and the error still propagates", async () => {
    const throwing = () => {
      const pipeline = fakePipeline();
      pipeline.runTrustReportForProject = vi.fn(async (args) => {
        args.onEvent({ type: "progress", completed: 15, total: 100, phase: "wave1" });
        args.onEvent({ type: "progress", completed: 80, total: 100, phase: "wave4" });
        args.onEvent({ type: "dimension_complete", dim: "ftv", chapter: { degraded: true, degradeReason: "deadline: wall-clock budget (480 s) reached before W4", score: 40 } });
        args.onEvent({ type: "audit_complete", groundedShare: 0.5, revised: 0, dump: DUMP });
        args.onEvent({ type: "done", calls: 16, costUsd: 0.01, degradedSections: ["ftv"], deadlineHit: true, deadlineHitPhase: "wave1" });
        args.onEvent(DIAG);
        const e = new Error(DIAG.error);
        e.name = "ReportFullyDegradedError";
        e.degradedSections = 8;
        e.calls = 16;
        throw e;
      });
      return pipeline;
    };
    const writes = [];
    await expect(runSelfReport({ db: fakeDb(), pipeline: throwing(), log: () => {}, auditDump: { path: "/x/a.json", write: async (p, j) => { writes.push(JSON.parse(j)); } } })).rejects.toThrow(/report fully degraded/);
    expect(writes).toHaveLength(1);
    const doc = writes[0];
    expect(doc).toMatchObject({ degraded: true, dumpAvailable: true, groundedShare: 0.91, criticEvidenceChars: 18_400 });
    expect(doc.sections.map((s) => s.sectionId)).toEqual(["executive", "dim:tre", "revenue", "idea"]);
    expect(doc.summary.ungrounded.map((u) => u.sectionId)).toEqual(["revenue", "idea"]);
    expect(doc.register).toEqual(DUMP.register);
    expect(doc.diagnostics).toMatchObject({ failedWave: "wave4", deadlineHit: true, deadlineHitWave: "wave1", providersStruck: ["deepinfra", "groq"], calls: 16, totalMs: 480000 });
    expect(doc.diagnostics.trail.chapters).toEqual([expect.objectContaining({ dim: "ftv", degraded: true, reason: "deadline: wall-clock budget (480 s) reached before W4", score: 40 })]);
    expect(doc.note).toBe(`run degraded — no report persisted: ${DIAG.error}`);
    // No --audit-dump → no write, same error.
    await expect(runSelfReport({ db: fakeDb(), pipeline: throwing(), log: () => {} })).rejects.toThrow(/report fully degraded/);
    // A pipeline that predates run_diagnostics still leaves the trail (diagnosticsEventSeen false, ledger empty).
    const legacy = fakePipeline();
    legacy.runTrustReportForProject = vi.fn(async (args) => {
      args.onEvent({ type: "progress", completed: 15, total: 100, phase: "wave1" });
      throw new Error("agents down");
    });
    const legacyWrites = [];
    await expect(runSelfReport({ db: fakeDb(), pipeline: legacy, log: () => {}, auditDump: { path: "/x/b.json", write: async (p, j) => { legacyWrites.push(JSON.parse(j)); } } })).rejects.toThrow("agents down");
    expect(legacyWrites[0].diagnostics).toMatchObject({ diagnosticsEventSeen: false, providersStruck: [], strikes: {}, waves: null, failedWave: "wave1", deadlineHitWave: null });
    // A failing dump writer never masks the run's own error.
    await expect(runSelfReport({ db: fakeDb(), pipeline: legacy, log: () => {}, auditDump: { path: "/x/c.json", write: async () => { throw new Error("disk full"); } } })).rejects.toThrow("agents down");
  });

  it("buildAuditDumpDocument: `degraded` is false and no diagnostics block exists on a good run", () => {
    const doc = buildAuditDumpDocument({ audit: DUMP, run: { reportId: "rpt-9" }, project: PROJECTS[0], tier: "standard", locale: "en" });
    expect(doc.degraded).toBe(false);
    expect("diagnostics" in doc).toBe(false);
    expect(doc.note).toBeUndefined();
  });
});
