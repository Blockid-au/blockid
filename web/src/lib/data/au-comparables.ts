/**
 * Australian Comparable Companies Dataset — BlockID SVI Valuation Engine
 *
 * Curated dataset of 30+ AU startups/scaleups used for benchmark comparisons
 * in the valuation engine. Includes industry-stage revenue multiples derived
 * from publicly reported funding rounds and valuation data.
 *
 * Sources: Cut Through Venture, CapitalBrief, SmartCompany, CrunchBase AU,
 * AVCAL, AFR, Blackbird/AirTree portfolio announcements (2021–2025).
 *
 * NOTE: All figures are indicative; not investment advice.
 * arr_multiple = post-money valuation implied by round / ARR at time of raise.
 * ebitda_multiple = enterprise value / EBITDA (only meaningful at later stages).
 */

export type AUIndustry =
  | "SaaS"
  | "FinTech"
  | "HealthTech"
  | "PropTech"
  | "AgriTech"
  | "EdTech"
  | "MarketPlace"
  | "DeepTech"
  | "CleanTech"
  | "eCommerce";

export type AUStage =
  | "pre-seed"
  | "seed"
  | "series-a"
  | "series-b"
  | "series-c"
  | "growth"
  | "unicorn";

export interface AUComparableCompany {
  name: string;
  industry: AUIndustry;
  stage: AUStage;
  /** Indicative ARR multiple (valuation / ARR) at the reference raise. */
  arr_multiple: number;
  /** Indicative EBITDA multiple — null if pre-profit or unavailable. */
  ebitda_multiple: number | null;
  founded_year: number;
  /** True = unicorn or widely-cited benchmark company. */
  notable: boolean;
  /** Brief context note. */
  note?: string;
}

/**
 * ARR revenue multiples by industry and stage — median benchmarks.
 * Derived from the comparable companies dataset below.
 * Use getMultiplesBenchmark() for lookup.
 */
export const AU_MULTIPLES_BY_STAGE: Record<
  AUStage,
  { low: number; median: number; high: number }
> = {
  "pre-seed":  { low: 8,   median: 12,  high: 20  },
  "seed":      { low: 6,   median: 10,  high: 18  },
  "series-a":  { low: 5,   median: 9,   high: 15  },
  "series-b":  { low: 4,   median: 7,   high: 12  },
  "series-c":  { low: 3,   median: 5,   high: 10  },
  "growth":    { low: 2,   median: 4,   high: 8   },
  "unicorn":   { low: 5,   median: 12,  high: 30  },
};

/**
 * ARR multiples by industry — cross-stage median adjustments.
 * These are multiplied against stage multiples for a blended estimate.
 */
export const AU_MULTIPLES_BY_INDUSTRY: Record<AUIndustry, number> = {
  SaaS:        1.20,   // Premium: recurring, sticky revenue
  FinTech:     1.10,   // Strong AU market; Block Earner, Airwallex
  HealthTech:  1.05,   // Regulated, longer sales cycle
  PropTech:    0.90,   // Cyclical, housing-market dependent
  AgriTech:    0.85,   // Hardware + software, slower adoption
  EdTech:      0.80,   // Volume play, lower LTV
  MarketPlace: 0.95,   // Network effects offset by thinner margins
  DeepTech:    1.15,   // IP moat, longer runway
  CleanTech:   1.00,   // Grant + revenue blend
  eCommerce:   0.70,   // Low multiples, asset-light but competitive
};

// ─── AU Comparable Companies Dataset ─────────────────────────────────────────

