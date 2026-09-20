// G19-S46 — `scripts/run-self-analysis.mjs --report` core (scripts/lib/
// self-report-core.mjs) with a fake db + a mocked pipeline: canonical project
// choice, the honest public-facts seed (13 criteria, pre-revenue raw input,
// no invented ARR), seed-then-rescore-then-report ordering, and the summary
// the operator reads (snapshot id + quality line).

import { describe, expect, it, vi } from "vitest";
import {
  BLOCKID_CANONICAL_PROJECT_ID,
  BLOCKID_CRITERIA,
  BLOCKID_RAW_INPUT,
  CRITERION_KEYS,
  criteriaSeedRows,
  makeSelfReportDb,
  needsCriteriaSeed,
  pickCanonicalProject,
  qualityLevelFor,
  runSelfReport,
} from "./lib/self-report-core.mjs";
import { EMPTY_MODULE_PATH, hooks, resolveTsPath } from "./lib/server-only-hook.mjs";
import { CRITERION_KEYS as LIB_CRITERION_KEYS, computeQuality } from "../src/lib/evaluation-criteria";
import { extractSignals } from "../src/lib/svi-analysis";

const PROJECTS = [
  { id: "ab3e9953-8969-40a6-a5b6-94cd4cba1ba0", name: "Blockid.au 2", created_at: "2026-05-21", snapshots: 88, owner_email: "admin@blockid.au" },
  { id: BLOCKID_CANONICAL_PROJECT_ID, name: "Blockid.au 1", created_at: "2026-05-20", snapshots: 180, owner_email: "admin@blockid.au" },
  { id: "f54facb1-575d-414b-808f-039e12310ac9", name: "blockid.au", created_at: "2026-05-22", snapshots: 87, owner_email: "admin@blockid.au" },
];

describe("public facts seed", () => {
  it("covers exactly the 13 criteria keys of lib/evaluation-criteria with > 50 chars each and the same quality rule", () => {
    expect([...CRITERION_KEYS].sort()).toEqual([...LIB_CRITERION_KEYS].sort());
    for (const key of CRITERION_KEYS) {
      const c = BLOCKID_CRITERIA[key];
      expect(c.text.length, key).toBeGreaterThan(50);
      const links = c.links.map((l) => ({ ...l, verified_at: null }));
      expect(qualityLevelFor({ text: c.text, links }), key).toBe(computeQuality({ text_input: c.text, files: [], links }));
    }
    const rows = criteriaSeedRows({ accountId: "acc", projectId: "p", now: "2026-09-20T00:00:00.000Z", dimensions: { idea: { primary: "mpc", secondary: "svm" } } });
    expect(rows).toHaveLength(13);
    expect(rows.find((r) => r.criterion_key === "idea")).toMatchObject({ account_id: "acc", project_id: "p", quality_level: "good", primary_dimension: "mpc", secondary_dimension: "svm", updated_at: "2026-09-20T00:00:00.000Z" });
    expect(rows.find((r) => r.criterion_key === "team")).toMatchObject({ quality_level: "good", primary_dimension: null, links: [] });
  });

  it("the raw input is scored as pre-revenue with a stated ask + cap and never as revenue, and names no invented figure", () => {
    const { signals } = { signals: extractSignals({ rawText: BLOCKID_RAW_INPUT }) };
    expect(signals.revenueBand).toBe("pre-revenue");
    expect(signals.hasRevenue).toBe(false);
    expect(signals.mrrAud).toBeUndefined();
    expect(signals.arrAud).toBeUndefined();
    expect(signals.raiseAskAud).toBe(500_000);
    expect(signals.statedCapAud).toBe(3_500_000);
    expect(signals.hasCapTable).toBe(true);
    expect(signals.hasVesting).toBe(true);
    expect(signals.esopAllocated).toBe(true);
    expect(signals.hasFinancialAudit).toBe(false);
    expect(signals.hasBoardCadence).toBe(false);
    // Solo founder, deck + model on file, 15+ years → experienced. (hasAdvisors is not
    // pinned: the engine's keyword list reads "angel groups" — the market — as advisors.)
    expect(signals.hasCoFounder).toBe(false);
    expect(signals.hasPitchDeck).toBe(true);
    expect(signals.hasFinancialModel).toBe(true);
    expect(signals.founderExperience).toBe("experienced");
    expect(signals.isAIWrapper).toBe(false);
    expect(BLOCKID_RAW_INPUT).toContain("pre-revenue");
    expect(BLOCKID_RAW_INPUT).toContain("0 active subscriptions");
    expect(BLOCKID_RAW_INPUT).not.toMatch(/\bPhD\b/);
    expect(BLOCKID_RAW_INPUT).not.toMatch(/A\$\d[\d,.]*\s?[KkMm]?\s?ARR\b/);
    expect(BLOCKID_RAW_INPUT).not.toMatch(/MRR A\$/);
    expect(JSON.stringify(BLOCKID_CRITERIA)).not.toMatch(/\bPhD\b/);
  });

  it("needsCriteriaSeed is true until every key carries real text", () => {
    expect(needsCriteriaSeed([])).toBe(true);
    expect(needsCriteriaSeed([{ criterion_key: "idea", text_input: "" }])).toBe(true);
    const full = CRITERION_KEYS.map((k) => ({ criterion_key: k, text_input: "x".repeat(60) }));
    expect(needsCriteriaSeed(full)).toBe(false);
    expect(needsCriteriaSeed(full.slice(1))).toBe(true);
  });
});

