// Colocated tests for lib/funding/analysis-refresh (T0251): quarter maths,
// knowledge ranking by industry, composeRefresh (SVI delta, catalogue moves,
// CFO/CLO rows, change count), the builder through a fake store, and the
// runner (Growth users only, dry-run writes nothing, zero-change → note
// stored but NO notification, already-refreshed quarter skipped).

import { describe, expect, it } from "vitest";
import {
  KNOWLEDGE_TOP_N,
  REFRESH_HREF,
  buildAnalysisRefresh,
  composeRefresh,
  createSupabaseRefreshStore,
  growthPlanIds,
  nextRefreshDate,
  previousQuarter,
  rankKnowledge,
  runAnalysisRefreshQuarterly,
  type KnowledgeItem,
  type RefreshStore,
} from "./analysis-refresh";

const Q3 = previousQuarter(new Date("2026-10-01T06:00:00Z"));
const PROJECT = { id: "p1", name: "Acme Agtech", industry: "AgTech" };

function knowledge(over: Partial<KnowledgeItem> = {}): KnowledgeItem {
  return {
    agent: over.agent ?? "cfo",
    topic: over.topic ?? "AU seed valuations Q3",
    findings: over.findings ?? ["Median seed pre-money A$6M"],
    implications: over.implications ?? "Anchor your ask at the median.",
    updated_at: over.updated_at ?? "2026-08-15T00:00:00Z",
  };
}

describe("quarter maths", () => {
  it("previousQuarter covers the quarter that just ended (UTC), incl. the Jan wrap", () => {
    expect(Q3).toEqual({ label: "2026-Q3", start: "2026-07-01", end: "2026-09-30" });
    expect(previousQuarter(new Date("2027-01-01T06:00:00Z"))).toEqual({ label: "2026-Q4", start: "2026-10-01", end: "2026-12-31" });
    expect(previousQuarter(new Date("2026-04-01T06:00:00Z"))).toEqual({ label: "2026-Q1", start: "2026-01-01", end: "2026-03-31" });
    expect(previousQuarter(new Date("2026-09-10T00:00:00Z")).label).toBe("2026-Q2");
  });

  it("nextRefreshDate is the 1st of the following quarter", () => {
    expect(nextRefreshDate(Q3)).toBe("2026-10-01");
    expect(nextRefreshDate({ label: "2026-Q4", start: "2026-10-01", end: "2026-12-31" })).toBe("2027-01-01");
  });

  it("growthPlanIds covers the founder Growth+ ids and legacy growth SKUs only", () => {
    const ids = growthPlanIds();
    expect(ids).toEqual(expect.arrayContaining(["founder_growth", "founder_scale", "founder_enterprise", "growth", "growth_annual"]));
    expect(ids).not.toContain("founder_starter");
    expect(ids.some((id) => id.startsWith("investor") || id.startsWith("accel"))).toBe(false);
  });
});

// Review 2026-09-10 #4: package buyers reach the quarterly refresh through
// the purchase signal (growth-extras.ts), never the `startup_package`
// entitlement row that nothing writes.
describe("createSupabaseRefreshStore.listGrowthUsers", () => {
  const NOW = new Date("2026-09-10T00:00:00Z");
  function fakeDb() {
    const tables: Record<string, Array<Record<string, unknown>>> = {
      app_users: [
        { id: "u-growth", plan: "founder_growth", money_radar_until: null },
        { id: "u-pkg", plan: "founder_free", money_radar_until: "2026-12-01T00:00:00Z" },
        { id: "u-starter", plan: "founder_starter", money_radar_until: null },
        { id: "u-support", plan: "founder_starter", money_radar_until: "2026-12-01T00:00:00Z" },
      ],
      startup_package_purchases: [{ user_id: "u-pkg", status: "active" }],
      credit_transactions: [],
      entitlements: [{ user_id: "u-entitlement-only", expires_at: null }],
    };
    const calls: string[] = [];
    return {
      calls,
      from(table: string) {
        calls.push(table);
        const filters: Array<[string, string, unknown]> = [];
        const c: Record<string, unknown> = {};
        for (const op of ["select", "in", "eq", "gt", "limit"]) {
          c[op] = (...args: unknown[]) => {
            if (op === "in" || op === "eq" || op === "gt") filters.push([op, String(args[0]), args[1]]);
            return c;
          };
        }
        c.then = (resolve: (v: unknown) => unknown) =>
          resolve({
            data: (tables[table] ?? []).filter((r) =>
              filters.every(([op, col, v]) => {
                if (op === "in") return (v as unknown[]).includes(r[col]);
                if (op === "eq") return r[col] === v;
                return typeof r[col] === "string" && String(r[col]) > String(v);
              }),
            ),
            error: null,
          });
        return c;
      },
    };
  }

  it("unions Growth-plan founders with active Startup Package buyers; Starter / support-only radar / entitlement rows do not qualify", async () => {
    const db = fakeDb();
    const users = await createSupabaseRefreshStore(db).listGrowthUsers(NOW);
    expect(users.map((u) => u.userId).sort()).toEqual(["u-growth", "u-pkg"]);
    expect(users.find((u) => u.userId === "u-pkg")?.plan).toBe("founder_free");
    expect(db.calls).not.toContain("entitlements");
  });
});

