// G21 P3-B — organisation retention over a fake DB: only the org's own
// artefacts (via its batches / intakes) older than the cutoff are touched,
// ≤ limit per table, dry-run deletes nothing and writes no audit row, one
// `org.retention.applied` row per org on a real run, 0428 missing → error.
// G22-B (0433): the scope is `org_id = org` ∪ owner-owned rows with no
// org_id (lib/org/scope.ts) — a seat's cohort stamped for this org is in, a
// seat's own cohort and the owner's cohort for another org are out; before
// 0433 (42703) the scope is owner-only, as before.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
const auditMock = vi.fn(async () => ({ id: 1n, curr_hash: "h" }));
vi.mock("@/lib/audit", () => ({ appendAudit: (...a: unknown[]) => auditMock(...(a as [])) }));
vi.mock("@/lib/investor/organisations", () => ({ listSeatUserIds: async () => ["seat-1"] }));

import { ORG_RETENTION_TARGETS, retentionCutoff, runOrgRetention } from "./retention";

type Row = Record<string, unknown>;
const NOW = new Date("2026-09-21T04:40:00.000Z");

interface FakeDb {
  tables: Record<string, Row[]>;
  deleted: Array<{ table: string; ids: string[] }>;
  missing: Set<string>;
  from: (table: string) => unknown;
}

/** `missing` takes table names (42P01) and `table.column` names (42703 — G22-B: pre-0433 `org_id`). */
function fakeDb(tables: Record<string, Row[]>, missing: string[] = []): FakeDb {
  const db: FakeDb = { tables, deleted: [], missing: new Set(missing), from: () => null };
  db.from = (table: string) => {
    const rows = () => db.tables[table] ?? [];
    let err: { code: string; message: string } | null = db.missing.has(table) ? { code: "42P01", message: `relation "${table}" does not exist` } : null;
    const touch = (col: string) => {
      if (db.missing.has(`${table}.${col}`)) err = { code: "42703", message: `column ${table}.${col} does not exist` };
    };
    const build = (filters: Array<(r: Row) => boolean>, opts: { order?: string; limit?: number }) => {
      const q = {
        select: () => q,
        in: (col: string, vals: string[]) => (filters.push((r) => vals.includes(String(r[col]))), q),
        eq: (col: string, v: unknown) => (touch(col), filters.push((r) => r[col] === v), q),
        is: (col: string, v: unknown) => (touch(col), filters.push((r) => (v === null ? r[col] == null : r[col] === v)), q),
        not: (col: string, _op: string, v: unknown) => (filters.push((r) => r[col] !== v), q),
        lt: (col: string, v: string) => (filters.push((r) => String(r[col]) < v), q),
        order: (col: string) => ((opts.order = col), q),
        limit: (n: number) => ((opts.limit = n), q),
        maybeSingle: async () => ({ data: err ? null : (rows().filter((r) => filters.every((f) => f(r)))[0] ?? null), error: err }),
        delete: () => ({
          in: (col: string, vals: string[]) => ({
            select: async () => {
              const hit = rows().filter((r) => vals.includes(String(r[col])));
              db.deleted.push({ table, ids: hit.map((r) => String(r.id)) });
              db.tables[table] = rows().filter((r) => !vals.includes(String(r[col])));
              return { data: hit, error: null };
            },
          }),
        }),
        then: (resolve: (v: { data: Row[] | null; error: unknown }) => void) => {
          if (err) return resolve({ data: null, error: err });
          let out = rows().filter((r) => filters.every((f) => f(r)));
          if (opts.order) out = [...out].sort((a, b) => (String(a[opts.order!]) < String(b[opts.order!]) ? -1 : 1));
          if (opts.limit) out = out.slice(0, opts.limit);
          resolve({ data: out, error: null });
        },
      };
      return q;
    };
    return build([], {});
  };
  return db;
}

const OLD = "2025-01-01T00:00:00.000Z";
const RECENT = "2026-09-15T00:00:00.000Z";

function seed(): Record<string, Row[]> {
  return {
    org_settings: [{ org_id: "org-1", retention_days: 365 }, { org_id: "org-2", retention_days: null }],
    investor_organisations: [{ id: "org-1", owner_user_id: "owner-1" }],
    // G22-B: in scope = org_id = org-1 (b-org, b-seat-org) ∪ owner rows with no org_id (b-owner-legacy);
    // out = a seat's own cohort (b-seat), the owner's cohort for another org (b-owner-other), a stranger's (b-other).
    evaluation_batches: [
      { id: "b-org", user_id: "owner-1", org_id: "org-1" },
      { id: "b-owner-legacy", user_id: "owner-1", org_id: null },
      { id: "b-owner-other", user_id: "owner-1", org_id: "org-9" },
      { id: "b-seat-org", user_id: "seat-1", org_id: "org-1" },
      { id: "b-seat", user_id: "seat-1", org_id: null },
      { id: "b-other", user_id: "someone-else", org_id: null },
    ],
    program_intakes: [
      { id: "i-org", owner_user_id: "owner-1", org_id: "org-1" },
      { id: "i-seat", owner_user_id: "seat-1", org_id: null },
      { id: "i-other", owner_user_id: "someone-else", org_id: null },
    ],
    cohort_snapshots: [
      { id: "s-old", batch_id: "b-org", taken_at: OLD },
      { id: "s-old-legacy", batch_id: "b-owner-legacy", taken_at: OLD },
      { id: "s-old-owner-other", batch_id: "b-owner-other", taken_at: OLD },
      { id: "s-old-seat-org", batch_id: "b-seat-org", taken_at: OLD },
      { id: "s-old-seat", batch_id: "b-seat", taken_at: OLD },
      { id: "s-new", batch_id: "b-org", taken_at: RECENT },
      { id: "s-other-old", batch_id: "b-other", taken_at: OLD },
    ],
    assessment_overrides: [
      { id: "o-old", batch_id: "b-org", created_at: OLD },
      { id: "o-new", batch_id: "b-org", created_at: RECENT },
    ],
    intake_submissions: [
      { id: "sub-old", intake_id: "i-org", submitted_at: OLD },
      { id: "sub-other-old", intake_id: "i-other", submitted_at: OLD },
    ],
    projects: [{ id: "p-1", created_at: OLD }],
  };
}

