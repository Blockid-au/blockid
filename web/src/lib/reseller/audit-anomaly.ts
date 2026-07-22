// Reseller audit-log anomaly detector — P10_hardening dry-run primitive per
// plan Verification #5 (docs/plans/reseller-module-plan.md line 1223):
// "anomaly alert triggers at > 200 subject-reads/week (simulate)."
//
// Pure — no DB, no IO. Consumes reseller_audit_log rows already selected by
// the caller (weekly digest cron, spec harness, or ops one-shot) and returns
// per-(reseller, actor) and per-(reseller, subject) rollups that exceed a
// configurable threshold within a rolling window. The digest cron layer maps
// these to email lines; specs assert on the shape.
//
// Two detectors on the same input:
//   detectActorHotspots  — one reseller admin reading many subjects in the
//                          window (scraping the customer list).
//   detectSubjectHotspots — one customer being repeatedly viewed by any
//                          number of actors (targeted probing).
//
// Default threshold matches plan line 1223 (>200 subject-reads/week).

/* ------------------------------------------------------------------------- */
/* Shape                                                                     */
/* ------------------------------------------------------------------------- */

export interface AuditLogRow {
  reseller_id: string;
  actor_user_id: string;
  subject_user_id: string | null;
  action: string;
  created_at: string;
}

export interface AnomalyOptions {
  /** Inclusive lower bound on the read count to flag. Default 200. */
  threshold?: number;
  /** Rolling window in days. Default 7. */
  windowDays?: number;
  /** Anchor for the window end. Defaults to now. */
  now?: Date;
  /**
   * Only count rows whose `action` is in this allowlist. Defaults to the two
   * privileged-read actions (view_customer_drawer + reveal_email). Pass an
   * empty array to count every action.
   */
  actions?: string[];
}

export interface ActorHotspot {
  reseller_id: string;
  actor_user_id: string;
  count: number;
  distinct_subjects: number;
  actions: string[];
  window_start: string;
  window_end: string;
  threshold: number;
}

export interface SubjectHotspot {
  reseller_id: string;
  subject_user_id: string;
  count: number;
  distinct_actors: number;
  actions: string[];
  window_start: string;
  window_end: string;
  threshold: number;
}

/* ------------------------------------------------------------------------- */
/* Constants                                                                 */
/* ------------------------------------------------------------------------- */

