// License-risk classifier layered on top of the SBOM (see ./sbom.ts).
//
// A founder-friendly readout of the strong-copyleft / weak-copyleft /
// unknown / permissive split for the dependency inventory. Investors
// doing pre-signature diligence want to know if AGPL / SSPL / GPL /
// UNKNOWN packages exist in the runtime tree before they sign — this
// module surfaces exactly that.
//
// Pure — no I/O, no network. Reads a `Sbom` (already parsed by
// buildSbom) and classifies each entry's `license` string into one
// of five risk bands.

import type { Sbom, SbomEntry } from "./sbom";

export type LicenseRiskBand =
  | "strong_copyleft" // AGPL / SSPL / Commons Clause — network + distribution copyleft
  | "weak_copyleft"   // GPL / LGPL / MPL / EPL — file/library-scoped copyleft
  | "unknown"         // no license field in the package's own package.json
  | "permissive"      // MIT / Apache-2.0 / BSD / ISC / CC0 / Unlicense
  | "other";          // recognised but not slotted (e.g. custom, proprietary)

export interface LicenseRiskEntry {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly dev: boolean;
  readonly band: LicenseRiskBand;
}

export interface LicenseRiskCounts {
  readonly strong_copyleft: number;
  readonly weak_copyleft: number;
  readonly unknown: number;
  readonly permissive: number;
  readonly other: number;
}

export interface LicenseRiskReport {
  readonly generated_at: string;
  readonly root_name: string;
  readonly root_version: string;
  readonly counts_runtime: LicenseRiskCounts;
  readonly counts_dev: LicenseRiskCounts;
  /** Runtime-only entries in strong_copyleft, weak_copyleft, or unknown bands — sorted band-desc, then name-asc. */
  readonly runtime_risky: LicenseRiskEntry[];
  readonly disclaimer: string;
}

export const LICENSE_RISK_DISCLAIMER =
  "Risk bands are heuristic — they map SPDX-style license identifiers onto strong-copyleft / weak-copyleft / permissive / unknown buckets to help spot exposure. This is not a legal opinion. Runtime AGPL / SSPL / GPL and UNKNOWN packages should be confirmed with counsel before shipping a distributed product; dev-only entries usually do not trigger distribution obligations but should still be tracked.";

function upperSet(members: string[]): Set<string> {
  return new Set(members.map((m) => m.toUpperCase()));
}

const STRONG_COPYLEFT = upperSet([
  "AGPL-1.0",
  "AGPL-1.0-only",
  "AGPL-1.0-or-later",
  "AGPL-3.0",
  "AGPL-3.0-only",
  "AGPL-3.0-or-later",
  "SSPL-1.0",
  "Commons-Clause",
  "BUSL-1.1",
  "Elastic-2.0",
]);

const WEAK_COPYLEFT = upperSet([
  "GPL-1.0",
  "GPL-1.0-only",
  "GPL-1.0-or-later",
  "GPL-2.0",
  "GPL-2.0-only",
  "GPL-2.0-or-later",
  "GPL-3.0",
  "GPL-3.0-only",
  "GPL-3.0-or-later",
  "LGPL-2.0",
  "LGPL-2.0-only",
  "LGPL-2.0-or-later",
  "LGPL-2.1",
  "LGPL-2.1-only",
  "LGPL-2.1-or-later",
  "LGPL-3.0",
  "LGPL-3.0-only",
  "LGPL-3.0-or-later",
  "MPL-1.0",
  "MPL-1.1",
  "MPL-2.0",
  "EPL-1.0",
  "EPL-2.0",
  "CDDL-1.0",
  "CDDL-1.1",
  "OSL-3.0",
]);

const PERMISSIVE = upperSet([
  "MIT",
  "MIT-0",
  "Apache-2.0",
  "BSD",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "BSD-3-Clause-Clear",
  "0BSD",
  "ISC",
  "CC0-1.0",
  "Unlicense",
  "WTFPL",
  "Zlib",
  "Python-2.0",
  "BlueOak-1.0.0",
]);

