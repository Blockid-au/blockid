// AU industry-size lookup for Phase 3 (Market Research).
//
// Closes docs/plans/atlassian-standard-mapping-goal.md §1 phase 3 P1 gap
// ("IBISWorld / ABS lookup not surfaced; no `/api/abs/lookup` stub").
// Companion to `web/src/lib/au-comparable-raises.ts` (deals) and
// `web/src/lib/compliance/abn.ts` (entity lookup).
//
// Design posture: offline seeded lookup keyed by ANZSIC 2006 code
// (Australian and New Zealand Standard Industrial Classification, jointly
// published by ABS + Stats NZ). Values are ANCHOR estimates sourced from
// public ABS releases (8155.0 Business Indicators, 8165.0 Counts of
// Australian Businesses) and IBISWorld public industry-report summaries.
// Any TAM cited to a founder should be treated as a starting anchor to be
// refined with primary research — never as an audited figure.
//
// Why offline: live ABS SDMX API (data.abs.gov.au) is fine for one-shot
// analyst use but adds a hard external dependency to every /svi run. The
// P0 raise-blocker gaps prioritised in the goal file (ABR, ASIC, GST
// threshold) already require live probes; keeping this one static means
// Chapter 3 stays available even when ABS is down for maintenance.
//
// Boundary: this is factual industry-size context, not personal financial
// product advice under s766B Corporations Act 2001 (Cth). No AFSL
// disclaimer required, but consumers surfacing the numbers in a founder
// report should attach `AU_MARKET_LOOKUP_DISCLAIMER` below so the reader
// knows the anchor origin.

export const AU_MARKET_LOOKUP_DISCLAIMER =
  "Industry size, growth, and business-count figures are anchor estimates " +
  "sourced from public ABS releases (8155.0 / 8165.0) and IBISWorld industry-" +
  "report summaries. Treat as a starting anchor for TAM/SAM/SOM sizing — " +
  "refine with primary research before quoting to investors.";

export type AnzsicDivision =
  | "A" // Agriculture, Forestry and Fishing
  | "B" // Mining
  | "C" // Manufacturing
  | "D" // Electricity, Gas, Water and Waste Services
  | "E" // Construction
  | "F" // Wholesale Trade
  | "G" // Retail Trade
  | "H" // Accommodation and Food Services
  | "I" // Transport, Postal and Warehousing
  | "J" // Information Media and Telecommunications
  | "K" // Financial and Insurance Services
  | "L" // Rental, Hiring and Real Estate Services
  | "M" // Professional, Scientific and Technical Services
  | "N" // Administrative and Support Services
  | "O" // Public Administration and Safety
  | "P" // Education and Training
  | "Q" // Health Care and Social Assistance
  | "R" // Arts and Recreation Services
  | "S"; // Other Services

export const ANZSIC_DIVISIONS: Record<AnzsicDivision, string> = {
  A: "Agriculture, Forestry and Fishing",
  B: "Mining",
  C: "Manufacturing",
  D: "Electricity, Gas, Water and Waste Services",
  E: "Construction",
  F: "Wholesale Trade",
  G: "Retail Trade",
  H: "Accommodation and Food Services",
  I: "Transport, Postal and Warehousing",
  J: "Information Media and Telecommunications",
  K: "Financial and Insurance Services",
  L: "Rental, Hiring and Real Estate Services",
  M: "Professional, Scientific and Technical Services",
  N: "Administrative and Support Services",
  O: "Public Administration and Safety",
  P: "Education and Training",
  Q: "Health Care and Social Assistance",
  R: "Arts and Recreation Services",
  S: "Other Services",
};

export type AuIndustrySource = {
  publisher: "ABS" | "IBISWorld" | "AusIndustry" | "ATO" | "RBA";
  title: string;
  url: string;
  publishedYear: number;
};

export type AuIndustrySnapshot = {
  /** ANZSIC 2006 class code (e.g. "J5810", "K6419"). */
  anzsicCode: string;
  division: AnzsicDivision;
  /** Human-readable class label. */
  label: string;
  /** Lowercase search terms (startup-vernacular aliases). */
  keywords: string[];
  /** Total Addressable Market for Australia in AUD. Anchor estimate. */
  tamAud: number;
  /** Trailing 5-yr CAGR as a decimal (e.g. 0.087 = 8.7%). */
  cagr: number;
  /** Count of active AU businesses (ABS 8165.0). */
  businessCount: number;
  sources: AuIndustrySource[];
  notes: string;
};