describe("rankKnowledge", () => {
  it("ranks industry hits first (topic ×2, body ×1), newest on ties, top 3", () => {
    const items = [
      knowledge({ topic: "GST on SaaS exports", updated_at: "2026-09-01T00:00:00Z" }),
      knowledge({ agent: "clo", topic: "Agtech R&D claims", findings: ["Farm trials count as core R&D"], updated_at: "2026-07-05T00:00:00Z" }),
      knowledge({ topic: "Seed valuations", findings: ["agtech rounds are pricing at 4x ARR"], updated_at: "2026-08-01T00:00:00Z" }),
      knowledge({ topic: "ESIC changes", updated_at: "2026-09-20T00:00:00Z" }),
      knowledge({ topic: "Term sheet norms", updated_at: "2026-09-25T00:00:00Z" }),
    ];
    const out = rankKnowledge(items, "AgTech");
    expect(KNOWLEDGE_TOP_N).toBe(3);
    expect(out.map((k) => k.topic)).toEqual(["Agtech R&D claims", "Seed valuations", "Term sheet norms"]);
    // No industry → newest first.
    expect(rankKnowledge(items, null).map((k) => k.topic)).toEqual(["Term sheet norms", "ESIC changes", "GST on SaaS exports"]);
  });
});

describe("composeRefresh", () => {
  it("counts changes = SVI moved + new + closed + paused + knowledge, renders all three sections and the D-3 title", () => {
    const note = composeRefresh({
      project: PROJECT,
      quarter: Q3,
      svi: { prev: 54, now: 61 },
      matches: {
        added: [{ ref_kind: "grant", ref_id: "g1", name: "MVP Ventures", closes_at: "2026-11-30" }],
        closed: [{ ref_kind: "program", ref_id: "p1", name: "Startmate W26", closes_at: null }],
        paused: [],
      },
      knowledge: [knowledge()],
    });
    expect(note.quarter).toBe("2026-Q3");
    expect(note.changes).toBe(4);
    expect(note.title).toBe("Your funding plan was refreshed — 4 changes");
    expect(note.body_md).toContain("# What changed for Acme Agtech — 2026-Q3");
    expect(note.body_md).toContain("SVI moved **54 → 61** (+7)");
    expect(note.body_md).toContain("- MVP Ventures (grant) joined your list — closes 2026-11-30");
    expect(note.body_md).toContain("- Startmate W26 (program) closed");
    expect(note.body_md).toContain("### CFO — AU seed valuations Q3");
    expect(note.body_md).toContain("_For you: Anchor your ask at the median._");
    expect(note.body_md).toContain("re-run your match");
    expect(note.meta).toEqual({ svi: { prev: 54, now: 61, delta: 7 }, matches: { added: 1, closed: 1, paused: 0 }, knowledge: 1 });
  });

  it("zero-change quarter → changes 0, 'nothing moved' copy, noCount title", () => {
    const note = composeRefresh({ project: PROJECT, quarter: Q3, svi: { prev: 60, now: 60 }, matches: { added: [], closed: [], paused: [] }, knowledge: [] });
    expect(note.changes).toBe(0);
    expect(note.title).toBe("Your funding plan was refreshed");
    expect(note.body_md).toContain("SVI held at **60**");
    expect(note.body_md).toContain("No grant or program on your matches opened, closed or paused this quarter.");
    expect(note.body_md).toContain("No new CFO / CLO research touched your industry this quarter.");
    expect(note.body_md).toContain("Nothing moved");
  });

  it("never blanks the SVI line — no snapshot / first snapshot / stale snapshot all read", () => {
    const none = composeRefresh({ project: PROJECT, quarter: Q3, svi: { prev: null, now: null }, matches: { added: [], closed: [], paused: [] }, knowledge: [] });
    expect(none.body_md).toContain("No SVI snapshot yet");
    expect(none.changes).toBe(0);
    const first = composeRefresh({ project: PROJECT, quarter: Q3, svi: { prev: null, now: 58 }, matches: { added: [], closed: [], paused: [] }, knowledge: [] });
    expect(first.body_md).toContain("First SVI on record: **58**");
    expect(first.changes).toBe(0);
  });
});

