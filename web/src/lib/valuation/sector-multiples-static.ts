// Static sector revenue-multiple table (S27-C, 2026-09-13).
//
// Lifted verbatim from src/lib/agents/cfo-valuation.ts so the resolver in
// ./sector-multiples.ts can import it without a circular dependency. This
// file is the FALLBACK: `getSectorMultiples()` returns the latest approved
// `sector_multiples_overrides` row (migration 0369) when one is effective,
// else the row below. Nothing here changes for users until an admin approves
// an override that carries a real, fetched citation — so keep editing this
// table by hand only with a source and a date in `source`.
//
// `cfo-valuation.ts` re-exports `Sector`, `VcBenchmark` and `SECTOR_MULTIPLES`
// so every existing import keeps working. Pure — no I/O, no `server-only`.

/** Label the resolver attaches when the static row wins. */
export const STATIC_SOURCE_LABEL = "BlockID static table (2026-06)";

export type Sector =
  | "saas"
  | "fintech"
  | "marketplace"
  | "healthtech"
  | "ai"
  | "deeptech"
  | "ecommerce"
  | "cybertech"
  | "wealthtech"
  | "biotech"
  | "cleantech"
  | "edtech"
  | "proptech"
  | "agtech"
  | "insurtech"
  | "legaltech"
  | "gaming"
  | "hrtech"
  | "mediatech"
  | "sportstech"
  | "traveltech"
  | "logisticstech"
  | "retailtech"
  | "govtech"
  | "constructiontech"
  | "spacetech"
  | "default";

export interface VcBenchmark {
  sector: Sector;
  medianMultiple: number;
  multipleRange: [number, number];
  source: string;
  sources?: string[];
  premiumFactor?: number;
  arrMultiple?: { low: number; mid: number; high: number };
  grossMarginTarget?: number;
}

/**
 * Sector Multiples based on Bessemer, Carta, and PitchBook 2024/25
 */
export const SECTOR_MULTIPLES: Record<Sector, VcBenchmark> = {
  saas: { sector: "saas", medianMultiple: 6.75, multipleRange: [6.0, 7.5], source: "Bessemer Venture Partners" },
  ai: { sector: "ai", medianMultiple: 16.0, multipleRange: [12.0, 20.0], source: "Carta / PitchBook", premiumFactor: 1.5 },
  fintech: { sector: "fintech", medianMultiple: 5.25, multipleRange: [4.5, 6.0], source: "SaaS Capital / PitchBook" },
  marketplace: { sector: "marketplace", medianMultiple: 4.0, multipleRange: [3.0, 5.0], source: "PitchBook" },
  healthtech: { sector: "healthtech", medianMultiple: 6.5, multipleRange: [5.0, 8.0], source: "Digital Health Benchmarks" },
  deeptech: { sector: "deeptech", medianMultiple: 8.0, multipleRange: [6.0, 12.0], source: "Internal BlockID / Industry" },
  ecommerce: { sector: "ecommerce", medianMultiple: 2.5, multipleRange: [1.5, 4.0], source: "Public Comps" },
  cybertech: { sector: "cybertech", medianMultiple: 7.0, multipleRange: [6.0, 9.0], source: "Bessemer" },
  wealthtech: { sector: "wealthtech", medianMultiple: 5.0, multipleRange: [4.0, 6.0], source: "PitchBook" },
  biotech: { sector: "biotech", medianMultiple: 10.0, multipleRange: [5.0, 25.0], source: "Biotech VC Index" },
  cleantech: { sector: "cleantech", medianMultiple: 6.0, multipleRange: [4.0, 10.0], source: "Clean Energy VC" },
  edtech: { sector: "edtech", medianMultiple: 4.0, multipleRange: [3.0, 6.0], source: "SaaS Capital" },
  proptech: { sector: "proptech", medianMultiple: 4.5, multipleRange: [3.5, 6.0], source: "PitchBook" },
  agtech: { sector: "agtech", medianMultiple: 4.0, multipleRange: [3.0, 5.0], source: "AgTech Global" },
  insurtech: { sector: "insurtech", medianMultiple: 5.0, multipleRange: [4.0, 7.0], source: "SaaS Capital" },
  legaltech: { sector: "legaltech", medianMultiple: 5.0, multipleRange: [4.0, 6.0], source: "PitchBook" },
  gaming: { sector: "gaming", medianMultiple: 6.0, multipleRange: [4.0, 10.0], source: "Gaming Industry Benchmarks" },
  hrtech: { sector: "hrtech", medianMultiple: 5.5, multipleRange: [4.5, 6.5], source: "SaaS Capital / Deel & Rippling comps 2025" },
  mediatech: { sector: "mediatech", medianMultiple: 4.0, multipleRange: [3.0, 5.5], source: "PitchBook Media & CreatorTech 2025" },
  sportstech: { sector: "sportstech", medianMultiple: 4.5, multipleRange: [3.5, 6.0], source: "PitchBook SportsTech Report 2025" },
  traveltech: { sector: "traveltech", medianMultiple: 3.5, multipleRange: [2.5, 5.0], source: "Skift Research / Phocuswright 2025" },
  logisticstech: { sector: "logisticstech", medianMultiple: 4.5, multipleRange: [3.5, 6.0], source: "PitchBook Supply Chain & Logistics 2025" },
  retailtech: { sector: "retailtech", medianMultiple: 3.5, multipleRange: [2.5, 5.0], source: "SaaS Capital / RetailTech comps 2025" },
  govtech: { sector: "govtech", medianMultiple: 6.0, multipleRange: [5.0, 8.0], source: "GovTech VC Index 2025 (long-cycle contracts)" },
  constructiontech: { sector: "constructiontech", medianMultiple: 4.5, multipleRange: [3.5, 6.0], source: "PitchBook Built World / ConTech 2025" },
  spacetech: { sector: "spacetech", medianMultiple: 7.0, multipleRange: [5.0, 12.0], source: "Space Capital / Bryce Space 2025 (deeptech premium)" },
  default: { sector: "default", medianMultiple: 5.0, multipleRange: [4.0, 6.0], source: "Generalist VC" },
};

/** Every sector key the table knows — the override table's `sector` CHECK mirrors this list (migration 0369). */
export const SECTOR_KEYS = Object.keys(SECTOR_MULTIPLES) as Sector[];

export function isSectorKey(value: string): value is Sector {
  return Object.prototype.hasOwnProperty.call(SECTOR_MULTIPLES, value);
}

/** Static {low, mid, high} ARR multiple for a sector (unknown → default). */
export function staticArrMultiple(sector: string): { sector: Sector; low: number; mid: number; high: number; citation: string } {
  const key: Sector = isSectorKey(sector) ? sector : "default";
  const row = SECTOR_MULTIPLES[key];
  const arr = row.arrMultiple ?? { low: row.multipleRange[0], mid: row.medianMultiple, high: row.multipleRange[1] };
  return { sector: key, low: arr.low, mid: arr.mid, high: arr.high, citation: row.source };
}