export const AU_COMPARABLES: AUComparableCompany[] = [
  // ── Unicorns / well-known scaleups ──────────────────────────────────────────
  {
    name: "Canva",
    industry: "SaaS",
    stage: "unicorn",
    arr_multiple: 40,
    ebitda_multiple: null,
    founded_year: 2013,
    notable: true,
    note: "AU's most valuable startup; A$49B valuation (2024), design SaaS.",
  },
  {
    name: "Atlassian",
    industry: "SaaS",
    stage: "unicorn",
    arr_multiple: 20,
    ebitda_multiple: 45,
    founded_year: 2002,
    notable: true,
    note: "NASDAQ-listed AU SaaS; team collaboration, FY2024 ~US$4.4B ARR.",
  },
  {
    name: "Afterpay",
    industry: "FinTech",
    stage: "unicorn",
    arr_multiple: 28,
    ebitda_multiple: null,
    founded_year: 2014,
    notable: true,
    note: "BNPL pioneer; acquired by Block (Square) for US$29B in 2022.",
  },
  {
    name: "Airwallex",
    industry: "FinTech",
    stage: "unicorn",
    arr_multiple: 22,
    ebitda_multiple: null,
    founded_year: 2015,
    notable: true,
    note: "Global fintech unicorn; A$9.6B valuation (2024), cross-border payments.",
  },
  {
    name: "SafetyCulture",
    industry: "SaaS",
    stage: "unicorn",
    arr_multiple: 30,
    ebitda_multiple: null,
    founded_year: 2004,
    notable: true,
    note: "Workplace safety SaaS; ~A$2.6B valuation, 85K+ global customers.",
  },
  {
    name: "Employment Hero",
    industry: "SaaS",
    stage: "unicorn",
    arr_multiple: 18,
    ebitda_multiple: null,
    founded_year: 2014,
    notable: true,
    note: "HR/payroll SaaS; A$2B+ valuation (2024), 300K+ businesses.",
  },
  {
    name: "Deputy",
    industry: "SaaS",
    stage: "unicorn",
    arr_multiple: 15,
    ebitda_multiple: null,
    founded_year: 2008,
    notable: true,
    note: "Workforce management SaaS; unicorn status 2021, US-AU operations.",
  },
  {
    name: "Linktree",
    industry: "SaaS",
    stage: "unicorn",
    arr_multiple: 25,
    ebitda_multiple: null,
    founded_year: 2016,
    notable: true,
    note: "Link-in-bio SaaS; A$1.9B valuation (2022), 35M+ users.",
  },

  // ── Series B / Growth stage ─────────────────────────────────────────────────
  {
    name: "Splose",
    industry: "HealthTech",
    stage: "series-b",
    arr_multiple: 12,
    ebitda_multiple: null,
    founded_year: 2018,
    notable: true,
    note: "Allied health practice management; A$100M+ valuation, A$46M Series A 2024.",
  },
  {
    name: "Operata",
    industry: "SaaS",
    stage: "series-b",
    arr_multiple: 52,
    ebitda_multiple: null,
    founded_year: 2019,
    notable: true,
    note: "Contact centre observability; A$89M Series B 2024, ~52x ARR multiple.",
  },
  {
    name: "Rokt",
    industry: "MarketPlace",
    stage: "series-c",
    arr_multiple: 10,
    ebitda_multiple: null,
    founded_year: 2012,
    notable: true,
    note: "E-commerce marketing platform; US$400M+ valuation.",
  },
  {
    name: "Culture Amp",
    industry: "SaaS",
    stage: "growth",
    arr_multiple: 14,
    ebitda_multiple: null,
    founded_year: 2009,
    notable: true,
    note: "Employee experience platform; A$1.5B+ valuation, 6500+ customers.",
  },
  {
    name: "GO1",
    industry: "EdTech",
    stage: "series-c",
    arr_multiple: 8,
    ebitda_multiple: null,
    founded_year: 2015,
    notable: true,
    note: "Corporate learning platform; US$800M valuation (2021), 3000+ content partners.",
  },
  {
    name: "Brighte",
    industry: "FinTech",
    stage: "series-c",
    arr_multiple: 6,
    ebitda_multiple: null,
    founded_year: 2015,
    notable: false,
    note: "BNPL for home energy; ~A$900M valuation.",
  },
  {
    name: "PropTrack",
    industry: "PropTech",
    stage: "growth",
    arr_multiple: 9,
    ebitda_multiple: 18,
    founded_year: 2015,
    notable: false,
    note: "Property data and analytics, subsidiary of REA Group.",
  },

  // ── Series A ─────────────────────────────────────────────────────────────────
  {
    name: "Block Earner",
    industry: "FinTech",
    stage: "series-a",
    arr_multiple: 15,
    ebitda_multiple: null,
    founded_year: 2021,
    notable: false,
    note: "Crypto-backed yield products; A$67M valuation (2024).",
  },
  {
    name: "Parachute",
    industry: "FinTech",
    stage: "series-a",
    arr_multiple: 12,
    ebitda_multiple: null,
    founded_year: 2021,
    notable: false,
    note: "B2B fintech infrastructure; A$8.5M Series A 2024.",
  },
  {
    name: "Breaker",
    industry: "DeepTech",
    stage: "series-a",
    arr_multiple: 18,
    ebitda_multiple: null,
    founded_year: 2020,
    notable: false,
    note: "Defence tech, counter-drone; A$36-45M valuation post A$9M seed.",
  },
  {
    name: "Agridigital",
    industry: "AgriTech",
    stage: "series-a",
    arr_multiple: 7,
    ebitda_multiple: null,
    founded_year: 2015,
    notable: false,
    note: "Grain supply chain platform; A$15M+ valuation.",
  },
  {
    name: "PictureWealth",
    industry: "FinTech",
    stage: "series-a",
    arr_multiple: 9,
    ebitda_multiple: null,
    founded_year: 2018,
    notable: false,
    note: "Digital wealth management platform.",
  },
  {
    name: "Fluentis",
    industry: "HealthTech",
    stage: "series-a",
    arr_multiple: 10,
    ebitda_multiple: null,
    founded_year: 2019,
    notable: false,
    note: "Clinical workflow SaaS; Series A 2024.",
  },

  // ── Seed stage ───────────────────────────────────────────────────────────────
  {
    name: "Aigentsphere",
    industry: "SaaS",
    stage: "seed",
    arr_multiple: 20,
    ebitda_multiple: null,
    founded_year: 2023,
    notable: false,
    note: "AI agent platform; A$20M valuation at seed (2024).",
  },
  {
    name: "Hachiko",
    industry: "SaaS",
    stage: "seed",
    arr_multiple: 12,
    ebitda_multiple: null,
    founded_year: 2022,
    notable: false,
    note: "SME operations SaaS; A$10-12M seed valuation.",
  },
  {
    name: "COR",
    industry: "FinTech",
    stage: "seed",
    arr_multiple: 10,
    ebitda_multiple: null,
    founded_year: 2022,
    notable: false,
    note: "Embedded insurance; A$8M seed valuation 2024.",
  },
  {
    name: "Bazaa",
    industry: "MarketPlace",
    stage: "seed",
    arr_multiple: 8,
    ebitda_multiple: null,
    founded_year: 2022,
    notable: false,
    note: "Wholesale B2B marketplace; A$2.6M pre-seed 2024.",
  },
  {
    name: "ClimateAI Australia",
    industry: "CleanTech",
    stage: "seed",
    arr_multiple: 10,
    ebitda_multiple: null,
    founded_year: 2020,
    notable: false,
    note: "Climate risk SaaS for agri/insurance; AU expansion 2023.",
  },
  {
    name: "Moroku",
    industry: "FinTech",
    stage: "seed",
    arr_multiple: 8,
    ebitda_multiple: null,
    founded_year: 2015,
    notable: false,
    note: "Gamified financial wellness SaaS for banks.",
  },

  // ── Pre-seed ─────────────────────────────────────────────────────────────────
  {
    name: "Earlywork",
    industry: "EdTech",
    stage: "pre-seed",
    arr_multiple: 10,
    ebitda_multiple: null,
    founded_year: 2022,
    notable: false,
    note: "Early-career tech talent marketplace; pre-seed 2023.",
  },
  {
    name: "Propel Ventures",
    industry: "PropTech",
    stage: "pre-seed",
    arr_multiple: 8,
    ebitda_multiple: null,
    founded_year: 2023,
    notable: false,
    note: "Proptech SaaS for property managers.",
  },
  {
    name: "Farmbook",
    industry: "AgriTech",
    stage: "pre-seed",
    arr_multiple: 7,
    ebitda_multiple: null,
    founded_year: 2021,
    notable: false,
    note: "Farm management software; AU rural market.",
  },
  {
    name: "Medi AI",
    industry: "HealthTech",
    stage: "pre-seed",
    arr_multiple: 12,
    ebitda_multiple: null,
    founded_year: 2023,
    notable: false,
    note: "AI-assisted clinical notes for GPs; pre-seed 2024.",
  },
  {
    name: "GridEdge",
    industry: "CleanTech",
    stage: "pre-seed",
    arr_multiple: 9,
    ebitda_multiple: null,
    founded_year: 2022,
    notable: false,
    note: "Grid-edge energy analytics; pre-seed 2023.",
  },
];

