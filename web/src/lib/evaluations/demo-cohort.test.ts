// demo-cohort (G24-C) — the DB layer over a fake PostgREST builder. Pins:
//   • createDemoBatch writes ONLY projects / evaluations / evaluation_batches /
//     evaluation_batch_items — never svi_analyses, svi_snapshots,
//     evaluation_reports, claims or connector rows — so benchmarks, the
//     assessment pools, the Startup Index, calibration and the outcome
//     signals are excluded BY CONSTRUCTION (the pools read those tables);
//   • the batch is `is_demo`, `done`, 5/5, with no AI call (no report
//     pipeline import is ever touched — the module has no such import);
//   • idempotent: a second call returns the existing batch, creates nothing;
//   • 42703 on is_demo (0436 pending) → migration_pending and the projects
//     inserted so far are rolled back;
//   • deleteDemoBatch removes the batch + only the demo-slug projects of the
//     creator; a non-demo batch is refused;
//   • demoAnalysisForRows / demoJourneyForRows come from the fixture (the
//     L1–L5 spread, the conflicting claim) without any DB read.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const auditMock = vi.fn(async () => ({ id: 1n }));
vi.mock("@/lib/audit", () => ({ appendAudit: (p: unknown) => auditMock(p as never) }));

type Row = Record<string, unknown>;

const db: Record<string, Row[]> = { projects: [], evaluations: [], evaluation_batches: [], evaluation_batch_items: [] };
const writes: Array<{ table: string; op: string }> = [];
const missingColumns = new Set<string>();
let seq = 1;

function builder(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: "select" | "insert" | "delete" = "select";
  let pending: Row[] | null = null;
  let ordering: { col: string; asc: boolean } | null = null;
  let lim: number | null = null;
  let single: "single" | "maybe" | null = null;
  let selected: string[] = [];
  const rows = () => {
    let out = (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
    if (ordering) out = [...out].sort((a, b) => (String(a[ordering!.col]) < String(b[ordering!.col]) ? -1 : 1) * (ordering!.asc ? 1 : -1));
    if (lim != null) out = out.slice(0, lim);
    return out;
  };
  const run = async () => {
    const missing = selected.find((c) => missingColumns.has(`${table}.${c}`)) ?? (pending ?? []).flatMap((r) => Object.keys(r)).find((c) => missingColumns.has(`${table}.${c}`));
    if (missing) return { data: null, error: { code: "42703", message: `column ${table}.${missing} does not exist` } };
    if (op === "insert" && pending) {
      writes.push({ table, op: "insert" });
      const inserted = pending.map((r) => ({ id: r.id ?? `${table}-${seq++}`, created_at: new Date(2026, 8, 21, 0, 0, seq).toISOString(), ...r }));
      (db[table] ??= []).push(...inserted);
      if (single === "single") return { data: { ...inserted[0] }, error: null };
      return { data: inserted.map((r) => ({ ...r })), error: null };
    }
    if (op === "delete") {
      writes.push({ table, op: "delete" });
      const gone = rows();
      db[table] = (db[table] ?? []).filter((r) => !gone.includes(r));
      // Cascades the real schema has: projects → evaluations → items; batches → items.
      if (table === "projects") {
        const pids = new Set(gone.map((r) => String(r.id)));
        const evGone = db.evaluations.filter((e) => pids.has(String(e.project_id)));
        const eids = new Set(evGone.map((e) => String(e.id)));
        db.evaluations = db.evaluations.filter((e) => !pids.has(String(e.project_id)));
        db.evaluation_batch_items = db.evaluation_batch_items.filter((i) => !eids.has(String(i.evaluation_id)));
      }
      if (table === "evaluation_batches") {
        const bids = new Set(gone.map((r) => String(r.id)));
        db.evaluation_batch_items = db.evaluation_batch_items.filter((i) => !bids.has(String(i.batch_id)));
      }
      return { data: gone.map((r) => ({ id: r.id })), error: null };
    }
    const out = rows();
    if (single === "maybe") return { data: out[0] ? { ...out[0] } : null, error: null };
    if (single === "single") return out[0] ? { data: { ...out[0] }, error: null } : { data: null, error: { code: "PGRST116" } };
    return { data: out.map((r) => ({ ...r })), error: null };
  };
  const b: Record<string, unknown> = {
    select(cols?: string) {
      selected = typeof cols === "string" ? cols.split(",").map((c) => c.trim()) : [];
      return b;
    },
    insert(p: Row | Row[]) {
      op = "insert";
      pending = Array.isArray(p) ? p : [p];
      return b;
    },
    delete() {
      op = "delete";
      return b;
    },
    eq(col: string, v: unknown) {
      filters.push((r) => String(r[col]) === String(v));
      return b;
    },
    in(col: string, vals: unknown[]) {
      filters.push((r) => vals.map(String).includes(String(r[col])));
      return b;
    },
    like(col: string, pattern: string) {
      const prefix = pattern.replace(/%$/, "");
      filters.push((r) => String(r[col] ?? "").startsWith(prefix));
      return b;
    },
    or(expr: string) {
      const parts = expr.split(",").map((p) => p.split("."));
      filters.push((r) => parts.some(([col, o, ...rest]) => o === "eq" && String(r[col]) === rest.join(".")));
      return b;
    },
    order(col: string, o?: { ascending?: boolean }) {
      ordering = { col, asc: o?.ascending !== false };
      return b;
    },
    limit(n: number) {
      lim = n;
      return b;
    },
    maybeSingle() {
      single = "maybe";
      return run();
    },
    single() {
      single = "single";
      return run();
    },
    then(ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) {
      return run().then(ok, ko);
    },
  };
  return b;
}

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: (t: string) => builder(t) }) }));

