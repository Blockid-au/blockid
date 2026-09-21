import { beforeEach, describe, expect, it } from "vitest";
import { _resetDataMoatCache, computeDataMoat, computeLongitudinal, dataMoatForStatus, readDataMoat } from "./data-moat";

const NOW = new Date("2026-09-20T10:00:00.000Z");

describe("computeLongitudinal (G21 P3-A)", () => {
  it("counts projects whose earliest and latest snapshot are ≥ 30 days apart", () => {
    const rows = [
      { project_id: "a", snapshot_date: "2026-01-01" },
      { project_id: "a", snapshot_date: "2026-02-15" },
      { project_id: "b", snapshot_date: "2026-01-01" },
      { project_id: "b", snapshot_date: "2026-01-20" },
      { project_id: "c", snapshot_date: "2026-01-01" },
      { project_id: null, snapshot_date: "2026-01-01" },
      { project_id: "d", snapshot_date: "bad" },
    ];
    expect(computeLongitudinal(rows)).toBe(1);
    expect(computeLongitudinal(rows, 10)).toBe(2);
    expect(computeLongitudinal([])).toBe(0);
  });
});

function fakeDb(tables: Record<string, { count?: number; rows?: Array<Record<string, unknown>>; error?: string }>) {
  return {
    from: (table: string) => {
      const t = tables[table];
      const chain = {
        select: () => chain,
        eq: () => chain,
        not: () => chain,
        order: () => chain,
        limit: () => chain,
        then: (res: (v: unknown) => void) => res(t?.error ? { data: null, count: null, error: { message: t.error } } : { data: t?.rows ?? null, count: t?.count ?? null, error: null }),
      };
      return chain;
    },
  };
}

describe("computeDataMoat / readDataMoat", () => {
  beforeEach(() => _resetDataMoatCache());

  it("six counts from five COUNT queries + the bounded snapshot scan; a failing table → null + warning (never a fake zero)", async () => {
    const db = fakeDb({
      projects: { count: 120 },
      svi_snapshots: { count: 900, rows: [{ project_id: "a", snapshot_date: "2026-01-01" }, { project_id: "a", snapshot_date: "2026-03-01" }] },
      evidence_records: { count: 340 },
      startup_outcomes: { error: 'relation "startup_outcomes" does not exist' },
    });
    const m = await computeDataMoat(db, NOW);
    expect(m).toMatchObject({ companies: 120, snapshots: 900, evidence_records: 340, longitudinal_companies: 1, known_outcomes: null, proposals_pending: null, longitudinal_capped: false, checked_at: NOW.toISOString() });
    expect(m.warnings.filter((w) => w.includes("startup_outcomes"))).toHaveLength(2);
  });

  it("no db → all null with a warning; the status shape drops warnings", async () => {
    const m = await computeDataMoat(null, NOW);
    expect(m.companies).toBeNull();
    expect(m.warnings).toEqual(["supabase not configured"]);
    expect(dataMoatForStatus(m)).not.toHaveProperty("warnings");
  });

  it("readDataMoat caches for 10 minutes (force bypasses)", async () => {
    let calls = 0;
    const db = { from: (table: string) => { calls += 1; return fakeDb({ [table]: { count: 1, rows: [] } }).from(table); } };
    const a = await readDataMoat(db, { now: NOW });
    const b = await readDataMoat(db, { now: new Date(NOW.getTime() + 5 * 60 * 1000) });
    expect(b).toBe(a);
    const before = calls;
    await readDataMoat(db, { now: new Date(NOW.getTime() + 11 * 60 * 1000) });
    expect(calls).toBeGreaterThan(before);
    const c = calls;
    await readDataMoat(db, { now: new Date(NOW.getTime() + 11 * 60 * 1000), force: true });
    expect(calls).toBeGreaterThan(c);
  });
});
