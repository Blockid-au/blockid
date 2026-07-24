// Weekly digest snapshot delta — week-over-week diff of two DigestSnapshot rows.
//
// P11.13 landed the JSONL persistence (digest-snapshot.ts) so the Monday cron
// appends one row per run. This module closes the "compute deltas without
// re-firing Supabase queries" gap flagged in the P11.13 docstring: given the
// previous week's snapshot and the current week's snapshot, produce a stable
// per-section triage that answers "which KPI sections changed shape between
// two runs, and by how many rows?"
//
// Scope is deliberately narrow — schema drift across sections is significant
// (each KPI has its own row shape), so the delta module diffs at a stable,
// low-coupling boundary:
//   - top-level reseller_count
//   - per-section presence (present / skipped / absent)
//   - per-section row_count (length of rows[] when the section is present)
//
// This gives ops a compact "structural diff" they can grep from the JSONL
// history without having to know each row shape. Per-metric numeric deltas
// (e.g. commission_cleared_mtd cents delta) can be layered on top in future
// ticks — this module intentionally does NOT try to do that here so the API
// stays stable when new KPI sections ship.
//
// Kept dependency-free so the JSONL shape can be regression-tested without
// touching Supabase, nodemailer, or the file system — mirrors digest-snapshot.ts.

import {
  DIGEST_SNAPSHOT_KPI_SECTIONS,
  type DigestSnapshot,
  type KnownKpiSection,
} from "./digest-snapshot";

/** State a KPI section can be in for one snapshot. */
export type DigestSectionState = "present" | "skipped" | "absent";

/** Transition classification between two states. */
export type DigestSectionTransition =
  | "unchanged"
  | "recovered" // was skipped/absent, now present
  | "regressed" // was present, now skipped/absent
  | "started" // wasn't there in either shape historically, now present
  | "stopped"; // was there, now completely absent (rarely: schema retirement)

export interface DigestSectionDelta {
  readonly key: KnownKpiSection;
  readonly previous_state: DigestSectionState;
  readonly current_state: DigestSectionState;
  readonly previous_row_count: number;
  readonly current_row_count: number;
  readonly row_count_delta: number;
  readonly previous_skipped_reason: string | null;
  readonly current_skipped_reason: string | null;
  readonly transition: DigestSectionTransition;
}

export interface DigestSnapshotDelta {
  readonly previous_captured_at: string;
  readonly current_captured_at: string;
  readonly previous_week: string;
  readonly current_week: string;
  readonly previous_reseller_count: number;
  readonly current_reseller_count: number;
  readonly reseller_count_delta: number;
  readonly sections: readonly DigestSectionDelta[];
}

