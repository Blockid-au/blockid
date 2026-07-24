// Weekly cohort retention chart for PMF Chapter 5 (P5-cohort).
//
// Closes §1 phase 5 P1 gap "cohort chart auto-draw component" from
// docs/plans/atlassian-standard-mapping-goal.md. The Chapter 5 guide body
// promises a "Retention-cohort chart — auto-drawn from the weekly buckets
// into the DataRoom under traction/" (startup-journey.ts:364) but no
// module existed to compute or render it — founders had to either wait for
// the CDO agent to draft prose or hand-build the matrix in a spreadsheet.
//
// A cohort = the set of users whose earliest signup landed in week W
// (Monday 00:00 UTC to next Monday 00:00 UTC). Retention at week N is the
// unique count of cohort-W users who did any activity in week W+N divided
// by the cohort size. Cell values are decimals in [0,1]; the SVG renderer
// formats them as %.
//
// Design choices worth pinning:
//   - Cohorts are sorted oldest-first so week-0 lands top-left, matching
//     the Mixpanel / Amplitude convention investors already read.
//   - `week_count` clamps the matrix width so a founder with 200 weeks of
//     data does not blow up a report PDF; defaults to 8 (matches the
//     Chapter 5 CTA "eight weeks (or as many as you have)").
//   - Retention at week N > weeks-elapsed-since-cohort is null, not 0, so
//     a young cohort renders as a truncated row rather than a false churn.
//   - Empty cohort weeks are dropped entirely so gaps in signup activity
//     do not shift the row alignment.
//
// Kept dependency-free so both the matrix maths and the SVG text can be
// regression-tested without touching Supabase, React, or a browser DOM
// (mirrors the reseller/cohort-velocity.ts + startup-growth-phases.ts
// posture — pure functions in, string out).

export const MIN_COHORT_BUCKETS = 4;
export const DEFAULT_COHORT_COUNT = 8;
export const DEFAULT_WEEK_COUNT = 8;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

export interface SignupEvent {
  user_id: string;
  signup_iso: string;
}

export interface ActivityEvent {
  user_id: string;
  activity_iso: string;
}

export interface CohortRow {
  cohort_week_iso: string; // Monday UTC of the cohort week (YYYY-MM-DD)
  size: number;
  retention: Array<number | null>; // index N = week-since-signup, decimal 0..1
}

export interface CohortMatrix {
  generated_at_iso: string;
  reference_week_iso: string;
  week_count: number;
  cohort_count: number;
  meets_min_buckets: boolean;
  cohorts: CohortRow[];
}

export interface ComputeCohortOptions {
  reference_date?: Date; // defaults to `new Date()`; caller may pin for tests
  cohort_count?: number; // number of cohort weeks to bucket into
  week_count?: number; // width of retention grid (0..N-1)
}

function parseTs(iso: string): number | null {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * Return the Monday 00:00 UTC timestamp of the week containing `ts`.
 * ISO 8601 weeks start on Monday; JS `getUTCDay()` returns 0 (Sun)..6 (Sat)
 * so we shift Sunday from 0 to 7 before subtracting.
 */
function weekStartMs(ts: number): number {
  const d = new Date(ts);
  const dayOfWeek = d.getUTCDay() || 7; // 1..7, Mon=1..Sun=7
  const monday = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - (dayOfWeek - 1),
  );
  return monday;
}

/**
 * Format a Monday UTC ms → YYYY-MM-DD. Cohort keys are date-only so JSON
 * round-trips cleanly through the digest email + PDF renderers.
 */
function toIsoDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCFullYear().toString().padStart(4, "0");
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Compute a weekly cohort retention matrix.
 *
 * Cohorts are built from `signups` (a user's earliest signup wins if the
 * same user_id shows up twice — the second row is ignored so a
 * re-registration does not shift them into a later cohort). Activity is
 * bucketed into weeks after the cohort week; a user counts as retained in
 * week N if they have >= 1 activity event whose week-start-ms == cohort +
 * N × MS_PER_WEEK.
 *
 * The matrix drops any cohort week whose size is 0 so empty rows never
 * leak into the SVG (a founder with a gap week just sees the next real
 * cohort). `meets_min_buckets` mirrors the Chapter 5 CTA's "at least two
 * consecutive weeks" hint — we use MIN_COHORT_BUCKETS=4 which is the
 * standard PMF-signal floor investors expect.
 */
