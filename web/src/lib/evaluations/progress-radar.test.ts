import { beforeEach, describe, expect, it, vi } from "vitest";

// Colocated vitest for lib/evaluations/progress-radar.ts (T0273). Pins, with
// a fake ProgressStore:
//   * SVI delta + stage change from the latest two snapshots, scoreHistory =
//     last 8 totals oldest-first, `projects.stage` fallback when unsnapshotted;
//   * new evidence per project since the period start;
//   * money signals from funding_matches keyed on the evaluation's project:
//     next deadline (past / closed rows ignored), deadlines ahead, matches
//     first seen this period; names resolved from au_grants / au_programs;
//   * movers = top 5 by |Δ| (Δ ≠ 0), ties by name; deadlines = next 5;
//   * digest_ready false on a silent week, true on any signal;
//   * periodStartFor = Monday 00:00 UTC; progressDedupeKey shape;
//   * claimProgressSend writes the evaluator_progress_sends row via the store
//     (claimed → dupe on the second call), notifyEvaluatorProgress writes the
//     weekly_next_step row with the payload + dedupe key;
//   * createSupabaseProgressStore maps 23505 to "dupe".

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("@/lib/notifications", () => ({ insertNotification: vi.fn(async () => undefined) }));

import {
  buildEvaluatorProgress,
  claimProgressSend,
  createSupabaseProgressStore,
  formatDelta,
  notifyEvaluatorProgress,
  periodStartFor,
  progressDedupeKey,
  progressHeadline,
  rankMovers,
  isEvaluatorPersona,
  type EvaluatorProgressItem,
  type ProgressStore,
} from "./progress-radar";
import { EVALUATOR_ACCOUNT_TYPES_SHARED } from "./progress-shared";
import { EVALUATOR_ACCOUNT_TYPES } from "@/lib/evaluations";

const NOW = new Date("2026-09-13T23:30:00Z"); // Sunday
const PERIOD_START = "2026-09-07T00:00:00.000Z"; // Monday

