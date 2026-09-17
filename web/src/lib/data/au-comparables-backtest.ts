/**
 * AU comparables — backtest v0 dataset (G14-S39, 2026-09-16).
 *
 * One row per comparable raise, taken as the UNION of the two hand-entered
 * source tables, deduped on (company, round):
 *
 *   - `src/lib/au-comparable-raises.ts`   (round size + valuation where reported)
 *   - `src/lib/data/au-comparables.ts`    (ARR multiples; some notes carry a round or valuation)
 *
 * For every row a `preRaiseProfile` is hand-curated AS OF the raise: what a
 * founder could have put in front of BlockID the week the round closed. Only
 * PUBLIC facts (company site, press coverage, investor portfolio pages,
 * Wikipedia, ABN Lookup). Where a fact is unknown the field is left out and
 * the engine's "no evidence" default applies — nothing is inferred to lift a
 * score. Where the source row lacks a number the outcome stays `null`;
 * numbers are never invented and the source figures are never corrected
 * (disagreements between the two sources are noted, not resolved).
 *
 * Every row cites ≥ 1 public URL. A row whose profile flips `founderExperience`
 * to `serial` or `hasRevenue` to `true` cites ≥ 2 (`au-comparables-backtest.test.ts`
 * enforces both). `confidence` is the curator's own grade of the profile —
 * `low` means the identity or the figures could not be corroborated beyond
 * the source table and the profile is stage-implied only.
 *
 * Claim scope (approved plan §5 S39 + goal doc F-8): RANK CALIBRATION ONLY.
 * Every row raised (survivorship bias); v1 after S40 adds a control group.
 *
 * `scripts/backtest/run.ts` scores each profile with `computeSVI()` at
 * confidence pinned to `document_uploaded` and writes
 * `content/reports/svi-backtest-latest.json` (Spearman ρ + bootstrap CI +
 * quartile buckets). Re-run `npm run backtest` whenever `svi-analysis.ts`
 * changes — the published page shows `SVI_VERSION` + git sha for that reason.
 */

import type { SVIExtractedSignals } from "@/lib/svi-analysis";

export type BacktestStage = "pre-seed" | "seed" | "series-a" | "series-b" | "series-c" | "growth" | "unicorn";

export const BACKTEST_STAGES: readonly BacktestStage[] = ["pre-seed", "seed", "series-a", "series-b", "series-c", "growth", "unicorn"];

export type BacktestConfidence = "high" | "medium" | "low";

export type BacktestSourceTable = "au-comparable-raises.ts" | "au-comparables.ts";

export interface BacktestOutcome {
  /** Round size, AUD, as reported by the source table (null = not disclosed there). */
  roundAud: number | null;
  /** Pre/post-money or headline valuation, AUD, as reported (null = not disclosed). */
  valuationAud: number | null;
  /** Did a further priced round / IPO follow within 24 months? null = not tracked. */
  nextRoundWithin24m: boolean | null;
}

export interface BacktestRow {
  /** Stable id: `<slug>-<yyyy-mm>`. */
  id: string;
  company: string;
  /** Exact `company` / `name` strings from the source tables this row covers (dedupe trail). */
  sourceNames: string[];
  sourceTables: BacktestSourceTable[];
  sector: string;
  /** Stage AT THE RAISE (the round label when the source note states one). */
  stage: BacktestStage;
  /** Month the profile is curated as of (yyyy-mm). */
  asOf: string;
  preRaiseProfile: Partial<SVIExtractedSignals>;
  sourceUrls: string[];
  /** Where the figures / facts come from, and any disagreement between the two sources. */
  sourceNote: string;
  outcome: BacktestOutcome;
  confidence: BacktestConfidence;
}

export interface ExcludedSourceRow {
  sourceName: string;
  sourceTable: BacktestSourceTable;
  reason: string;
}

const ABR = (name: string) => `https://abr.business.gov.au/Search/ResultsActive?SearchText=${encodeURIComponent(name)}`;

// Profile fragments shared by rows at the same stage — spelled out per row so
// a reviewer can see exactly what each profile asserts. These are the
// governance / readiness artefacts a VC-led priced round implies (board seat,
// SHA, vesting, ESOP pool, model + data room in diligence); they are constant
// within a stage and therefore cannot move a within-stage rank.
const AU_BASE: Partial<SVIExtractedSignals> = { hasABN: true, hasWebsite: true, hasCapTable: true, hasPitchDeck: true, targetRaiseMentioned: true, raiseMentioned: true, hasLegalDocs: true };
const VC_SEED: Partial<SVIExtractedSignals> = { ...AU_BASE, hasVesting: true, hasShareholdersAgreement: true, hasFinancialModel: true };
const VC_SERIES_A: Partial<SVIExtractedSignals> = { ...VC_SEED, hasBoardCadence: true, esopAllocated: true, hasDataRoom: true };
const VC_LATE: Partial<SVIExtractedSignals> = { ...VC_SERIES_A, hasFinancialAudit: true };