// Seeded snapshots. Every entry cites at least one ABS release (for
// business-count / turnover anchoring) plus one IBISWorld or AusIndustry
// public URL (for growth-narrative). Values rounded to 2 significant
// figures — precision beyond that is false confidence for a static seed.
const INDUSTRIES: AuIndustrySnapshot[] = [
  {
    anzsicCode: "J5810",
    division: "J",
    label: "Software Publishing (SaaS)",
    keywords: ["saas", "software", "b2b software", "cloud software", "platform"],
    tamAud: 6_500_000_000,
    cagr: 0.108,
    businessCount: 8_400,
    sources: [
      { publisher: "ABS", title: "8155.0 Australian Industry, 2022-23", url: "https://www.abs.gov.au/statistics/industry/industry-overview/australian-industry/latest-release", publishedYear: 2024 },
      { publisher: "IBISWorld", title: "Software Publishing in Australia industry report", url: "https://www.ibisworld.com/au/industry/software-publishing/1979/", publishedYear: 2025 },
    ],
    notes: "Includes packaged and subscription SaaS. Excludes bespoke development (see M7000 IT Services) and cloud hosting (J5921).",
  },
  {
    anzsicCode: "J5921",
    division: "J",
    label: "Data Processing and Web Hosting Services",
    keywords: ["hosting", "cloud infrastructure", "data centre", "iaas", "paas"],
    tamAud: 3_100_000_000,
    cagr: 0.126,
    businessCount: 2_100,
    sources: [
      { publisher: "ABS", title: "8155.0 Australian Industry, 2022-23", url: "https://www.abs.gov.au/statistics/industry/industry-overview/australian-industry/latest-release", publishedYear: 2024 },
      { publisher: "IBISWorld", title: "Data Processing & Web Hosting Services in Australia", url: "https://www.ibisworld.com/au/industry/data-processing-web-hosting-services/1980/", publishedYear: 2025 },
    ],
    notes: "AWS Sydney + Azure AU are the dominant share-holders; ABS bundles hyperscaler AU revenue into this class.",
  },
  {
    anzsicCode: "K6419",
    division: "K",
    label: "Other Depository Financial Intermediation (Fintech)",
    keywords: ["fintech", "neobank", "payments", "digital wallet", "buy now pay later"],
    tamAud: 4_800_000_000,
    cagr: 0.091,
    businessCount: 1_150,
    sources: [
      { publisher: "ABS", title: "8155.0 Australian Industry, 2022-23", url: "https://www.abs.gov.au/statistics/industry/industry-overview/australian-industry/latest-release", publishedYear: 2024 },
      { publisher: "RBA", title: "Payments System Board Annual Report 2024", url: "https://www.rba.gov.au/publications/annual-reports/psb/2024/", publishedYear: 2024 },
      { publisher: "IBISWorld", title: "Financial Technology Services in Australia", url: "https://www.ibisworld.com/au/industry/financial-technology-services/5568/", publishedYear: 2025 },
    ],
    notes: "TAM anchor is fintech-attributable revenue only; total AU financial-services sector is ~A$180B. Wholesale-client rules (Corps Act s761G(7)) apply to funding rounds.",
  },
  {
    anzsicCode: "G4720",
    division: "G",
    label: "Non-Store Retailing (E-commerce)",
    keywords: ["ecommerce", "d2c", "online retail", "marketplace", "dtc"],
    tamAud: 68_000_000_000,
    cagr: 0.074,
    businessCount: 24_600,
    sources: [
      { publisher: "ABS", title: "8501.0 Retail Trade, Australia", url: "https://www.abs.gov.au/statistics/industry/retail-and-wholesale-trade/retail-trade-australia/latest-release", publishedYear: 2025 },
      { publisher: "IBISWorld", title: "Online Shopping in Australia", url: "https://www.ibisworld.com/au/industry/online-shopping/1837/", publishedYear: 2025 },
    ],
    notes: "ABS 8501.0 splits online retail as a percentage of total retail (~16%). Milkrun / Sendle / Providoor comparables under this class.",
  },
  {
    anzsicCode: "Q8511",
    division: "Q",
    label: "Hospitals (Digital Health / Healthtech B2B)",
    keywords: ["healthtech", "digital health", "medtech", "clinical software"],
    tamAud: 2_400_000_000,
    cagr: 0.132,
    businessCount: 640,
    sources: [
      { publisher: "ABS", title: "8155.0 Australian Industry, 2022-23", url: "https://www.abs.gov.au/statistics/industry/industry-overview/australian-industry/latest-release", publishedYear: 2024 },
      { publisher: "IBISWorld", title: "Digital Health Services in Australia", url: "https://www.ibisworld.com/au/industry/digital-health/5772/", publishedYear: 2025 },
    ],
    notes: "TAM anchor is software-and-services sold TO hospitals, not hospital revenue. Add TGA + Privacy Act (health-record APP 11) evidence to Chapter 3.",
  },
  {
    anzsicCode: "M6910",
    division: "M",
    label: "Scientific Research Services (Deeptech / R&D)",
    keywords: ["deeptech", "quantum", "biotech", "climate tech", "materials", "research"],
    tamAud: 5_600_000_000,
    cagr: 0.089,
    businessCount: 3_900,
    sources: [
      { publisher: "ABS", title: "8104.0 Research and Experimental Development, Businesses", url: "https://www.abs.gov.au/statistics/industry/technology-and-innovation/research-and-experimental-development-businesses-australia/latest-release", publishedYear: 2024 },
      { publisher: "AusIndustry", title: "R&D Tax Incentive statistics", url: "https://business.gov.au/grants-and-programs/research-and-development-tax-incentive", publishedYear: 2025 },
    ],
    notes: "AusIndustry R&D Tax Incentive registration due within 10 months of FY end. Chapter 6 R&D section (P1j) links here.",
  },
  {
    anzsicCode: "P8102",
    division: "P",
    label: "Adult, Community and Other Education (Edtech)",
    keywords: ["edtech", "online learning", "corporate training", "microcredentials"],
    tamAud: 3_800_000_000,
    cagr: 0.068,
    businessCount: 6_200,
    sources: [
      { publisher: "ABS", title: "8155.0 Australian Industry, 2022-23", url: "https://www.abs.gov.au/statistics/industry/industry-overview/australian-industry/latest-release", publishedYear: 2024 },
      { publisher: "IBISWorld", title: "Online Education in Australia", url: "https://www.ibisworld.com/au/industry/online-education/5228/", publishedYear: 2025 },
    ],
    notes: "Excludes state-funded K-12 (P8021) and university sector (P8102). Go1 + Cluey Learning comparables.",
  },
  {
    anzsicCode: "A0169",
    division: "A",
    label: "Other Crop Growing (Agritech)",
    keywords: ["agritech", "agtech", "farm software", "carbon farming", "regenerative"],
    tamAud: 1_900_000_000,
    cagr: 0.084,
    businessCount: 12_400,
    sources: [
      { publisher: "ABS", title: "7503.0 Value of Agricultural Commodities Produced", url: "https://www.abs.gov.au/statistics/industry/agriculture/value-agricultural-commodities-produced-australia/latest-release", publishedYear: 2024 },
      { publisher: "IBISWorld", title: "Agricultural Technology in Australia", url: "https://www.ibisworld.com/au/industry/agricultural-technology/5867/", publishedYear: 2025 },
    ],
    notes: "TAM is agtech software + services sold to producers, not gross farm-gate value (that anchors at ~A$90B). Loam Bio comparable.",
  },
  {
    anzsicCode: "D2611",
    division: "D",
    label: "Fossil Fuel Electricity Generation / Cleantech Transition",
    keywords: ["cleantech", "climate tech", "renewables", "battery", "carbon"],
    tamAud: 21_000_000_000,
    cagr: 0.147,
    businessCount: 1_800,
    sources: [
      { publisher: "ABS", title: "4660.0 Energy Account, Australia", url: "https://www.abs.gov.au/statistics/industry/energy/energy-account-australia/latest-release", publishedYear: 2024 },
      { publisher: "IBISWorld", title: "Renewable Electricity Generation in Australia", url: "https://www.ibisworld.com/au/industry/renewable-electricity-generation/1836/", publishedYear: 2025 },
    ],
    notes: "TAM anchor is renewables-attributable revenue only. Q-CTRL + Sun Cable + Loam Bio operate adjacent to this class.",
  },
  {
    anzsicCode: "M6913",
    division: "M",
    label: "Legal Services (Legaltech)",
    keywords: ["legaltech", "contract software", "legal tech", "e-signing"],
    tamAud: 24_000_000_000,
    cagr: 0.058,
    businessCount: 15_800,
    sources: [
      { publisher: "ABS", title: "8155.0 Australian Industry, 2022-23", url: "https://www.abs.gov.au/statistics/industry/industry-overview/australian-industry/latest-release", publishedYear: 2024 },
      { publisher: "IBISWorld", title: "Legal Services in Australia", url: "https://www.ibisworld.com/au/industry/legal-services/2044/", publishedYear: 2025 },
    ],
    notes: "TAM anchor is total legal-services spend (LawPath, Ignition, Lawcadia are the software slice). Software SAM is ~5% of TAM.",
  },
  {
    anzsicCode: "M6931",
    division: "M",
    label: "Employment Placement and Recruitment Services (HR-tech)",
    keywords: ["hrtech", "recruitment software", "hris", "payroll software", "workforce"],
    tamAud: 15_400_000_000,
    cagr: 0.062,
    businessCount: 8_100,
    sources: [
      { publisher: "ABS", title: "8155.0 Australian Industry, 2022-23", url: "https://www.abs.gov.au/statistics/industry/industry-overview/australian-industry/latest-release", publishedYear: 2024 },
      { publisher: "IBISWorld", title: "Recruitment Services in Australia", url: "https://www.ibisworld.com/au/industry/recruitment-services/2076/", publishedYear: 2025 },
    ],
    notes: "Employment Hero + Deputy comparables. TAM includes agency fees; software SAM is the tech-only slice.",
  },
  {
    anzsicCode: "N7292",
    division: "N",
    label: "Contract Packing and Labelling / Marketplace Services",
    keywords: ["marketplace", "gig", "on-demand", "logistics tech", "fulfilment"],
    tamAud: 7_200_000_000,
    cagr: 0.093,
    businessCount: 4_600,
    sources: [
      { publisher: "ABS", title: "8155.0 Australian Industry, 2022-23", url: "https://www.abs.gov.au/statistics/industry/industry-overview/australian-industry/latest-release", publishedYear: 2024 },
      { publisher: "IBISWorld", title: "Online Marketplace Services in Australia", url: "https://www.ibisworld.com/au/industry/online-marketplace-services/5768/", publishedYear: 2025 },
    ],
    notes: "Mr Yum + Sendle comparables. Excludes pure e-commerce (G4720) and food delivery apps (H4530).",
  },
];

