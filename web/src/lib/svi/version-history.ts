// SVI_VERSION history — the one table behind /methodology/versions and
// § 5 of /methodology/governance (G21 P3-C; the rows were inline in
// governance-content.ts since P0-D). The last row must equal the live
// `SVI_VERSION` (pinned by version-history.test.ts and governance/page.test.tsx),
// and every row must appear in docs/product/score-governance.md § 5 — so a
// version bump without a history row fails the build.
//
// Pure data + helpers. No React, no Next.

import { SVI_VERSION } from "@/lib/svi-analysis";

export type SviVersionChangeType = "initial" | "major" | "minor" | "patch";

export interface SviVersionHistoryRow {
  version: string;
  /** ISO date the version went live. */
  date: string;
  /** What changed (matches the governance document's Change column verbatim). */
  change: string;
  type: SviVersionChangeType;
  /** Effect on comparability with earlier snapshots (score-governance § 5 / § 11). */
  comparability: string;
}

export const VERSIONS_PATH = "/methodology/versions";
export const VERSIONS_VI_PATH = "/vi/methodology/versions";

export const SVI_VERSION_HISTORY: ReadonlyArray<SviVersionHistoryRow> = Object.freeze([
  {
    version: "1.0.0",
    date: "2026-05-19",
    change: "First engine: single composite score from text input",
    type: "initial",
    comparability: "Not comparable with any later version: one composite number, no dimensions, no evidence rules.",
  },
  {
    version: "2.0.0",
    date: "2026-05-19",
    change: "Eight-dimension model, stage tracking, evidence wizard",
    type: "major",
    comparability: "The dimension set is defined here; 1.x scores cannot be mapped onto it. Every snapshot from this version carries eight dimension scores and a stage.",
  },
  {
    version: "2.1.0",
    date: "2026-08-16",
    change: "Funding-readiness gates; enhanced finance, strategy and data analysis prompts",
    type: "minor",
    comparability: "Same dimensions, weights and scale as 2.0.0. Narrative chapters differ; the deterministic score is comparable, with the gates noted on the report.",
  },
  {
    version: "2.2.0",
    date: "2026-09-16",
    change: "Confidence cap by evidence origin; business-verification multiplier",
    type: "minor",
    comparability: "Scores are comparable; evidence confidence is not. A 2.1.0 snapshot may show higher confidence for the same evidence because typed prose could grade itself above public_url. Compare confidence only across snapshots on 2.2.0 or later.",
  },
]);

/** The row for the live SVI_VERSION (undefined = a bump without a history row; the test fails). */
export function currentVersionRow(): SviVersionHistoryRow | undefined {
  return SVI_VERSION_HISTORY.find((r) => r.version === SVI_VERSION);
}

/** `1.2.3` → [1, 2, 3]. */
export function parseVersion(v: string): [number, number, number] {
  const [a, b, c] = v.split(".").map((n) => Number.parseInt(n, 10));
  return [a || 0, b || 0, c || 0];
}

/** True when the history is strictly ascending by version. */
export function historyIsAscending(rows: ReadonlyArray<Pick<SviVersionHistoryRow, "version">> = SVI_VERSION_HISTORY): boolean {
  for (let i = 1; i < rows.length; i++) {
    const [a1, a2, a3] = parseVersion(rows[i - 1].version);
    const [b1, b2, b3] = parseVersion(rows[i].version);
    if (b1 < a1 || (b1 === a1 && b2 < a2) || (b1 === a1 && b2 === a2 && b3 <= a3)) return false;
  }
  return true;
}

/** Semantic-versioning step between two rows, for the "what a step means" column. */
export const CHANGE_TYPE_LABEL: Record<SviVersionChangeType, string> = {
  initial: "first release",
  major: "major — dimensions, scale or benchmark rules changed; both versions run side by side for one cohort cycle",
  minor: "minor — a weight, criterion, evidence-level value, cap or multiplier changed; announced before deploy",
  patch: "patch — wording, narrative prompts or layout; changelog only",
};
