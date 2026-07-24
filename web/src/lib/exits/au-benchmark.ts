// AU tech-exit benchmark fixture used by Chapter 12 (exit-readiness) surfaces
// and the CFO / IR agent bundles. Data is compiled from publicly-reported
// deal announcements; AUD figures are rounded to the nearest A$M and treat
// USD deals at the announcement-date spot rate. Every row cites a public
// source URL. Not investment advice.

export type AuExitBuyerType = "strategic" | "financial" | "pe" | "ipo" | "secondary";
export type AuExitStructure = "cash" | "cash_stock" | "stock" | "public_listing" | "secondary_sale";
export type AuExitSector =
  | "saas"
  | "fintech"
  | "marketplace"
  | "healthtech"
  | "deeptech"
  | "edtech"
  | "adtech"
  | "logistics"
  | "media"
  | "cyber";

export type AuExit = {
  company: string;
  sector: AuExitSector;
  buyer: string | null;
  buyerType: AuExitBuyerType;
  structure: AuExitStructure;
  valuationAud: number;
  ttmRevenueAud: number | null;
  revenueMultiple: number | null;
  year: number;
  sourceUrl: string;
  sourceNote: string;
};

const EXITS: AuExit[] = [
  // Trade-sale (strategic buyer)
  {
    company: "Afterpay",
    sector: "fintech",
    buyer: "Block (formerly Square)",
    buyerType: "strategic",
    structure: "stock",
    valuationAud: 39_000_000_000,
    ttmRevenueAud: 925_000_000,
    revenueMultiple: 42,
    year: 2022,
    sourceUrl: "https://squareup.com/us/en/press/afterpay-acquisition-closes",
    sourceNote: "reported A$39B all-scrip; ~42x TTM revenue at close",
  },
  {
    company: "OpsGenie",
    sector: "saas",
    buyer: "Atlassian",
    buyerType: "strategic",
    structure: "cash",
    valuationAud: 400_000_000,
    ttmRevenueAud: null,
    revenueMultiple: null,
    year: 2018,
    sourceUrl: "https://www.atlassian.com/company/news/press-releases/atlassian-to-acquire-opsgenie",
    sourceNote: "US$295M cash",
  },
  {
    company: "Trello",
    sector: "saas",
    buyer: "Atlassian",
    buyerType: "strategic",
    structure: "cash_stock",
    valuationAud: 570_000_000,
    ttmRevenueAud: null,
    revenueMultiple: null,
    year: 2017,
    sourceUrl: "https://www.atlassian.com/company/news/press-releases/atlassian-completes-acquisition-of-trello",
    sourceNote: "US$425M ~90% cash / 10% retention RSUs",
  },
  {
    company: "Loom",
    sector: "saas",
    buyer: "Atlassian",
    buyerType: "strategic",
    structure: "cash_stock",
    valuationAud: 1_500_000_000,
    ttmRevenueAud: null,
    revenueMultiple: null,
    year: 2023,
    sourceUrl: "https://www.atlassian.com/blog/announcements/loom-acquisition",
    sourceNote: "US$975M ~90% cash / 10% retention",
  },
  {
    company: "Envato",
    sector: "marketplace",
    buyer: "Shutterstock",
    buyerType: "strategic",
    structure: "cash",
    valuationAud: 375_000_000,
    ttmRevenueAud: 145_000_000,
    revenueMultiple: 2.6,
    year: 2024,
    sourceUrl: "https://investor.shutterstock.com/news-releases/news-release-details/shutterstock-acquire-envato",
    sourceNote: "US$245M cash; strategic content-marketplace tuck-in",
  },
  {
    company: "Practice Ignition (Ignition)",
    sector: "saas",
    buyer: null,
    buyerType: "financial",
    structure: "secondary_sale",
    valuationAud: 500_000_000,
    ttmRevenueAud: null,
    revenueMultiple: null,
    year: 2022,
    sourceUrl: "https://www.afr.com/technology/ignition-hits-500m-valuation-after-us-fund-buys-in-20220314-p5a4an",
    sourceNote: "reported secondary at ~A$500M by AGV / Battery",
  },

  // Public listing (ASX / NASDAQ / NYSE)
  {
    company: "Atlassian",
    sector: "saas",
    buyer: null,
    buyerType: "ipo",
    structure: "public_listing",
    valuationAud: 6_500_000_000,
    ttmRevenueAud: 435_000_000,
    revenueMultiple: 15,
    year: 2015,
    sourceUrl: "https://www.sec.gov/Archives/edgar/data/1650372/000119312515373798/d67899ds1.htm",
    sourceNote: "NASDAQ:TEAM IPO Dec 10 2015 at US$21; US$4.4B market cap",
  },
  {
    company: "WiseTech Global",
    sector: "saas",
    buyer: null,
    buyerType: "ipo",
    structure: "public_listing",
    valuationAud: 1_050_000_000,
    ttmRevenueAud: 102_000_000,
    revenueMultiple: 10,
    year: 2016,
    sourceUrl: "https://www.asx.com.au/asx/share-price-research/company/WTC",
    sourceNote: "ASX:WTC IPO A$1.05B market cap Apr 2016",
  },
  {
    company: "Xero",
    sector: "saas",
    buyer: null,
    buyerType: "ipo",
    structure: "public_listing",
    valuationAud: 55_000_000,
    ttmRevenueAud: 1_800_000,
    revenueMultiple: 30,
    year: 2007,
    sourceUrl: "https://www.nzx.com/companies/XRO",
    sourceNote: "NZX:XRO IPO Jun 2007 NZ$55M market cap (dual-listed ASX 2012)",
  },
  {
    company: "Nitro Software",
    sector: "saas",
    buyer: "Potentia Capital",
    buyerType: "pe",
    structure: "cash",
    valuationAud: 532_000_000,
    ttmRevenueAud: 96_000_000,
    revenueMultiple: 5.5,
    year: 2023,
    sourceUrl: "https://www.gonitro.com/news/potentia-acquires-nitro-software",
    sourceNote: "Potentia scheme-of-arrangement take-private at A$2.20/share",
  },
  {
    company: "MYOB",
    sector: "saas",
    buyer: "KKR",
    buyerType: "pe",
    structure: "cash",
    valuationAud: 2_400_000_000,
    ttmRevenueAud: 445_000_000,
    revenueMultiple: 5.4,
    year: 2019,
    sourceUrl: "https://www.kkr.com/media/kkr-completes-acquisition-of-myob-group",
    sourceNote: "KKR scheme-of-arrangement A$3.40/share",
  },
  {
    company: "Nearmap",
    sector: "saas",
    buyer: "Thoma Bravo",
    buyerType: "pe",
    structure: "cash",
    valuationAud: 1_060_000_000,
    ttmRevenueAud: 155_000_000,
    revenueMultiple: 6.8,
    year: 2023,
    sourceUrl: "https://newsroom.thomabravo.com/press-releases/press-release-details/2023/Thoma-Bravo-Completes-Acquisition-of-Nearmap-Ltd",
    sourceNote: "Thoma Bravo scheme A$2.10/share",
  },
  {
    company: "PEXA",
    sector: "fintech",
    buyer: null,
    buyerType: "ipo",
    structure: "public_listing",
    valuationAud: 3_300_000_000,
    ttmRevenueAud: 220_000_000,
    revenueMultiple: 15,
    year: 2021,
    sourceUrl: "https://www.asx.com.au/asx/share-price-research/company/PXA",
    sourceNote: "ASX:PXA IPO Jul 2021 at A$17.13 (Link + Morgan Stanley + KKR unwind)",
  },
  {
    company: "Airtasker",
    sector: "marketplace",
    buyer: null,
    buyerType: "ipo",
    structure: "public_listing",
    valuationAud: 260_000_000,
    ttmRevenueAud: 24_000_000,
    revenueMultiple: 11,
    year: 2021,
    sourceUrl: "https://www.asx.com.au/asx/share-price-research/company/ART",
    sourceNote: "ASX:ART IPO Mar 2021 at A$0.65",
  },
  {
    company: "Judo Bank",
    sector: "fintech",
    buyer: null,
    buyerType: "ipo",
    structure: "public_listing",
    valuationAud: 2_320_000_000,
    ttmRevenueAud: 108_000_000,
    revenueMultiple: 21,
    year: 2021,
    sourceUrl: "https://www.asx.com.au/asx/share-price-research/company/JDO",
    sourceNote: "ASX:JDO IPO Nov 2021 at A$2.10",
  },
  {
    company: "Prospa",
    sector: "fintech",
    buyer: null,
    buyerType: "ipo",
    structure: "public_listing",
    valuationAud: 610_000_000,
    ttmRevenueAud: 128_000_000,
    revenueMultiple: 4.8,
    year: 2019,
    sourceUrl: "https://www.asx.com.au/asx/share-price-research/company/PGL",
    sourceNote: "ASX:PGL IPO Jun 2019 at A$3.78 (re-listed after 2018 defer)",
  },

  // Secondary (pre-IPO liquidity)
  {
    company: "Canva (secondary tender)",
    sector: "saas",
    buyer: "Coatue / T. Rowe / others",
    buyerType: "secondary",
    structure: "secondary_sale",
    valuationAud: 39_000_000_000,
    ttmRevenueAud: 1_500_000_000,
    revenueMultiple: 26,
    year: 2021,
    sourceUrl: "https://www.canva.com/newsroom/news/canva-40-billion-valuation/",
    sourceNote: "US$26B (~A$39B) valuation, primary + secondary mix",
  },
  {
    company: "Atlassian (Accel 2010)",
    sector: "saas",
    buyer: "Accel Partners",
    buyerType: "secondary",
    structure: "secondary_sale",
    valuationAud: 400_000_000,
    ttmRevenueAud: 90_000_000,
    revenueMultiple: 4.4,
    year: 2010,
    sourceUrl: "https://techcrunch.com/2010/07/14/atlassian-accel-60-million/",
    sourceNote: "US$60M 100% secondary; founder liquidity",
  },
  {
    company: "Atlassian (T. Rowe 2014)",
    sector: "saas",
    buyer: "T. Rowe Price",
    buyerType: "secondary",
    structure: "secondary_sale",
    valuationAud: 4_300_000_000,
    ttmRevenueAud: 320_000_000,
    revenueMultiple: 13,
    year: 2014,
    sourceUrl: "https://www.wsj.com/articles/atlassian-raises-150-million-at-3-3-billion-valuation-1397587141",
    sourceNote: "US$150M 100% secondary at US$3.3B",
  },
  {
    company: "SafetyCulture (secondary)",
    sector: "saas",
    buyer: "Insight Partners",
    buyerType: "secondary",
    structure: "secondary_sale",
    valuationAud: 2_700_000_000,
    ttmRevenueAud: 100_000_000,
    revenueMultiple: 27,
    year: 2021,
    sourceUrl: "https://www.afr.com/technology/safetyculture-hits-2-7b-valuation-in-latest-raise-20210517-p57sqp",
    sourceNote: "A$99M raise (primary + secondary) at A$2.7B",
  },

  // Ad / media / cyber tuck-ins
  {
    company: "LiveHire",
    sector: "saas",
    buyer: "HireRoad",
    buyerType: "strategic",
    structure: "cash",
    valuationAud: 51_000_000,
    ttmRevenueAud: null,
    revenueMultiple: null,
    year: 2024,
    sourceUrl: "https://www.asx.com.au/asxpdf/20240220/pdf/",
    sourceNote: "HireRoad scheme A$0.20/share",
  },
  {
    company: "Elmo Software",
    sector: "saas",
    buyer: "K1 Investment Management",
    buyerType: "pe",
    structure: "cash",
    valuationAud: 486_000_000,
    ttmRevenueAud: 105_000_000,
    revenueMultiple: 4.6,
    year: 2023,
    sourceUrl: "https://www.asx.com.au/asx/share-price-research/company/ELO",
    sourceNote: "K1 scheme-of-arrangement A$4.85/share",
  },
];

