// G36 tick 3 — stop a report run whose owner was deleted mid-run.
//
// Incident 2026-11-25 (origin 4103): the live-QA teardown erased its
// throwaway account while the evaluation batch runner was scoring that
// account's one-item batch. `evaluation_batches` / `projects` cascade from
// `app_users`, so the parent rows vanished — but the pipeline kept running
// for ~10 minutes (15 model calls, AI spend on deleted data), every
// `ai_runs` / chapter-cache write failed its FK, the assembled report insert
// failed with 23503 and the runner logged `report_persistence_unconfirmed`
// as a real failure (error-digest noise). The same happens when a real user
// erases their account, or a project, while a background run is in flight.
//
// The seam: a `RunCancellation` built from a cheap liveness probe (one
// `select id … where id = ?` per parent row). Callers that run in the
// background (the batch runner) hand it to `runTrustReportForProject`; the
// pipeline then
//   * probes before the run and at every wave boundary / model call
//     (throttled, shared in-flight probe — a handful of single-row lookups
//     per run, never one per call),
//   * refuses every further model call once a parent is gone (sticky),
//   * on ANY failure re-probes (forced) and, when a parent is gone, throws
//     `ReportRunCancelledError` instead of the raw error — the caller logs
//     one info line and moves on (no error-digest line, no retry, no alert,
//     no charge, no refund).
// A probe that cannot run (DB blip, odd mock) reads as "still there":
// a real failure on a parent that still exists keeps failing loudly.

export const OWNER_DELETED = "owner_deleted";

/** Thrown when a parent row (account / project / batch / item) was deleted while the run was in flight. */
export class ReportRunCancelledError extends Error {
  readonly code = OWNER_DELETED;
  constructor(readonly missing: string) {
    super(`${OWNER_DELETED}: ${missing} was deleted while the report run was in flight`);
    this.name = "ReportRunCancelledError";
  }
}

export function isReportRunCancelled(err: unknown): err is ReportRunCancelledError {
  if (err instanceof ReportRunCancelledError) return true;
  return typeof err === "object" && err !== null && (err as { name?: unknown }).name === "ReportRunCancelledError";
}

/**
 * Resolves the label of the first parent row that no longer exists, or null
 * when every parent is still there OR the lookup could not run. Never throws.
 */
export type OwnerLivenessProbe = () => Promise<string | null>;

export interface LivenessRow {
  table: string;
  id: string | number;
  /** Human label for the log line (`project`, `batch owner`, …). */
  label?: string;
}

/** The narrow PostgREST surface the probe needs (supabase-js satisfies it). */
export interface LivenessDb {
  from(table: string): unknown;
}

type SingleQuery = { select(cols: string): { eq(col: string, val: unknown): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> } } };

/** One `select id … where id = ?` per row, in parallel. Unknown (error / throw) ≠ deleted. */
export function rowLivenessProbe(db: LivenessDb | null | undefined, rows: LivenessRow[]): OwnerLivenessProbe {
  const live = rows.filter((r) => r.id !== null && r.id !== undefined && r.id !== "");
  return async () => {
    if (!db || live.length === 0) return null;
    const missing = await Promise.all(
      live.map(async (r) => {
        try {
          const { data, error } = await (db.from(r.table) as SingleQuery).select("id").eq("id", r.id).maybeSingle();
          if (error) return null;
          return data ? null : (r.label ?? r.table);
        } catch {
          return null;
        }
      }),
    );
    return missing.find((m): m is string => m !== null) ?? null;
  };
}

/** Default spacing between two un-forced probes (a run makes ~40 model calls over ~7 min). */
export const LIVENESS_MIN_INTERVAL_MS = 10_000;

export class RunCancellation {
  private missingLabel: string | null = null;
  private lastProbeAt = Number.NEGATIVE_INFINITY;
  private inFlight: Promise<boolean> | null = null;
  private probes = 0;

  constructor(
    private readonly probe: OwnerLivenessProbe,
    private readonly opts: { minIntervalMs?: number; now?: () => number } = {},
  ) {}

  /** True once a probe saw a parent row gone (sticky). */
  get cancelled(): boolean {
    return this.missingLabel !== null;
  }

  /** Which parent was gone (null while the run may continue). */
  get missing(): string | null {
    return this.missingLabel;
  }

  /** How many probes actually ran (tests / diagnostics). */
  get probeCount(): number {
    return this.probes;
  }

  /**
   * Resolve true when the run must stop. Un-forced calls probe at most once
   * per `minIntervalMs`; concurrent callers share one in-flight probe.
   * `force` (before persistence / after a failure) probes now.
   */
  check(force = false): Promise<boolean> {
    if (this.missingLabel !== null) return Promise.resolve(true);
    if (this.inFlight) return this.inFlight;
    const now = (this.opts.now ?? Date.now)();
    if (!force && now - this.lastProbeAt < (this.opts.minIntervalMs ?? LIVENESS_MIN_INTERVAL_MS)) return Promise.resolve(false);
    this.lastProbeAt = now;
    this.probes += 1;
    const run = (async () => {
      try {
        const gone = await this.probe();
        if (gone) this.missingLabel = gone;
      } catch {
        /* unknown ≠ deleted */
      } finally {
        this.inFlight = null;
      }
      return this.missingLabel !== null;
    })();
    this.inFlight = run;
    return run;
  }

  error(): ReportRunCancelledError {
    return new ReportRunCancelledError(this.missingLabel ?? "owner");
  }

  async throwIfCancelled(force = false): Promise<void> {
    if (await this.check(force)) throw this.error();
  }

  /** Synchronous gate (model-call metering): throws only once a probe already saw the deletion. */
  throwIfCancelledSync(): void {
    if (this.missingLabel !== null) throw this.error();
  }
}

/**
 * `err` re-classified: a `ReportRunCancelledError` when the run was (or, on a
 * forced re-probe, now turns out to be) orphaned; null when the failure is
 * genuine and must surface as itself.
 */
export async function ownerDeletedCause(err: unknown, cancellation: RunCancellation | null | undefined): Promise<ReportRunCancelledError | null> {
  if (isReportRunCancelled(err)) return err;
  if (!cancellation) return null;
  try {
    return (await cancellation.check(true)) ? cancellation.error() : null;
  } catch {
    return null;
  }
}

/** The parents of one evaluation-batch item run (all cascade from app_users). */
export function evaluationBatchItemProbe(
  db: LivenessDb | null | undefined,
  args: { itemId: number; batchId: string; ownerUserId: string; projectId: string | null },
): OwnerLivenessProbe {
  return rowLivenessProbe(db, [
    { table: "evaluation_batch_items", id: args.itemId, label: "batch item" },
    { table: "evaluation_batches", id: args.batchId, label: "batch" },
    { table: "app_users", id: args.ownerUserId, label: "batch owner" },
    ...(args.projectId ? [{ table: "projects", id: args.projectId, label: "project" }] : []),
  ]);
}
