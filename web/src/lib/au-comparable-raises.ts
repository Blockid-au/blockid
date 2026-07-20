// Source: public reporting (press coverage / Crunchbase-style aggregators).
// Not investment advice. AUD figures use round approximations near the
// deal's announcement date; treat every row as "reported" rather than
// audited.

export type ComparableRaise = {
  company: string;
  sector: string;
  stage: "preseed" | "seed" | "seriesA" | "seriesB";
  roundAud: number;
  valuationAud: number | null;
  year: number;
  leadInvestor: string | null;
  sourceNote: string;
};

const COMPARABLES: ComparableRaise[] = [
  // Fintech
  { company: "Zeller", sector: "fintech", stage: "seriesB", roundAud: 100_000_000, valuationAud: 1_000_000_000, year: 2022, leadInvestor: "Spark Capital", sourceNote: "reported" },
  { company: "Airwallex", sector: "fintech", stage: "seriesB", roundAud: 150_000_000, valuationAud: 8_400_000_000, year: 2022, leadInvestor: "Lone Pine Capital", sourceNote: "reported" },
  { company: "Athena Home Loans", sector: "fintech", stage: "seriesB", roundAud: 90_000_000, valuationAud: 1_500_000_000, year: 2022, leadInvestor: "Salesforce Ventures", sourceNote: "reported" },
  { company: "Judo Bank", sector: "fintech", stage: "seriesB", roundAud: 230_000_000, valuationAud: 1_600_000_000, year: 2020, leadInvestor: "Bain Capital Credit", sourceNote: "reported" },
  { company: "Beforepay", sector: "fintech", stage: "seriesA", roundAud: 35_000_000, valuationAud: null, year: 2021, leadInvestor: "Alium Capital", sourceNote: "reported" },
  { company: "Zepto AU", sector: "fintech", stage: "seriesA", roundAud: 25_000_000, valuationAud: null, year: 2023, leadInvestor: "AP Ventures", sourceNote: "reported" },
  { company: "Butter Insurance", sector: "fintech", stage: "seed", roundAud: 3_000_000, valuationAud: null, year: 2023, leadInvestor: "Betterlabs", sourceNote: "reported" },

  // SaaS
  { company: "Employment Hero", sector: "saas", stage: "seriesB", roundAud: 181_000_000, valuationAud: 1_250_000_000, year: 2022, leadInvestor: "TDM Growth Partners", sourceNote: "reported" },
  { company: "Culture Amp", sector: "saas", stage: "seriesB", roundAud: 135_000_000, valuationAud: 1_500_000_000, year: 2021, leadInvestor: "TDM Growth Partners", sourceNote: "reported" },
  { company: "Linktree", sector: "saas", stage: "seriesB", roundAud: 145_000_000, valuationAud: 1_300_000_000, year: 2022, leadInvestor: "Index Ventures", sourceNote: "reported" },
  { company: "SafetyCulture", sector: "saas", stage: "seriesB", roundAud: 220_000_000, valuationAud: 2_700_000_000, year: 2021, leadInvestor: "Insight Partners", sourceNote: "reported" },
  { company: "Deputy", sector: "saas", stage: "seriesA", roundAud: 111_000_000, valuationAud: null, year: 2018, leadInvestor: "IVP", sourceNote: "reported" },
  { company: "Auror", sector: "saas", stage: "seriesA", roundAud: 45_000_000, valuationAud: null, year: 2023, leadInvestor: "Blackbird Ventures", sourceNote: "reported" },
  { company: "Roller", sector: "saas", stage: "seriesA", roundAud: 115_000_000, valuationAud: null, year: 2022, leadInvestor: "Insight Partners", sourceNote: "reported" },
  { company: "Ignition", sector: "saas", stage: "seriesA", roundAud: 50_000_000, valuationAud: null, year: 2022, leadInvestor: "AGV", sourceNote: "reported" },
  { company: "Assignar", sector: "saas", stage: "seed", roundAud: 4_000_000, valuationAud: null, year: 2018, leadInvestor: "Tola Capital", sourceNote: "reported" },

  // Marketplace
  { company: "Mr Yum", sector: "marketplace", stage: "seriesA", roundAud: 89_000_000, valuationAud: 250_000_000, year: 2022, leadInvestor: "Tiger Global", sourceNote: "reported" },
  { company: "Milkrun", sector: "marketplace", stage: "seed", roundAud: 11_000_000, valuationAud: null, year: 2021, leadInvestor: "AirTree Ventures", sourceNote: "reported" },
  { company: "Providoor", sector: "marketplace", stage: "seed", roundAud: 10_000_000, valuationAud: null, year: 2021, leadInvestor: "Square Peg Capital", sourceNote: "reported" },
  { company: "Sendle", sector: "marketplace", stage: "seriesA", roundAud: 45_000_000, valuationAud: null, year: 2022, leadInvestor: "Federation Asset Management", sourceNote: "reported" },

  // Healthtech
  { company: "Harrison.ai", sector: "healthtech", stage: "seriesB", roundAud: 129_000_000, valuationAud: null, year: 2021, leadInvestor: "Horizons Ventures", sourceNote: "reported" },
  { company: "Eucalyptus", sector: "healthtech", stage: "seriesB", roundAud: 60_000_000, valuationAud: null, year: 2021, leadInvestor: "BOND Capital", sourceNote: "reported" },
  { company: "Heidi Health", sector: "healthtech", stage: "seed", roundAud: 10_000_000, valuationAud: null, year: 2024, leadInvestor: "Blackbird Ventures", sourceNote: "reported" },
  { company: "Sonder", sector: "healthtech", stage: "seriesA", roundAud: 50_000_000, valuationAud: null, year: 2022, leadInvestor: "Blackbird Ventures", sourceNote: "reported" },
  { company: "Perx Health", sector: "healthtech", stage: "seed", roundAud: 8_000_000, valuationAud: null, year: 2022, leadInvestor: "Main Sequence Ventures", sourceNote: "reported" },

  // Deeptech
  { company: "Advanced Navigation", sector: "deeptech", stage: "seriesB", roundAud: 108_000_000, valuationAud: null, year: 2022, leadInvestor: "In-Q-Tel", sourceNote: "reported" },
  { company: "Q-CTRL", sector: "deeptech", stage: "seriesB", roundAud: 40_000_000, valuationAud: null, year: 2022, leadInvestor: "Airbus Ventures", sourceNote: "reported" },
  { company: "Baraja", sector: "deeptech", stage: "seriesA", roundAud: 60_000_000, valuationAud: null, year: 2020, leadInvestor: "Sequoia Capital", sourceNote: "reported" },
  { company: "Fivecast", sector: "deeptech", stage: "seriesA", roundAud: 30_000_000, valuationAud: null, year: 2022, leadInvestor: "Ten Eleven Ventures", sourceNote: "reported" },
  { company: "Loam Bio", sector: "deeptech", stage: "seriesB", roundAud: 105_000_000, valuationAud: null, year: 2022, leadInvestor: "Lowercarbon Capital", sourceNote: "reported" },
  { company: "Vow", sector: "deeptech", stage: "seriesA", roundAud: 70_000_000, valuationAud: null, year: 2022, leadInvestor: "Blackbird Ventures", sourceNote: "reported" },
  { company: "Cortical Labs", sector: "deeptech", stage: "seed", roundAud: 15_000_000, valuationAud: null, year: 2022, leadInvestor: "Horizons Ventures", sourceNote: "reported" },

  // Edtech
  { company: "Go1", sector: "edtech", stage: "seriesB", roundAud: 275_000_000, valuationAud: 2_000_000_000, year: 2021, leadInvestor: "SoftBank / AirTree", sourceNote: "reported" },
  { company: "Cluey Learning", sector: "edtech", stage: "seriesA", roundAud: 20_000_000, valuationAud: null, year: 2021, leadInvestor: "Australian Ethical", sourceNote: "reported" },
  { company: "Mathspace", sector: "edtech", stage: "seriesA", roundAud: 14_000_000, valuationAud: null, year: 2018, leadInvestor: "Rethink Education", sourceNote: "reported" },

  // Pre-seed (accelerator program terms are commonly published)
  { company: "Antler AU cohort (representative)", sector: "saas", stage: "preseed", roundAud: 150_000, valuationAud: 1_500_000, year: 2025, leadInvestor: "Antler", sourceNote: "reported program terms" },
  { company: "Startmate cohort (representative)", sector: "saas", stage: "preseed", roundAud: 120_000, valuationAud: 1_800_000, year: 2025, leadInvestor: "Startmate", sourceNote: "reported program terms" },
  { company: "Blackbird Giants (representative)", sector: "saas", stage: "preseed", roundAud: 500_000, valuationAud: 5_000_000, year: 2024, leadInvestor: "Blackbird Ventures", sourceNote: "reported program terms" },
];