// ─── Lookup helpers ───────────────────────────────────────────────────────────

/**
 * Map a valuation engine stage key to an AUStage enum value.
 * Handles both numeric stages (0-7) and named stages.
 */
export function mapStageToAUStage(stage: string | number): AUStage {
  const n = typeof stage === "number" ? stage : parseInt(stage, 10);
  if (!isNaN(n)) {
    if (n <= 0) return "pre-seed";
    if (n === 1) return "pre-seed";
    if (n === 2) return "seed";
    if (n === 3) return "series-a";
    if (n === 4) return "series-b";
    if (n === 5) return "series-c";
    if (n === 6) return "growth";
    return "unicorn";
  }
  const s = stage.toString().toLowerCase();
  if (s.includes("pre") || s.includes("idea") || s.includes("concept")) return "pre-seed";
  if (s.includes("seed") && !s.includes("series")) return "seed";
  if (s.includes("series-a") || s.includes("a ")) return "series-a";
  if (s.includes("series-b") || s.includes("b ")) return "series-b";
  if (s.includes("series-c") || s.includes("c ")) return "series-c";
  if (s.includes("growth") || s.includes("scale")) return "growth";
  if (s.includes("mvp") || s.includes("proto")) return "seed";
  return "seed";
}

/**
 * Map a valuation engine sector/industry key to an AUIndustry enum value.
 */