export const DEFAULT_ANOMALY_THRESHOLD = 200;
export const DEFAULT_ANOMALY_WINDOW_DAYS = 7;
export const DEFAULT_ANOMALY_ACTIONS: readonly string[] = [
  "view_customer_drawer",
  "reveal_email",
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------------- */
/* Window helper (exported so specs can pin the boundary)                    */
/* ------------------------------------------------------------------------- */

export interface AnomalyWindow {
  start: Date;
  end: Date;
  threshold: number;
  actions: Set<string> | null; // null = wildcard
}

export function resolveWindow(opts: AnomalyOptions = {}): AnomalyWindow {
  const end = opts.now ?? new Date();
  const days = Number.isFinite(opts.windowDays) && (opts.windowDays as number) > 0
    ? (opts.windowDays as number)
    : DEFAULT_ANOMALY_WINDOW_DAYS;
  const start = new Date(end.getTime() - days * MS_PER_DAY);
  const rawThreshold = Number.isFinite(opts.threshold) && (opts.threshold as number) > 0
    ? Math.floor(opts.threshold as number)
    : DEFAULT_ANOMALY_THRESHOLD;
  const actionList = opts.actions;
  const actions = actionList === undefined
    ? new Set<string>(DEFAULT_ANOMALY_ACTIONS)
    : actionList.length === 0
      ? null
      : new Set<string>(actionList);
  return { start, end, threshold: rawThreshold, actions };
}

/* ------------------------------------------------------------------------- */
/* Internal: pre-filter rows to the window + action set                      */
/* ------------------------------------------------------------------------- */

interface FilteredRow {
  reseller_id: string;
  actor_user_id: string;
  subject_user_id: string | null;
  action: string;
}

function filterRows(rows: readonly AuditLogRow[], window: AnomalyWindow): FilteredRow[] {
  const startMs = window.start.getTime();
  const endMs = window.end.getTime();
  const out: FilteredRow[] = [];
  for (const r of rows) {
    if (!r.reseller_id || !r.actor_user_id || !r.action) continue;
    if (window.actions && !window.actions.has(r.action)) continue;
    const ts = Date.parse(r.created_at);
    if (!Number.isFinite(ts)) continue;
    if (ts < startMs || ts > endMs) continue;
    out.push({
      reseller_id: r.reseller_id,
      actor_user_id: r.actor_user_id,
      subject_user_id: r.subject_user_id,
      action: r.action,
    });
  }
  return out;
}

function sortStrings(input: Set<string>): string[] {
  return [...input].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/* ------------------------------------------------------------------------- */
/* detectActorHotspots — reseller admin reading too many subjects            */
/* ------------------------------------------------------------------------- */

export function detectActorHotspots(
  rows: readonly AuditLogRow[],
  opts: AnomalyOptions = {},
): ActorHotspot[] {
  const window = resolveWindow(opts);
  const filtered = filterRows(rows, window);

  interface Bucket {
    reseller_id: string;
    actor_user_id: string;
    count: number;
    subjects: Set<string>;
    actions: Set<string>;
  }
  const buckets = new Map<string, Bucket>();
  for (const r of filtered) {
    const key = `${r.reseller_id}|${r.actor_user_id}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        reseller_id: r.reseller_id,
        actor_user_id: r.actor_user_id,
        count: 0,
        subjects: new Set(),
        actions: new Set(),
      };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (r.subject_user_id) bucket.subjects.add(r.subject_user_id);
    bucket.actions.add(r.action);
  }

  const window_start = window.start.toISOString();
  const window_end = window.end.toISOString();
  const out: ActorHotspot[] = [];
  for (const b of buckets.values()) {
    if (b.count < window.threshold) continue;
    out.push({
      reseller_id: b.reseller_id,
      actor_user_id: b.actor_user_id,
      count: b.count,
      distinct_subjects: b.subjects.size,
      actions: sortStrings(b.actions),
      window_start,
      window_end,
      threshold: window.threshold,
    });
  }
  return out.sort((a, b) => b.count - a.count || a.actor_user_id.localeCompare(b.actor_user_id));
}

/* ------------------------------------------------------------------------- */
/* detectSubjectHotspots — one customer being probed repeatedly              */
/* ------------------------------------------------------------------------- */

export function detectSubjectHotspots(
  rows: readonly AuditLogRow[],
  opts: AnomalyOptions = {},
): SubjectHotspot[] {
  const window = resolveWindow(opts);
  const filtered = filterRows(rows, window);

  interface Bucket {
    reseller_id: string;
    subject_user_id: string;
    count: number;
    actors: Set<string>;
    actions: Set<string>;
  }
  const buckets = new Map<string, Bucket>();
  for (const r of filtered) {
    if (!r.subject_user_id) continue;
    const key = `${r.reseller_id}|${r.subject_user_id}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        reseller_id: r.reseller_id,
        subject_user_id: r.subject_user_id,
        count: 0,
        actors: new Set(),
        actions: new Set(),
      };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    bucket.actors.add(r.actor_user_id);
    bucket.actions.add(r.action);
  }

  const window_start = window.start.toISOString();
  const window_end = window.end.toISOString();
  const out: SubjectHotspot[] = [];
  for (const b of buckets.values()) {
    if (b.count < window.threshold) continue;
    out.push({
      reseller_id: b.reseller_id,
      subject_user_id: b.subject_user_id,
      count: b.count,
      distinct_actors: b.actors.size,
      actions: sortStrings(b.actions),
      window_start,
      window_end,
      threshold: window.threshold,
    });
  }
  return out.sort((a, b) => b.count - a.count || a.subject_user_id.localeCompare(b.subject_user_id));
}

/* ------------------------------------------------------------------------- */
/* Rollup for the weekly digest email                                        */
/* ------------------------------------------------------------------------- */

export interface AnomalySummary {
  actor_hotspots: ActorHotspot[];
  subject_hotspots: SubjectHotspot[];
  window_start: string;
  window_end: string;
  threshold: number;
  total_rows_in_window: number;
}

export function buildAnomalySummary(
  rows: readonly AuditLogRow[],
  opts: AnomalyOptions = {},
): AnomalySummary {
  const window = resolveWindow(opts);
  const filtered = filterRows(rows, window);
  return {
    actor_hotspots: detectActorHotspots(rows, opts),
    subject_hotspots: detectSubjectHotspots(rows, opts),
    window_start: window.start.toISOString(),
    window_end: window.end.toISOString(),
    threshold: window.threshold,
    total_rows_in_window: filtered.length,
  };
}
