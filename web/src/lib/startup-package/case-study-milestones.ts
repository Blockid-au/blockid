// Case-study milestones — Subgoal 13 harvester
// -----------------------------------------------------------------------------
// Canva / Xero / SafetyCulture timelines were previously hand-typed inline in
// `web/src/app/showcase/<slug>/page.tsx`. This module lifts those `TIMELINE`
// arrays into typed, shared constants and re-exports Atlassian's milestone
// list from the existing fixture in the same normalised shape.
//
// The three showcase page files import `<COMPANY>_TIMELINE` from here rather
// than owning their own copy — no rendering change, just a source swap. The
// Package UI (`unicorn-playbook-panel.tsx`) uses `caseStudiesForPhase()` to
// surface 2 cross-company real-world examples per growth phase.
//
// Phase taxonomy note
// -------------------
// Showcase pages tag milestones with a NUMERIC phase (1..12) drawn from
// `web/src/lib/showcase/gallery.ts:PHASE_LABELS`. The Startup Package works in
// `GrowthPhaseId` (`vision`, `customer_dev`, ...). Both taxonomies have 12
// items whose canonical 8-stage bucket lines up 1:1 by ordinal position (see
// `journey-map.ts:GROWTH_PHASE_TO_STAGE` vs
// `showcase/atlassian/fixture.ts:PHASE_TO_CANONICAL`), so we map positionally:
// numeric N → `GROWTH_PHASE_IDS[N-1]`. Atlassian's `phaseSlug` is a stringified
// numeric ("1".."12") — same mapping applies.

import { ATLASSIAN_DEMO } from "../showcase/atlassian/fixture";
import { GROWTH_PHASE_IDS, type GrowthPhaseId } from "../journey-map";

export type CaseStudyCompany = "canva" | "xero" | "safetyculture" | "atlassian";

/**
 * Normalised milestone shape shared by every case-study surface.
 *
 * `phase` is a `GrowthPhaseId` so callers can filter with the same taxonomy
 * the Package uses; UI code that still needs the numeric 1..12 label should
 * look up via `GROWTH_PHASE_IDS.indexOf(phase) + 1`.
 */
export interface Milestone {
  company: CaseStudyCompany;
  phase: GrowthPhaseId;
  headline: string;
  detail: string;
  source?: string;
  year?: number;
  /**
   * Optional USD-figure badge (e.g. "$3M", "$1B valuation"). Not required by
   * the plan schema — kept as an OPTIONAL extension so the three showcase
   * pages that previously rendered this badge (Canva / Xero / SafetyCulture)
   * preserve their display exactly after the refactor. New consumers can
   * safely ignore it.
   */
  usd?: string;
}

/**
 * Positional numeric-phase → GrowthPhaseId mapper. Both taxonomies map to the
 * same 8-stage canonical buckets in the same ordinal order, so slot 1 ↔ vision,
 * slot 2 ↔ customer_dev, etc. Unknown numbers fall back to `"vision"` (idea)
 * so a bad tag never breaks the render.
 */
function numericPhaseToId(phase: number): GrowthPhaseId {
  const idx = phase - 1;
  if (idx < 0 || idx >= GROWTH_PHASE_IDS.length) return "vision";
  return GROWTH_PHASE_IDS[idx];
}

/**
 * Coerce a phase slug produced by the showcase system ("1".."12" or a numeric)
 * into a `GrowthPhaseId`. Anything unparseable falls back to `"vision"`.
 */
function phaseSlugToId(phaseSlug: string | number): GrowthPhaseId {
  const n = typeof phaseSlug === "number" ? phaseSlug : parseInt(phaseSlug, 10);
  if (!Number.isFinite(n)) return "vision";
  return numericPhaseToId(n);
}

// ── CANVA ───────────────────────────────────────────────────────────────────
// Extracted verbatim (headline + detail + source + year) from
// `web/src/app/showcase/canva/page.tsx` — the previous hand-typed inline
// TIMELINE array. Same 11 rows, same wording, just normalised into the
// shared shape + tagged with company:"canva".

