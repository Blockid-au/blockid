// Software Bill of Materials (SBOM) generator for the founder data room.
//
// Closes §2 folder-4 item 4.9 "Third-Party Dependency Inventory" and
// folder-7 item 7.9 "Open-Source License Inventory" — both listed as
// AUTO but unwired in docs/plans/atlassian-standard-mapping-goal.md.
//
// Input is the parsed contents of npm's lockfile-v3 package-lock.json.
// This module never touches disk, never invokes npm, and never reaches
// the network — the file-reading route wraps it (see
// web/src/app/api/dataroom/sbom/route.ts).

export interface SbomEntry {
  /** Bare package name — e.g. "react" or "@babel/core". */
  readonly name: string;
  readonly version: string;
  /** SPDX identifier when the package declared one, else "UNKNOWN". */
  readonly license: string;
  /** npm registry (or tarball) URL from the lockfile. */
  readonly resolved: string | null;
  /** True when the lockfile marks the entry as devDependency-only. */
  readonly dev: boolean;
}

export interface SbomSummary {
  readonly total: number;
  readonly runtime: number;
  readonly dev: number;
  readonly unknown_license: number;
  /** License → occurrence count, sorted desc. Runtime + dev combined. */
  readonly by_license: Array<{ license: string; count: number }>;
}

export interface Sbom {
  readonly generated_at: string;
  readonly lockfile_version: number;
  readonly root_name: string;
  readonly root_version: string;
  readonly summary: SbomSummary;
  readonly entries: SbomEntry[];
  /** Investor-facing disclaimer inlined into the JSON response. */
  readonly disclaimer: string;
}

export const SBOM_DISCLAIMER =
  "License field is copied verbatim from each package's own package.json as recorded by npm — it is not a legal opinion. Verify AGPL / GPL / SSPL entries with counsel before shipping in a distributed product.";

interface RawPackage {
  name?: string;
  version?: string;
  license?: string | { type?: string };
  licenses?: Array<{ type?: string }>;
  resolved?: string;
  dev?: boolean;
  devOptional?: boolean;
}

interface RawLockfile {
  name?: string;
  version?: string;
  lockfileVersion?: number;
  packages?: Record<string, RawPackage>;
}

function normaliseLicense(raw: RawPackage): string {
  if (typeof raw.license === "string" && raw.license.trim()) {
    return raw.license.trim();
  }
  if (raw.license && typeof raw.license === "object" && raw.license.type) {
    return raw.license.type.trim();
  }
  if (Array.isArray(raw.licenses) && raw.licenses.length > 0) {
    const joined = raw.licenses
      .map((l) => (l?.type ?? "").trim())
      .filter(Boolean)
      .join(" OR ");
    if (joined) return joined;
  }
  return "UNKNOWN";
}

function nameFromKey(key: string): string {
  // Lockfile v3 keys look like "node_modules/<name>" or nested
  // "node_modules/<a>/node_modules/<b>". We want the deepest name.
  const marker = "node_modules/";
  const idx = key.lastIndexOf(marker);
  if (idx === -1) return key;
  return key.slice(idx + marker.length);
}

export function buildSbom(
  lockfile: unknown,
  now: () => Date = () => new Date(),
): Sbom {
  const raw = (lockfile ?? {}) as RawLockfile;
  const packages = raw.packages ?? {};

  const entries: SbomEntry[] = [];
  const seen = new Set<string>();

  for (const [key, pkg] of Object.entries(packages)) {
    if (key === "") continue; // root package
    if (!pkg || !pkg.version) continue;
    const name = pkg.name ?? nameFromKey(key);
    if (!name) continue;
    const dedupeKey = `${name}@${pkg.version}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    entries.push({
      name,
      version: pkg.version,
      license: normaliseLicense(pkg),
      resolved: pkg.resolved ?? null,
      dev: pkg.dev === true || pkg.devOptional === true,
    });
  }

  entries.sort((a, b) =>
    a.name === b.name
      ? a.version.localeCompare(b.version)
      : a.name.localeCompare(b.name),
  );

  const licenseCounts = new Map<string, number>();
  let devCount = 0;
  let unknownCount = 0;
  for (const entry of entries) {
    licenseCounts.set(entry.license, (licenseCounts.get(entry.license) ?? 0) + 1);
    if (entry.dev) devCount += 1;
    if (entry.license === "UNKNOWN") unknownCount += 1;
  }

  const by_license = Array.from(licenseCounts.entries())
    .map(([license, count]) => ({ license, count }))
    .sort((a, b) => (b.count - a.count) || a.license.localeCompare(b.license));

  return {
    generated_at: now().toISOString(),
    lockfile_version: typeof raw.lockfileVersion === "number" ? raw.lockfileVersion : 0,
    root_name: raw.name ?? "unknown",
    root_version: raw.version ?? "0.0.0",
    summary: {
      total: entries.length,
      runtime: entries.length - devCount,
      dev: devCount,
      unknown_license: unknownCount,
      by_license,
    },
    entries,
    disclaimer: SBOM_DISCLAIMER,
  };
}