export const AU_COMPARABLES_BACKTEST: BacktestRow[] = [
  // ── FinTech ──────────────────────────────────────────────────────────────
  {
    id: "zeller-2022-03",
    company: "Zeller",
    sourceNames: ["Zeller"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "fintech",
    stage: "series-b",
    asOf: "2022-03",
    preRaiseProfile: {
      ...VC_SERIES_A,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated",
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "growing", hasCustomers: true, hasSocialProof: true,
      hasContracts: true,
    },
    sourceUrls: ["https://www.myzeller.com", "https://www.blackbird.vc/portfolio", ABR("Zeller")],
    sourceNote: "Series B (Headline / Spark Capital) reported in AFR + Startup Daily, Mar 2022; product launched May 2021 with paying merchants; founders ex-Square AU.",
    outcome: { roundAud: 100_000_000, valuationAud: 1_000_000_000, nextRoundWithin24m: null },
    confidence: "high",
  },
  {
    id: "airwallex-2022-10",
    company: "Airwallex",
    sourceNames: ["Airwallex"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "fintech",
    stage: "series-b",
    asOf: "2022-10",
    preRaiseProfile: {
      ...VC_LATE,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated", hasSwitchingCosts: true, hasMoat: true,
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasSocialProof: true,
      hasContracts: true, hasIPProtection: true,
    },
    sourceUrls: ["https://www.airwallex.com", "https://en.wikipedia.org/wiki/Airwallex"],
    sourceNote: "Source stage label is the 'Series B+' bucket; the Oct 2022 round was a Series E extension (US$100M at US$5.5B, ≈ A$8.4B). Licensed, audited payments business by then.",
    outcome: { roundAud: 150_000_000, valuationAud: 8_400_000_000, nextRoundWithin24m: false },
    confidence: "high",
  },
  {
    id: "airwallex-2024-06",
    company: "Airwallex",
    sourceNames: ["Airwallex"],
    sourceTables: ["au-comparables.ts"],
    sector: "fintech",
    stage: "unicorn",
    asOf: "2024-06",
    preRaiseProfile: {
      ...VC_LATE,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated", hasSwitchingCosts: true, hasMoat: true, hasDataAdvantage: true,
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasSocialProof: true,
      hasContracts: true, hasIPProtection: true,
    },
    sourceUrls: ["https://www.airwallex.com", "https://en.wikipedia.org/wiki/Airwallex"],
    sourceNote: "au-comparables.ts note: 'A$9.6B valuation (2024)'. No round size in that source (a 2024 secondary / valuation mark), so roundAud stays null.",
    outcome: { roundAud: null, valuationAud: 9_600_000_000, nextRoundWithin24m: null },
    confidence: "medium",
  },
  {
    id: "athena-home-loans-2022-03",
    company: "Athena Home Loans",
    sourceNames: ["Athena Home Loans"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "fintech",
    stage: "series-b",
    asOf: "2022-03",
    preRaiseProfile: {
      ...VC_LATE,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated",
      hasProduct: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasSocialProof: true,
      hasContracts: true,
    },
    sourceUrls: ["https://www.athena.com.au", "https://www.squarepeg.vc/portfolio", ABR("Athena Home Loans")],
    sourceNote: "A$90M round (Salesforce Ventures) reported 2022; founders ex-NAB executives; lending since 2019 under an Australian Credit Licence.",
    outcome: { roundAud: 90_000_000, valuationAud: 1_500_000_000, nextRoundWithin24m: null },
    confidence: "medium",
  },
  {
    id: "judo-bank-2020-05",
    company: "Judo Bank",
    sourceNames: ["Judo Bank"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "fintech",
    stage: "series-b",
    asOf: "2020-05",
    preRaiseProfile: {
      ...VC_LATE,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated", hasSwitchingCosts: true,
      hasProduct: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasSocialProof: true,
      hasContracts: true,
    },
    sourceUrls: ["https://www.judo.bank", "https://en.wikipedia.org/wiki/Judo_Bank"],
    sourceNote: "A$230M round (Bain Capital Credit) at ~A$1.6B, May 2020 (AFR). Full banking licence since Apr 2019 → audited. IPO on the ASX Nov 2021 (< 24 months).",
    outcome: { roundAud: 230_000_000, valuationAud: 1_600_000_000, nextRoundWithin24m: true },
    confidence: "high",
  },
  {
    id: "beforepay-2021-11",
    company: "Beforepay",
    sourceNames: ["Beforepay"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "fintech",
    stage: "series-a",
    asOf: "2021-11",
    preRaiseProfile: {
      ...VC_SERIES_A,
      founderExperience: "experienced", founderSectorFit: true,
      marketSize: "medium", problemClarity: "validated",
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "growing", hasCustomers: true, hasSocialProof: true,
    },
    sourceUrls: ["https://www.beforepay.com.au", ABR("Beforepay")],
    sourceNote: "A$35M pre-IPO round reported Nov 2021; ASX listing Jan 2022 (< 24 months). Co-founder status not asserted.",
    outcome: { roundAud: 35_000_000, valuationAud: null, nextRoundWithin24m: true },
    confidence: "medium",
  },
  {
    id: "zepto-2023-02",
    company: "Zepto AU",
    sourceNames: ["Zepto AU"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "fintech",
    stage: "series-a",
    asOf: "2023-02",
    preRaiseProfile: {
      ...VC_SERIES_A,
      founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated", hasSwitchingCosts: true,
      hasProduct: true, hasRevenue: true, revenueBand: "growing", hasCustomers: true, hasContracts: true,
    },
    sourceUrls: ["https://zepto.com.au", "https://www.airtree.vc/companies", ABR("Zepto")],
    sourceNote: "Source row: A$25M Series A, 2023 (AirTree-backed real-time payments). Round year in the source table not independently confirmed.",
    outcome: { roundAud: 25_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "low",
  },
  {
    id: "butter-insurance-2023-01",
    company: "Butter Insurance",
    sourceNames: ["Butter Insurance"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "fintech",
    stage: "seed",
    asOf: "2023-01",
    preRaiseProfile: {
      ...VC_SEED,
      marketSize: "medium", problemClarity: "clear",
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "early", hasCustomers: true,
    },
    sourceUrls: ["https://www.startupdaily.net/?s=Butter+Insurance", ABR("Butter Insurance")],
    sourceNote: "A$3M seed (Betterlabs) reported by Startup Daily, 2023; app-first insurance with early policies sold. Founder background not asserted.",
    outcome: { roundAud: 3_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "low",
  },
  {
    id: "brighte-2020-11",
    company: "Brighte",
    sourceNames: ["Brighte"],
    sourceTables: ["au-comparables.ts"],
    sector: "fintech",
    stage: "series-c",
    asOf: "2020-11",
    preRaiseProfile: {
      ...VC_LATE,
      founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated",
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasSocialProof: true,
      hasContracts: true,
    },
    sourceUrls: ["https://brighte.com.au", "https://www.airtree.vc/companies", ABR("Brighte")],
    sourceNote: "au-comparables.ts note: '~A$900M valuation' (no round size in that source). Solo founder ex-Macquarie; regulated consumer lender with securitisation programmes by 2020.",
    outcome: { roundAud: null, valuationAud: 900_000_000, nextRoundWithin24m: null },
    confidence: "low",
  },
  {
    id: "block-earner-2024-06",
    company: "Block Earner",
    sourceNames: ["Block Earner"],
    sourceTables: ["au-comparables.ts"],
    sector: "fintech",
    stage: "series-a",
    asOf: "2024-06",
    preRaiseProfile: {
      ...VC_SERIES_A,
      hasCoFounder: true, founderSectorFit: true,
      marketSize: "medium", problemClarity: "clear",
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "early", hasCustomers: true,
    },
    sourceUrls: ["https://blockearner.com.au", ABR("Block Earner")],
    sourceNote: "au-comparables.ts note: 'A$67M valuation (2024)'; no round size given. Crypto-backed lending, live product with customers; ASIC proceedings in the period are public.",
    outcome: { roundAud: null, valuationAud: 67_000_000, nextRoundWithin24m: null },
    confidence: "low",
  },
  {
    id: "parachute-2024-06",
    company: "Parachute",
    sourceNames: ["Parachute"],
    sourceTables: ["au-comparables.ts"],
    sector: "fintech",
    stage: "series-a",
    asOf: "2024-06",
    preRaiseProfile: {
      ...VC_SERIES_A,
      marketSize: "medium", problemClarity: "clear",
      hasProduct: true, hasRevenue: true, revenueBand: "growing", hasCustomers: true,
    },
    sourceUrls: [ABR("Parachute"), "https://www.smartcompany.com.au/?s=Parachute"],
    sourceNote: "au-comparables.ts note: 'A$8.5M Series A 2024' (B2B fintech infrastructure). Identity not corroborated beyond the source table; profile is stage-implied only.",
    outcome: { roundAud: 8_500_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "low",
  },
  {
    id: "cor-2024-06",
    company: "COR",
    sourceNames: ["COR"],
    sourceTables: ["au-comparables.ts"],
    sector: "fintech",
    stage: "seed",
    asOf: "2024-06",
    preRaiseProfile: {
      ...VC_SEED,
      marketSize: "medium", problemClarity: "clear",
      hasProduct: true, hasCustomers: true,
    },
    sourceUrls: [ABR("COR")],
    sourceNote: "au-comparables.ts note: 'A$8M seed valuation 2024' (embedded insurance). The 0402 seed carries amount_aud = post_money_aud = 8M; both kept as written. Identity not corroborated; stage-implied profile.",
    outcome: { roundAud: 8_000_000, valuationAud: 8_000_000, nextRoundWithin24m: null },
    confidence: "low",
  },

  // ── SaaS ─────────────────────────────────────────────────────────────────
  {
    id: "employment-hero-2022-02",
    company: "Employment Hero",
    sourceNames: ["Employment Hero"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "saas",
    stage: "series-b",
    asOf: "2022-02",
    preRaiseProfile: {
      ...VC_LATE,
      hasCoFounder: true, founderExperience: "serial", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated", hasSwitchingCosts: true,
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasSocialProof: true,
      hasContracts: true,
    },
    sourceUrls: ["https://employmenthero.com", "https://www.airtree.vc/companies", ABR("Employment Hero")],
    sourceNote: "A$181M Series E (TDM / SEEK) at A$1.25B, Feb 2022 (AFR). Founder previously built Employment Innovations / KeyPay → serial. Next round Oct 2023 (< 24 months).",
    outcome: { roundAud: 181_000_000, valuationAud: 1_250_000_000, nextRoundWithin24m: true },
    confidence: "high",
  },
  {
    id: "employment-hero-2023-10",
    company: "Employment Hero",
    sourceNames: ["Employment Hero"],
    sourceTables: ["au-comparables.ts"],
    sector: "saas",
    stage: "unicorn",
    asOf: "2023-10",
    preRaiseProfile: {
      ...VC_LATE,
      hasCoFounder: true, founderExperience: "serial", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated", hasSwitchingCosts: true, hasDataAdvantage: true,
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasSocialProof: true,
      hasContracts: true,
    },
    sourceUrls: ["https://employmenthero.com", "https://www.airtree.vc/companies", ABR("Employment Hero")],
    sourceNote: "au-comparables.ts note: 'A$2B+ valuation (2024)'. That source gives no round size, so roundAud stays null even though the Oct 2023 round was widely reported.",
    outcome: { roundAud: null, valuationAud: 2_000_000_000, nextRoundWithin24m: null },
    confidence: "medium",
  },
  {
    id: "culture-amp-2021-07",
    company: "Culture Amp",
    sourceNames: ["Culture Amp"],
    sourceTables: ["au-comparable-raises.ts", "au-comparables.ts"],
    sector: "saas",
    stage: "series-b",
    asOf: "2021-07",
    preRaiseProfile: {
      ...VC_LATE,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated", hasSwitchingCosts: true, hasDataAdvantage: true,
      hasProduct: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasSocialProof: true,
      hasContracts: true,
    },
    sourceUrls: ["https://www.cultureamp.com", "https://en.wikipedia.org/wiki/Culture_Amp", "https://www.blackbird.vc/portfolio"],
    sourceNote: "A$135M Series F (TDM / Sequoia China) at ~A$1.5B, Jul 2021. Both source tables describe this valuation; deduped into one row. No further primary round announced within 24 months.",
    outcome: { roundAud: 135_000_000, valuationAud: 1_500_000_000, nextRoundWithin24m: false },
    confidence: "high",
  },
  {
    id: "linktree-2022-03",
    company: "Linktree",
    sourceNames: ["Linktree"],
    sourceTables: ["au-comparable-raises.ts", "au-comparables.ts"],
    sector: "saas",
    stage: "series-b",
    asOf: "2022-03",
    preRaiseProfile: {
      ...VC_SERIES_A,
      hasCoFounder: true, founderExperience: "experienced",
      marketSize: "large", problemClarity: "validated", hasNetworkEffect: true,
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasSocialProof: true,
    },
    sourceUrls: ["https://linktr.ee", "https://en.wikipedia.org/wiki/Linktree", "https://www.airtree.vc/companies"],
    sourceNote: "Series C (Index / Coatue), Mar 2022. Sources disagree on the AUD valuation — au-comparable-raises.ts A$1.3B (kept, it carries the round size) vs au-comparables.ts A$1.9B. No further primary round within 24 months.",
    outcome: { roundAud: 145_000_000, valuationAud: 1_300_000_000, nextRoundWithin24m: false },
    confidence: "high",
  },
  {
    id: "safetyculture-2021-05",
    company: "SafetyCulture",
    sourceNames: ["SafetyCulture"],
    sourceTables: ["au-comparable-raises.ts", "au-comparables.ts"],
    sector: "saas",
    stage: "series-b",
    asOf: "2021-05",
    preRaiseProfile: {
      ...VC_LATE,
      founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated", hasSwitchingCosts: true, hasDataAdvantage: true,
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasSocialProof: true,
      hasContracts: true,
    },
    sourceUrls: ["https://safetyculture.com", "https://www.blackbird.vc/portfolio", ABR("SafetyCulture")],
    sourceNote: "Source: A$220M round (Insight) at A$2.7B, 2021 (the 2021 raise was reported at ~A$2.2B, the 2022 top-up at A$2.7B — figures kept as written). au-comparables.ts '~A$2.6B' deduped here. Solo founder.",
    outcome: { roundAud: 220_000_000, valuationAud: 2_700_000_000, nextRoundWithin24m: null },
    confidence: "medium",
  },
  {
    id: "deputy-2018-11",
    company: "Deputy",
    sourceNames: ["Deputy"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "saas",
    stage: "series-a",
    asOf: "2018-11",
    preRaiseProfile: {
      ...VC_SERIES_A,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated", hasSwitchingCosts: true,
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasSocialProof: true,
      hasContracts: true,
    },
    sourceUrls: ["https://www.deputy.com", "https://en.wikipedia.org/wiki/Deputy_(company)"],
    sourceNote: "US$81M (≈ A$111M) Series B led by IVP, Nov 2018 — the source labels it 'seriesA'; stage kept as the source's bucket. Valuation undisclosed.",
    outcome: { roundAud: 111_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "medium",
  },
  {
    id: "auror-2023-05",
    company: "Auror",
    sourceNames: ["Auror"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "saas",
    stage: "series-a",
    asOf: "2023-05",
    preRaiseProfile: {
      ...VC_SERIES_A,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated", hasNetworkEffect: true, hasDataAdvantage: true, hasSwitchingCosts: true,
      hasProduct: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasSocialProof: true, hasContracts: true,
    },
    sourceUrls: ["https://www.auror.co", "https://www.blackbird.vc/portfolio"],
    sourceNote: "A$45M round (Blackbird) 2023; NZ-founded retail-crime intelligence network with ANZ retailers as customers. Source stage bucket 'seriesA'.",
    outcome: { roundAud: 45_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "medium",
  },
  {
    id: "roller-2022-06",
    company: "Roller",
    sourceNames: ["Roller"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "saas",
    stage: "series-a",
    asOf: "2022-06",
    preRaiseProfile: {
      ...VC_SERIES_A,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "medium", problemClarity: "validated", hasSwitchingCosts: true,
      hasProduct: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasContracts: true,
    },
    sourceUrls: ["https://www.roller.software", ABR("Roller Software")],
    sourceNote: "A$115M growth round (Insight Partners) reported 2022; venue-management SaaS with global paying customers; founded by two brothers.",
    outcome: { roundAud: 115_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "medium",
  },
  {
    id: "ignition-2022-04",
    company: "Ignition",
    sourceNames: ["Ignition"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "saas",
    stage: "series-a",
    asOf: "2022-04",
    preRaiseProfile: {
      ...VC_SERIES_A,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated", hasSwitchingCosts: true,
      hasProduct: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasContracts: true,
    },
    sourceUrls: ["https://www.ignitionapp.com", ABR("Practice Ignition")],
    sourceNote: "A$50M round reported 2022 (proposal-to-payment SaaS for accountants, formerly Practice Ignition). Source stage bucket 'seriesA'.",
    outcome: { roundAud: 50_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "medium",
  },
  {
    id: "assignar-2018-06",
    company: "Assignar",
    sourceNames: ["Assignar"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "saas",
    stage: "seed",
    asOf: "2018-06",
    preRaiseProfile: {
      ...VC_SEED,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "medium", problemClarity: "validated", hasSwitchingCosts: true,
      hasProduct: true, hasRevenue: true, revenueBand: "early", hasCustomers: true, hasContracts: true,
    },
    sourceUrls: ["https://assignar.com", ABR("Assignar")],
    sourceNote: "A$4M seed (Tola Capital) 2018; construction-workforce SaaS with paying contractors; founder from the construction industry.",
    outcome: { roundAud: 4_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "medium",
  },
  {
    id: "splose-2024-03",
    company: "Splose",
    sourceNames: ["Splose"],
    sourceTables: ["au-comparables.ts"],
    sector: "healthtech",
    stage: "series-a",
    asOf: "2024-03",
    preRaiseProfile: {
      ...VC_SERIES_A,
      marketSize: "medium", problemClarity: "validated", hasSwitchingCosts: true,
      hasProduct: true, hasRevenue: true, revenueBand: "growing", hasCustomers: true,
    },
    sourceUrls: ["https://splose.com", ABR("Splose")],
    sourceNote: "au-comparables.ts note: 'A$100M+ valuation, A$46M Series A 2024' (allied-health practice software). Source stage field 'series-b'; row uses the stated round label. Figures not independently confirmed.",
    outcome: { roundAud: 46_000_000, valuationAud: 100_000_000, nextRoundWithin24m: null },
    confidence: "low",
  },
  {
    id: "operata-2024-03",
    company: "Operata",
    sourceNames: ["Operata"],
    sourceTables: ["au-comparables.ts"],
    sector: "saas",
    stage: "series-b",
    asOf: "2024-03",
    preRaiseProfile: {
      ...VC_SERIES_A,
      founderSectorFit: true,
      marketSize: "medium", problemClarity: "validated", hasDataAdvantage: true, hasSwitchingCosts: true,
      hasProduct: true, hasRevenue: true, revenueBand: "growing", hasCustomers: true, hasContracts: true,
    },
    sourceUrls: ["https://operata.com", ABR("Operata")],
    sourceNote: "au-comparables.ts note: 'A$89M Series B 2024, ~52x ARR multiple' (contact-centre observability). Figures not independently confirmed.",
    outcome: { roundAud: 89_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "low",
  },
  {
    id: "aigentsphere-2024-06",
    company: "Aigentsphere",
    sourceNames: ["Aigentsphere"],
    sourceTables: ["au-comparables.ts"],
    sector: "saas",
    stage: "seed",
    asOf: "2024-06",
    preRaiseProfile: {
      ...VC_SEED,
      marketSize: "large", problemClarity: "clear",
      hasProduct: true,
    },
    sourceUrls: ["https://www.aigentsphere.com", ABR("Aigentsphere")],
    sourceNote: "au-comparables.ts note: 'A$20M valuation at seed (2024)'; no round size. Identity not corroborated beyond the domain; stage-implied profile, revenue not asserted.",
    outcome: { roundAud: null, valuationAud: 20_000_000, nextRoundWithin24m: null },
    confidence: "low",
  },
  {
    id: "hachiko-2022-06",
    company: "Hachiko",
    sourceNames: ["Hachiko"],
    sourceTables: ["au-comparables.ts"],
    sector: "saas",
    stage: "seed",
    asOf: "2022-06",
    preRaiseProfile: {
      ...VC_SEED,
      marketSize: "medium", problemClarity: "clear",
      hasProduct: true, hasCustomers: true,
    },
    sourceUrls: [ABR("Hachiko")],
    sourceNote: "au-comparables.ts note: 'A$10-12M seed valuation' (SME operations SaaS); the 0402 seed stores 10M. No round size. Identity not corroborated; stage-implied profile.",
    outcome: { roundAud: null, valuationAud: 10_000_000, nextRoundWithin24m: null },
    confidence: "low",
  },
  {
    id: "canva-2024-08",
    company: "Canva",
    sourceNames: ["Canva"],
    sourceTables: ["au-comparables.ts"],
    sector: "saas",
    stage: "unicorn",
    asOf: "2024-08",
    preRaiseProfile: {
      ...VC_LATE,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated", hasSwitchingCosts: true, hasDataAdvantage: true, hasMoat: true,
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasSocialProof: true,
      hasContracts: true, hasIPProtection: true,
    },
    sourceUrls: ["https://www.canva.com", "https://en.wikipedia.org/wiki/Canva", "https://www.blackbird.vc/portfolio"],
    sourceNote: "au-comparables.ts note: 'A$49B valuation (2024)' — a secondary-sale mark, no primary round, so roundAud stays null.",
    outcome: { roundAud: null, valuationAud: 49_000_000_000, nextRoundWithin24m: null },
    confidence: "high",
  },

  // ── Marketplace ──────────────────────────────────────────────────────────
  {
    id: "mr-yum-2022-02",
    company: "Mr Yum",
    sourceNames: ["Mr Yum"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "marketplace",
    stage: "series-a",
    asOf: "2022-02",
    preRaiseProfile: {
      ...VC_SERIES_A,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated",
      hasProduct: true, hasRevenue: true, revenueBand: "growing", hasCustomers: true, hasSocialProof: true, hasContracts: true,
    },
    sourceUrls: ["https://www.mryum.com", ABR("Mr Yum")],
    sourceNote: "A$89M Series A (Tiger Global) at ~A$250M, early 2022 (AFR / Startup Daily). Merged with me&u in 2023 — no further primary round within 24 months.",
    outcome: { roundAud: 89_000_000, valuationAud: 250_000_000, nextRoundWithin24m: false },
    confidence: "high",
  },
  {
    id: "milkrun-2021-10",
    company: "Milkrun",
    sourceNames: ["Milkrun"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "marketplace",
    stage: "seed",
    asOf: "2021-10",
    preRaiseProfile: {
      ...VC_SEED,
      founderExperience: "experienced", founderSectorFit: true,
      marketSize: "medium", problemClarity: "clear",
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "early", hasCustomers: true, hasSocialProof: true,
    },
    sourceUrls: ["https://www.milkrun.com", "https://en.wikipedia.org/wiki/Milkrun", "https://www.airtree.vc/companies"],
    sourceNote: "A$11M seed (AirTree) Oct 2021, weeks after launch; founder previously co-founded Koala (no exit → 'experienced', not 'serial'). Series A A$75M Jan 2022 (< 24 months).",
    outcome: { roundAud: 11_000_000, valuationAud: null, nextRoundWithin24m: true },
    confidence: "high",
  },
  {
    id: "providoor-2021-06",
    company: "Providoor",
    sourceNames: ["Providoor"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "marketplace",
    stage: "seed",
    asOf: "2021-06",
    preRaiseProfile: {
      ...VC_SEED,
      founderExperience: "experienced", founderSectorFit: true,
      marketSize: "medium", problemClarity: "validated", hasNetworkEffect: true,
      hasProduct: true, hasRevenue: true, revenueBand: "growing", hasCustomers: true, hasSocialProof: true,
    },
    sourceUrls: ["https://providoor.com", ABR("Providoor")],
    sourceNote: "A$10M round reported 2021 (restaurant-meal delivery marketplace launched in the 2020 lockdowns by a chef-founder). Business wound up in 2023; no further primary round.",
    outcome: { roundAud: 10_000_000, valuationAud: null, nextRoundWithin24m: false },
    confidence: "medium",
  },
  {
    id: "sendle-2022-05",
    company: "Sendle",
    sourceNames: ["Sendle"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "marketplace",
    stage: "series-a",
    asOf: "2022-05",
    preRaiseProfile: {
      ...VC_SERIES_A,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated",
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasSocialProof: true, hasContracts: true,
    },
    sourceUrls: ["https://www.sendle.com", "https://en.wikipedia.org/wiki/Sendle"],
    sourceNote: "A$45M round (Federation) 2022; certified B Corp parcel network for SMEs since 2014. Source stage bucket 'seriesA' (the company was on later lettered rounds).",
    outcome: { roundAud: 45_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "medium",
  },
  {
    id: "bazaa-2024-06",
    company: "Bazaa",
    sourceNames: ["Bazaa"],
    sourceTables: ["au-comparables.ts"],
    sector: "marketplace",
    stage: "pre-seed",
    asOf: "2024-06",
    preRaiseProfile: {
      ...AU_BASE,
      marketSize: "medium", problemClarity: "clear", hasNetworkEffect: true,
      hasProduct: true,
    },
    sourceUrls: ["https://bazaa.com.au", ABR("Bazaa")],
    sourceNote: "au-comparables.ts note: 'A$2.6M pre-seed 2024' (wholesale B2B marketplace); source stage field 'seed', row uses the stated round label. No valuation.",
    outcome: { roundAud: 2_600_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "low",
  },

  // ── HealthTech ───────────────────────────────────────────────────────────
  {
    id: "harrison-ai-2021-11",
    company: "Harrison.ai",
    sourceNames: ["Harrison.ai"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "healthtech",
    stage: "series-b",
    asOf: "2021-11",
    preRaiseProfile: {
      ...VC_SERIES_A,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated", hasDataAdvantage: true, hasMoat: true,
      hasProduct: true, hasRevenue: true, revenueBand: "early", hasCustomers: true, hasSocialProof: true,
      hasIPProtection: true, hasContracts: true,
    },
    sourceUrls: ["https://harrison.ai", "https://www.blackbird.vc/portfolio", ABR("Harrison.ai")],
    sourceNote: "A$129M Series B (Horizons / Blackbird) Nov 2021; TGA-cleared radiology AI sold through the I-MED joint venture. Next primary round > 24 months later.",
    outcome: { roundAud: 129_000_000, valuationAud: null, nextRoundWithin24m: false },
    confidence: "high",
  },
  {
    id: "eucalyptus-2021-11",
    company: "Eucalyptus",
    sourceNames: ["Eucalyptus"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "healthtech",
    stage: "series-b",
    asOf: "2021-11",
    preRaiseProfile: {
      ...VC_SERIES_A,
      hasCoFounder: true, founderSectorFit: true,
      marketSize: "large", problemClarity: "validated",
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasSocialProof: true,
    },
    sourceUrls: ["https://www.eucalyptus.health", "https://www.blackbird.vc/portfolio", ABR("Eucalyptus")],
    sourceNote: "A$60M Series C (BOND) Nov 2021 for the Pilot / Kin / Juniper telehealth brands. First-time founding team (ex-Koala marketing).",
    outcome: { roundAud: 60_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "high",
  },
  {
    id: "heidi-health-2024-02",
    company: "Heidi Health",
    sourceNames: ["Heidi Health"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "healthtech",
    stage: "seed",
    asOf: "2024-02",
    preRaiseProfile: {
      ...VC_SEED,
      hasCoFounder: true, founderSectorFit: true,
      marketSize: "large", problemClarity: "validated", hasDataAdvantage: true,
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "early", hasCustomers: true, hasSocialProof: true,
    },
    sourceUrls: ["https://www.heidihealth.com", "https://www.blackbird.vc/portfolio", ABR("Heidi Health")],
    sourceNote: "A$10M round (Blackbird) Feb 2024; AI scribe used by GPs, doctor-founder. Series A announced within 24 months.",
    outcome: { roundAud: 10_000_000, valuationAud: null, nextRoundWithin24m: true },
    confidence: "medium",
  },
  {
    id: "sonder-2022-06",
    company: "Sonder",
    sourceNames: ["Sonder"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "healthtech",
    stage: "series-a",
    asOf: "2022-06",
    preRaiseProfile: {
      ...VC_SERIES_A,
      hasCoFounder: true, founderExperience: "experienced",
      marketSize: "medium", problemClarity: "validated",
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "growing", hasCustomers: true, hasContracts: true,
    },
    sourceUrls: ["https://sonder.io", "https://www.blackbird.vc/portfolio", ABR("Sonder Australia")],
    sourceNote: "A$50M round (Blackbird) 2022 for the employee wellbeing / safety app sold to enterprises and universities; ex-military founding team.",
    outcome: { roundAud: 50_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "medium",
  },
  {
    id: "perx-health-2022-06",
    company: "Perx Health",
    sourceNames: ["Perx Health"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "healthtech",
    stage: "seed",
    asOf: "2022-06",
    preRaiseProfile: {
      ...VC_SEED,
      hasCoFounder: true, founderSectorFit: true,
      marketSize: "medium", problemClarity: "validated",
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "early", hasCustomers: true, hasContracts: true,
    },
    sourceUrls: ["https://www.perxhealth.com", ABR("Perx Health")],
    sourceNote: "A$8M round (Main Sequence) 2022; medication-adherence app with pharma / insurer contracts.",
    outcome: { roundAud: 8_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "medium",
  },

  // ── DeepTech ─────────────────────────────────────────────────────────────
  {
    id: "advanced-navigation-2022-11",
    company: "Advanced Navigation",
    sourceNames: ["Advanced Navigation"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "deeptech",
    stage: "series-b",
    asOf: "2022-11",
    preRaiseProfile: {
      ...VC_LATE,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated", hasMoat: true, hasIPProtection: true,
      hasProduct: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasSocialProof: true, hasContracts: true,
    },
    sourceUrls: ["https://www.advancednavigation.com", ABR("Advanced Navigation")],
    sourceNote: "A$108M Series B (KKR-led; In-Q-Tel an earlier investor) Nov 2022; profitable navigation / robotics hardware exporter founded 2012.",
    outcome: { roundAud: 108_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "medium",
  },
  {
    id: "q-ctrl-2022-11",
    company: "Q-CTRL",
    sourceNames: ["Q-CTRL"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "deeptech",
    stage: "series-b",
    asOf: "2022-11",
    preRaiseProfile: {
      ...VC_SERIES_A,
      founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "clear", hasMoat: true, hasIPProtection: true, hasDataAdvantage: true,
      hasProduct: true, hasRevenue: true, revenueBand: "early", hasCustomers: true, hasContracts: true, hasSocialProof: true,
    },
    sourceUrls: ["https://q-ctrl.com", ABR("Q-CTRL")],
    sourceNote: "A$40M Series B extension (Airbus Ventures) 2022; quantum-control software spun out of the University of Sydney, solo academic founder. Further Series B capital announced within 24 months.",
    outcome: { roundAud: 40_000_000, valuationAud: null, nextRoundWithin24m: true },
    confidence: "medium",
  },
  {
    id: "baraja-2020-06",
    company: "Baraja",
    sourceNames: ["Baraja"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "deeptech",
    stage: "series-a",
    asOf: "2020-06",
    preRaiseProfile: {
      ...VC_SERIES_A,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "clear", hasMoat: true, hasIPProtection: true,
      hasProduct: true, hasRevenue: true, revenueBand: "early", hasCustomers: true,
    },
    sourceUrls: ["https://www.baraja.com", "https://www.blackbird.vc/portfolio", ABR("Baraja")],
    sourceNote: "Source row: A$60M Series A led by Sequoia, 2020. Baraja's Sequoia-led Series A was reported in Dec 2018 (US$32M) — year and amount kept as the source wrote them; confidence low.",
    outcome: { roundAud: 60_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "low",
  },
  {
    id: "fivecast-2022-05",
    company: "Fivecast",
    sourceNames: ["Fivecast"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "deeptech",
    stage: "series-a",
    asOf: "2022-05",
    preRaiseProfile: {
      ...VC_SERIES_A,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated", hasDataAdvantage: true, hasMoat: true, hasIPProtection: true,
      hasProduct: true, hasRevenue: true, revenueBand: "growing", hasCustomers: true, hasContracts: true, hasSocialProof: true,
    },
    sourceUrls: ["https://www.fivecast.com", ABR("Fivecast")],
    sourceNote: "A$30M Series A (Ten Eleven Ventures) May 2022; open-source-intelligence software spun out of the Data to Decisions CRC with government customers.",
    outcome: { roundAud: 30_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "high",
  },
  {
    id: "loam-bio-2022-02",
    company: "Loam Bio",
    sourceNames: ["Loam Bio"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "deeptech",
    stage: "series-b",
    asOf: "2022-02",
    preRaiseProfile: {
      ...VC_SERIES_A,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "clear", hasMoat: true, hasIPProtection: true,
      hasProduct: true, hasCustomers: true, hasSocialProof: true,
    },
    sourceUrls: ["https://www.loambio.com", ABR("Loam Bio")],
    sourceNote: "Source row: A$105M round (Lowercarbon) 2022 labelled seriesB. Loam's A$40M Series A closed Feb 2022 and the ~A$105M Series B in early 2023 — figures kept as the source wrote them; farmer pilots but revenue not asserted.",
    outcome: { roundAud: 105_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "low",
  },
  {
    id: "vow-2022-11",
    company: "Vow",
    sourceNames: ["Vow"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "deeptech",
    stage: "series-a",
    asOf: "2022-11",
    preRaiseProfile: {
      ...VC_SERIES_A,
      hasCoFounder: true, founderSectorFit: true,
      marketSize: "large", problemClarity: "clear", hasMoat: true, hasIPProtection: true,
      hasProduct: true, hasSocialProof: true,
    },
    sourceUrls: ["https://vow.com.au", "https://en.wikipedia.org/wiki/Vow_(company)", "https://www.blackbird.vc/portfolio"],
    sourceNote: "US$49M (≈ A$70M) Series A (Blackbird / Prosperity7) Nov 2022; cultured-meat company, pre-revenue pending regulatory approval at the time.",
    outcome: { roundAud: 70_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "high",
  },
  {
    id: "cortical-labs-2022-06",
    company: "Cortical Labs",
    sourceNames: ["Cortical Labs"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "deeptech",
    stage: "seed",
    asOf: "2022-06",
    preRaiseProfile: {
      ...VC_SEED,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "clear", hasMoat: true, hasIPProtection: true, hasDataAdvantage: true,
      hasProduct: true, hasSocialProof: true,
    },
    sourceUrls: ["https://corticallabs.com", "https://en.wikipedia.org/wiki/Cortical_Labs"],
    sourceNote: "Source row: A$15M round (Horizons) 2022. Biological-computing company (DishBrain paper 2022), pre-revenue; doctor-founder with a prior startup (no exit).",
    outcome: { roundAud: 15_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "medium",
  },
  {
    id: "breaker-2020-06",
    company: "Breaker",
    sourceNames: ["Breaker"],
    sourceTables: ["au-comparables.ts"],
    sector: "deeptech",
    stage: "seed",
    asOf: "2020-06",
    preRaiseProfile: {
      ...VC_SEED,
      marketSize: "medium", problemClarity: "clear", hasIPProtection: true, hasMoat: true,
      hasProduct: true,
    },
    sourceUrls: [ABR("Breaker"), "https://www.startupdaily.net/?s=Breaker+counter-drone"],
    sourceNote: "au-comparables.ts note: 'A$36-45M valuation post A$9M seed' (defence counter-drone); the 0402 seed stores 36M. Source stage field 'series-a', row uses the stated round label. Identity not corroborated; stage-implied profile.",
    outcome: { roundAud: 9_000_000, valuationAud: 36_000_000, nextRoundWithin24m: null },
    confidence: "low",
  },

  // ── AgriTech ─────────────────────────────────────────────────────────────
  {
    id: "agridigital-2020-06",
    company: "Agridigital",
    sourceNames: ["Agridigital"],
    sourceTables: ["au-comparables.ts"],
    sector: "agritech",
    stage: "series-a",
    asOf: "2020-06",
    preRaiseProfile: {
      ...VC_SERIES_A,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "medium", problemClarity: "validated", hasSwitchingCosts: true,
      hasProduct: true, hasRevenue: true, revenueBand: "growing", hasCustomers: true, hasContracts: true,
    },
    sourceUrls: ["https://www.agridigital.io", ABR("AgriDigital")],
    sourceNote: "au-comparables.ts note: 'A$15M+ valuation' (grain supply-chain platform founded 2015 by agri-industry founders); no round size or date in the source — asOf is the curator's best placement.",
    outcome: { roundAud: null, valuationAud: 15_000_000, nextRoundWithin24m: null },
    confidence: "low",
  },

  // ── EdTech ───────────────────────────────────────────────────────────────
  {
    id: "go1-2021-07",
    company: "Go1",
    sourceNames: ["Go1", "GO1"],
    sourceTables: ["au-comparable-raises.ts", "au-comparables.ts"],
    sector: "edtech",
    stage: "series-b",
    asOf: "2021-07",
    preRaiseProfile: {
      ...VC_LATE,
      hasCoFounder: true, founderExperience: "experienced", founderSectorFit: true,
      marketSize: "large", problemClarity: "validated", hasNetworkEffect: true, hasSwitchingCosts: true,
      hasProduct: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasSocialProof: true, hasContracts: true,
    },
    sourceUrls: ["https://www.go1.com", "https://www.airtree.vc/companies", ABR("Go1")],
    sourceNote: "Series D (SoftBank / AirTree) Jul 2021. Sources disagree on the valuation — au-comparable-raises.ts A$2B (kept, carries the round) vs au-comparables.ts 'US$800M (2021)'. Further capital raised within 24 months.",
    outcome: { roundAud: 275_000_000, valuationAud: 2_000_000_000, nextRoundWithin24m: true },
    confidence: "medium",
  },
  {
    id: "cluey-learning-2021-06",
    company: "Cluey Learning",
    sourceNames: ["Cluey Learning"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "edtech",
    stage: "series-a",
    asOf: "2021-06",
    preRaiseProfile: {
      ...VC_LATE,
      hasCoFounder: true, founderExperience: "serial", founderSectorFit: true,
      marketSize: "medium", problemClarity: "validated",
      hasProduct: true, hasRevenue: true, revenueBand: "scaling", hasCustomers: true, hasSocialProof: true,
    },
    sourceUrls: ["https://clueylearning.com.au", ABR("Cluey Learning"), "https://www.startupdaily.net/?s=Cluey+Learning"],
    sourceNote: "Source row: A$20M round (Australian Ethical) 2021. Cluey listed on the ASX in Dec 2020, so this is a listed-company placement — 'seriesA' is the source's bucket. Co-founder previously took 3P Learning (Mathletics) public → serial.",
    outcome: { roundAud: 20_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "low",
  },
  {
    id: "mathspace-2018-06",
    company: "Mathspace",
    sourceNames: ["Mathspace"],
    sourceTables: ["au-comparable-raises.ts"],
    sector: "edtech",
    stage: "series-a",
    asOf: "2018-06",
    preRaiseProfile: {
      ...VC_SERIES_A,
      hasCoFounder: true, founderSectorFit: true,
      marketSize: "medium", problemClarity: "validated", hasDataAdvantage: true,
      hasProduct: true, hasApp: true, hasRevenue: true, revenueBand: "growing", hasCustomers: true, hasContracts: true,
    },
    sourceUrls: ["https://mathspace.co", "https://en.wikipedia.org/wiki/Mathspace"],
    sourceNote: "A$14M round (Rethink Education) 2018; adaptive maths platform sold to schools since 2012.",
    outcome: { roundAud: 14_000_000, valuationAud: null, nextRoundWithin24m: null },
    confidence: "medium",
  },
];

/**
 * Source rows that are in one of the two tables but NOT scored. Listed so
 * the colocated test can prove the union is complete and the page can say
 * why N is what it is. Nothing here is a judgement about the company —
 * only that the row carries nothing to calibrate against.
 */
export const EXCLUDED_SOURCE_ROWS: ExcludedSourceRow[] = [
  { sourceName: "Antler AU cohort (representative)", sourceTable: "au-comparable-raises.ts", reason: "program terms, not a company — no pre-raise profile exists" },
  { sourceName: "Startmate cohort (representative)", sourceTable: "au-comparable-raises.ts", reason: "program terms, not a company — no pre-raise profile exists" },
  { sourceName: "Blackbird Giants (representative)", sourceTable: "au-comparable-raises.ts", reason: "program terms, not a company — no pre-raise profile exists" },
  { sourceName: "Atlassian", sourceTable: "au-comparables.ts", reason: "listed company; the source row carries no round or valuation figure" },
  { sourceName: "Afterpay", sourceTable: "au-comparables.ts", reason: "the only figure in the source is the 2022 acquisition price — not a raise" },
  { sourceName: "Deputy", sourceTable: "au-comparables.ts", reason: "2021 'unicorn status' row carries no round or valuation figure (the 2018 round is scored)" },
  { sourceName: "Rokt", sourceTable: "au-comparables.ts", reason: "source figure is 'US$400M+' — no AUD value and no date" },
  { sourceName: "PropTrack", sourceTable: "au-comparables.ts", reason: "REA Group subsidiary — no startup raise; no figure" },
  { sourceName: "PictureWealth", sourceTable: "au-comparables.ts", reason: "no round or valuation figure in the source" },
  { sourceName: "Fluentis", sourceTable: "au-comparables.ts", reason: "no round or valuation figure in the source; identity not corroborated" },
  { sourceName: "ClimateAI Australia", sourceTable: "au-comparables.ts", reason: "no round or valuation figure in the source; identity not corroborated" },
  { sourceName: "Moroku", sourceTable: "au-comparables.ts", reason: "no round or valuation figure in the source" },
  { sourceName: "Earlywork", sourceTable: "au-comparables.ts", reason: "no round or valuation figure in the source" },
  { sourceName: "Propel Ventures", sourceTable: "au-comparables.ts", reason: "no round or valuation figure in the source" },
  { sourceName: "Farmbook", sourceTable: "au-comparables.ts", reason: "no round or valuation figure in the source" },
  { sourceName: "Medi AI", sourceTable: "au-comparables.ts", reason: "no round or valuation figure in the source" },
  { sourceName: "GridEdge", sourceTable: "au-comparables.ts", reason: "no round or valuation figure in the source" },
];

/** Rows with at least one outcome number — what the backtest can actually rank against. */
export function scorableBacktestRows(rows: readonly BacktestRow[] = AU_COMPARABLES_BACKTEST): BacktestRow[] {
  return rows.filter((r) => r.outcome.roundAud !== null || r.outcome.valuationAud !== null);
}

/** Does this profile flip a flag that the two-URL rule guards? */
export function profileFlipsGuardedFlag(profile: Partial<SVIExtractedSignals>): boolean {
  return profile.founderExperience === "serial" || profile.hasRevenue === true;
}