export function computeWeeklyCohortRetention(
  signups: ReadonlyArray<SignupEvent>,
  activities: ReadonlyArray<ActivityEvent>,
  opts: ComputeCohortOptions = {},
): CohortMatrix {
  const referenceDate = opts.reference_date ?? new Date();
  const referenceWeekMs = weekStartMs(referenceDate.getTime());
  const cohortCount = Math.max(1, Math.floor(opts.cohort_count ?? DEFAULT_COHORT_COUNT));
  const weekCount = Math.max(1, Math.floor(opts.week_count ?? DEFAULT_WEEK_COUNT));

  // First-signup wins: earliest signup timestamp per user_id.
  const firstSignup = new Map<string, number>();
  for (const s of signups) {
    if (!s.user_id) continue;
    const ts = parseTs(s.signup_iso);
    if (ts === null) continue;
    const prev = firstSignup.get(s.user_id);
    if (prev === undefined || ts < prev) firstSignup.set(s.user_id, ts);
  }

  // Bucket users into cohort weeks (Monday-anchored). Only cohorts within
  // the trailing `cohortCount` weeks (ending at referenceWeekMs) are kept.
  const earliestCohortMs = referenceWeekMs - (cohortCount - 1) * MS_PER_WEEK;
  const cohortUsers = new Map<number, Set<string>>();
  for (const [userId, ts] of firstSignup) {
    const cohortMs = weekStartMs(ts);
    if (cohortMs < earliestCohortMs || cohortMs > referenceWeekMs) continue;
    const bucket = cohortUsers.get(cohortMs) ?? new Set<string>();
    bucket.add(userId);
    cohortUsers.set(cohortMs, bucket);
  }

  // Bucket activity by (user_id → set of week-start-ms with any activity).
  const activityWeeksByUser = new Map<string, Set<number>>();
  for (const a of activities) {
    if (!a.user_id) continue;
    const ts = parseTs(a.activity_iso);
    if (ts === null) continue;
    if (!cohortUsers.size) continue;
    const weekMs = weekStartMs(ts);
    const set = activityWeeksByUser.get(a.user_id) ?? new Set<number>();
    set.add(weekMs);
    activityWeeksByUser.set(a.user_id, set);
  }

  const cohortMsSorted = [...cohortUsers.keys()].sort((a, b) => a - b);
  const rows: CohortRow[] = [];
  for (const cohortMs of cohortMsSorted) {
    const users = cohortUsers.get(cohortMs);
    if (!users || users.size === 0) continue;
    const weeksElapsed = Math.floor((referenceWeekMs - cohortMs) / MS_PER_WEEK);
    const retention: Array<number | null> = [];
    for (let w = 0; w < weekCount; w += 1) {
      if (w > weeksElapsed) {
        retention.push(null);
        continue;
      }
      const targetMs = cohortMs + w * MS_PER_WEEK;
      let retained = 0;
      for (const userId of users) {
        if (activityWeeksByUser.get(userId)?.has(targetMs)) retained += 1;
      }
      retention.push(retained / users.size);
    }
    rows.push({
      cohort_week_iso: toIsoDate(cohortMs),
      size: users.size,
      retention,
    });
  }

  return {
    generated_at_iso: new Date(referenceDate.getTime()).toISOString(),
    reference_week_iso: toIsoDate(referenceWeekMs),
    week_count: weekCount,
    cohort_count: rows.length,
    meets_min_buckets: rows.length >= MIN_COHORT_BUCKETS,
    cohorts: rows,
  };
}

/**
 * Cell colour for a retention decimal in [0,1]. Uses a five-band heatmap
 * (grey → red → amber → yellow-green → green) that stays legible in both
 * light + dark PDF backgrounds. `null` renders as slate-100 (truncated row).
 */
export function cohortCellColour(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "#e2e8f0"; // slate-200
  if (value <= 0) return "#f1f5f9"; // slate-100 — zero retention still shown
  if (value < 0.2) return "#fecaca"; // red-200
  if (value < 0.4) return "#fed7aa"; // orange-200
  if (value < 0.6) return "#fde68a"; // amber-200
  if (value < 0.8) return "#bbf7d0"; // green-200
  return "#86efac"; // green-300 (0.8+ = investor-grade retention)
}