export const CANVA_TIMELINE: readonly Milestone[] = [
  {
    company: "canva",
    year: 2007,
    phase: numericPhaseToId(1),
    headline: "Fusion Yearbooks — the precursor",
    detail:
      "Melanie Perkins and Cliff Obrecht start a school-yearbook design business in Perth. Learn the design-tool pain point that becomes Canva five years later.",
    source: "https://en.wikipedia.org/wiki/Canva",
  },
  {
    company: "canva",
    year: 2012,
    phase: numericPhaseToId(4),
    headline: "Canva incorporates in Sydney; Cameron Adams joins as CTO/co-founder",
    detail:
      "Perkins + Obrecht + Adams. 100+ investor rejections in Silicon Valley. Bill Tai finally introduces Perkins to Lars Rasmussen (ex-Google Maps).",
    source: "https://www.canva.com/newsroom/news/canva-turns-10/",
  },
  {
    company: "canva",
    year: 2013,
    phase: numericPhaseToId(10),
    headline: "US$3M seed round; product launched",
    detail:
      "Matrix Partners + Blackbird Ventures + Bill Tai + Lars Rasmussen. Canva.com launches to public on 2013-08-26 with 50,000 sign-ups within the first month.",
    source: "https://www.crunchbase.com/organization/canva/company_financials",
    usd: "$3M",
  },
  {
    company: "canva",
    year: 2015,
    phase: numericPhaseToId(11),
    headline: "US$15M Series A led by Sequoia's Bond + Felicis + Blackbird",
    detail:
      "Valuation ~US$165M. Canva Business launched. Canva for Work becomes revenue engine.",
    source: "https://www.crunchbase.com/organization/canva/company_financials",
    usd: "$15M",
  },
  {
    company: "canva",
    year: 2018,
    phase: numericPhaseToId(11),
    headline: "Unicorn status — US$1B valuation",
    detail:
      "US$40M round led by Sequoia China + Blackbird Ventures + Felicis. First Aussie-founded unicorn led by a female founder.",
    source: "https://www.canva.com/newsroom/",
    usd: "$1B valuation",
  },
  {
    company: "canva",
    year: 2019,
    phase: numericPhaseToId(11),
    headline: "US$70M @ US$2.5B; then US$85M @ US$3.2B",
    detail:
      "Two rounds in a year. Rapid international expansion; Manila office grows; Chinese market entry.",
    source: "https://www.canva.com/newsroom/",
    usd: "$2.5B → $3.2B",
  },
  {
    company: "canva",
    year: 2021,
    phase: numericPhaseToId(11),
    headline: "US$200M round; valuation US$40B (decacorn)",
    detail:
      "T. Rowe Price + Franklin Templeton + Sequoia Capital Global Equities + Bessemer Venture Partners. Perkins + Obrecht pledge 30% of their equity to charitable causes.",
    source: "https://www.canva.com/newsroom/news/canva-reaches-40-billion-valuation-signs-giving-pledge/",
    usd: "$40B valuation",
  },
  {
    company: "canva",
    year: 2022,
    phase: numericPhaseToId(11),
    headline: "Downround to US$26B in secondary market",
    detail:
      "As tech valuations reset globally, secondary trades reprice Canva. Primary financing remains intact.",
    source: "https://en.wikipedia.org/wiki/Canva",
    usd: "$26B",
  },
  {
    company: "canva",
    year: 2023,
    phase: numericPhaseToId(11),
    headline: "Magic Studio — AI product launch",
    detail:
      "Suite of generative AI features (Magic Design, Magic Media, Magic Write) built on partnerships with OpenAI, Google Cloud, Anthropic.",
    source: "https://www.canva.com/newsroom/news/canva-2023-year-in-review/",
  },
  {
    company: "canva",
    year: 2024,
    phase: numericPhaseToId(11),
    headline: "US$380M secondary at ~US$26B; Affinity acquisition US$380M",
    detail:
      "Affinity (Serif Ltd) UK-based Photoshop/Illustrator alternative acquired. Largest Canva deal to date; broadens pro-designer market.",
    source: "https://www.canva.com/newsroom/",
    usd: "$380M deal",
  },
  {
    company: "canva",
    year: 2025,
    phase: numericPhaseToId(12),
    headline: "IPO speculation intensifies as revenue passes US$3B ARR",
    detail:
      "Multiple press reports on 2025-26 IPO planning; investment banks engaged. Company publicly declines to confirm timing.",
    source: "https://en.wikipedia.org/wiki/Canva",
  },
];

// ── XERO ────────────────────────────────────────────────────────────────────

