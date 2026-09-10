// progress-shared — client-safe types + pure helpers for the Evaluator
// Progress Radar (T0273). No `server-only`, no data access: imported by the
// server builder (progress-radar.ts), the email renderer (progress-email.ts)
// and the /workspace/evaluations client (Δ column, sparkline, panel).

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProgressEvaluationRow {
  id: string;
  projectId: string;
  projectName: string;
  projectSlug: string;
  /** `projects.stage` — the fallback stage when there are no snapshots. */
  projectStage: number | null;
  label: string | null;
}

export interface ProgressSnapshotRow {
  project_id: string;
  svi_total: number | null;
  stage: number | null;
  /** Some snapshot writers put the growth phase in analysis_json. */
  current_phase?: number | null;
  created_at: string;
}

export interface ProgressReportRow {
  evaluation_id: string;
  kind: "full" | "rescore";
  svi_total: number | null;
  created_at: string;
}

export interface ProgressMatchRow {
  project_id: string | null;
  ref_kind: "grant" | "program";
  ref_id: string;
  closes_at: string | null;
  first_seen_at: string;
  score: number;
  status_at_match?: string | null;
}

export interface ProgressRefMeta {
  ref_kind: "grant" | "program";
  ref_id: string;
  name: string;
  url: string | null;
}

export interface ProgressDeadline {
  evaluationId: string;
  projectId: string;
  startup: string;
  refKind: "grant" | "program";
  refId: string;
  name: string;
  closesAt: string;
  daysLeft: number;
  url: string | null;
}

export interface EvaluatorProgressItem {
  evaluationId: string;
  projectId: string;
  projectSlug: string;
  name: string;
  label: string | null;
  sviNow: number | null;
  sviPrev: number | null;
  /** sviNow − sviPrev; null when fewer than two snapshots exist. */
  delta: number | null;
  stageNow: number | null;
  stagePrev: number | null;
  stageChanged: boolean;
  /** evidence_items rows created since the period start. */
  newEvidence: number;
  lastReport: { at: string; svi: number | null; kind: "full" | "rescore" } | null;
  money: {
    nextDeadline: ProgressDeadline | null;
    /** Dated deadlines still ahead for this startup. */
    deadlinesAhead: number;
    /** funding_matches first seen since the period start. */
    newMatches: number;
  };
  /** Last 8 snapshot totals, oldest first (sparkline). */
  scoreHistory: number[];
}

export interface EvaluatorProgress {
  userId: string;
  /** ISO — Monday 00:00 UTC of the ISO week containing `now`. */
  periodStart: string;
  periodEnd: string;
  items: EvaluatorProgressItem[];
  /** Top 5 by |Δ| (Δ ≠ 0). */
  movers: EvaluatorProgressItem[];
  /** Next 5 dated deadlines across every tracked startup. */
  deadlines: ProgressDeadline[];
  /** funding_matches first seen this period, all startups. */
  newMatches: number;
  /** evidence_items created this period, all startups. */
  newEvidence: number;
  digest_ready: boolean;
}

export interface ProgressStore {
  listEvaluations(userId: string): Promise<ProgressEvaluationRow[]>;
  /** Newest first, ≥ 8 per project (the caller trims). */
  listSnapshots(projectIds: string[]): Promise<ProgressSnapshotRow[]>;
  countEvidenceSince(projectIds: string[], sinceIso: string): Promise<Map<string, number>>;
  /** Newest first. */
  listReports(userId: string): Promise<ProgressReportRow[]>;
  listMatches(userId: string, projectIds: string[]): Promise<ProgressMatchRow[]>;
  resolveRefs(refs: Array<{ ref_kind: "grant" | "program"; ref_id: string }>): Promise<ProgressRefMeta[]>;
  claimSend(args: { userId: string; periodStart: string; periodEnd: string; payload: Record<string, unknown> }): Promise<"claimed" | "dupe" | "error">;
  releaseSend(args: { userId: string; periodStart: string }): Promise<void>;
}

export interface BuildProgressOptions {
  userId: string;
  now?: Date;
  /** Raw Supabase-like client; defaults to getSupabaseAdmin(). */
  db?: SupabaseLike | null;
  /** Full store override (tests). */
  store?: ProgressStore | null;
}