function safeInt(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function readSectionState(
  envelope: Record<string, unknown>,
  key: KnownKpiSection,
): {
  state: DigestSectionState;
  row_count: number;
  skipped_reason: string | null;
} {
  const raw = envelope[key];
  if (!raw || typeof raw !== "object") {
    return { state: "absent", row_count: 0, skipped_reason: null };
  }
  const rec = raw as Record<string, unknown>;
  if (
    typeof rec.skipped_reason === "string" &&
    rec.skipped_reason.length > 0
  ) {
    return {
      state: "skipped",
      row_count: 0,
      skipped_reason: rec.skipped_reason,
    };
  }
  const rows = rec.rows;
  const rowCount = Array.isArray(rows) ? rows.length : 0;
  return { state: "present", row_count: rowCount, skipped_reason: null };
}

function classifyTransition(
  previous: DigestSectionState,
  current: DigestSectionState,
): DigestSectionTransition {
  if (previous === current) return "unchanged";
  if (previous === "absent" && current === "present") return "started";
  if (previous === "present" && current === "absent") return "stopped";
  if (previous !== "present" && current === "present") return "recovered";
  if (previous === "present" && current !== "present") return "regressed";
  // Remaining transitions (skipped ↔ absent) are shape shifts on the same
  // "not-usable" side of the fence — flag as unchanged so ops isn't paged.
  return "unchanged";
}

/**
 * Diff two snapshots. `previous` is the older row, `current` is the newer
 * row. Callers are expected to hand them in that order — the module does NOT
 * introspect captured_at to decide which is older, since two snapshots from
 * the same Monday (dry-run + real run) can share a captured_at within the
 * same second and the caller's intent is authoritative.
 */
export function computeDigestSnapshotDelta(
  previous: DigestSnapshot,
  current: DigestSnapshot,
): DigestSnapshotDelta {
  const prevEnv = (previous.envelope ?? {}) as Record<string, unknown>;
  const currEnv = (current.envelope ?? {}) as Record<string, unknown>;
  const sections: DigestSectionDelta[] = DIGEST_SNAPSHOT_KPI_SECTIONS.map(
    (key) => {
      const prev = readSectionState(prevEnv, key);
      const curr = readSectionState(currEnv, key);
      return {
        key,
        previous_state: prev.state,
        current_state: curr.state,
        previous_row_count: prev.row_count,
        current_row_count: curr.row_count,
        row_count_delta: curr.row_count - prev.row_count,
        previous_skipped_reason: prev.skipped_reason,
        current_skipped_reason: curr.skipped_reason,
        transition: classifyTransition(prev.state, curr.state),
      };
    },
  );
  const prevCount = safeInt(previous.reseller_count);
  const currCount = safeInt(current.reseller_count);
  return {
    previous_captured_at: previous.captured_at,
    current_captured_at: current.captured_at,
    previous_week: previous.week,
    current_week: current.week,
    previous_reseller_count: prevCount,
    current_reseller_count: currCount,
    reseller_count_delta: currCount - prevCount,
    sections,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function signedInt(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

function stateLabel(state: DigestSectionState): string {
  switch (state) {
    case "present":
      return "present";
    case "skipped":
      return "skipped";
    case "absent":
      return "absent";
  }
}

/**
 * Render an HTML table summarising the section-level delta. Returns an empty
 * string only when both snapshots are structurally identical and reseller
 * counts match — a genuine no-op week. Otherwise every row of the section
 * ladder renders so ops can spot the changed rows at a glance.
 */
export function formatDigestSnapshotDeltaSection(
  delta: DigestSnapshotDelta,
): string {
  const hasSectionDrift = delta.sections.some(
    (s) => s.transition !== "unchanged" || s.row_count_delta !== 0,
  );
  const hasCountDrift = delta.reseller_count_delta !== 0;
  if (!hasSectionDrift && !hasCountDrift) return "";

  const body = delta.sections
    .map((s) => {
      const highlight =
        s.transition !== "unchanged" || s.row_count_delta !== 0;
      const rowStyle = highlight ? ' style="background:#fff8e1"' : "";
      const skippedReason =
        s.current_skipped_reason ?? s.previous_skipped_reason ?? "";
      return `
      <tr${rowStyle}>
        <td>${escapeHtml(s.key)}</td>
        <td>${stateLabel(s.previous_state)}</td>
        <td>${stateLabel(s.current_state)}</td>
        <td style="text-align:right">${s.previous_row_count}</td>
        <td style="text-align:right">${s.current_row_count}</td>
        <td style="text-align:right">${signedInt(s.row_count_delta)}</td>
        <td>${escapeHtml(s.transition)}</td>
        <td>${escapeHtml(skippedReason)}</td>
      </tr>`;
    })
    .join("");
  return `
    <h3 style="margin-top:24px;font-family:Arial,sans-serif;font-size:14px">Weekly digest snapshot delta (${escapeHtml(delta.previous_week)} &rarr; ${escapeHtml(delta.current_week)})</h3>
    <p style="font-family:Arial,sans-serif;font-size:13px">Reseller count: ${delta.previous_reseller_count} &rarr; ${delta.current_reseller_count} (${signedInt(delta.reseller_count_delta)}). Sections with a state transition or row-count change are highlighted.</p>
    <table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px">
      <thead>
        <tr>
          <th>Section</th>
          <th>Was</th>
          <th>Now</th>
          <th>Was rows</th>
          <th>Now rows</th>
          <th>&Delta;</th>
          <th>Transition</th>
          <th>Skip reason</th>
        </tr>
      </thead>
      <tbody>${body}
      </tbody>
    </table>`;
}