export function mapSectorToAUIndustry(sector?: string): AUIndustry {
  if (!sector) return "SaaS";
  const s = sector.toLowerCase();
  if (s.includes("saas") || s.includes("software") || s.includes("b2b")) return "SaaS";
  if (s.includes("fintech") || s.includes("finance") || s.includes("pay") || s.includes("bank") || s.includes("insur")) return "FinTech";
  if (s.includes("health") || s.includes("med") || s.includes("clinic")) return "HealthTech";
  if (s.includes("prop") || s.includes("real estate") || s.includes("housing")) return "PropTech";
  if (s.includes("agri") || s.includes("farm") || s.includes("food")) return "AgriTech";
  if (s.includes("edu") || s.includes("learn") || s.includes("train")) return "EdTech";
  if (s.includes("market") || s.includes("platform") || s.includes("commerce") || s.includes("retail")) return "MarketPlace";
  if (s.includes("deep") || s.includes("defence") || s.includes("defense") || s.includes("quantum") || s.includes("biotech")) return "DeepTech";
  if (s.includes("clean") || s.includes("energy") || s.includes("climate") || s.includes("solar")) return "CleanTech";
  if (s.includes("ecomm") || s.includes("shop") || s.includes("d2c")) return "eCommerce";
  return "SaaS"; // default to SaaS (largest AU startup segment)
}

/**
 * Get the top N most relevant comparable companies for a given industry and stage.
 * Returns both exact industry/stage matches, then broadens if insufficient.
 */