export const XERO_TIMELINE: readonly Milestone[] = [
  {
    company: "xero",
    year: 2006,
    phase: numericPhaseToId(1),
    headline: "Founded in Wellington by Rod Drury + Hamish Edwards",
    detail:
      "Drury (serial entrepreneur, sold AfterMail to Quest Software in 2006 for NZ$70M) + Edwards (accountant) build cloud-first accounting for SMBs. Original bet: browser-native replaces desktop MYOB.",
    source: "https://en.wikipedia.org/wiki/Xero_(company)",
  },
  {
    company: "xero",
    year: 2007,
    phase: numericPhaseToId(10),
    headline: "NZX IPO 6 months after founding — NZ$15M raised",
    detail:
      "Listed on NZX at NZ$1.00. Extraordinarily early IPO — pre-revenue. Justified by need for capital + credibility to compete with MYOB in AU.",
    source: "https://www.xero.com/nz/media-releases/",
    usd: "NZ$15M",
  },
  {
    company: "xero",
    year: 2010,
    phase: numericPhaseToId(11),
    headline: "Australian expansion — Sydney office",
    detail:
      "AU launch and dual-listing exploration begins. Sydney office established.",
    source: "https://www.xero.com/nz/media-releases/",
  },
  {
    company: "xero",
    year: 2012,
    phase: numericPhaseToId(11),
    headline: "ASX dual-listing — ASX code XRO",
    detail:
      "Xero listed on ASX as well as NZX. Both boards active until 2018 NZX delist.",
    source: "https://www.asx.com.au/asx/share-price-research/company/XRO",
  },
  {
    company: "xero",
    year: 2014,
    phase: numericPhaseToId(11),
    headline: "US expansion + Matrix Partners US$150M round",
    detail:
      "Matrix Capital + Accel + Peter Thiel $150M — valuation ~US$1.5B. Aggressive push into US SMB accounting market. Later described as loss-making chapter.",
    source: "https://en.wikipedia.org/wiki/Xero_(company)",
    usd: "$150M",
  },
  {
    company: "xero",
    year: 2016,
    phase: numericPhaseToId(11),
    headline: "1M subscribers milestone",
    detail: "Global subscriber base crosses 1M; ARR ~NZ$300M.",
    source: "https://www.xero.com/global/media-releases/",
  },
  {
    company: "xero",
    year: 2018,
    phase: numericPhaseToId(11),
    headline: "NZX delisting — ASX primary only",
    detail:
      "Xero delisted from NZX to simplify governance + reduce compliance overhead. ASX becomes sole listing (still cited as first NZ-to-AU dual-listing success).",
    source: "https://www.xero.com/global/media-releases/",
  },
  {
    company: "xero",
    year: 2019,
    phase: numericPhaseToId(11),
    headline: "Acquires Instafile + Hubdoc — data-capture bet",
    detail:
      "Doubles down on the accountant tool-chain around Xero — receipts, expenses, doc management.",
    source: "https://www.xero.com/global/media-releases/",
  },
  {
    company: "xero",
    year: 2020,
    phase: numericPhaseToId(11),
    headline: "Reaches profitability + 2.7M subscribers",
    detail:
      "First full year profitable. ARR NZ$820M. Market cap ~AU$16B on ASX.",
    source: "https://www.asx.com.au/asx/share-price-research/company/XRO",
  },
  {
    company: "xero",
    year: 2022,
    phase: numericPhaseToId(11),
    headline: "Steve Vamos steps down; Sukhinder Singh Cassidy CEO",
    detail:
      "First externally-hired CEO from Silicon Valley — signals move to US-market focus + AI product bets.",
    source: "https://www.xero.com/global/media-releases/",
  },
  {
    company: "xero",
    year: 2024,
    phase: numericPhaseToId(11),
    headline: "Cost-cutting + focus on ARR growth; 4.2M subscribers",
    detail:
      "Xero completes restructuring. Announces Xero AI (Just Ask Xero). Market cap ~AU$25B.",
    source: "https://www.xero.com/global/media-releases/",
  },
];

// ── SAFETYCULTURE ───────────────────────────────────────────────────────────

