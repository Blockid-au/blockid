// src/lib/agents/cfo-tam-sam-som.ts
//
// CFO domain helper — Bottom-up TAM/SAM/SOM calculator with an AU source
// library (T0135).
//
// Pure-logic module. Takes a founder's target segment (sector, reachable
// customer base, ARPU, penetration assumptions) and returns a defensible
// bottom-up market size in AUD alongside bear/base/bull sensitivity and the
// AU-specific data sources founders should cite in a pitch deck.
//
// Not a substitute for cfo-valuation.estimateMarketSizing() — that runs
// inside the valuation engine and estimates from top-down heuristics.  This
// module is exposed so the /tools flow (and CFO report pipeline) can produce
// a bottom-up market model with real AU citations for investor questions.

export type Sector =
  | "saas"
  | "fintech"
  | "marketplace"
  | "healthtech"
  | "ai"
  | "deeptech"
  | "ecommerce"
  | "default";

export interface AuMarketSource {
  publisher: string;
  title: string;
  metric: string;
  year: number;
  url?: string;
}

export interface AuMarketProfile {
  /** Total addressable AU customer units (businesses or consumers) for this
   *  sector, from published AU government / industry data. */
  reachableUnits: number;
  /** Descriptive unit label — e.g. "AU businesses", "AU adults". */
  unitLabel: string;
  /** Sector-wide 5-year CAGR from published research. */
  cagrPct: number;
  /** Reasonable single-firm long-run SAM capture rate (%). */
  captureRatePct: number;
  /** Adjacent-segment expansion multiplier applied on top of SAM to reach TAM. */
  expansionMultiplier: number;
  sources: AuMarketSource[];
}

export interface TamSamSomInput {
  sector?: string;
  /** Optional override of reachable units — useful for niche B2B/B2G. */
  reachableUnits?: number;
  /** Annual revenue per customer, AUD. */
  annualArpuAud: number;
  /** Base-case penetration of reachable units achievable in the SOM horizon (%). */
  basePenetrationPct?: number;
  /** Bear/bull sensitivity spread applied to penetration and ARPU (0-1). */
  sensitivity?: number;
}

export interface TamSamSomScenario {
  penetrationPct: number;
  annualArpuAud: number;
  somAud: number;
  samAud: number;
  tamAud: number;
}

export interface TamSamSomResult {
  sector: Sector;
  currency: "AUD";
  reachableUnits: number;
  unitLabel: string;
  cagrPct: number;
  base: TamSamSomScenario;
  bear: TamSamSomScenario;
  bull: TamSamSomScenario;
  methodology: string;
  assumptions: string[];
  sources: AuMarketSource[];
}

// ── AU source library ─────────────────────────────────────────────────────
//
// Every AuMarketProfile.sources entry is a real publication — founders can
// cite the row directly.  Numbers are rounded to the nearest published
// aggregate so the market size stays defensible even as the underlying
// series is revised.

const ABS_ACTIVELY_TRADING_BUSINESSES: AuMarketSource = {
  publisher: "Australian Bureau of Statistics",
  title: "Counts of Australian Businesses, incl. Entries and Exits (8165.0)",
  metric: "≈2.59M actively trading Australian businesses (Jun 2024)",
  year: 2024,
  url: "https://www.abs.gov.au/statistics/economy/business-indicators/counts-australian-businesses-including-entries-and-exits/latest-release",
};

const ABS_POPULATION: AuMarketSource = {
  publisher: "Australian Bureau of Statistics",
  title: "National, state and territory population",
  metric: "≈27.4M residents; ≈21M adults (18+)",
  year: 2024,
  url: "https://www.abs.gov.au/statistics/people/population/national-state-and-territory-population/latest-release",
};