describe("pickCanonicalProject", () => {
  it("prefers the canonical id, else the most snapshots (ties → oldest), null when empty", () => {
    expect(pickCanonicalProject(PROJECTS)?.name).toBe("Blockid.au 1");
    expect(pickCanonicalProject(PROJECTS, { preferredId: "f54facb1-575d-414b-808f-039e12310ac9" })?.name).toBe("blockid.au");
    expect(pickCanonicalProject(PROJECTS.filter((p) => p.id !== BLOCKID_CANONICAL_PROJECT_ID))?.name).toBe("Blockid.au 2");
    expect(pickCanonicalProject([{ id: "a", snapshots: 3, created_at: "2026-02" }, { id: "b", snapshots: 3, created_at: "2026-01" }], { preferredId: null })?.id).toBe("b");
    expect(pickCanonicalProject([])).toBeNull();
  });
});

function fakeDb({ criteria = [], account = { id: "acc-1", startup_name: "BlockID.au (Auschain PTY LTD)" } } = {}) {
  const upserts = [];
  return {
    upserts,
    listProjects: vi.fn(async () => PROJECTS),
    findOwnerUserId: vi.fn(async (email) => (email === "admin@blockid.au" ? "user-admin" : null)),
    findAccount: vi.fn(async () => account),
    listCriteria: vi.fn(async () => criteria),
    upsertCriteria: vi.fn(async (rows) => { upserts.push(rows); }),
  };
}

function fakePipeline(calls) {
  return {
    criterionDimensions: { idea: { primary: "mpc", secondary: "svm" } },
    runRescoreForProject: vi.fn(async (args) => { calls.push(["rescore", args]); return { kind: "rescore", snapshotId: "snap-rescore", analysisId: "an-new", svi: 121, delta: 3, stage: 2 }; }),
    runTrustReportForProject: vi.fn(async (args) => {
      calls.push(["report", args]);
      return { kind: "full", reportId: "rpt-1", snapshotId: "snap-1", shareToken: "tok", reportV2: { schemaVersion: "2.0" }, svi: 121, stage: 2, wordCount: 1280, qualityScore: 86, synthesisedAnalysis: false, quality: { snapshotId: "snap-1", calls: 22, costUsd: 0.01, groundedShare: 0.9, pendingDims: 2 } };
    }),
    formatTbrQualityLine: (q) => `[tbr-quality] calls=${q.calls} grounded=${q.groundedShare}`,
  };
}