function fakeStore(over: Partial<RefreshStore> = {}) {
  const saved: unknown[] = [];
  const notified: unknown[] = [];
  const store: RefreshStore = {
    listGrowthUsers: async () => [{ userId: "u-growth", plan: "founder_growth" }],
    listProjects: async () => [PROJECT],
    sviOnOrBefore: async (_u, _p, day) => (day === Q3.start ? 50 : 57),
    listMatchChanges: async () => ({ added: [{ ref_kind: "grant", ref_id: "g1", name: "MVP Ventures", closes_at: null }], closed: [], paused: [] }),
    listKnowledge: async () => [knowledge()],
    hasRefresh: async () => false,
    saveRefresh: async (row) => {
      saved.push(row);
    },
    notify: async (args) => {
      notified.push(args);
    },
    ...over,
  };
  return { store, saved, notified };
}

describe("buildAnalysisRefresh", () => {
  it("reads SVI at both quarter edges, the match changes and the knowledge rows", async () => {
    const { store } = fakeStore();
    const note = await buildAnalysisRefresh("u-growth", PROJECT, { now: new Date("2026-10-01T06:00:00Z"), store });
    expect(note.quarter).toBe("2026-Q3");
    expect(note.meta.svi).toEqual({ prev: 50, now: 57, delta: 7 });
    expect(note.changes).toBe(3); // svi + 1 new + 1 knowledge
  });
});

describe("runAnalysisRefreshQuarterly", () => {
  const now = new Date("2026-10-01T06:00:00Z");

  it("stores the note and writes ONE analysis_refresh notification with the changes + href", async () => {
    const { store, saved, notified } = fakeStore();
    const s = await runAnalysisRefreshQuarterly({ now, store });
    expect(s).toMatchObject({ ok: true, dryRun: false, quarter: "2026-Q3", users: 1, projects: 1, written: 1, notified: 1, skipped: 0, errors: 0 });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ user_id: "u-growth", project_id: "p1", quarter: "2026-Q3", changes: 3 });
    expect(notified).toHaveLength(1);
    expect(notified[0]).toMatchObject({
      userId: "u-growth",
      projectId: "p1",
      kind: "analysis_refresh",
      dedupeKey: "analysis_refresh:p1:2026-Q3",
      payload: { changes: 3, href: REFRESH_HREF, quarter: "2026-Q3", startup: "Acme Agtech" },
    });
  });

  it("zero-change quarter → note stored, NO notification", async () => {
    const { store, saved, notified } = fakeStore({
      sviOnOrBefore: async () => 60,
      listMatchChanges: async () => ({ added: [], closed: [], paused: [] }),
      listKnowledge: async () => [],
    });
    const s = await runAnalysisRefreshQuarterly({ now, store });
    expect(s.written).toBe(1);
    expect(s.notified).toBe(0);
    expect(saved).toHaveLength(1);
    expect((saved[0] as { changes: number }).changes).toBe(0);
    expect(notified).toHaveLength(0);
  });

  it("dry run computes the notes and writes nothing", async () => {
    const { store, saved, notified } = fakeStore();
    const s = await runAnalysisRefreshQuarterly({ now, store, dryRun: true });
    expect(s.dryRun).toBe(true);
    expect(s.written).toBe(1);
    expect(s.notified).toBe(1);
    expect(s.notes).toEqual([{ userId: "u-growth", projectId: "p1", changes: 3, title: "Your funding plan was refreshed — 3 changes" }]);
    expect(saved).toHaveLength(0);
    expect(notified).toHaveLength(0);
  });

  it("skips a (user, project, quarter) that already has a note unless force", async () => {
    const { store, saved } = fakeStore({ hasRefresh: async () => true });
    const s = await runAnalysisRefreshQuarterly({ now, store });
    expect(s).toMatchObject({ written: 0, skipped: 1 });
    expect(saved).toHaveLength(0);
    const forced = await runAnalysisRefreshQuarterly({ now, store, force: true });
    expect(forced.written).toBe(1);
  });

  it("a founder without projects still gets one note keyed on user (project null); store errors are counted, not fatal", async () => {
    const { store, saved } = fakeStore({ listProjects: async () => [] });
    const s = await runAnalysisRefreshQuarterly({ now, store });
    expect(s.written).toBe(1);
    expect((saved[0] as { project_id: string | null }).project_id).toBeNull();

    const broken = fakeStore({ saveRefresh: async () => { throw new Error("boom"); } });
    const b = await runAnalysisRefreshQuarterly({ now, store: broken.store });
    expect(b.ok).toBe(true);
    expect(b.errors).toBe(1);
    expect(broken.notified).toHaveLength(0);
  });

  it("no store + no db → supabase_unavailable", async () => {
    const s = await runAnalysisRefreshQuarterly({ now, db: null, store: null });
    // getSupabaseAdmin() is unconfigured in tests → null → 503 path.
    expect(s.ok).toBe(false);
    expect(s.error).toBe("supabase_unavailable");
  });
});