export interface RenderCohortSvgOptions {
  cell_width?: number; // px per week column
  cell_height?: number; // px per cohort row
  padding_left?: number; // room for cohort_week + size label
  padding_top?: number; // room for column header
  title?: string;
}

/**
 * Render the cohort matrix as a self-contained SVG heatmap. Output is a
 * plain string (no React) so the digest email / PDF pipelines can inline
 * it via dangerouslySetInnerHTML or write it to disk without spinning up
 * a browser. Values are formatted as integer % (e.g. 0.734 → "73%") to
 * keep cell text legible at report scale.
 */
export function renderCohortRetentionSvg(
  matrix: CohortMatrix,
  opts: RenderCohortSvgOptions = {},
): string {
  const cellW = opts.cell_width ?? 56;
  const cellH = opts.cell_height ?? 28;
  const padLeft = opts.padding_left ?? 140;
  const padTop = opts.padding_top ?? 44;
  const title = opts.title ?? "Weekly cohort retention";

  const weekCount = matrix.week_count;
  const rowCount = matrix.cohorts.length;
  const width = padLeft + cellW * weekCount + 16;
  const height = padTop + cellH * Math.max(rowCount, 1) + 20;

  const columnHeaders: string[] = [];
  for (let w = 0; w < weekCount; w += 1) {
    const x = padLeft + w * cellW + cellW / 2;
    columnHeaders.push(
      `<text x="${x}" y="${padTop - 12}" text-anchor="middle" font-size="11" font-family="Arial" fill="#475569">W${w}</text>`,
    );
  }

  const rows: string[] = [];
  matrix.cohorts.forEach((row, rIdx) => {
    const y = padTop + rIdx * cellH;
    const labelY = y + cellH / 2 + 4;
    rows.push(
      `<text x="12" y="${labelY}" font-size="11" font-family="Arial" fill="#0f172a">${row.cohort_week_iso}</text>`,
    );
    rows.push(
      `<text x="${padLeft - 12}" y="${labelY}" text-anchor="end" font-size="10" font-family="Arial" fill="#64748b">n=${row.size}</text>`,
    );
    row.retention.forEach((val, wIdx) => {
      const x = padLeft + wIdx * cellW;
      const fill = cohortCellColour(val);
      const pct = val === null ? "" : `${Math.round(val * 100)}%`;
      const textFill = val !== null && val >= 0.8 ? "#065f46" : "#0f172a";
      rows.push(
        `<rect x="${x}" y="${y}" width="${cellW - 2}" height="${cellH - 2}" rx="4" fill="${fill}" stroke="#e2e8f0" stroke-width="1"/>`,
      );
      if (pct) {
        rows.push(
          `<text x="${x + cellW / 2 - 1}" y="${labelY}" text-anchor="middle" font-size="11" font-family="Arial" fill="${textFill}">${pct}</text>`,
        );
      }
    });
  });

  const emptyHint = rowCount === 0
    ? `<text x="${padLeft + 8}" y="${padTop + cellH / 2 + 4}" font-size="12" font-family="Arial" fill="#94a3b8">No cohort data yet — log at least ${MIN_COHORT_BUCKETS} weeks of signups.</text>`
    : "";

  const belowMinHint = rowCount > 0 && !matrix.meets_min_buckets
    ? `<text x="${padLeft}" y="${height - 6}" font-size="10" font-family="Arial" fill="#b45309">Signal below investor threshold — needs ${MIN_COHORT_BUCKETS}+ consecutive weekly cohorts.</text>`
    : "";

  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" rx="12" fill="white" stroke="#e2e8f0" stroke-width="1"/>
  <text x="16" y="24" font-size="13" font-family="Arial" fill="#0f172a" font-weight="bold">${title}</text>
  <text x="${width - 16}" y="24" text-anchor="end" font-size="11" font-family="Arial" fill="#64748b">Ref week ${matrix.reference_week_iso} · ${rowCount} cohort${rowCount === 1 ? "" : "s"}</text>
  ${columnHeaders.join("\n  ")}
  ${rows.join("\n  ")}
  ${emptyHint}
  ${belowMinHint}
</svg>`;
}
