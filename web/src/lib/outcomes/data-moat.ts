// Data-moat metrics (G21 P3-A, goal doc § 0 "the moat is … longitudinal
// history"): the six counts /admin/funnel's "Data moat" section and
// /api/status `data_moat` publish.
//
//   companies                 projects rows
//   snapshots                 svi_snapshots rows
//   evidence_records          evidence_records rows (0417) — the Claim ≠
//                             Evidence graph; the legacy svi_dimension_evidence
//                             count stays on the funnel's own row
//   longitudinal_companies    projects with ≥ 2 snapshots ≥ 30 days apart
//   known_outcomes            startup_outcomes rows with status confirmed
//   proposals_pending         startup_outcomes rows with status proposed
//
// Five `head: true` COUNT queries + one bounded (project_id, snapshot_date)
// scan for the longitudinal count, cached 10 minutes per process so the
// public /api/status (30 s CDN cache) never becomes a DB hammer. Every
// count is null when its query fails (a missing 0427 table reads as null,
// never a fake zero); `computeLongitudinal` is pure and unit-tested.

export interface DataMoatMetrics {
  companies: number | null;
  snapshots: number | null;
  evidence_records: number | null;
  longitudinal_companies: number | null;
  known_outcomes: number | null;
  proposals_pending: number | null;
  /** True when the longitudinal scan hit its row cap (the count is a floor). */
  longitudinal_capped: boolean;
  checked_at: string;
  warnings: string[];
}

export const DATA_MOAT_TTL_MS = 10 * 60 * 1000;
export const LONGITUDINAL_MIN_GAP_DAYS = 30;
export const LONGITUDINAL_SCAN_LIMIT = 20_000;

const DAY_MS = 24 * 60 * 60 * 1000;

let cache: { value: DataMoatMetrics; at: number } | null = null;

export function _resetDataMoatCache(): void {
  cache = null;
}

export interface SnapshotDateRow {
  project_id: string | null;
  snapshot_date: string;
}

/** Pure: projects whose earliest and latest snapshot are ≥ `minGapDays` apart. */
export function computeLongitudinal(rows: readonly SnapshotDateRow[], minGapDays = LONGITUDINAL_MIN_GAP_DAYS): number {
  const span = new Map<string, { min: number; max: number }>();
  for (const r of rows) {
    if (!r.project_id) continue;
    const t = Date.parse(r.snapshot_date);
    if (!Number.isFinite(t)) continue;
    const cur = span.get(r.project_id);
    if (!cur) span.set(r.project_id, { min: t, max: t });
    else {
      if (t < cur.min) cur.min = t;
      if (t > cur.max) cur.max = t;
    }
  }
  let n = 0;
  for (const s of span.values()) if (s.max - s.min >= minGapDays * DAY_MS) n += 1;
  return n;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DataMoatDb = { from(table: string): any };

async function countRows(db: DataMoatDb, table: string, refine: (q: any) => any = (q) => q): Promise<number | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = await refine(db.from(table).select("id", { count: "exact", head: true }));
  if (!res || res.error) throw new Error(`${table}: ${res?.error?.message ?? "query failed"}`);
  return typeof res.count === "number" ? res.count : null;
}

export function emptyDataMoat(now: Date = new Date()): DataMoatMetrics {
  return { companies: null, snapshots: null, evidence_records: null, longitudinal_companies: null, known_outcomes: null, proposals_pending: null, longitudinal_capped: false, checked_at: now.toISOString(), warnings: [] };
}

/** Uncached read — the reader behind `readDataMoat`. Never throws. */
export async function computeDataMoat(db: DataMoatDb | null, now: Date = new Date()): Promise<DataMoatMetrics> {
  const out = emptyDataMoat(now);
  if (!db) {
    out.warnings.push("supabase not configured");
    return out;
  }
  const safe = async (label: keyof DataMoatMetrics, fn: () => Promise<number | null>) => {
    try {
      (out as unknown as Record<string, unknown>)[label] = await fn();
    } catch (err) {
      out.warnings.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  await Promise.all([
    safe("companies", () => countRows(db, "projects")),
    safe("snapshots", () => countRows(db, "svi_snapshots")),
    safe("evidence_records", () => countRows(db, "evidence_records")),
    safe("known_outcomes", () => countRows(db, "startup_outcomes", (q) => q.eq("status", "confirmed"))),
    safe("proposals_pending", () => countRows(db, "startup_outcomes", (q) => q.eq("status", "proposed"))),
    safe("longitudinal_companies", async () => {
      const res = await db.from("svi_snapshots").select("project_id, snapshot_date").not("project_id", "is", null).order("snapshot_date", { ascending: false }).limit(LONGITUDINAL_SCAN_LIMIT);
      if (!res || res.error) throw new Error(res?.error?.message ?? "query failed");
      const rows = (res.data ?? []) as SnapshotDateRow[];
      out.longitudinal_capped = rows.length >= LONGITUDINAL_SCAN_LIMIT;
      return computeLongitudinal(rows);
    }),
  ]);
  return out;
}

/** Cached 10 min. `db` defaults to the service-role client. */
export async function readDataMoat(db?: DataMoatDb | null, opts: { now?: Date; force?: boolean } = {}): Promise<DataMoatMetrics> {
  const now = opts.now ?? new Date();
  if (!opts.force && cache && now.getTime() - cache.at < DATA_MOAT_TTL_MS) return cache.value;
  let client: DataMoatDb | null | undefined = db;
  if (client === undefined) {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    client = getSupabaseAdmin();
  }
  const value = await computeDataMoat(client ?? null, now);
  cache = { value, at: now.getTime() };
  return value;
}

/** The public shape for /api/status — counts and the check time only. */
export function dataMoatForStatus(m: DataMoatMetrics): Omit<DataMoatMetrics, "warnings"> {
  const { warnings: _w, ...rest } = m;
  void _w;
  return rest;
}