function normaliseSpdxToken(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * Classify a single license string. Handles compound SPDX expressions
 * (`"MIT OR Apache-2.0"`, `"(MIT AND BSD-3-Clause)"`) by taking the
 * *worst* band present so a `(GPL-3.0 OR MIT)` package still shows up
 * as weak_copyleft — a founder needs to see the worst-case exposure
 * even if a permissive alternative exists.
 */
export function classifyLicense(license: string): LicenseRiskBand {
  const trimmed = (license ?? "").trim();
  if (!trimmed || trimmed.toUpperCase() === "UNKNOWN") return "unknown";

  // Split compound SPDX expressions on OR/AND and take the worst band
  // present. WITH-exceptions (e.g. "Apache-2.0 WITH LLVM-exception")
  // do not switch licenses — strip the exception clause instead.
  const withStripped = trimmed.replace(/\s+WITH\s+[^\s()]+/gi, "");
  const tokens = withStripped
    .replace(/[()]/g, " ")
    .split(/\s+(?:OR|AND)\s+/i)
    .map(normaliseSpdxToken)
    .filter(Boolean);

  const targets = tokens.length > 0 ? tokens : [normaliseSpdxToken(trimmed)];

  const rank: Record<LicenseRiskBand, number> = {
    strong_copyleft: 4,
    weak_copyleft: 3,
    other: 2,
    permissive: 1,
    unknown: 0,
  };

  let worst: LicenseRiskBand | null = null;
  for (const token of targets) {
    let band: LicenseRiskBand;
    if (STRONG_COPYLEFT.has(token)) band = "strong_copyleft";
    else if (WEAK_COPYLEFT.has(token)) band = "weak_copyleft";
    else if (PERMISSIVE.has(token)) band = "permissive";
    else band = "other";
    if (worst === null || rank[band] > rank[worst]) worst = band;
  }

  return worst ?? "other";
}

function emptyCounts(): LicenseRiskCounts {
  return {
    strong_copyleft: 0,
    weak_copyleft: 0,
    unknown: 0,
    permissive: 0,
    other: 0,
  };
}

function bumpCount(counts: LicenseRiskCounts, band: LicenseRiskBand): LicenseRiskCounts {
  return { ...counts, [band]: counts[band] + 1 };
}

const RISKY_BAND_RANK: Record<LicenseRiskBand, number> = {
  strong_copyleft: 3,
  unknown: 2,
  weak_copyleft: 1,
  other: 0,
  permissive: 0,
};

export function classifySbomLicenseRisk(sbom: Sbom): LicenseRiskReport {
  let runtimeCounts = emptyCounts();
  let devCounts = emptyCounts();
  const runtimeRisky: LicenseRiskEntry[] = [];

  for (const entry of sbom.entries as readonly SbomEntry[]) {
    const band = classifyLicense(entry.license);
    if (entry.dev) {
      devCounts = bumpCount(devCounts, band);
    } else {
      runtimeCounts = bumpCount(runtimeCounts, band);
      if (band === "strong_copyleft" || band === "weak_copyleft" || band === "unknown") {
        runtimeRisky.push({
          name: entry.name,
          version: entry.version,
          license: entry.license,
          dev: false,
          band,
        });
      }
    }
  }

  runtimeRisky.sort((a, b) => {
    const bandDiff = RISKY_BAND_RANK[b.band] - RISKY_BAND_RANK[a.band];
    if (bandDiff !== 0) return bandDiff;
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.version.localeCompare(b.version);
  });

  return {
    generated_at: sbom.generated_at,
    root_name: sbom.root_name,
    root_version: sbom.root_version,
    counts_runtime: runtimeCounts,
    counts_dev: devCounts,
    runtime_risky: runtimeRisky,
    disclaimer: LICENSE_RISK_DISCLAIMER,
  };
}