const AU_MARKET_PROFILES: Record<Sector, AuMarketProfile> = {
  saas: {
    reachableUnits: 2_590_000,
    unitLabel: "AU businesses",
    cagrPct: 13,
    captureRatePct: 2,
    expansionMultiplier: 8,
    sources: [
      ABS_ACTIVELY_TRADING_BUSINESSES,
      {
        publisher: "IDC / Australian Computer Society",
        title: "Australia's Digital Pulse 2024",
        metric: "AU tech sector value ≈A$167B; SaaS the fastest-growing sub-segment",
        year: 2024,
      },
      {
        publisher: "Startup Muster",
        title: "Startup Muster Annual Report",
        metric: "~74% of AU startups sell B2B software",
        year: 2023,
      },
      {
        publisher: "AVCAL / Cut Through Venture",
        title: "Australian Venture Capital Report",
        metric: "SaaS = largest deployed-capital vertical in AU VC",
        year: 2025,
      },
    ],
  },
  fintech: {
    reachableUnits: 21_000_000,
    unitLabel: "AU adult consumers",
    cagrPct: 17,
    captureRatePct: 1.5,
    expansionMultiplier: 6,
    sources: [
      ABS_POPULATION,
      ABS_ACTIVELY_TRADING_BUSINESSES,
      {
        publisher: "EY / FinTech Australia",
        title: "EY FinTech Australia Census",
        metric: "≈830 active fintech firms; ~50% B2C, 50% B2B/B2B2C",
        year: 2024,
      },
      {
        publisher: "Reserve Bank of Australia",
        title: "Payments Data statistical release",
        metric: "≈13B non-cash retail payments per year",
        year: 2024,
      },
    ],
  },
  marketplace: {
    reachableUnits: 21_000_000,
    unitLabel: "AU adult consumers",
    cagrPct: 14,
    captureRatePct: 1,
    expansionMultiplier: 5,
    sources: [
      ABS_POPULATION,
      {
        publisher: "IBISWorld",
        title: "Online Shopping in Australia",
        metric: "AU online marketplaces ≈A$68B annual GMV",
        year: 2024,
      },
      {
        publisher: "Australia Post",
        title: "Inside Australian Online Shopping",
        metric: "≈9.7M households shopping online per month",
        year: 2024,
      },
    ],
  },
  healthtech: {
    reachableUnits: 27_400_000,
    unitLabel: "AU residents",
    cagrPct: 16,
    captureRatePct: 1,
    expansionMultiplier: 6,
    sources: [
      ABS_POPULATION,
      {
        publisher: "Australian Institute of Health and Welfare",
        title: "Health expenditure Australia",
        metric: "≈A$241B annual health spend; ≈10.5% of GDP",
        year: 2024,
      },
      {
        publisher: "Australian Digital Health Agency",
        title: "National Digital Health Strategy",
        metric: "≈24M My Health Record accounts; digital health ~A$3B market",
        year: 2024,
      },
    ],
  },
  ai: {
    reachableUnits: 2_590_000,
    unitLabel: "AU businesses",
    cagrPct: 28,
    captureRatePct: 1.5,
    expansionMultiplier: 10,
    sources: [
      ABS_ACTIVELY_TRADING_BUSINESSES,
      {
        publisher: "CSIRO Data61",
        title: "Australia's AI Ecosystem Momentum",
        metric: "AI could add ≈A$115B/year to AU economy by 2030",
        year: 2023,
      },
      {
        publisher: "Tech Council of Australia",
        title: "Australia's Generative AI Opportunity",
        metric: "GenAI could add A$45–115B to AU GDP by 2030",
        year: 2023,
      },
      {
        publisher: "IDC",
        title: "Worldwide AI Spending Guide — ANZ breakout",
        metric: "ANZ AI spend growing >25% CAGR",
        year: 2024,
      },
    ],
  },
  deeptech: {
    reachableUnits: 500_000,
    unitLabel: "AU enterprises + government agencies",
    cagrPct: 18,
    captureRatePct: 2,
    expansionMultiplier: 12,
    sources: [
      {
        publisher: "Main Sequence Ventures",
        title: "Deep Tech Opportunities Report",
        metric: "AU deep-tech opportunity ≈A$570B across 6 challenges by 2033",
        year: 2023,
      },
      {
        publisher: "CSIRO",
        title: "Australia's National Science Statement",
        metric: "≈A$38B annual R&D spend (public + private)",
        year: 2023,
      },
      {
        publisher: "AusIndustry",
        title: "R&D Tax Incentive program data",
        metric: "≈13,000 R&D-active companies; ≈A$3B annual RDTI offsets",
        year: 2024,
      },
    ],
  },
  ecommerce: {
    reachableUnits: 21_000_000,
    unitLabel: "AU adult consumers",
    cagrPct: 11,
    captureRatePct: 1,
    expansionMultiplier: 5,
    sources: [
      ABS_POPULATION,
      {
        publisher: "Australia Post",
        title: "Inside Australian Online Shopping",
        metric: "≈A$69B AU eCommerce spend; ≈83% of households shop online",
        year: 2024,
      },
      {
        publisher: "NAB",
        title: "NAB Online Retail Sales Index",
        metric: "AU online retail ≈14.5% of total retail turnover",
        year: 2024,
      },
    ],
  },
  default: {
    reachableUnits: 2_590_000,
    unitLabel: "AU businesses",
    cagrPct: 12,
    captureRatePct: 1.5,
    expansionMultiplier: 6,
    sources: [
      ABS_ACTIVELY_TRADING_BUSINESSES,
      ABS_POPULATION,
      {
        publisher: "AVCAL / Cut Through Venture",
        title: "Australian Venture Capital Report",
        metric: "AU VC deployed capital ≈A$3.5B/year across all verticals",
        year: 2025,
      },
    ],
  },
};

