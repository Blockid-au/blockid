// Weekly digest snapshot persistence (P11.13).
//
// After P11.1..P11.12 shipped all 13 canonical weekly_digest_kpis
// (reseller-module-goal.md), the Monday cron computes every KPI from scratch
// on each run and hands the aggregate to admin@blockid.au via HTML + CSV.
// Nothing on the host persists the raw numeric envelope: week N+1 has no way
// to compute a delta against week N without re-querying every fact table.
// This module closes that gap by shaping the digest response envelope into a
// serialisable snapshot line the cron appends to a JSONL file. Downstream
// consumers (future trend module, ops JSONL grep, incident reconstruction)
// then read the append-only history without re-running Supabase queries.
//
// Kept dependency-free so the JSONL shape can be regression-tested without
// touching Supabase, nodemailer, or the file system — mirrors sandbox-share-
// of-budget.ts (P11.12) + ltv-cac.ts (P11.11) + cohort-velocity.ts (P11.10).
// The cron route owns the fs.appendFileSync call so this module never touches
// disk in isolation.

/**
 * Envelope of the weekly-digest response body. Kept loosely typed since every
 * KPI section can be present, skipped, or absent (older snapshots miss newer
 * sections); consumers walking the JSONL history must handle each shape.
 */
export interface DigestSnapshotEnvelope {
  readonly [key: string]: unknown;
}

/**
 * One JSONL row. `captured_at` is the digest run timestamp (ISO); `week` is
 * the ISO week key from isoWeekKey(); `reseller_count` mirrors the envelope
 * top-level count so a snapshot can be triaged without unpacking `envelope`;
 * `emailed` records whether the digest actually sent (skip_email=1 dry-runs
 * still snapshot so a Monday dry-run leaves a diff-able row).
 */
export interface DigestSnapshot {
  readonly captured_at: string;
  readonly week: string;
  readonly reseller_count: number;
  readonly emailed: boolean;
  readonly envelope: DigestSnapshotEnvelope;
}

export interface BuildDigestSnapshotInput {
  readonly capturedAt: Date;
  readonly week: string;
  readonly envelope: DigestSnapshotEnvelope;
}

const KNOWN_KPI_SECTIONS = [
  "budget_utilization",
  "tier_mix",
  "commission_cleared_mtd",
  "clawback_exposure",
  "attributed_mrr",
  "attributed_net_contribution",
  "attributed_churn_30d",
  "ledger_drift_events",
  "gst_reconciliation_delta",
  "cohort_velocity",
  "ltv_cac_per_reseller",
  "sandbox_share_of_budget",
  "contribution_margin_pct",
] as const;

export type KnownKpiSection = (typeof KNOWN_KPI_SECTIONS)[number];

/** Freeze the canonical list so consumers can iterate without redefining. */
export const DIGEST_SNAPSHOT_KPI_SECTIONS: readonly KnownKpiSection[] =
  KNOWN_KPI_SECTIONS;

function safeInt(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function safeBool(n: unknown): boolean {
  return n === true;
}

function safeString(n: unknown): string {
  return typeof n === "string" ? n : "";
}

/**
 * Fold the raw envelope into a snapshot row. `capturedAt` is normalised to
 * ISO with a runtime guard so a stray Invalid Date does not corrupt the
 * JSONL file. `reseller_count` and `emailed` are copied out of the envelope
 * to the top level so callers grepping the JSONL for "emailed":true or
 * "reseller_count":0 do not have to unpack `envelope` first.
 */
export function buildDigestSnapshot(
  input: BuildDigestSnapshotInput,
): DigestSnapshot {
  const capturedMs = input.capturedAt.getTime();
  const captured_at = Number.isFinite(capturedMs)
    ? new Date(capturedMs).toISOString()
    : new Date(0).toISOString();
  const envelope = input.envelope ?? {};
  return {
    captured_at,
    week: safeString(input.week),
    reseller_count: safeInt((envelope as Record<string, unknown>).reseller_count),
    emailed: safeBool((envelope as Record<string, unknown>).emailed),
    envelope,
  };
}

/**
 * Emit exactly one JSONL row (one JSON object + trailing "\n"). Callers pass
 * the string straight to fs.appendFileSync so a partial write is impossible
 * — a mid-write crash truncates the newline at worst, which any JSONL parser
 * treats as the end of the file.
 */
export function serialiseDigestSnapshot(snapshot: DigestSnapshot): string {
  return `${JSON.stringify(snapshot)}\n`;
}

/**
 * Walk a raw JSONL file contents string and return the newest parseable
 * snapshot row (scanning bottom-up so a corrupted trailing line does not
 * mask an older good row). Returns null when every line is empty or
 * corrupted. The route reads the file via fs.readFileSync and hands the
 * text in here; keeping the walker pure lets vitest exercise it without
 * touching disk. Handles both trailing-newline and no-trailing-newline
 * shapes for defensive reads against a mid-write truncation.
 */
export function readLastDigestSnapshot(text: string): DigestSnapshot | null {
  if (typeof text !== "string" || text.length === 0) return null;
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const parsed = parseDigestSnapshotLine(lines[i]);
    if (parsed) return parsed;
  }
  return null;
}