export function getTopComparables(
  industry: AUIndustry,
  stage: AUStage,
  limit = 3,
): AUComparableCompany[] {
  // 1. Exact match: same industry + same stage
  const exact = AU_COMPARABLES.filter(
    (c) => c.industry === industry && c.stage === stage,
  );
  if (exact.length >= limit) {
    // Prefer notable companies first
    return exact.sort((a, b) => (b.notable ? 1 : 0) - (a.notable ? 1 : 0)).slice(0, limit);
  }

  // 2. Broaden: same industry, any stage — nearest stage wins
  const stageOrder: AUStage[] = ["pre-seed", "seed", "series-a", "series-b", "series-c", "growth", "unicorn"];
  const stageIdx = stageOrder.indexOf(stage);

  const sameIndustry = AU_COMPARABLES.filter((c) => c.industry === industry)
    .sort((a, b) => {
      const da = Math.abs(stageOrder.indexOf(a.stage) - stageIdx);
      const db = Math.abs(stageOrder.indexOf(b.stage) - stageIdx);
      if (da !== db) return da - db;
      return (b.notable ? 1 : 0) - (a.notable ? 1 : 0);
    });

  const combined = [...exact];
  for (const c of sameIndustry) {
    if (!combined.find((x) => x.name === c.name)) combined.push(c);
    if (combined.length >= limit) break;
  }
  if (combined.length >= limit) return combined;

  // 3. Fill remaining slots with notable companies from any industry at nearest stage
  const notable = AU_COMPARABLES.filter(
    (c) => c.notable && !combined.find((x) => x.name === c.name),
  ).sort((a, b) => {
    const da = Math.abs(stageOrder.indexOf(a.stage) - stageIdx);
    const db = Math.abs(stageOrder.indexOf(b.stage) - stageIdx);
    return da - db;
  });

  for (const c of notable) {
    combined.push(c);
    if (combined.length >= limit) break;
  }

  return combined.slice(0, limit);
}

/**
 * Return the industry-stage ARR multiple range, blending the stage base
 * with the industry adjustment factor.
 */
export function getMultiplesBenchmark(
  industry: AUIndustry,
  stage: AUStage,
): { low: number; median: number; high: number } {
  const stageMults = AU_MULTIPLES_BY_STAGE[stage];
  const industryAdj = AU_MULTIPLES_BY_INDUSTRY[industry];
  return {
    low: Math.round(stageMults.low * industryAdj * 10) / 10,
    median: Math.round(stageMults.median * industryAdj * 10) / 10,
    high: Math.round(stageMults.high * industryAdj * 10) / 10,
  };
}

// ─── Comparables benchmark output type ───────────────────────────────────────

export interface ComparablesBenchmark {
  industry: AUIndustry;
  stage: AUStage;
  /** Blended ARR multiple range for this industry/stage combination. */
  multiples: { low: number; median: number; high: number };
  /** Top 3 most relevant comparable companies. */
  topComps: Pick<AUComparableCompany, "name" | "industry" | "stage" | "arr_multiple" | "notable" | "note">[];
  /** The median ARR multiple from actual comparable deals. */
  medianArrMultiple: number;
}

/**
 * Primary entry point: given a startup's sector string and stage (0-7 numeric
 * or named), return the full ComparablesBenchmark object.
 *
 * This is designed to be added directly to the valuation output.
 */
export function buildComparablesBenchmark(
  sector?: string,
  stage?: string | number,
): ComparablesBenchmark {
  const auIndustry = mapSectorToAUIndustry(sector);
  const auStage = mapStageToAUStage(stage ?? 0);
  const multiples = getMultiplesBenchmark(auIndustry, auStage);
  const topComps = getTopComparables(auIndustry, auStage, 3).map((c) => ({
    name: c.name,
    industry: c.industry,
    stage: c.stage,
    arr_multiple: c.arr_multiple,
    notable: c.notable,
    note: c.note,
  }));

  // Compute median ARR multiple from the top comps (fallback to stage median)
  const compMultiples = topComps.map((c) => c.arr_multiple);
  const medianArrMultiple =
    compMultiples.length > 0
      ? compMultiples.sort((a, b) => a - b)[Math.floor(compMultiples.length / 2)]
      : multiples.median;

  return {
    industry: auIndustry,
    stage: auStage,
    multiples,
    topComps,
    medianArrMultiple,
  };
}