function makeStore(overrides: Partial<ProgressStore> = {}) {
  const sends = new Set<string>();
  const store: ProgressStore & { sends: Set<string> } = {
    sends,
    async listEvaluations() {
      return [
        { id: "e-1", projectId: "p-1", projectName: "Acme Robotics", projectSlug: "acme", projectStage: 3, label: null },
        { id: "e-2", projectId: "p-2", projectName: "Beta Health", projectSlug: "beta", projectStage: 2, label: "Cohort 4" },
        { id: "e-3", projectId: "p-3", projectName: "Gamma", projectSlug: "gamma", projectStage: 1, label: null },
        { id: "e-4", projectId: "p-4", projectName: "Delta", projectSlug: "delta", projectStage: 4, label: null },
      ];
    },
    async listSnapshots() {
      return [
        // p-1: 62 → 71.5 (Δ +9.5), stage 3 → 4, plus older history (10 rows → trimmed to 8)
        ...[71.5, 62, 60, 58, 55, 50, 48, 45, 40, 30].map((v, i) => ({
          project_id: "p-1",
          svi_total: v,
          stage: i === 0 ? 4 : 3,
          created_at: new Date(Date.UTC(2026, 8, 13 - i * 7)).toISOString(),
        })),
        // p-2: 55 → 50 (Δ −5), stage via analysis_json.current_phase, unchanged
        { project_id: "p-2", svi_total: 50, stage: null, current_phase: 2, created_at: "2026-09-12T00:00:00Z" },
        { project_id: "p-2", svi_total: 55, stage: null, current_phase: 2, created_at: "2026-09-05T00:00:00Z" },
        // p-3: single snapshot → delta null
        { project_id: "p-3", svi_total: 40, stage: 1, created_at: "2026-09-10T00:00:00Z" },
        // p-4: no snapshots at all
      ];
    },
    async countEvidenceSince(_ids, since) {
      expect(since).toBe(PERIOD_START);
      return new Map([["p-2", 3]]);
    },
    async listReports() {
      return [
        { evaluation_id: "e-1", kind: "full", svi_total: 71, created_at: "2026-09-11T00:00:00Z" },
        { evaluation_id: "e-1", kind: "rescore", svi_total: 62, created_at: "2026-09-01T00:00:00Z" },
      ];
    },
    async listMatches() {
      return [
        { project_id: "p-1", ref_kind: "grant", ref_id: "g-mvp", closes_at: "2026-09-27", first_seen_at: "2026-09-13T05:00:00Z", score: 80 },
        { project_id: "p-1", ref_kind: "program", ref_id: "pr-cicada", closes_at: "2026-10-30", first_seen_at: "2026-08-01T05:00:00Z", score: 60 },
        { project_id: "p-1", ref_kind: "grant", ref_id: "g-past", closes_at: "2026-09-01", first_seen_at: "2026-08-01T05:00:00Z", score: 60 },
        { project_id: "p-1", ref_kind: "grant", ref_id: "g-closed", closes_at: "2026-09-20", first_seen_at: "2026-08-01T05:00:00Z", score: 60, status_at_match: "closed" },
        { project_id: "p-2", ref_kind: "grant", ref_id: "g-ignite", closes_at: "2026-09-15", first_seen_at: "2026-09-13T05:00:00Z", score: 70 },
        { project_id: "p-2", ref_kind: "grant", ref_id: "g-rolling", closes_at: null, first_seen_at: "2026-09-13T05:00:00Z", score: 70 },
        { project_id: null, ref_kind: "grant", ref_id: "g-orphan", closes_at: "2026-09-14", first_seen_at: "2026-09-13T05:00:00Z", score: 70 },
      ];
    },
    async resolveRefs(refs) {
      return refs.map((r) => ({
        ...r,
        name: { "g-mvp": "MVP Ventures", "pr-cicada": "Cicada Innovations", "g-ignite": "Ignite Ideas", "g-past": "Past", "g-closed": "Closed" }[r.ref_id] ?? r.ref_id,
        url: r.ref_id === "g-mvp" ? "https://www.nsw.gov.au/mvp" : null,
      }));
    },
    async claimSend({ userId, periodStart }) {
      const k = `${userId}:${periodStart}`;
      if (sends.has(k)) return "dupe";
      sends.add(k);
      return "claimed";
    },
    async releaseSend({ userId, periodStart }) {
      sends.delete(`${userId}:${periodStart}`);
    },
    ...overrides,
  };
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("periodStartFor / formatDelta / dedupe key", () => {
  it("period starts Monday 00:00 UTC of the ISO week", () => {
    expect(periodStartFor(NOW).toISOString()).toBe(PERIOD_START);
    expect(periodStartFor(new Date("2026-09-07T00:00:00Z")).toISOString()).toBe(PERIOD_START);
    expect(periodStartFor(new Date("2026-09-14T09:00:00Z")).toISOString()).toBe("2026-09-14T00:00:00.000Z");
  });

  it("formats deltas with arrows and a proper minus", () => {
    expect(formatDelta(9.5)).toBe("▲ +9.5");
    expect(formatDelta(-5)).toBe("▼ −5");
    expect(formatDelta(0)).toBe("— 0");
    expect(formatDelta(null)).toBe("—");
  });

  it("dedupe key is evaluator_progress:<user>:<period day>", () => {
    expect(progressDedupeKey("u-1", PERIOD_START)).toBe("evaluator_progress:u-1:2026-09-07");
  });

  it("persona filter mirrors EVALUATOR_ACCOUNT_TYPES and the four evaluator segments", () => {
    expect(Array.from(EVALUATOR_ACCOUNT_TYPES_SHARED).sort()).toEqual(Array.from(EVALUATOR_ACCOUNT_TYPES).sort());
    expect(isEvaluatorPersona({ account_type: "advisor", segment: "founder" })).toBe(true);
    expect(isEvaluatorPersona({ account_type: "founder", segment: "accelerator" })).toBe(true);
    expect(isEvaluatorPersona({ account_type: "founder", segment: "founder" })).toBe(false);
    expect(isEvaluatorPersona({ account_type: null, segment: null })).toBe(false);
  });
});

describe("buildEvaluatorProgress", () => {
  it("computes delta, stage change, evidence, last report, money signals and score history per evaluation", async () => {
    const store = makeStore();
    const p = await buildEvaluatorProgress({ userId: "u-1", now: NOW, store });

    expect(p.periodStart).toBe(PERIOD_START);
    expect(p.periodEnd).toBe(NOW.toISOString());
    expect(p.items.map((i) => i.evaluationId)).toEqual(["e-1", "e-2", "e-3", "e-4"]);

    const acme = p.items[0];
    expect(acme).toMatchObject({
      name: "Acme Robotics",
      sviNow: 71.5,
      sviPrev: 62,
      delta: 9.5,
      stageNow: 4,
      stagePrev: 3,
      stageChanged: true,
      newEvidence: 0,
      lastReport: { at: "2026-09-11T00:00:00Z", svi: 71, kind: "full" },
    });
    expect(acme.scoreHistory).toEqual([45, 48, 50, 55, 58, 60, 62, 71.5]);
    // Money: past + closed rows ignored, next = MVP Ventures (14 days), one new this week.
    expect(acme.money.deadlinesAhead).toBe(2);
    expect(acme.money.newMatches).toBe(1);
    expect(acme.money.nextDeadline).toMatchObject({ name: "MVP Ventures", closesAt: "2026-09-27", daysLeft: 14, refKind: "grant", url: "https://www.nsw.gov.au/mvp" });

    const beta = p.items[1];
    expect(beta).toMatchObject({ sviNow: 50, sviPrev: 55, delta: -5, stageNow: 2, stagePrev: 2, stageChanged: false, newEvidence: 3, lastReport: null });
    expect(beta.money).toMatchObject({ deadlinesAhead: 1, newMatches: 2 });
    expect(beta.money.nextDeadline).toMatchObject({ name: "Ignite Ideas", daysLeft: 2 });

    const gamma = p.items[2];
    expect(gamma).toMatchObject({ sviNow: 40, sviPrev: null, delta: null, stageNow: 1, stagePrev: null, stageChanged: false });
    expect(gamma.scoreHistory).toEqual([40]);

    const delta = p.items[3];
    expect(delta).toMatchObject({ sviNow: null, delta: null, stageNow: 4, scoreHistory: [] });
    expect(delta.money).toEqual({ nextDeadline: null, deadlinesAhead: 0, newMatches: 0 });

    // Movers: |9.5| > |−5|; null deltas excluded.
    expect(p.movers.map((m) => m.name)).toEqual(["Acme Robotics", "Beta Health"]);
    // Deadlines across startups, soonest first; the orphan (project null) row is ignored.
    expect(p.deadlines.map((d) => `${d.name}/${d.startup}/${d.daysLeft}`)).toEqual([
      "Ignite Ideas/Beta Health/2",
      "MVP Ventures/Acme Robotics/14",
      "Cicada Innovations/Acme Robotics/47",
    ]);
    expect(p.newMatches).toBe(3);
    expect(p.newEvidence).toBe(3);
    expect(p.digest_ready).toBe(true);
    expect(progressHeadline(p)).toBe("Your weekly progress radar — 2 of 4 startups moved");
  });

  it("rankMovers keeps the top 5 by |Δ| with name tie-break", () => {
    const mk = (name: string, delta: number | null): EvaluatorProgressItem => ({
      evaluationId: name, projectId: name, projectSlug: name, name, label: null,
      sviNow: 50, sviPrev: 50, delta, stageNow: 1, stagePrev: 1, stageChanged: false, newEvidence: 0, lastReport: null,
      money: { nextDeadline: null, deadlinesAhead: 0, newMatches: 0 }, scoreHistory: [],
    });
    const ranked = rankMovers([mk("F", 0), mk("B", -3), mk("A", 3), mk("C", 7), mk("D", -1), mk("E", 2), mk("G", null), mk("H", 1.5)]);
    expect(ranked.map((m) => m.name)).toEqual(["C", "A", "B", "E", "H"]);
  });

  it("silent week → digest_ready false and the 'no movement' headline with deadlines count", async () => {
    const store = makeStore({
      async listSnapshots() {
        return [
          { project_id: "p-1", svi_total: 60, stage: 3, created_at: "2026-09-12T00:00:00Z" },
          { project_id: "p-1", svi_total: 60, stage: 3, created_at: "2026-09-05T00:00:00Z" },
        ];
      },
      async countEvidenceSince() {
        return new Map();
      },
      async listReports() {
        return [];
      },
      async listMatches() {
        return [];
      },
    });
    const p = await buildEvaluatorProgress({ userId: "u-1", now: NOW, store });
    expect(p.movers).toEqual([]);
    expect(p.digest_ready).toBe(false);
    expect(progressHeadline(p)).toBe("Your weekly progress radar — no movement this week, 0 deadlines ahead");

    // One deadline ahead flips it on (that is the "no movement, k deadlines" email).
    const withDeadline = makeStore({
      ...store,
      async listMatches() {
        return [{ project_id: "p-1", ref_kind: "grant", ref_id: "g-mvp", closes_at: "2026-09-27", first_seen_at: "2026-08-01T00:00:00Z", score: 1 }];
      },
    });
    const q = await buildEvaluatorProgress({ userId: "u-1", now: NOW, store: withDeadline });
    expect(q.digest_ready).toBe(true);
    expect(progressHeadline(q)).toBe("Your weekly progress radar — no movement this week, 1 deadline ahead");
  });

  it("returns the empty shape when the user holds no evaluations or no store is available", async () => {
    const store = makeStore({ async listEvaluations() { return []; } });
    const p = await buildEvaluatorProgress({ userId: "u-1", now: NOW, store });
    expect(p).toMatchObject({ items: [], movers: [], deadlines: [], newMatches: 0, digest_ready: false, periodStart: PERIOD_START });
    // getSupabaseAdmin mocked → null → same empty shape, no throw.
    const q = await buildEvaluatorProgress({ userId: "u-1", now: NOW });
    expect(q.items).toEqual([]);
  });

  it("a failing side query degrades to zero for that signal instead of failing the build", async () => {
    const store = makeStore({
      async countEvidenceSince() { throw new Error("42P01"); },
      async listMatches() { throw new Error("boom"); },
    });
    const p = await buildEvaluatorProgress({ userId: "u-1", now: NOW, store });
    expect(p.items[1].newEvidence).toBe(0);
    expect(p.deadlines).toEqual([]);
    expect(p.movers.length).toBe(2);
  });
});

describe("idempotency row + in-app notification", () => {
  it("claimProgressSend claims once per (user, period) and releaseProgressSend frees it", async () => {
    const store = makeStore();
    const p = await buildEvaluatorProgress({ userId: "u-1", now: NOW, store });
    expect(await claimProgressSend(p, store)).toBe("claimed");
    expect(await claimProgressSend(p, store)).toBe("dupe");
    expect(store.sends.has(`u-1:${PERIOD_START}`)).toBe(true);
    const { releaseProgressSend } = await import("./progress-radar");
    await releaseProgressSend(p, store);
    expect(await claimProgressSend(p, store)).toBe("claimed");
  });

  it("notifyEvaluatorProgress writes weekly_next_step with {movers, deadlines} and the period dedupe key", async () => {
    const store = makeStore();
    const p = await buildEvaluatorProgress({ userId: "u-1", now: NOW, store });
    const notify = vi.fn(async () => undefined);
    await notifyEvaluatorProgress(p, notify);
    expect(notify).toHaveBeenCalledTimes(1);
    const args = notify.mock.calls[0][0] as Record<string, unknown>;
    expect(args).toMatchObject({
      userId: "u-1",
      projectId: null,
      kind: "weekly_next_step",
      dedupeKey: "evaluator_progress:u-1:2026-09-07",
    });
    const payload = args.payload as Record<string, unknown>;
    expect(payload.title).toBe("Your weekly progress radar — 2 of 4 startups moved");
    expect(payload.href).toBe("/workspace/evaluations");
    expect(payload.movers).toEqual([
      { evaluation_id: "e-1", name: "Acme Robotics", svi: 71.5, delta: 9.5, stage: 4, stage_changed: true },
      { evaluation_id: "e-2", name: "Beta Health", svi: 50, delta: -5, stage: 2, stage_changed: false },
    ]);
    expect((payload.deadlines as unknown[]).length).toBe(3);
    expect((payload.deadlines as Array<Record<string, unknown>>)[0]).toMatchObject({ startup: "Beta Health", name: "Ignite Ideas", closes_at: "2026-09-15", days_left: 2 });
  });
});

describe("createSupabaseProgressStore", () => {
  function fakeDb(inserts: unknown[], insertError: unknown = null) {
    const rows: Record<string, unknown[]> = {
      evaluations: [{ id: "e-1", project_id: "p-1", label: null, projects: { name: "Acme", slug: "acme", stage: 3 } }],
      svi_snapshots: [{ project_id: "p-1", svi_total: "71", stage: "4", analysis_json: { current_phase: 4 }, created_at: "2026-09-12T00:00:00Z" }],
      svi_accounts: [{ id: "acc-1", project_id: "p-1" }],
      evidence_items: [{ account_id: "acc-1", created_at: "2026-09-10T00:00:00Z" }, { account_id: "acc-1", created_at: "2026-09-11T00:00:00Z" }],
      evaluation_reports: [{ evaluation_id: "e-1", kind: "rescore", svi_total: 70, created_at: "2026-09-11T00:00:00Z" }],
      // #16 fixture: the founder (f-1, projects.user_id) has a match on p-1; the
      // evaluator (u-1) reading the radar has none. The row must still surface.
      projects: [{ id: "p-1", user_id: "f-1" }],
      funding_matches: [
        { user_id: "f-1", project_id: "p-1", ref_kind: "grant", ref_id: "g1", closes_at: "2026-09-27", first_seen_at: "2026-09-13T00:00:00Z", score: 9, status_at_match: "open" },
        { user_id: "someone-else", project_id: "p-1", ref_kind: "grant", ref_id: "g-other", closes_at: "2026-09-30", first_seen_at: "2026-09-13T00:00:00Z", score: 5, status_at_match: "open" },
      ],
      au_grants: [{ id: "g1", name: "MVP Ventures", official_url: "https://x" }],
      au_programs: [],
    };
    const deletes: unknown[] = [];
    const queried: Array<{ table: string; filters: Array<[string, string, unknown]> }> = [];
    const builder = (table: string) => {
      const b: Record<string, unknown> = {};
      const filters: Array<[string, string, unknown]> = [];
      queried.push({ table, filters });
      const resolve = () => {
        let data = rows[table] ?? [];
        // Only funding_matches / projects filter in this fake — enough to prove #16.
        if (table === "funding_matches" || table === "projects") {
          data = (data as Array<Record<string, unknown>>).filter((r) =>
            filters.every(([op, col, val]) =>
              op === "eq" ? String(r[col]) === String(val) : op === "in" ? (val as unknown[]).map(String).includes(String(r[col])) : true,
            ),
          );
        }
        return Promise.resolve({ data, error: null });
      };
      Object.assign(b, {
        select: () => b,
        eq: (col: string, val: unknown) => { filters.push(["eq", col, val]); return b; },
        in: (col: string, val: unknown[]) => { filters.push(["in", col, val]); return b; },
        gte: () => b,
        order: () => b,
        limit: () => b,
        insert(payload: unknown) {
          inserts.push({ table, payload });
          return Promise.resolve({ data: null, error: insertError });
        },
        delete() {
          deletes.push(table);
          return b;
        },
        then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) {
          return resolve().then(ok, err);
        },
      });
      return b;
    };
    return { db: { from: builder }, deletes, queried };
  }

  it("maps every table to the store shape (numbers coerced, current_phase from analysis_json)", async () => {
    const inserts: unknown[] = [];
    const store = createSupabaseProgressStore(fakeDb(inserts).db);
    expect(await store.listEvaluations("u-1")).toEqual([{ id: "e-1", projectId: "p-1", projectName: "Acme", projectSlug: "acme", projectStage: 3, label: null }]);
    expect(await store.listSnapshots(["p-1"])).toEqual([{ project_id: "p-1", svi_total: 71, stage: 4, current_phase: 4, created_at: "2026-09-12T00:00:00Z" }]);
    expect(await store.countEvidenceSince(["p-1"], PERIOD_START)).toEqual(new Map([["p-1", 2]]));
    expect(await store.listReports("u-1")).toEqual([{ evaluation_id: "e-1", kind: "rescore", svi_total: 70, created_at: "2026-09-11T00:00:00Z" }]);
    expect(await store.listMatches("u-1", ["p-1"])).toEqual([
      { project_id: "p-1", ref_kind: "grant", ref_id: "g1", closes_at: "2026-09-27", first_seen_at: "2026-09-13T00:00:00Z", score: 9, status_at_match: "open" },
    ]);
    expect(await store.resolveRefs([{ ref_kind: "grant", ref_id: "g1" }])).toEqual([{ ref_kind: "grant", ref_id: "g1", name: "MVP Ventures", url: "https://x" }]);
    expect(await store.listSnapshots([])).toEqual([]);
    expect(await store.listMatches("u-1", [])).toEqual([]);
  });

  it("#16 listMatches queries funding_matches by the FOUNDER (projects.user_id) + project, never the evaluator's id", async () => {
    const f = fakeDb([]);
    const store = createSupabaseProgressStore(f.db);
    // Evaluator u-1 has no funding_matches rows; the founder f-1 does → must surface.
    const rows = await store.listMatches("u-1", ["p-1"]);
    expect(rows.map((r) => r.ref_id)).toEqual(["g1"]);
    const projects = f.queried.find((q) => q.table === "projects")!;
    expect(projects.filters).toEqual([["in", "id", ["p-1"]]]);
    const matches = f.queried.find((q) => q.table === "funding_matches")!;
    expect(matches.filters).toEqual([
      ["in", "user_id", ["f-1"]],
      ["in", "project_id", ["p-1"]],
    ]);
    expect(matches.filters.some(([, col, val]) => col === "user_id" && (val === "u-1" || (Array.isArray(val) && val.includes("u-1"))))).toBe(false);
    // Unknown project → no owner → nothing queried, empty result.
    expect(await store.listMatches("u-1", ["p-unknown"])).toEqual([]);
  });

  it("claimSend inserts the evaluator_progress_sends row; 23505 → dupe; other errors → error; releaseSend deletes", async () => {
    const inserts: unknown[] = [];
    const ok = createSupabaseProgressStore(fakeDb(inserts).db);
    expect(await ok.claimSend({ userId: "u-1", periodStart: PERIOD_START, periodEnd: NOW.toISOString(), payload: { moved: 1 } })).toBe("claimed");
    expect(inserts[0]).toEqual({
      table: "evaluator_progress_sends",
      payload: { user_id: "u-1", period_start: PERIOD_START, period_end: NOW.toISOString(), payload: { moved: 1 } },
    });
    const dupe = createSupabaseProgressStore(fakeDb([], { code: "23505", message: "duplicate key" }).db);
    expect(await dupe.claimSend({ userId: "u-1", periodStart: PERIOD_START, periodEnd: NOW.toISOString(), payload: {} })).toBe("dupe");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const bad = createSupabaseProgressStore(fakeDb([], { code: "42P01", message: "missing" }).db);
    expect(await bad.claimSend({ userId: "u-1", periodStart: PERIOD_START, periodEnd: NOW.toISOString(), payload: {} })).toBe("error");
    warn.mockRestore();
    const f = fakeDb([]);
    await createSupabaseProgressStore(f.db).releaseSend({ userId: "u-1", periodStart: PERIOD_START });
    expect(f.deletes).toEqual(["evaluator_progress_sends"]);
  });
});