/**
 * Walk a raw JSONL file contents string and return up to the newest N
 * parseable snapshots ordered oldest → newest (natural time flow, so a
 * downstream trend consumer can iterate left → right for chronological
 * folds). Bottom-up scan collects parseable rows until N accumulate, then
 * reverses so the caller does not have to. Corrupted lines (partial write,
 * non-JSON, missing envelope) are silently skipped — a mid-write truncation
 * on the trailing row yields the previous N good rows rather than throwing.
 * Returns [] on empty input, non-string input, n ≤ 0, or when every line is
 * corrupted. Passing n larger than the row count returns every parseable
 * row (up to that count) rather than padding — the caller checks .length.
 */
export function readLastNDigestSnapshots(
  text: string,
  n: number,
): DigestSnapshot[] {
  if (typeof text !== "string" || text.length === 0) return [];
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return [];
  const cap = Math.floor(n);
  const collected: DigestSnapshot[] = [];
  const lines = text.split("\n");
  for (let i = lines.length - 1; i >= 0 && collected.length < cap; i--) {
    const parsed = parseDigestSnapshotLine(lines[i]);
    if (parsed) collected.push(parsed);
  }
  return collected.reverse();
}

/**
 * Reverse of serialiseDigestSnapshot. Returns null on any parse failure so
 * a corrupted line (partial write, hand-edit, non-JSON row) does not throw
 * inside a consumer's for-loop — the consumer skips and continues.
 */
export function parseDigestSnapshotLine(line: string): DigestSnapshot | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const envelope = obj.envelope;
  if (!envelope || typeof envelope !== "object") return null;
  return {
    captured_at: safeString(obj.captured_at),
    week: safeString(obj.week),
    reseller_count: safeInt(obj.reseller_count),
    emailed: safeBool(obj.emailed),
    envelope: envelope as DigestSnapshotEnvelope,
  };
}

export interface DigestSnapshotSectionState {
  readonly key: KnownKpiSection;
  readonly present: boolean;
  readonly skipped_reason: string | null;
}

/**
 * Triage a snapshot's 12 KPI sections into {present, skipped, absent}. Used
 * by ops JSONL greps and future trend modules to spot systemic skip patterns
 * (e.g. a partner whose LTV/CAC section is skipped 4 weeks running).
 */
export function summariseDigestSnapshot(
  snapshot: DigestSnapshot,
): {
  captured_at: string;
  week: string;
  reseller_count: number;
  emailed: boolean;
  sections: DigestSnapshotSectionState[];
} {
  const env = snapshot.envelope as Record<string, unknown>;
  const sections: DigestSnapshotSectionState[] = KNOWN_KPI_SECTIONS.map((key) => {
    const raw = env[key];
    if (!raw || typeof raw !== "object") {
      return { key, present: false, skipped_reason: null };
    }
    const rec = raw as Record<string, unknown>;
    if (typeof rec.skipped_reason === "string" && rec.skipped_reason.length > 0) {
      return { key, present: false, skipped_reason: rec.skipped_reason };
    }
    return { key, present: true, skipped_reason: null };
  });
  return {
    captured_at: snapshot.captured_at,
    week: snapshot.week,
    reseller_count: snapshot.reseller_count,
    emailed: snapshot.emailed,
    sections,
  };
}