export const SAFETYCULTURE_TIMELINE: readonly Milestone[] = [
  {
    company: "safetyculture",
    year: 2004,
    phase: numericPhaseToId(1),
    headline: "Founded in Townsville by Luke Anear",
    detail:
      "Ex-Private Investigator with a passion for workplace safety builds paper-forms replacement for construction + mining sites. Regional Aussie founder — unusual for tech.",
    source: "https://en.wikipedia.org/wiki/SafetyCulture",
  },
  {
    company: "safetyculture",
    year: 2012,
    phase: numericPhaseToId(4),
    headline: "iAuditor mobile app launched",
    detail:
      "Native iOS + Android inspection app replaces paper safety checklists. Freemium model. Product-led growth from Day 0.",
    source: "https://safetyculture.com/press/",
  },
  {
    company: "safetyculture",
    year: 2016,
    phase: numericPhaseToId(10),
    headline: "US$23M Series A led by Index Ventures + Blackbird",
    detail:
      "Series A after 12 years of bootstrap-and-slow-growth. Uncommon path — most Aussie tech takes seed within 2 years.",
    source: "https://safetyculture.com/press/",
    usd: "$23M",
  },
  {
    company: "safetyculture",
    year: 2018,
    phase: numericPhaseToId(11),
    headline: "US$70M Series B; valuation ~US$440M",
    detail:
      "Tiger Global led. HQ shifts to Sydney office alongside Townsville roots. International expansion into US + UK.",
    source: "https://safetyculture.com/press/",
    usd: "$70M",
  },
  {
    company: "safetyculture",
    year: 2021,
    phase: numericPhaseToId(11),
    headline: "US$99M Series C; unicorn status",
    detail:
      "Insight Partners led. Valuation US$1.6B — first Townsville-founded tech unicorn.",
    source: "https://safetyculture.com/press/",
    usd: "$1.6B valuation",
  },
  {
    company: "safetyculture",
    year: 2022,
    phase: numericPhaseToId(11),
    headline: "US$34M Series C extension @ US$2.7B valuation",
    detail:
      "Softbank Vision Fund 2 led — first Australian Softbank-led round. Growth acceleration into US + APAC.",
    source: "https://safetyculture.com/press/",
    usd: "$2.7B valuation",
  },
  {
    company: "safetyculture",
    year: 2023,
    phase: numericPhaseToId(11),
    headline: "AI product line launched",
    detail:
      "Generative AI features for safety checklist creation + inspection analysis. Partnerships with OpenAI + Anthropic.",
    source: "https://safetyculture.com/press/",
  },
  {
    company: "safetyculture",
    year: 2024,
    phase: numericPhaseToId(11),
    headline: "Secondary trade valuation ~US$2B (down from US$2.7B peak)",
    detail:
      "Consistent with global valuation resets. Company remains cash-flow positive.",
    source: "https://safetyculture.com/press/",
    usd: "$2B secondary",
  },
];

// ── ATLASSIAN ───────────────────────────────────────────────────────────────
// Re-exported from the existing fixture — mapped into the same normalised
// shape (title→headline, body→detail, source.url→source, phaseSlug→phase).
// We compute this lazily so the fixture only runs once on module load.

export const ATLASSIAN_TIMELINE: readonly Milestone[] =
  ATLASSIAN_DEMO.milestones.map((m) => ({
    company: "atlassian" as const,
    year: m.year,
    phase: phaseSlugToId(m.phaseSlug),
    headline: m.title,
    detail: m.body,
    source: m.source.url,
    usd: m.usd,
  }));

/**
 * Every milestone from every case study, in a stable order (company groups
 * → chronological within each). Callers that want deterministic pagination
 * should slice this array; callers that want per-phase picks should use
 * {@link caseStudiesForPhase} which handles cross-company round-robin.
 */
export const ALL_MILESTONES: readonly Milestone[] = [
  ...ATLASSIAN_TIMELINE,
  ...CANVA_TIMELINE,
  ...XERO_TIMELINE,
  ...SAFETYCULTURE_TIMELINE,
];

/**
 * Return up to 2 cross-company example milestones for the requested phase.
 *
 * Strategy: prefer diversity of company (pick one Atlassian, then one from
 * a non-Atlassian company) so the founder always sees a real Aussie unicorn
 * *plus* a second data point. Falls back to any 2 matching rows if the ideal
 * pairing isn't available. Empty array if the phase has no matching rows.
 */
export function caseStudiesForPhase(phaseId: GrowthPhaseId): Milestone[] {
  const matches = ALL_MILESTONES.filter((m) => m.phase === phaseId);
  if (matches.length <= 2) return [...matches];

  const atlassian = matches.find((m) => m.company === "atlassian");
  const others = matches.filter((m) => m.company !== "atlassian");

  const picks: Milestone[] = [];
  if (atlassian) picks.push(atlassian);

  // Round-robin across the non-Atlassian companies so we don't pick two Canva
  // rows when we could show Canva + Xero.
  const seenCompanies = new Set<CaseStudyCompany>(
    picks.map((p) => p.company),
  );
  for (const m of others) {
    if (picks.length >= 2) break;
    if (seenCompanies.has(m.company)) continue;
    picks.push(m);
    seenCompanies.add(m.company);
  }

  // Fill remaining slots (if any) with any remaining match to guarantee up to 2.
  for (const m of matches) {
    if (picks.length >= 2) break;
    if (!picks.includes(m)) picks.push(m);
  }

  return picks;
}
