// Colocated vitest for lib/evaluations/batch.ts — the runner's write path
// (money-path review 2026-09-10, findings #6 / #7). Against an in-memory
// fake of the two tables it pins:
//   * nextQueuedItems claims with `… where id=? and status='queued'`: an item
//     another tick already flipped updates 0 rows and is NOT returned, so
//     two overlapping ticks can never both score it (#6); the claim stamps
//     started_at + attempts+1; `dry` reads without claiming;
//   * claimNextBatch flips queued → running conditionally, skips (and
//     closes) a batch whose every item is terminal so an all-failed batch no
//     longer wedges the platform-wide queue (#7);
//   * sweepExpiredLeases requeues a `running` item older than 15 min with
//     attempts < 2 and fails it with error=lease_expired at attempts ≥ 2;
//     fresh leases are untouched (#7);
//   * countPendingBatchItems is re-exported from report-quota (#8).

import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const db = {
  evaluation_batches: [] as Row[],
  evaluation_batch_items: [] as Row[],
  evaluations: [] as Row[],
  app_users: [] as Row[],
};

type Filter = (r: Row) => boolean;

/** Enough of PostgREST's builder to run batch.ts: select/update/eq/in/or/order/limit/maybeSingle/single + count head. */
function builder(table: keyof typeof db) {
  const filters: Filter[] = [];
  let op: "select" | "update" | "insert" | "delete" = "select";
  let patch: Row = {};
  let countMode = false;
  let ordering: { col: string; asc: boolean } | null = null;
  let lim: number | null = null;
  let wantSingle: "single" | "maybe" | null = null;

  const rowsMatching = () => {
    let rows = db[table].filter((r) => filters.every((f) => f(r)));
    if (ordering) {
      const { col, asc } = ordering;
      rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
    }
    if (lim != null) rows = rows.slice(0, lim);
    return rows;
  };

  const run = async () => {
    if (op === "update") {
      const rows = rowsMatching();
      for (const r of rows) Object.assign(r, patch);
      return { data: rows.map((r) => ({ ...r })), error: null, count: null };
    }
    if (op === "delete") {
      const rows = rowsMatching();
      db[table] = db[table].filter((r) => !rows.includes(r));
      return { data: null, error: null, count: null };
    }
    const rows = rowsMatching();
    if (countMode) return { data: null, error: null, count: rows.length };
    if (wantSingle === "maybe") return { data: rows[0] ? { ...rows[0] } : null, error: null, count: null };
    if (wantSingle === "single") return rows[0] ? { data: { ...rows[0] }, error: null, count: null } : { data: null, error: { code: "PGRST116" }, count: null };
    return { data: rows.map((r) => ({ ...r })), error: null, count: null };
  };

  const b: Record<string, unknown> = {};
  Object.assign(b, {
    select(_cols?: string, opts?: { count?: string; head?: boolean }) {
      if (opts?.head) countMode = true;
      return b;
    },
    update(p: Row) { op = "update"; patch = p; return b; },
    insert(p: Row | Row[]) {
      op = "insert";
      const rows = Array.isArray(p) ? p : [p];
      for (const r of rows) db[table].push({ id: db[table].length + 1, ...r });
      return b;
    },
    delete() { op = "delete"; return b; },
    eq(col: string, val: unknown) { filters.push((r) => String(r[col]) === String(val)); return b; },
    in(col: string, vals: unknown[]) { filters.push((r) => vals.map(String).includes(String(r[col]))); return b; },
    or(expr: string) {
      // "started_at.is.null,started_at.lt.<iso>"
      const parts = expr.split(",");
      filters.push((r) =>
        parts.some((p) => {
          const [col, o, ...rest] = p.split(".");
          const v = rest.join(".");
          if (o === "is" && v === "null") return r[col] == null;
          if (o === "lt") return r[col] != null && String(r[col]) < v;
          return false;
        }),
      );
      return b;
    },
    order(col: string, o?: { ascending?: boolean }) { ordering = { col, asc: o?.ascending !== false }; return b; },
    limit(n: number) { lim = n; return b; },
    maybeSingle() { wantSingle = "maybe"; return run(); },
    single() { wantSingle = "single"; return run(); },
    then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) { return run().then(ok, err); },
  });
  return b;
}

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({ from: (t: keyof typeof db) => builder(t) }),
}));

import {
  ITEM_LEASE_MS,
  ITEM_MAX_ATTEMPTS,
  claimNextBatch,
  countPendingBatchItems,
  nextQueuedItems,
  sweepExpiredLeases,
} from "./batch";

const NOW = new Date("2026-09-10T12:30:00.000Z");

function seed() {
  db.evaluation_batches = [
    { id: "b-1", user_id: "u-1", name: "Cohort 4", rubric_weights: {}, status: "queued", total: 3, done_count: 0, failed_count: 0, created_at: "2026-09-10T00:00:00Z", started_at: null, finished_at: null },
  ];
  db.evaluation_batch_items = [
    { id: 1, batch_id: "b-1", evaluation_id: "e-1", status: "queued", started_at: null, attempts: 0, error: null },
    { id: 2, batch_id: "b-1", evaluation_id: "e-2", status: "queued", started_at: null, attempts: 0, error: null },
    { id: 3, batch_id: "b-1", evaluation_id: "e-3", status: "queued", started_at: null, attempts: 0, error: null },
  ];
  db.evaluations = [
    { id: "e-1", project_id: "p-1", label: null, state: null, projects: { name: "Acme", slug: "acme", industry: null, stage: 3 } },
    { id: "e-2", project_id: "p-2", label: null, state: null, projects: { name: "Beta", slug: "beta", industry: null, stage: 2 } },
    { id: "e-3", project_id: "p-3", label: null, state: null, projects: { name: "Gamma", slug: "gamma", industry: null, stage: 1 } },
  ];
  db.app_users = [{ id: "u-1", plan: "investor_vc_small" }];
}