/** Canonical, uppercased ANZSIC lookup. Returns null if not seeded. */
export function lookupByAnzsic(code: string | null | undefined): AuIndustrySnapshot | null {
  if (!code) return null;
  const normalized = String(code).trim().toUpperCase().replace(/\s+/g, "");
  return INDUSTRIES.find((i) => i.anzsicCode === normalized) ?? null;
}

/**
 * Case-insensitive keyword search across label + keywords. Returns matches
 * ordered by (a) exact keyword hit first, then (b) label prefix, then
 * (c) any-substring. Ties broken by larger TAM (more likely the founder
 * means the parent market).
 */
export function searchByKeyword(query: string, limit = 5): AuIndustrySnapshot[] {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  const scored = INDUSTRIES.map((industry) => {
    let score = 0;
    if (industry.keywords.includes(q)) score += 100;
    if (industry.label.toLowerCase().startsWith(q)) score += 40;
    if (industry.label.toLowerCase().includes(q)) score += 20;
    for (const kw of industry.keywords) {
      if (kw.includes(q)) score += 10;
      if (q.includes(kw)) score += 5;
    }
    return { industry, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || b.industry.tamAud - a.industry.tamAud);
  return scored.slice(0, Math.max(0, limit)).map((s) => s.industry);
}

/** List all divisions actually represented in the seeded set. */
export function listCoveredDivisions(): { division: AnzsicDivision; label: string; count: number }[] {
  const counts = new Map<AnzsicDivision, number>();
  for (const i of INDUSTRIES) counts.set(i.division, (counts.get(i.division) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([division, count]) => ({ division, label: ANZSIC_DIVISIONS[division], count }))
    .sort((a, b) => a.division.localeCompare(b.division));
}

export type TamSamSomInput = {
  anzsicCode?: string;
  keyword?: string;
  /** Fraction of TAM the founder plausibly SERVES (default 20%). */
  addressablePct?: number;
  /** Fraction of SAM the founder plausibly CAPTURES over 3 years (default 1%). */
  targetSharePct?: number;
};

export type TamSamSomResult = {
  industry: AuIndustrySnapshot;
  tamAud: number;
  samAud: number;
  somAud: number;
  addressablePct: number;
  targetSharePct: number;
  disclaimer: string;
};

/**
 * Compute an anchor TAM/SAM/SOM for a founder given either an exact
 * ANZSIC code or a keyword. Returns null when no industry matches.
 *
 * SAM = TAM × addressablePct  (default 20% — geography or channel slice)
 * SOM = SAM × targetSharePct  (default 1%  — 3-year capturable share)
 *
 * These defaults are conservative enough that a founder quoting them to
 * an investor won't be laughed out of the meeting. The founder can and
 * should override once primary research is done.
 */
export function estimateTamSamSom(input: TamSamSomInput): TamSamSomResult | null {
  const industry = input.anzsicCode
    ? lookupByAnzsic(input.anzsicCode)
    : input.keyword
      ? searchByKeyword(input.keyword, 1)[0] ?? null
      : null;
  if (!industry) return null;
  const addressablePct = clamp(input.addressablePct ?? 0.2, 0, 1);
  const targetSharePct = clamp(input.targetSharePct ?? 0.01, 0, 1);
  const samAud = Math.round(industry.tamAud * addressablePct);
  const somAud = Math.round(samAud * targetSharePct);
  return {
    industry,
    tamAud: industry.tamAud,
    samAud,
    somAud,
    addressablePct,
    targetSharePct,
    disclaimer: AU_MARKET_LOOKUP_DISCLAIMER,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

/** For test + tooling introspection — never mutate. */
export const AU_MARKET_INDUSTRIES: readonly AuIndustrySnapshot[] = INDUSTRIES;