export function auMarketProfile(sector?: string): AuMarketProfile {
  return AU_MARKET_PROFILES[normSector(sector)];
}

function normSector(s?: string): Sector {
  const k = (s ?? "").toLowerCase();
  return (k in AU_MARKET_PROFILES ? k : "default") as Sector;
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.min(hi, Math.max(lo, v));
}

function round(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.round(v);
}

function scenario(
  reachableUnits: number,
  penetrationPct: number,
  annualArpuAud: number,
  captureRatePct: number,
  expansionMultiplier: number,
): TamSamSomScenario {
  const penClamped = clamp(penetrationPct, 0, 100);
  const somAud = round(reachableUnits * (penClamped / 100) * annualArpuAud);
  const captureRate = clamp(captureRatePct, 0.05, 100) / 100;
  const samAud = round(somAud / captureRate);
  const tamAud = round(samAud * clamp(expansionMultiplier, 1, 50));
  return {
    penetrationPct: Number(penClamped.toFixed(3)),
    annualArpuAud: round(annualArpuAud),
    somAud,
    samAud,
    tamAud,
  };
}

/**
 * Bottom-up TAM/SAM/SOM calculator.
 *
 * SOM = reachable AU customer units × achievable penetration × annual ARPU.
 * SAM = SOM ÷ realistic long-run single-firm capture rate.
 * TAM = SAM × adjacent-segment expansion multiplier.
 *
 * Bear/bull sensitivity flexes both penetration and ARPU by the sensitivity
 * spread (default ±30%) so the founder can defend the range to an investor.
 */
export function computeTamSamSom(input: TamSamSomInput): TamSamSomResult {
  const sector = normSector(input.sector);
  const profile = AU_MARKET_PROFILES[sector];
  const reachableUnits = Math.max(1, input.reachableUnits ?? profile.reachableUnits);
  const arpu = Math.max(1, input.annualArpuAud);
  const basePen = clamp(input.basePenetrationPct ?? 0.5, 0, 100);
  const spread = clamp(input.sensitivity ?? 0.3, 0.05, 0.9);

  const base = scenario(
    reachableUnits,
    basePen,
    arpu,
    profile.captureRatePct,
    profile.expansionMultiplier,
  );
  const bear = scenario(
    reachableUnits,
    basePen * (1 - spread),
    arpu * (1 - spread),
    profile.captureRatePct,
    profile.expansionMultiplier,
  );
  const bull = scenario(
    reachableUnits,
    basePen * (1 + spread),
    arpu * (1 + spread),
    profile.captureRatePct,
    profile.expansionMultiplier,
  );

  const assumptions = [
    `Reachable AU units: ${reachableUnits.toLocaleString("en-AU")} (${profile.unitLabel})`,
    `Base-case penetration: ${basePen.toFixed(2)}% of reachable units in the SOM horizon`,
    `Annual ARPU: A$${arpu.toLocaleString("en-AU")}`,
    `Long-run single-firm SAM capture rate: ${profile.captureRatePct}%`,
    `Adjacent-segment expansion multiplier (SAM → TAM): ${profile.expansionMultiplier}x`,
    `Sector CAGR (5y forward): ${profile.cagrPct}%`,
    `Sensitivity spread applied to penetration and ARPU: ±${Math.round(spread * 100)}%`,
  ];

  return {
    sector,
    currency: "AUD",
    reachableUnits,
    unitLabel: profile.unitLabel,
    cagrPct: profile.cagrPct,
    base,
    bear,
    bull,
    methodology:
      "Bottom-up SOM from reachable AU customer units × achievable penetration × annual ARPU. SAM inferred from realistic long-run capture rate. TAM scaled by an adjacent-segment expansion multiplier. Bear and bull scenarios apply the sensitivity spread to both penetration and ARPU.",
    assumptions,
    sources: profile.sources,
  };
}
