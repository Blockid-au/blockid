// Investor readiness snapshot helpers (P7b).
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md §P7b
//   "persist last-week readiness snapshot per project so the P7a delta
//    actually has a baseline (new column on startup_phase_progress OR
//    a small svi_readiness_snapshots table)"
//
// This file exposes:
//   - toSnapshotRow(nudgeResult)       — pure NudgeResult -> DB row shape
//   - computeReadinessDelta(prev, cur) — pure delta helper
//   - writeReadinessSnapshot(sb, ...)  — thin insert (service-role)
//   - fetchLatestReadinessSnapshot(sb, ...) — most-recent-first read
//
// Pure helpers own the wire shape + delta rules; the I/O helpers are a
// pass-through over the two so the founder-side weekly digest cron
// (P7a) can call them without recomputing.
//
// Migration: web/supabase/migrations/0113_svi_readiness_snapshots.sql

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReadinessBand } from "./readiness-by-phase";
import type { NudgeMissingItem, NudgeResult } from "./next-steps";

// ---------------------------------------------------------------------------
// DB row shape — mirrors migration 0113 column list
// ---------------------------------------------------------------------------

export type SnapshotSource = "nudge_engine" | "manual" | "cron" | "digest";

export interface ReadinessSnapshotRow {
  id?: string;
  user_id: string;
  project_id: string | null;
  phase_slug: string;
  overall_score: number;
  band: ReadinessBand;
  readiness_by_phase: NudgeResult["readiness_by_phase"];
  missing_top3: NudgeMissingItem[];
  next_action_title: string | null;
  source: SnapshotSource;
  computed_at?: string;
}

export interface ToSnapshotRowOptions {
  userId: string;
  projectId: string | null;
  source?: SnapshotSource;
}

// ---------------------------------------------------------------------------
// Pure: NudgeResult -> snapshot row
// ---------------------------------------------------------------------------

export function toSnapshotRow(
  result: NudgeResult,
  opts: ToSnapshotRowOptions,
): ReadinessSnapshotRow {
  const overall = clampScore(result.readiness_score.overall);
  return {
    user_id: opts.userId,
    project_id: opts.projectId ?? null,
    phase_slug: result.current_phase.slug,
    overall_score: overall,
    band: bandForScore(overall),
    readiness_by_phase: result.readiness_by_phase,
    missing_top3: result.missing.slice(0, 3),
    next_action_title: result.next_action?.title ?? null,
    source: opts.source ?? "nudge_engine",
  };
}

// ---------------------------------------------------------------------------
// Pure: delta between two snapshots (for the digest section)
// ---------------------------------------------------------------------------

export type BandDirection = "up" | "down" | "same";

export interface ReadinessDelta {
  /** current - previous, signed integer in [-100,100]. */
  score_delta: number;
  /** Human-readable summary the digest can drop straight into the email. */
  summary: string;
  /** Movement across the band boundary. */
  band_direction: BandDirection;
  /** ISO of the previous snapshot (echo for the digest footer). */
  previous_computed_at: string | null;
}

const BAND_ORDER: Record<ReadinessBand, number> = {
  "not-ready": 0,
  "warming-up": 1,
  "investor-ready": 2,
};

export function computeReadinessDelta(
  current: ReadinessSnapshotRow,
  previous: ReadinessSnapshotRow | null,
): ReadinessDelta {
  if (!previous) {
    return {
      score_delta: 0,
      summary: "First readiness snapshot — no prior digest to compare against.",
      band_direction: "same",
      previous_computed_at: null,
    };
  }
  const cur = clampScore(current.overall_score);
  const prev = clampScore(previous.overall_score);
  const delta = cur - prev;
  const bandDir = pickBandDirection(current.band, previous.band);
  return {
    score_delta: delta,
    summary: buildDeltaSummary(delta, bandDir, cur),
    band_direction: bandDir,
    previous_computed_at: previous.computed_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// I/O — thin Supabase wrappers (never called from the pure helpers above)
// ---------------------------------------------------------------------------

const TABLE = "svi_readiness_snapshots";

export async function writeReadinessSnapshot(
  supabase: SupabaseClient,
  row: ReadinessSnapshotRow,
): Promise<{ id: string; computed_at: string } | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert(row)
    .select("id, computed_at")
    .maybeSingle();
  if (error || !data) return null;
  return { id: data.id, computed_at: data.computed_at };
}

export interface FetchLatestSnapshotArgs {
  userId: string;
  projectId: string | null;
  /** Optional exclusive upper bound (ISO). Used to fetch the pre-digest baseline. */
  before?: string;
}

export async function fetchLatestReadinessSnapshot(
  supabase: SupabaseClient,
  args: FetchLatestSnapshotArgs,
): Promise<ReadinessSnapshotRow | null> {
  let query = supabase
    .from(TABLE)
    .select(
      "id, user_id, project_id, phase_slug, overall_score, band, readiness_by_phase, missing_top3, next_action_title, source, computed_at",
    )
    .eq("user_id", args.userId)
    .order("computed_at", { ascending: false })
    .limit(1);

  if (args.projectId === null) {
    query = query.is("project_id", null);
  } else {
    query = query.eq("project_id", args.projectId);
  }
  if (args.before) {
    query = query.lt("computed_at", args.before);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) return null;
  return data as ReadinessSnapshotRow;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function clampScore(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function bandForScore(score: number): ReadinessBand {
  if (score >= 75) return "investor-ready";
  if (score >= 50) return "warming-up";
  return "not-ready";
}

function pickBandDirection(
  current: ReadinessBand,
  previous: ReadinessBand,
): BandDirection {
  const a = BAND_ORDER[current];
  const b = BAND_ORDER[previous];
  if (a > b) return "up";
  if (a < b) return "down";
  return "same";
}

function buildDeltaSummary(
  delta: number,
  bandDir: BandDirection,
  currentScore: number,
): string {
  if (delta === 0 && bandDir === "same") {
    return `No change this week — readiness held at ${currentScore}/100.`;
  }
  const signed = delta > 0 ? `+${delta}` : `${delta}`;
  if (bandDir === "up") {
    return `Readiness improved ${signed} points to ${currentScore}/100 — crossed a band boundary upward.`;
  }
  if (bandDir === "down") {
    return `Readiness dropped ${signed} points to ${currentScore}/100 — slipped into a lower readiness band.`;
  }
  const dir = delta > 0 ? "up" : "down";
  return `Readiness moved ${signed} points ${dir} to ${currentScore}/100 (band unchanged).`;
}