describe("runSelfReport", () => {
  it("empty criteria → seeds 13 rows, re-scores on the public raw input, then runs the standard-tier report and returns snapshot + quality", async () => {
    const calls = [];
    const db = fakeDb();
    const pipeline = fakePipeline(calls);
    const log = vi.fn();
    const out = await runSelfReport({ db, pipeline, log });
    expect(out.project.id).toBe(BLOCKID_CANONICAL_PROJECT_ID);
    expect(out.ownerUserId).toBe("user-admin");
    expect(db.upserts).toHaveLength(1);
    expect(db.upserts[0]).toHaveLength(13);
    expect(db.upserts[0].find((r) => r.criterion_key === "idea")).toMatchObject({ account_id: "acc-1", project_id: BLOCKID_CANONICAL_PROJECT_ID, primary_dimension: "mpc" });
    expect(calls.map((c) => c[0])).toEqual(["rescore", "report"]);
    expect(calls[0][1]).toEqual({ projectId: BLOCKID_CANONICAL_PROJECT_ID, requestedByUserId: "user-admin", rawInput: BLOCKID_RAW_INPUT });
    expect(calls[1][1]).toMatchObject({ projectId: BLOCKID_CANONICAL_PROJECT_ID, requestedByUserId: "user-admin", tier: "standard", locale: "en", creditsCost: 0 });
    expect(typeof calls[1][1].onEvent).toBe("function");
    // The event logger never throws on any event shape.
    for (const ev of [{ type: "context", stage: 2, stageLabel: "Seed", phaseId: "pitch", estimatedCalls: 24, estimatedSeconds: 90 }, { type: "gather_complete", evidenceRows: 3, connectors: [] }, { type: "dimension_complete", dim: "tre", chapter: { score: 50, band: "pending", degraded: true } }, { type: "done", calls: 22, costUsd: 0.01, degradedSections: [], deadlineHit: false }, { type: "error", message: "x", degraded: true }, { type: "nope" }]) expect(() => calls[1][1].onEvent(ev)).not.toThrow();
    expect(out).toMatchObject({ seeded: { criteria: 13, rescored: true, analysisId: "an-new", rescoreSnapshotId: "snap-rescore" }, reportId: "rpt-1", snapshotId: "snap-1", shareToken: "tok", svi: 121, stage: 2, wordCount: 1280, reportV2Persisted: true, showcaseUrl: "https://blockid.au/showcase/blockid/report" });
    expect(out.qualityLine).toBe("[tbr-quality] calls=22 grounded=0.9");
    expect(log.mock.calls.map((c) => c[0]).join("\n")).toContain('project: 2bf55234-e359-4390-8faa-06597824f77a "Blockid.au 1" (180 snapshots');
  });

  it("filled criteria → no seed, no re-score, report only; --seed forces; --no-seed skips; --project must be one of the owner's blockid projects", async () => {
    const full = CRITERION_KEYS.map((k) => ({ criterion_key: k, text_input: "y".repeat(80) }));
    let calls = [];
    let db = fakeDb({ criteria: full });
    let out = await runSelfReport({ db, pipeline: fakePipeline(calls) });
    expect(db.upserts).toHaveLength(0);
    expect(calls.map((c) => c[0])).toEqual(["report"]);
    expect(out.seeded).toEqual({ criteria: 0, rescored: false, analysisId: null, rescoreSnapshotId: null });

    calls = [];
    db = fakeDb({ criteria: full });
    await runSelfReport({ db, pipeline: fakePipeline(calls), forceSeed: true });
    expect(db.upserts).toHaveLength(1);
    expect(calls.map((c) => c[0])).toEqual(["rescore", "report"]);

    calls = [];
    db = fakeDb();
    const dry = await runSelfReport({ db, pipeline: fakePipeline(calls), dryRun: true });
    expect(dry).toMatchObject({ dryRun: true, wouldSeed: true, accountId: "acc-1", project: { id: BLOCKID_CANONICAL_PROJECT_ID } });
    expect(db.upserts).toHaveLength(0);
    expect(calls).toEqual([]);

    calls = [];
    db = fakeDb();
    await runSelfReport({ db, pipeline: fakePipeline(calls), skipSeed: true });
    expect(db.findAccount).not.toHaveBeenCalled();
    expect(calls.map((c) => c[0])).toEqual(["report"]);

    calls = [];
    out = await runSelfReport({ db: fakeDb(), pipeline: fakePipeline(calls), projectId: "f54facb1-575d-414b-808f-039e12310ac9" });
    expect(out.project.name).toBe("blockid.au");
    await expect(runSelfReport({ db: fakeDb(), pipeline: fakePipeline([]), projectId: "not-ours" })).rejects.toThrow(/not one of/);
    const noProjects = { ...fakeDb(), listProjects: vi.fn(async () => []) };
    await expect(runSelfReport({ db: noProjects, pipeline: fakePipeline([]) })).rejects.toThrow(/no "%blockid%" project/);
    const noOwner = { ...fakeDb(), findOwnerUserId: vi.fn(async () => null) };
    await expect(runSelfReport({ db: noOwner, pipeline: fakePipeline([]) })).rejects.toThrow(/app_users row/);
  });

  it("makeSelfReportDb queries the owner's unarchived '%blockid%' projects with their snapshot counts and upserts on (account_id, criterion_key)", async () => {
    const seen = [];
    const table = (name) => {
      const q = { _name: name, _filters: [] };
      const chain = (op) => (...args) => { q._filters.push([op, ...args]); return q; };
      q.select = (cols, opts) => { q._select = [cols, opts]; return q; };
      for (const op of ["eq", "ilike", "is"]) q[op] = chain(op);
      q.maybeSingle = async () => {
        seen.push(q);
        if (name === "app_users") return { data: { id: "user-admin", email: "admin@blockid.au" } };
        if (name === "svi_accounts") return { data: { id: "acc-1", startup_name: "x" } };
        return { data: null };
      };
      q.upsert = async (rows, opts) => { seen.push({ ...q, _upsert: [rows, opts] }); return { error: null }; };
      q.then = (ok) => {
        seen.push(q);
        if (name === "projects") return Promise.resolve(ok({ data: [{ id: "p1", name: "Blockid.au 1", created_at: "2026-05-20", archived_at: null }], error: null }));
        if (name === "svi_snapshots") return Promise.resolve(ok({ data: null, count: 180, error: null }));
        if (name === "evaluation_criteria") return Promise.resolve(ok({ data: [{ criterion_key: "idea", text_input: "" }], error: null }));
        return Promise.resolve(ok({ data: [], error: null }));
      };
      return q;
    };
    const sb = { from: (name) => table(name) };
    const db = makeSelfReportDb(sb);
    expect(await db.findOwnerUserId("admin@blockid.au")).toBe("user-admin");
    const projects = await db.listProjects();
    expect(projects).toEqual([{ id: "p1", name: "Blockid.au 1", created_at: "2026-05-20", snapshots: 180, owner_email: "admin@blockid.au" }]);
    const projQ = seen.find((q) => q._name === "projects");
    expect(projQ._filters).toEqual([["eq", "user_id", "user-admin"], ["ilike", "name", "%blockid%"], ["is", "archived_at", null]]);
    const snapQ = seen.find((q) => q._name === "svi_snapshots");
    expect(snapQ._select).toEqual(["id", { count: "exact", head: true }]);
    expect(await db.findAccount("p1")).toEqual({ id: "acc-1", startup_name: "x" });
    expect(await db.listCriteria("acc-1")).toEqual([{ criterion_key: "idea", text_input: "" }]);
    await db.upsertCriteria([{ criterion_key: "idea" }]);
    const up = seen.find((q) => q._upsert);
    expect(up._upsert[1]).toEqual({ onConflict: "account_id,criterion_key" });
  });
});