beforeEach(() => auditMock.mockClear());

describe("runOrgRetention", () => {
  it("targets exactly the three org-owned tables", () => {
    expect(ORG_RETENTION_TARGETS.map((t) => t.table)).toEqual(["cohort_snapshots", "assessment_overrides", "intake_submissions"]);
    expect(retentionCutoff(365, NOW)).toBe("2025-09-21T04:40:00.000Z");
  });

  it("dry-run: counts the org's stale artefacts, deletes nothing, writes no audit row, skips orgs with no window", async () => {
    const db = fakeDb(seed());
    const s = await runOrgRetention({ db: db as never, now: () => NOW, dryRun: true });
    expect(s.ok).toBe(true);
    expect(s.dry_run).toBe(true);
    expect(s.orgs).toHaveLength(1);
    expect(s.orgs[0]).toMatchObject({ org_id: "org-1", retention_days: 365, seats: 1, batches: 3, intakes: 1, deleted: { cohort_snapshots: 3, assessment_overrides: 1, intake_submissions: 1 }, more: false, dry_run: true });
    expect(s.deleted_total).toBe(5);
    expect(db.deleted).toEqual([]);
    expect(auditMock).not.toHaveBeenCalled();
  });

  it("real run: deletes only the org's stale rows (never another org's, never a recent row, never a project) and records one audit row", async () => {
    const db = fakeDb(seed());
    const s = await runOrgRetention({ db: db as never, now: () => NOW });
    expect(s.ok).toBe(true);
    expect(s.deleted_total).toBe(5);
    const deletedIds = db.deleted.flatMap((d) => d.ids).sort();
    // s-old-seat (a seat's own batch) and s-old-owner-other (the owner's cohort for org-9) survive.
    expect(deletedIds).toEqual(["o-old", "s-old", "s-old-legacy", "s-old-seat-org", "sub-old"]);
    expect(db.tables.cohort_snapshots!.map((r) => r.id)).toEqual(["s-old-owner-other", "s-old-seat", "s-new", "s-other-old"]);
    expect(db.tables.intake_submissions!.map((r) => r.id)).toEqual(["sub-other-old"]); // i-seat had no rows; sub-old (owner intake) deleted
    expect(db.tables.projects).toHaveLength(1);
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect(auditMock.mock.calls[0]![0]).toMatchObject({ actor: "cron", action: "org.retention.applied", resource_id: "org-1", detail: { retention_days: 365, batches: 3, deleted: { cohort_snapshots: 3, assessment_overrides: 1, intake_submissions: 1 } } });
  });

  it("before 0433 (42703 on evaluation_batches.org_id): the scope is owner-only — every owner-owned cohort, no seat cohort", async () => {
    const db = fakeDb(seed(), ["evaluation_batches.org_id"]);
    const s = await runOrgRetention({ db: db as never, now: () => NOW });
    expect(s.ok).toBe(true);
    expect(s.orgs[0]).toMatchObject({ batches: 3, intakes: 1, deleted: { cohort_snapshots: 3 } });
    const deletedIds = db.deleted.flatMap((d) => d.ids).sort();
    expect(deletedIds).toEqual(["o-old", "s-old", "s-old-legacy", "s-old-owner-other", "sub-old"]); // owner rows regardless of org; s-old-seat-org is out
  });

  it("an org with no artefacts in scope is reported with zero counts and no delete", async () => {
    const tables = seed();
    tables.investor_organisations = [{ id: "org-1", owner_user_id: "nobody" }];
    tables.evaluation_batches = tables.evaluation_batches!.filter((b) => b.org_id !== "org-1");
    tables.program_intakes = tables.program_intakes!.filter((i) => i.org_id !== "org-1");
    const db = fakeDb(tables);
    const s = await runOrgRetention({ db: db as never, now: () => NOW });
    expect(s.orgs[0]).toMatchObject({ seats: 1, batches: 0, intakes: 0, deleted: { cohort_snapshots: 0, assessment_overrides: 0, intake_submissions: 0 } });
    expect(db.deleted).toEqual([]);
  });

  it("honours the per-table limit and flags `more`", async () => {
    const db = fakeDb(seed());
    const s = await runOrgRetention({ db: db as never, now: () => NOW, limit: 1 });
    expect(s.orgs[0]!.deleted.cohort_snapshots).toBe(1);
    expect(s.orgs[0]!.more).toBe(true);
  });

  it("0428 missing → ok:false with the migration hint; no DB → supabase_unavailable", async () => {
    const db = fakeDb(seed(), ["org_settings"]);
    expect(await runOrgRetention({ db: db as never, now: () => NOW })).toMatchObject({ ok: false, error: expect.stringContaining("0428") });
    expect(await runOrgRetention({ db: null, now: () => NOW })).toMatchObject({ ok: false, error: "supabase_unavailable" });
  });
});