beforeEach(() => {
  vi.restoreAllMocks();
  seed();
});

describe("#6 atomic item claim", () => {
  it("claims queued items conditionally: stamps running/started_at/attempts and skips an item another tick already took", async () => {
    // Tick B raced ahead and already flipped item 2.
    db.evaluation_batch_items[1].status = "running";
    db.evaluation_batch_items[1].started_at = NOW.toISOString();
    db.evaluation_batch_items[1].attempts = 1;

    const items = await nextQueuedItems("b-1", 5);
    expect(items.map((i) => i.id)).toEqual([1, 3]);
    expect(items[0]).toMatchObject({ status: "running", projectId: "p-1", projectName: "Acme" });
    const row1 = db.evaluation_batch_items[0];
    expect(row1.status).toBe("running");
    expect(row1.attempts).toBe(1);
    expect(typeof row1.started_at).toBe("string");
    // Item 2 untouched by this tick (still attempts 1, not 2).
    expect(db.evaluation_batch_items[1].attempts).toBe(1);

    // A second overlapping tick now finds nothing left to claim.
    expect(await nextQueuedItems("b-1", 5)).toEqual([]);
  });

  it("the same queued rows offered to two ticks are handed to exactly one of them", async () => {
    // Simulate the lost race: the row flips between the select and the update.
    const [a, b] = await Promise.all([nextQueuedItems("b-1", 5), nextQueuedItems("b-1", 5)]);
    const ids = [...a.map((i) => i.id), ...b.map((i) => i.id)].sort();
    expect(ids).toEqual([1, 2, 3]); // each item exactly once across both ticks
  });

  it("dry mode reads the queued items without claiming them", async () => {
    const items = await nextQueuedItems("b-1", 2, true);
    expect(items.map((i) => i.id)).toEqual([1, 2]);
    expect(db.evaluation_batch_items.every((r) => r.status === "queued" && r.attempts === 0)).toBe(true);
  });

  it("claimNextBatch flips queued → running once; a second claim reads the running row", async () => {
    const first = await claimNextBatch();
    expect(first).toMatchObject({ id: "b-1", status: "running" });
    expect(db.evaluation_batches[0].status).toBe("running");
    expect(typeof db.evaluation_batches[0].started_at).toBe("string");
    const second = await claimNextBatch();
    expect(second).toMatchObject({ id: "b-1", status: "running" });
    // dry never writes
    db.evaluation_batches[0].status = "queued";
    expect((await claimNextBatch(true))?.status).toBe("queued");
    expect(db.evaluation_batches[0].status).toBe("queued");
  });
});

describe("#7 stuck items and all-failed batches", () => {
  it("claimNextBatch closes a batch whose every item is failed and moves on to the next live batch", async () => {
    for (const r of db.evaluation_batch_items) { r.status = "failed"; r.error = "owner_not_found"; }
    db.evaluation_batches.push({ id: "b-2", user_id: "u-2", name: "Next", rubric_weights: {}, status: "queued", total: 1, done_count: 0, failed_count: 0, created_at: "2026-09-10T01:00:00Z", started_at: null, finished_at: null });
    db.evaluation_batch_items.push({ id: 4, batch_id: "b-2", evaluation_id: "e-1", status: "queued", started_at: null, attempts: 0, error: null });

    const next = await claimNextBatch();
    expect(next?.id).toBe("b-2");
    expect(next?.status).toBe("running");
    const closed = db.evaluation_batches.find((b) => b.id === "b-1")!;
    expect(closed.status).toBe("failed");
    expect(closed.failed_count).toBe(3);
    expect(typeof closed.finished_at).toBe("string");
  });

  it("returns null when only terminal batches remain", async () => {
    for (const r of db.evaluation_batch_items) r.status = "done";
    expect(await claimNextBatch()).toBeNull();
    expect(db.evaluation_batches[0].status).toBe("done");
  });

  it("sweepExpiredLeases requeues a stale running item (attempts < 2), fails it with lease_expired at 2, leaves fresh leases alone", async () => {
    const stale = new Date(NOW.getTime() - ITEM_LEASE_MS - 1000).toISOString();
    const fresh = new Date(NOW.getTime() - 60_000).toISOString();
    Object.assign(db.evaluation_batch_items[0], { status: "running", started_at: stale, attempts: 1 });
    Object.assign(db.evaluation_batch_items[1], { status: "running", started_at: stale, attempts: ITEM_MAX_ATTEMPTS });
    Object.assign(db.evaluation_batch_items[2], { status: "running", started_at: fresh, attempts: 1 });

    const out = await sweepExpiredLeases("b-1", NOW);
    expect(out).toEqual({ requeued: [1], failed: [2] });
    expect(db.evaluation_batch_items[0]).toMatchObject({ status: "queued", started_at: null });
    expect(db.evaluation_batch_items[1]).toMatchObject({ status: "failed", error: "lease_expired" });
    expect(db.evaluation_batch_items[2]).toMatchObject({ status: "running", started_at: fresh });

    // A pre-0325 row with no started_at counts as expired.
    Object.assign(db.evaluation_batch_items[2], { started_at: null, attempts: 0 });
    expect((await sweepExpiredLeases("b-1", NOW)).requeued).toEqual([3]);
  });
});

describe("#8 reserved quota", () => {
  it("countPendingBatchItems (re-exported from report-quota) counts queued|running items of the user's live batches", async () => {
    db.evaluation_batch_items[2].status = "done";
    expect(await countPendingBatchItems("u-1")).toBe(2);
    expect(await countPendingBatchItems("u-other")).toBe(0);
  });
});