function normalizeStage(stage: string): ComparableRaise["stage"] {
  const s = stage.toLowerCase().replace(/[\s_-]/g, "");
  if (s.startsWith("pre")) return "preseed";
  if (s === "seed") return "seed";
  if (s === "seriesa" || s === "a") return "seriesA";
  if (s === "seriesb" || s === "b") return "seriesB";
  return "seed";
}

export function getComparableRaises(opts: {
  sector?: string;
  stage: string;
  limit?: number;
}): ComparableRaise[] {
  const normalizedStage = normalizeStage(opts.stage);
  const normalizedSector = opts.sector?.toLowerCase();
  const filtered = COMPARABLES.filter((c) => {
    if (c.stage !== normalizedStage) return false;
    if (normalizedSector && c.sector !== normalizedSector) return false;
    return true;
  }).sort((a, b) => b.year - a.year || b.roundAud - a.roundAud);
  return typeof opts.limit === "number" ? filtered.slice(0, opts.limit) : filtered;
}

export function summariseComparables(raises: ComparableRaise[]): {
  medianRoundAud: number | null;
  medianValuationAud: number | null;
  count: number;
} {
  if (raises.length === 0) {
    return { medianRoundAud: null, medianValuationAud: null, count: 0 };
  }
  const median = (nums: number[]): number => {
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
      : sorted[mid];
  };
  const rounds = raises.map((r) => r.roundAud);
  const valuations = raises.map((r) => r.valuationAud).filter((v): v is number => v !== null);
  return {
    medianRoundAud: median(rounds),
    medianValuationAud: valuations.length > 0 ? median(valuations) : null,
    count: raises.length,
  };
}
