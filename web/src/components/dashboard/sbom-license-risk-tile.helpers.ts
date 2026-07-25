// Pure helpers for <SbomLicenseRiskTile /> (P7-sbom-license-risk-tile).
//
// Consumes the JSON response from GET /api/dataroom/sbom (JSON path only —
// the CSV path is a raw per-package dump). Projects `license_risk` into
// a founder-friendly tile view: an overall traffic-light band, a headline,
// a short body summary, and a capped list of the runtime_risky[] rows so
// the tile stays scannable at any dependency-tree depth.
//
// Follows the compliance-calendar-tile.helpers.ts posture — every branch
// (loading / empty payload / no risk / has risk) surfaces a stable view
// object so the tile never renders half-populated state.

import type {
  LicenseRiskBand,
  LicenseRiskCounts,
  LicenseRiskEntry,
  LicenseRiskReport,
} from "@/lib/dataroom/sbom-license-risk";

export type SbomTileBand = "red" | "amber" | "emerald" | "slate";

export interface SbomTilePayload {
  readonly generated_at: string;
  readonly root_name: string;
  readonly root_version: string;
  readonly license_risk: LicenseRiskReport;
}

export interface SbomTileView {
  readonly colour: SbomTileBand;
  readonly chipLabel: string;
  readonly headline: string;
  readonly body: string;
  readonly rows: readonly LicenseRiskEntry[];
  readonly runtimeTotal: number;
  readonly devTotal: number;
  readonly disclaimer: string;
}

/** Human-readable label per risk band — used in the counts row + row chips. */
export const RISK_BAND_LABEL: Record<LicenseRiskBand, string> = {
  strong_copyleft: "Strong copyleft",
  weak_copyleft: "Weak copyleft",
  unknown: "Unknown",
  permissive: "Permissive",
  other: "Other",
};

/** Row-chip colour per band. `slate` covers permissive/other so risky bands stand out. */
export const RISK_BAND_COLOUR: Record<LicenseRiskBand, SbomTileBand> = {
  strong_copyleft: "red",
  unknown: "amber",
  weak_copyleft: "amber",
  other: "slate",
  permissive: "emerald",
};

const DEFAULT_ROW_CAP = 5;

function sumCounts(counts: LicenseRiskCounts): number {
  return (
    counts.strong_copyleft +
    counts.weak_copyleft +
    counts.unknown +
    counts.permissive +
    counts.other
  );
}

/**
 * Overall traffic-light band for the tile header.
 *   red     → runtime has ≥ 1 strong_copyleft entry (AGPL / SSPL / Commons-Clause / BUSL / Elastic-2.0)
 *   amber   → runtime has ≥ 1 unknown or weak_copyleft entry
 *   emerald → runtime is permissive / other only (no risky rows)
 *   slate   → no runtime entries at all (unusual — e.g. lockfile only has devDependencies)
 * Dev-only strong-copyleft entries stay slate at the header level (see
 * LICENSE_RISK_DISCLAIMER — "dev-only entries usually do not trigger
 * distribution obligations"); the founder still sees the counts row.
 */
export function pickSbomTileBand(report: LicenseRiskReport): SbomTileBand {
  const runtimeTotal = sumCounts(report.counts_runtime);
  if (runtimeTotal === 0) return "slate";
  if (report.counts_runtime.strong_copyleft > 0) return "red";
  if (
    report.counts_runtime.unknown > 0 ||
    report.counts_runtime.weak_copyleft > 0
  ) {
    return "amber";
  }
  return "emerald";
}

function pluralise(n: number, singular: string, plural: string): string {
  return n === 1 ? `${n} ${singular}` : `${n} ${plural}`;
}

function formatChip(report: LicenseRiskReport): string {
  const c = report.counts_runtime;
  if (c.strong_copyleft > 0) return `${c.strong_copyleft} strong-copyleft`;
  if (c.unknown > 0) return `${c.unknown} unknown license`;
  if (c.weak_copyleft > 0) return `${c.weak_copyleft} weak-copyleft`;
  if (sumCounts(c) === 0) return "No runtime deps";
  return "All permissive";
}

function formatHeadline(report: LicenseRiskReport): string {
  const runtimeTotal = sumCounts(report.counts_runtime);
  if (runtimeTotal === 0) return "License risk — no runtime dependencies";
  if (report.counts_runtime.strong_copyleft > 0) {
    return `License risk — strong-copyleft in runtime`;
  }
  if (report.counts_runtime.unknown > 0) {
    return `License risk — unknown-license packages in runtime`;
  }
  if (report.counts_runtime.weak_copyleft > 0) {
    return `License risk — weak-copyleft in runtime`;
  }
  return "License risk — runtime is permissive";
}

function formatBody(report: LicenseRiskReport): string {
  const runtimeTotal = sumCounts(report.counts_runtime);
  const devTotal = sumCounts(report.counts_dev);
  if (runtimeTotal === 0 && devTotal === 0) {
    return "No dependencies found in package-lock.json. Run `npm install` to seed the SBOM.";
  }
  const runtimeCopy = `${pluralise(runtimeTotal, "runtime dependency", "runtime dependencies")}`;
  const devCopy = `${pluralise(devTotal, "dev dependency", "dev dependencies")}`;
  const risky = report.runtime_risky.length;
  const riskySuffix =
    risky === 0
      ? "No runtime rows in strong-copyleft / weak-copyleft / unknown bands — investors will not flag license exposure at signature."
      : `${pluralise(risky, "runtime row needs", "runtime rows need")} counsel review before shipping a distributed product.`;
  return `${runtimeCopy} · ${devCopy}. ${riskySuffix}`;
}

/**
 * Project the SBOM payload into a stable tile view. Deliberately branch on
 * (a) loading (null payload) / (b) no license_risk (older API response) /
 * (c) full report so the tile always renders something meaningful.
 *
 * `rowCap` bounds `rows[]` so a deeply-nested tree with dozens of
 * unknown-license transitive packages does not blow out the tile height —
 * the founder clicks through to /api/dataroom/sbom for the full dump.
 */
export function pickSbomTileView(
  payload: SbomTilePayload | null,
  rowCap: number = DEFAULT_ROW_CAP,
): SbomTileView {
  if (!payload) {
    return {
      colour: "slate",
      chipLabel: "Loading…",
      headline: "License risk",
      body: "Fetching /api/dataroom/sbom — feeds data-room folder 7.9 (Open-Source License Inventory).",
      rows: [],
      runtimeTotal: 0,
      devTotal: 0,
      disclaimer: "",
    };
  }
  const report = payload.license_risk;
  const runtimeTotal = sumCounts(report.counts_runtime);
  const devTotal = sumCounts(report.counts_dev);
  const cap = Math.max(0, Math.floor(rowCap));
  return {
    colour: pickSbomTileBand(report),
    chipLabel: formatChip(report),
    headline: formatHeadline(report),
    body: formatBody(report),
    rows: report.runtime_risky.slice(0, cap),
    runtimeTotal,
    devTotal,
    disclaimer: report.disclaimer,
  };
}

/**
 * Count how many runtime_risky rows are hidden by the tile's rowCap so the
 * tile can render a "+N more" pointer to the raw API when the tree is large.
 * Safe against non-integer / negative caps (clamps to 0).
 */
export function countHiddenRisky(
  report: LicenseRiskReport,
  rowCap: number = DEFAULT_ROW_CAP,
): number {
  const cap = Math.max(0, Math.floor(rowCap));
  return Math.max(0, report.runtime_risky.length - cap);
}