function normaliseSector(s: string | undefined): string | undefined {
  return s?.toLowerCase().replace(/[\s_-]/g, "");
}

export function getAuComparableExits(opts: {
  sector?: AuExitSector | string;
  buyerType?: AuExitBuyerType;
  minYear?: number;
  limit?: number;
} = {}): AuExit[] {
  const sector = normaliseSector(opts.sector);
  const filtered = EXITS.filter((e) => {
    if (sector && e.sector !== sector) return false;
    if (opts.buyerType && e.buyerType !== opts.buyerType) return false;
    if (typeof opts.minYear === "number" && e.year < opts.minYear) return false;
    return true;
  }).sort((a, b) => b.year - a.year || b.valuationAud - a.valuationAud);
  return typeof opts.limit === "number" ? filtered.slice(0, opts.limit) : filtered;
}

export type AuExitSummary = {
  count: number;
  medianValuationAud: number | null;
  medianRevenueMultiple: number | null;
  byBuyerType: Record<AuExitBuyerType, number>;
  latestYear: number | null;
};

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100;
  }
  return sorted[mid];
}

export function summariseAuExits(exits: AuExit[]): AuExitSummary {
  const byBuyerType: Record<AuExitBuyerType, number> = {
    strategic: 0,
    financial: 0,
    pe: 0,
    ipo: 0,
    secondary: 0,
  };
  for (const e of exits) byBuyerType[e.buyerType] += 1;
  const valuations = exits.map((e) => e.valuationAud);
  const multiples = exits
    .map((e) => e.revenueMultiple)
    .filter((m): m is number => typeof m === "number");
  return {
    count: exits.length,
    medianValuationAud: median(valuations),
    medianRevenueMultiple: median(multiples),
    byBuyerType,
    latestYear: exits.length > 0 ? Math.max(...exits.map((e) => e.year)) : null,
  };
}

export const AU_EXIT_DISCLAIMER =
  "General information only, not personal financial product advice under s766B Corporations Act 2001 (Cth). Deal figures are approximations of publicly-reported terms.";
