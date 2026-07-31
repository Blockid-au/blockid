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
  | "proprietary"     // UNLICENSED / "SEE LICENSE IN …" / LicenseRef-* — no open-source grant
  | "weak_copyleft"   // GPL / LGPL / MPL / EPL — file/library-scoped copyleft
  | "unknown"         // no license field in the package's own package.json
  | "permissive"      // MIT / Apache-2.0 / BSD / ISC / CC0 / Unlicense
  | "other";          // a recognised SPDX id that is not slotted (e.g. CC-BY-4.0)

export interface LicenseRiskEntry {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly dev: boolean;
  readonly band: LicenseRiskBand;
}

export interface LicenseRiskCounts {
  readonly strong_copyleft: number;
  readonly proprietary: number;
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
  /** Runtime-only entries in strong_copyleft, proprietary, weak_copyleft, or unknown bands — sorted band-desc, then name-asc. */
  readonly runtime_risky: LicenseRiskEntry[];
  readonly disclaimer: string;
}

export const LICENSE_RISK_DISCLAIMER =
  "Risk bands are heuristic — they map SPDX-style license identifiers onto strong-copyleft / proprietary / weak-copyleft / permissive / unknown buckets to help spot exposure. This is not a legal opinion. Runtime AGPL / SSPL / GPL, proprietary (UNLICENSED or 'SEE LICENSE IN …') and UNKNOWN packages should be confirmed with counsel before shipping a distributed product; dev-only entries usually do not trigger distribution obligations but should still be tracked. A dual-licensed 'A OR B' package is banded on the least restrictive option, since the licensee chooses.";

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

/** npm's conventions for "this package grants you no open-source license". */
const PROPRIETARY_MARKER = /^(UNLICENSED$|SEE[ -]LICEN[SC]E\b|LICENSEREF-)/;

/** Severity ordering — drives worst-wins for AND and best-wins for OR. */
const BAND_SEVERITY: Record<LicenseRiskBand, number> = {
  strong_copyleft: 5,
  proprietary: 4,
  weak_copyleft: 3,
  unknown: 2,
  other: 1,
  permissive: 0,
};

function classifyToken(token: string): LicenseRiskBand {
  if (STRONG_COPYLEFT.has(token)) return "strong_copyleft";
  if (WEAK_COPYLEFT.has(token)) return "weak_copyleft";
  if (PERMISSIVE.has(token)) return "permissive";
  if (PROPRIETARY_MARKER.test(token)) return "proprietary";
  // A valid SPDX identifier is a single word. Free-form prose such as
  // "Remotion License https://remotion.dev/license" grants nothing a tool
  // can verify, so it belongs beside UNLICENSED rather than in `other`.
  if (/\s|:\/\//.test(token)) return "proprietary";
  return "other";
}

/**
 * Classify a single license string, honouring SPDX expression semantics:
 * `AND` stacks obligations so the *worst* conjunct wins, while `OR` is the
 * licensee's choice so the *least restrictive* alternative wins — a
 * `(MIT OR GPL-3.0)` package carries no copyleft obligation if you take MIT.
 */
export function classifyLicense(license: string): LicenseRiskBand {
  const trimmed = (license ?? "").trim();
  if (!trimmed || trimmed.toUpperCase() === "UNKNOWN") return "unknown";

  // WITH-exceptions (e.g. "Apache-2.0 WITH LLVM-exception") do not switch
  // licenses — strip the exception clause before splitting.
  const cleaned = trimmed
    .replace(/\s+WITH\s+[^\s()]+/gi, "")
    .replace(/[()]/g, " ")
    .trim();

  let best: LicenseRiskBand | null = null;
  for (const alternative of cleaned.split(/\s+OR\s+/i)) {
    let worst: LicenseRiskBand | null = null;
    for (const conjunct of alternative.split(/\s+AND\s+/i)) {
      const token = normaliseSpdxToken(conjunct);
      if (!token) continue;
      const band = classifyToken(token);
      if (worst === null || BAND_SEVERITY[band] > BAND_SEVERITY[worst]) worst = band;
    }
    if (worst === null) continue;
    if (best === null || BAND_SEVERITY[worst] < BAND_SEVERITY[best]) best = worst;
  }

  return best ?? "other";
}

function emptyCounts(): LicenseRiskCounts {
  return {
    strong_copyleft: 0,
    proprietary: 0,
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
  strong_copyleft: 4,
  proprietary: 3,
  unknown: 2,
  weak_copyleft: 1,
  other: 0,
  permissive: 0,
};

const RISKY_BANDS: ReadonlySet<LicenseRiskBand> = new Set<LicenseRiskBand>([
  "strong_copyleft",
  "proprietary",
  "weak_copyleft",
  "unknown",
]);

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
      if (RISKY_BANDS.has(band)) {
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
