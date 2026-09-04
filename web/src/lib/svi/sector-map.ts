// Wave 27B — industry-string → benchmark-sector normaliser.
//
// The `svi_snapshots.analysis_json.industry` field is a free-text string
// entered at analysis time (e.g. "SaaS", "B2B SaaS platform", "Fintech —
// lending", "Climate tech / hardware"). Cohort benchmarks are stored per
// canonical sector (see svi_sector_benchmarks migration). This helper
// maps any incoming industry label to one of the nine canonical buckets.

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

/**
 * Map a free-text industry string to a canonical benchmark sector.
 * Falls back to "default" for anything unrecognised.
 */
export function industryToSector(raw: string | null | undefined): BenchmarkSector {
  if (!raw) return "default";
  const s = raw.toLowerCase();

  if (/\bsaas\b|software as a service|b2b software|dev\s*tools?|api platform/.test(s)) return "saas";
  if (/marketplace|two[-\s]?sided|platform (?:for|connecting)|matching platform/.test(s)) return "marketplace";
  if (/fintech|payments?|lending|neobank|banking|insurance|insurtech|regtech|wealthtech/.test(s)) return "fintech";
  if (/health(?:tech|care)?|medtech|biotech|pharma|clinical|digital health|telehealth/.test(s)) return "healthtech";
  if (/climate|carbon|renewable|clean\s?tech|sustainab|energy transition|greentech/.test(s)) return "climatetech";
  if (/hardware|iot|robotics?|electronics|manufactur|device|drone|sensor/.test(s)) return "hardware";
  if (/consumer|d2c|dtc|retail|e[-\s]?commerce|marketplace consumer|social app|creator/.test(s)) return "consumer";
  if (/deep[-\s]?tech|quantum|frontier|advanced materials|space|semiconductor|ai research/.test(s)) return "deeptech";

  return "default";
}
