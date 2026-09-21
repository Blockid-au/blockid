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