import { DEMO_WRITE_TABLES, createDemoBatch, deleteDemoBatch, demoAnalysisForRows, demoCohortItems, demoJourneyForRows, findDemoBatch, hasDemoBatch } from "./demo-cohort";
import { DEMO_COHORT_NAME, DEMO_STARTUPS } from "./demo-cohort-shared";

beforeEach(() => {
  for (const k of Object.keys(db)) db[k] = [];
  writes.length = 0;
  missingColumns.clear();
  seq = 1;
  auditMock.mockClear();
});

const POOL_TABLES = ["svi_analyses", "svi_snapshots", "evaluation_reports", "claims", "connector_snapshots", "svi_dimension_evidence", "svi_index_snapshots", "startup_outcomes"];

describe("createDemoBatch", () => {
  it("writes only the four allowed tables — never a pool table — and answers created:true with a done, is_demo batch of 5 scored items", async () => {
    const r = await createDemoBatch({ userId: "u-1", orgId: "org-1" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.created).toBe(true);
    expect(r.items).toBe(5);
    expect(r.batch).toMatchObject({ isDemo: true, status: "done", total: 5, doneCount: 5, failedCount: 0, name: DEMO_COHORT_NAME, orgId: "org-1", userId: "u-1" });

    const touched = [...new Set(writes.map((w) => w.table))].sort();
    expect(touched).toEqual([...DEMO_WRITE_TABLES].sort());
    for (const t of POOL_TABLES) expect(touched).not.toContain(t);

    expect(db.projects).toHaveLength(5);
    expect(db.evaluations).toHaveLength(5);
    expect(db.evaluation_batch_items).toHaveLength(5);
    for (const p of db.projects) {
      expect(String(p.slug)).toMatch(/^demo-cohort-/);
      expect(String(p.name)).toMatch(/\(demo\)$/);
      expect(p.abn).toBeUndefined();
      expect(p.is_default).toBe(false);
      expect([1, 2, 3, 4, 5]).toContain(p.verification_level);
    }
    expect([...db.projects.map((p) => p.verification_level)].sort()).toEqual([1, 2, 3, 4, 5]);
    for (const it of db.evaluation_batch_items) {
      expect(it.status).toBe("done");
      expect(typeof it.svi_total).toBe("number");
      expect(it.dimension_scores).toBeTruthy();
      expect(typeof it.scored_at).toBe("string");
      expect(it.report_id).toBeUndefined();
      expect(it.snapshot_id).toBeUndefined();
    }
    for (const ev of db.evaluations) {
      expect(ev.owner_kind).toBe("evaluator");
      expect(ev.founder_email).toBeUndefined();
      expect(String(ev.notes)).toMatch(/^Demo data — fictional/);
    }
    expect(auditMock).toHaveBeenCalledTimes(1);
    expect((auditMock.mock.calls[0] as unknown as [Row])[0]).toMatchObject({ action: "cohort.demo_created", resource_id: r.batch.id });
  });

  it("is idempotent: the second call returns the existing batch and writes nothing", async () => {
    const first = await createDemoBatch({ userId: "u-1" });
    const before = writes.length;
    const second = await createDemoBatch({ userId: "u-1" });
    expect(second.ok && first.ok && second.batch.id === first.batch.id).toBe(true);
    expect(second.ok && second.created).toBe(false);
    expect(writes.length).toBe(before);
    expect(db.projects).toHaveLength(5);
  });

  it("one demo per organisation: a second seat of the same org gets the org's batch", async () => {
    const a = await createDemoBatch({ userId: "u-1", orgId: "org-1" });
    const b = await createDemoBatch({ userId: "u-2", orgId: "org-1" });
    expect(a.ok && b.ok && a.batch.id === b.batch.id).toBe(true);
    expect(b.ok && b.created).toBe(false);
  });

  it("before 0436 (42703 on is_demo): migration_pending and the projects / evaluations are rolled back", async () => {
    missingColumns.add("evaluation_batches.is_demo");
    const r = await createDemoBatch({ userId: "u-1" });
    expect(r).toMatchObject({ ok: false, error: "migration_pending" });
    expect(db.projects).toHaveLength(0);
    expect(db.evaluations).toHaveLength(0);
    expect(db.evaluation_batches).toHaveLength(0);
  });

  it("a leftover demo project bumps the slug suffix instead of failing the create", async () => {
    db.projects.push({ id: "p-old", user_id: "u-1", slug: "demo-cohort-banksiabyte", name: "old" });
    const r = await createDemoBatch({ userId: "u-1" });
    expect(r.ok).toBe(true);
    expect(db.projects.some((p) => p.slug === "demo-cohort-banksiabyte-2")).toBe(true);
    expect(db.evaluation_batch_items).toHaveLength(5);
  });
});

describe("findDemoBatch / hasDemoBatch / deleteDemoBatch", () => {
  it("find → null before a create, the batch after; hasDemoBatch mirrors it", async () => {
    expect(await findDemoBatch("u-1")).toEqual({ ok: true, batch: null });
    expect(await hasDemoBatch("u-1")).toBe(false);
    await createDemoBatch({ userId: "u-1" });
    const f = await findDemoBatch("u-1");
    expect(f.ok && f.batch?.isDemo).toBe(true);
    expect(await hasDemoBatch("u-1")).toBe(true);
  });

  it("before 0436 find answers migration_pending; hasDemoBatch is false", async () => {
    missingColumns.add("evaluation_batches.is_demo");
    expect(await findDemoBatch("u-1")).toEqual({ ok: false, error: "migration_pending" });
    expect(await hasDemoBatch("u-1")).toBe(false);
  });

  it("delete removes the batch, its items and only the creator's demo-slug projects; a real project with the same owner survives", async () => {
    db.projects.push({ id: "p-real", user_id: "u-1", slug: "acme-robotics", name: "Acme" });
    const c = await createDemoBatch({ userId: "u-1" });
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    const r = await deleteDemoBatch(c.batch, "u-1");
    expect(r).toEqual({ ok: true, removedProjects: 5 });
    expect(db.evaluation_batches).toHaveLength(0);
    expect(db.evaluation_batch_items).toHaveLength(0);
    expect(db.evaluations).toHaveLength(0);
    expect(db.projects.map((p) => p.slug)).toEqual(["acme-robotics"]);
    expect(await findDemoBatch("u-1")).toEqual({ ok: true, batch: null });
    expect((auditMock.mock.calls.at(-1) as unknown as [Row])[0]).toMatchObject({ action: "cohort.demo_removed" });
  });

  it("refuses to delete a batch that is not the demo", async () => {
    const c = await createDemoBatch({ userId: "u-1" });
    if (!c.ok) throw new Error("create failed");
    const r = await deleteDemoBatch({ ...c.batch, isDemo: false }, "u-1");
    expect(r).toMatchObject({ ok: false, error: "not_demo" });
    expect(db.evaluation_batches).toHaveLength(1);
  });
});

describe("fixture-backed reads (no DB)", () => {
  it("demoCohortItems: five items, L1–L5, one conflicting claim, one stale connector, every startup scored", () => {
    const items = demoCohortItems();
    expect(items).toHaveLength(5);
    expect(items.map((i) => i.fixture.key)).toEqual(DEMO_STARTUPS.map((s) => s.key));
    expect(items.filter((i) => i.conflictingClaims > 0)).toHaveLength(1);
    expect(items.filter((i) => i.staleConnector)).toHaveLength(1);
    for (const i of items) expect(i.sviTotal).toBeGreaterThan(0);
  });

  it("demoAnalysisForRows maps slugs → confidence / verification / conflicting claims; foreign slugs are skipped", () => {
    const rows = [
      { projectId: "p1", projectSlug: "demo-cohort-numbatpay" },
      { projectId: "p2", projectSlug: "demo-cohort-emberquay-2" },
      { projectId: "p3", projectSlug: "acme-robotics" },
    ];
    const out = demoAnalysisForRows(rows);
    expect(Object.keys(out).sort()).toEqual(["p1", "p2"]);
    expect(out.p1).toMatchObject({ verificationLevel: 2, conflictingClaims: 1, unverifiedMaterialClaims: 1, pendingDims: 0 });
    expect(out.p2).toMatchObject({ verificationLevel: 1, conflictingClaims: 0 });
    expect(typeof out.p1.evidenceConfidence).toBe("number");
  });

  it("demoJourneyForRows carries confidence, verification and the evidence rows per project", () => {
    const j = demoJourneyForRows([{ projectId: "p1", projectSlug: "demo-cohort-banksiabyte" }, { projectId: "p9", projectSlug: "real" }]);
    expect(j.verification.get("p1")).toBe(5);
    expect(j.confidence.get("p1")).toBeGreaterThan(50);
    expect((j.evidence.get("p1") ?? []).length).toBeGreaterThan(5);
    expect(j.evidence.has("p9")).toBe(false);
  });
});
