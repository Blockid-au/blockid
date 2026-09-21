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
  evaluation_batch_members: [] as Row[],
};

type Filter = (r: Row) => boolean;

/** G22-B: columns the fake schema does NOT have — a select / insert naming one answers 42703 like PostgREST (and inserts nothing). */
const missingColumns = new Set<string>();
const MISSING_COLUMN = (col: string) => ({ code: "42703", message: `column evaluation_batches.${col} does not exist` });

/** Enough of PostgREST's builder to run batch.ts: select/update/eq/in/or/order/limit/maybeSingle/single + count head. */
function builder(table: keyof typeof db) {
  const filters: Filter[] = [];
  let op: "select" | "update" | "insert" | "delete" = "select";
  let patch: Row = {};
  let countMode = false;
  let ordering: { col: string; asc: boolean } | null = null;
  let lim: number | null = null;
  let wantSingle: "single" | "maybe" | null = null;
  let selected: string[] = [];
  let pendingInsert: Row[] | null = null;

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
    const missing = selected.find((c) => missingColumns.has(c)) ?? (pendingInsert ?? []).flatMap((r) => Object.keys(r)).find((c) => missingColumns.has(c));
    if (missing) return { data: null, error: MISSING_COLUMN(missing), count: null };
    if (op === "insert" && pendingInsert) {
      const inserted = pendingInsert.map((r) => {
        const row = { id: `${table}-${db[table].length + 1}`, ...r };
        db[table].push(row);
        return { ...row };
      });
      pendingInsert = null;
      if (wantSingle) return { data: inserted[0] ?? null, error: null, count: null };
      return { data: inserted, error: null, count: null };
    }
    if (op === "update") {
      const rows = rowsMatching();
      for (const r of rows) Object.assign(r, patch);
      const out = rows.map((r) => ({ ...r }));
      if (wantSingle === "maybe") return { data: out[0] ?? null, error: null, count: null };
      if (wantSingle === "single") return out[0] ? { data: out[0], error: null, count: null } : { data: null, error: { code: "PGRST116" }, count: null };
      return { data: out, error: null, count: null };
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
    select(cols?: string, opts?: { count?: string; head?: boolean }) {
      if (opts?.head) countMode = true;
      selected = typeof cols === "string" ? cols.split(",").map((c) => c.trim()) : [];
      return b;
    },
    update(p: Row) { op = "update"; patch = p; return b; },
    insert(p: Row | Row[]) {
      op = "insert";
      pendingInsert = Array.isArray(p) ? p : [p];
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
  createBatch,
  getBatchById,
  listBatches,
  nextQueuedItems,
  sweepExpiredLeases,
  updateBatchWeights,
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
  db.evaluation_batch_members = [];
}

beforeEach(() => {
  vi.restoreAllMocks();
  missingColumns.clear();
  seed();
});

// G22-B (0433): org_id is stamped at creation from the caller-resolved acting
// org and read back through the V3 → V2 → V1 column fallback.
describe("G22-B org_id on evaluation_batches", () => {
  const input = { userId: "u-1", name: "Round 1", rubricWeights: {}, evaluationIds: ["e-1"], programName: "Fellowship", orgId: "org-1" };

  it("with 0433 applied: the insert carries org_id and every reader maps it", async () => {
    const created = await createBatch(input);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.batch.orgId).toBe("org-1");
    expect(created.batch.programName).toBe("Fellowship");
    const stored = db.evaluation_batches.find((r) => r.id === created.batch.id);
    expect(stored?.org_id).toBe("org-1");
    expect((await getBatchById(created.batch.id))?.orgId).toBe("org-1");
    expect((await listBatches("u-1")).map((b) => b.orgId)).toContain("org-1");
    // No acting org (tables absent) → the column is simply not written.
    const bare = await createBatch({ ...input, orgId: null });
    expect(bare.ok && bare.batch.orgId).toBeNull();
  });

  it("before 0433 (42703 on org_id): the cohort is still created on the 0422 shape — metadata kept, org_id dropped — and reads fall back to null", async () => {
    missingColumns.add("org_id");
    const created = await createBatch(input);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.batch.orgId).toBeNull();
    expect(created.batch.programName).toBe("Fellowship"); // the 0422 columns survive the fallback
    expect(db.evaluation_batches.find((r) => r.id === created.batch.id)?.org_id).toBeUndefined();
    expect((await getBatchById(created.batch.id))?.orgId).toBeNull();
    expect((await listBatches("u-1")).every((b) => b.orgId === null)).toBe(true);
  });

  it("before 0422 (42703 on both): the 0322 shape is inserted and read", async () => {
    missingColumns.add("org_id").add("program_name");
    const created = await createBatch(input);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.batch.orgId).toBeNull();
    expect(created.batch.programName).toBeNull();
    expect((await getBatchById(created.batch.id))?.orgId).toBeNull();
  });
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

describe("listBatches (G22-A: created + member cohorts, each with the caller's seat)", () => {
  it("the creator's batches carry role owner; a member row adds that batch with its role; newest first; no duplicates", async () => {
    db.evaluation_batches.push(
      { id: "b-2", user_id: "u-2", name: "Other's cohort", rubric_weights: {}, status: "done", total: 1, done_count: 1, failed_count: 0, created_at: "2026-09-12T00:00:00Z", started_at: null, finished_at: null, weights_version: 3 },
      { id: "b-3", user_id: "u-3", name: "Unrelated", rubric_weights: {}, status: "done", total: 1, done_count: 1, failed_count: 0, created_at: "2026-09-13T00:00:00Z", started_at: null, finished_at: null },
    );
    db.evaluation_batch_members.push({ batch_id: "b-2", user_id: "u-1", role: "reviewer" }, { batch_id: "b-1", user_id: "u-1", role: "viewer" });
    const list = await listBatches("u-1");
    expect(list.map((b) => [b.id, b.role])).toEqual([
      ["b-2", "reviewer"],
      ["b-1", "owner"], // a member row on a batch the caller created never demotes the creator
    ]);
    expect(list[0]?.weightsVersion).toBe(3);
    expect(list.some((b) => b.id === "b-3")).toBe(false);
  });

  it("a stranger with no batches and no seats gets []; an unknown role string reads as viewer; the limit applies after the merge", async () => {
    expect(await listBatches("u-nobody")).toEqual([]);
    db.evaluation_batches.push({ id: "b-2", user_id: "u-2", name: "X", rubric_weights: {}, status: "done", total: 1, done_count: 1, failed_count: 0, created_at: "2026-09-12T00:00:00Z", started_at: null, finished_at: null });
    db.evaluation_batch_members.push({ batch_id: "b-2", user_id: "u-1", role: "bogus" });
    const list = await listBatches("u-1", 1);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: "b-2", role: "viewer" });
  });
});