/** Minimal Supabase surface the default store uses. */
export interface SupabaseLike {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const SCORE_HISTORY_LEN = 8;
export const MOVERS_LIMIT = 5;
export const DEADLINES_LIMIT = 5;
const DAY_MS = 86_400_000;

// ─── Pure helpers (exported for tests + the email) ───────────────────────────

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Monday 00:00 UTC of the ISO week containing `now`. */
export function periodStartFor(now: Date): Date {
  const day = startOfUtcDay(now);
  const dow = day.getUTCDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  return new Date(day.getTime() - back * DAY_MS);
}

export function parseIsoDay(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Δ as "▲ +3.2" / "▼ −1.0" / "—" for tables and emails. */
export function formatDelta(delta: number | null): string {
  if (delta == null) return "—";
  if (delta === 0) return "— 0";
  const arrow = delta > 0 ? "▲" : "▼";
  const sign = delta > 0 ? "+" : "−";
  return `${arrow} ${sign}${Math.abs(round1(delta))}`;
}

/** Sort key: |Δ| desc, then name asc — pinned by the movers test. */
export function rankMovers(items: EvaluatorProgressItem[], limit = MOVERS_LIMIT): EvaluatorProgressItem[] {
  return items
    .filter((i) => i.delta != null && i.delta !== 0)
    .sort((a, b) => Math.abs(b.delta as number) - Math.abs(a.delta as number) || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// ─── Notification / email payload helpers ────────────────────────────────────

/** Compact payload stored on the send row and on the in-app notification. */
export function progressNotificationPayload(p: EvaluatorProgress): Record<string, unknown> {
  return {
    title: progressHeadline(p),
    href: "/workspace/evaluations",
    startups: p.items.length,
    moved: p.movers.length,
    new_matches: p.newMatches,
    movers: p.movers.map((m) => ({
      evaluation_id: m.evaluationId,
      name: m.name,
      svi: m.sviNow,
      delta: m.delta,
      stage: m.stageNow,
      stage_changed: m.stageChanged,
    })),
    deadlines: p.deadlines.map((d) => ({
      startup: d.startup,
      name: d.name,
      closes_at: d.closesAt,
      days_left: d.daysLeft,
      ref_kind: d.refKind,
      ref_id: d.refId,
      url: d.url,
    })),
  };
}

/** One line for the notification title + email subject tail. */
export function progressHeadline(p: EvaluatorProgress): string {
  const m = p.items.length;
  if (p.movers.length > 0) {
    return `Your weekly progress radar — ${p.movers.length} of ${m} startup${m === 1 ? "" : "s"} moved`;
  }
  const k = p.deadlines.length;
  return `Your weekly progress radar — no movement this week, ${k} deadline${k === 1 ? "" : "s"} ahead`;
}

export function progressDedupeKey(userId: string, periodStart: string): string {
  return `evaluator_progress:${userId}:${periodStart.slice(0, 10)}`;
}

// ─── Audience ────────────────────────────────────────────────────────────────

/**
 * `app_users.account_type` values that may hold evaluations — mirrors
 * EVALUATOR_ACCOUNT_TYPES in lib/evaluations.ts (server-only, so the set is
 * repeated here for the client-safe module; the test pins them equal).
 */
export const EVALUATOR_ACCOUNT_TYPES_SHARED: ReadonlySet<string> = new Set([
  "investor",
  "investor_angel",
  "investor_vc",
  "accelerator",
  "incubator",
  "advisor",
  "service_provider",
]);

/** `app_users.segment` values that count as evaluators (0073 enum). */
export const EVALUATOR_SEGMENTS: ReadonlySet<string> = new Set(["investor_angel", "investor_vc", "advisor", "accelerator"]);

/** Persona filter for the weekly cron audience (account_type OR segment). */
export function isEvaluatorPersona(u: { account_type?: string | null; segment?: string | null }): boolean {
  if (u.account_type && EVALUATOR_ACCOUNT_TYPES_SHARED.has(u.account_type)) return true;
  if (u.segment && EVALUATOR_SEGMENTS.has(u.segment)) return true;
  return false;
}