describe("server-only-hook (the loader behind --report)", () => {
  it("resolves the Next sentinels to the empty module, @/ and relative src specifiers to .ts files, and delegates everything else", () => {
    const next = vi.fn((spec) => ({ url: `next:${spec}` }));
    expect(hooks.resolve("server-only", {}, next)).toEqual({ url: expect.stringMatching(/empty-module\.cjs$/), shortCircuit: true });
    expect(hooks.resolve("client-only", {}, next).url).toContain("empty-module.cjs");
    expect(hooks.resolve("@/lib/report-pipeline/quality-log", {}, next).url).toMatch(/src\/lib\/report-pipeline\/quality-log\.ts$/);
    const parent = `file://${resolveTsPath(new URL("../src/lib/report-pipeline/run-for-project", import.meta.url).pathname)}`;
    expect(hooks.resolve("./quality-log", { parentURL: parent }, next).url).toMatch(/quality-log\.ts$/);
    expect(hooks.resolve("nanoid", { parentURL: parent }, next)).toEqual({ url: "next:nanoid" });
    expect(hooks.resolve("@/lib/does-not-exist", {}, next)).toEqual({ url: "next:@/lib/does-not-exist" });
    expect(resolveTsPath("/definitely/not/here")).toBeNull();
    expect(EMPTY_MODULE_PATH).toMatch(/scripts\/lib\/empty-module\.cjs$/);
  });

  it("load bridges a src .ts file reached through import() to its CJS instance with every named export; other urls pass through", () => {
    const next = vi.fn(() => ({ format: "commonjs", source: "" }));
    const url = hooks.resolve("@/lib/report-pipeline/quality-log", {}, next).url;
    const orig = globalThis.__blockidSelfReportRequire;
    globalThis.__blockidSelfReportRequire = () => ({ TBR_QUALITY_FILE: "tbr-quality.jsonl", summariseTbrQuality: () => 1, default: undefined, "not-an-identifier": 1 });
    try {
      // The real hook require()s the file through tsx; under vitest we only check the generated ESM shape.
      const out = hooks.load(url, {}, next);
      expect(out.format).toBe("module");
      expect(out.shortCircuit).toBe(true);
      expect(out.source).toContain("export default m.default ?? m;");
      expect(out.source).toMatch(/globalThis\["__blockidSelfReportRequire"\]\(/);
    } finally {
      globalThis.__blockidSelfReportRequire = orig;
    }
    expect(hooks.load("file:///tmp/x.mjs", {}, next)).toEqual({ format: "commonjs", source: "" });
    expect(hooks.load("node:fs", {}, next)).toEqual({ format: "commonjs", source: "" });
  });
});
