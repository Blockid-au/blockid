// Pitch-deck coverage types + pure helpers (G14 S35). Client-safe: no
// imports at all, so "use client" components (the intake inbox heat strip)
// can share the 8-dimension vocabulary with the server classifier
// (./classify.ts re-exports everything here).

// Kept in sync with DIM_META in the streaming analyzer.
export const DIM_KEYS = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"] as const;
export type DimKey = (typeof DIM_KEYS)[number];
export type CoverageLevel = "strong" | "partial" | "missing";

export interface DimCoverage {
  level: CoverageLevel;
  excerpt: string;
}
export type CoverageMap = Record<DimKey, DimCoverage>;

export function safeParseCoverage(raw: string): CoverageMap | null {
  // Strip a leading markdown fence in case the LLM disobeys the "no fence" rule.
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*\n/, "")
    .replace(/\n```\s*$/, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const out: Partial<CoverageMap> = {};
  for (const key of DIM_KEYS) {
    const entry = obj[key];
    if (!entry || typeof entry !== "object") {
      out[key] = { level: "missing", excerpt: "" };
      continue;
    }
    const e = entry as Record<string, unknown>;
    const rawLevel = String(e.level ?? "missing").toLowerCase();
    const level: CoverageLevel =
      rawLevel === "strong" || rawLevel === "partial" || rawLevel === "missing"
        ? (rawLevel as CoverageLevel)
        : "missing";
    const excerpt = typeof e.excerpt === "string" ? e.excerpt.slice(0, 120) : "";
    out[key] = { level, excerpt };
  }
  return out as CoverageMap;
}

/** `{ strong, partial, missing }` counts — the inbox's coverage heat strip. */
export function coverageSummary(coverage: Partial<Record<string, { level?: string }>> | null | undefined): {
  strong: number;
  partial: number;
  missing: number;
} {
  const out = { strong: 0, partial: 0, missing: 0 };
  for (const key of DIM_KEYS) {
    const level = coverage?.[key]?.level;
    if (level === "strong") out.strong += 1;
    else if (level === "partial") out.partial += 1;
    else out.missing += 1;
  }
  return out;
}
