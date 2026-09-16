// Wave 27B — industry-string → benchmark-sector normaliser.
//
// The `svi_snapshots.analysis_json.industry` field is a free-text string
// entered at analysis time (e.g. "SaaS", "B2B SaaS platform", "Fintech —
// lending", "Climate tech / hardware"). Cohort benchmarks are stored per
// canonical sector (see svi_sector_benchmarks migration). This helper
// maps any incoming industry label to one of the nine canonical buckets.
//
// G13 E1.5: the mapping is now DERIVED from the startup taxonomy —
// `crosswalkIndustry()` → `INDUSTRY_TO_BENCHMARK_SECTOR` (§B.2 column 6) —
// so a benchmark bucket can never disagree with the canonical industry a
// dossier badge shows. `marketplace` is a business model, not an industry,
// so the marketplace signal is checked first; the historical regexes stay
// as the LAST resort for the two buckets the taxonomy has no industry for
// (hardware · consumer) and for strings the crosswalk cannot place.
// `taxonomyToBenchmarkSector()` is the row-based entry point for callers
// that already hold a `startup_taxonomy` row.

import { INDUSTRY_TO_BENCHMARK_SECTOR, crosswalkIndustry, type StartupTaxonomyRow } from "@/lib/taxonomy/startup-taxonomy";

export type BenchmarkSector =
  | "saas"
  | "marketplace"
  | "fintech"
  | "healthtech"
  | "climatetech"
  | "hardware"
  | "consumer"
  | "deeptech"
  | "default";

const CANONICAL: readonly BenchmarkSector[] = [
  "saas",
  "marketplace",
  "fintech",
  "healthtech",
  "climatetech",
  "hardware",
  "consumer",
  "deeptech",
  "default",
];

export function isBenchmarkSector(s: string): s is BenchmarkSector {
  return (CANONICAL as readonly string[]).includes(s);
}

const MARKETPLACE_RE = /marketplace|two[-\s]?sided|platform (?:for|connecting)|matching platform/;

/** Historical regex chain — last resort only (see header). */
function legacyRegexSector(s: string): BenchmarkSector {
  if (/\bsaas\b|software as a service|b2b software|dev\s*tools?|api platform/.test(s)) return "saas";
  if (MARKETPLACE_RE.test(s)) return "marketplace";
  if (/fintech|payments?|lending|neobank|banking|insurance|insurtech|regtech|wealthtech/.test(s)) return "fintech";
  if (/health(?:tech|care)?|medtech|biotech|pharma|clinical|digital health|telehealth/.test(s)) return "healthtech";
  if (/climate|carbon|renewable|clean\s?tech|sustainab|energy transition|greentech/.test(s)) return "climatetech";
  if (/hardware|iot|robotics?|electronics|manufactur|device|drone|sensor/.test(s)) return "hardware";
  if (/consumer|d2c|dtc|retail|e[-\s]?commerce|marketplace consumer|social app|creator/.test(s)) return "consumer";
  if (/deep[-\s]?tech|quantum|frontier|advanced materials|space|semiconductor|ai research/.test(s)) return "deeptech";
  return "default";
}

/**
 * Map a free-text industry string to a canonical benchmark sector.
 * Falls back to "default" for anything unrecognised.
 */
export function industryToSector(raw: string | null | undefined): BenchmarkSector {
  if (!raw) return "default";
  const s = raw.toLowerCase();
  // A marketplace is a business model — it wins over the industry words around it
  // exactly as the taxonomy's `multiplesKeyFor()` lets marketplace_platform override.
  if (MARKETPLACE_RE.test(s) && !/\bsaas\b/.test(s)) return "marketplace";
  const industry = crosswalkIndustry(raw);
  if (industry !== "unclassified") {
    const bucket = INDUSTRY_TO_BENCHMARK_SECTOR[industry];
    if (bucket !== "default" && isBenchmarkSector(bucket)) return bucket;
  }
  return legacyRegexSector(s);
}

/** Benchmark bucket for a taxonomy row: marketplace model first, then the industry crosswalk. */
export function taxonomyToBenchmarkSector(t: Pick<StartupTaxonomyRow, "industry" | "business_model"> | null | undefined): BenchmarkSector {
  if (!t) return "default";
  if (t.business_model === "marketplace_platform") return "marketplace";
  const bucket = INDUSTRY_TO_BENCHMARK_SECTOR[t.industry] ?? "default";
  return isBenchmarkSector(bucket) ? bucket : "default";
}