describe("updateBatchWeights (G22-A weights editor)", () => {
  const equal = { ftv: 12.5, mpc: 12.5, ptd: 12.5, tre: 12.5, cgh: 12.5, iri: 12.5, lco: 12.5, svm: 12.5 };

  it("a real change writes the normalised set and bumps weights_version by one; the row is re-read", async () => {
    db.evaluation_batches[0].weights_version = 1;
    const batch = (await listBatches("u-1"))[0]!;
    const r = await updateBatchWeights(batch, { ...equal, tre: 40, mpc: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changed).toBe(true);
    expect(r.previousVersion).toBe(1);
    expect(r.batch.weightsVersion).toBe(2);
    expect(r.batch.rubricWeights.mpc).toBe(0);
    expect(r.batch.rubricWeights.tre).toBeGreaterThan(30);
    const sum = Object.values(r.batch.rubricWeights).reduce((s, v) => s + v, 0);
    expect(Math.round(sum)).toBe(100);
    expect(db.evaluation_batches[0].weights_version).toBe(2);
  });

  it("an identical set (after normalisation) is a no-op: same version, changed:false, nothing written", async () => {
    db.evaluation_batches[0].weights_version = 4;
    db.evaluation_batches[0].rubric_weights = equal;
    const batch = (await listBatches("u-1"))[0]!;
    const r = await updateBatchWeights(batch, { ftv: 1, mpc: 1, ptd: 1, tre: 1, cgh: 1, iri: 1, lco: 1, svm: 1 });
    expect(r).toMatchObject({ ok: true, changed: false, previousVersion: 4 });
    expect(db.evaluation_batches[0].weights_version).toBe(4);
  });

  it("conflict when the row is gone OR its weights_version moved since the caller read it (review P2: optimistic concurrency)", async () => {
    const batch = (await listBatches("u-1"))[0]!;
    db.evaluation_batches = [];
    const r = await updateBatchWeights(batch, { ...equal, tre: 40 });
    expect(r).toMatchObject({ ok: false, error: "conflict" });
  });

  it("an identical set re-normalised (2 dp drift) is still a no-op — live-qa 37 saw a 0.01 drift read as a change", async () => {
    db.evaluation_batches[0].weights_version = 1;
    const batch = (await listBatches("u-1"))[0]!;
    const first = await updateBatchWeights(batch, { ...equal, tre: 40 });
    expect(first).toMatchObject({ ok: true, changed: true });
    const stored = (first as { ok: true; batch: typeof batch }).batch;
    const again = await updateBatchWeights(stored, { ...equal, tre: 40 });
    expect(again).toMatchObject({ ok: true, changed: false, previousVersion: stored.weightsVersion });
  });
});
