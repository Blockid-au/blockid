// Public-record showcases — Airwallex + Culture Amp (G2 #6, S19-B).
//
// Real-world workflow parity audit
// (docs/plans/real-world-workflow-parity-audit-2026-07-23.md §2, §6 item 6):
// two more reference journeys for the /showcase library, built ONLY from
// publicly documented facts. Every figure (A$/US$ amount, valuation, revenue,
// customer count) carries the source it was read from — publisher, URL and
// the date of that source — and the colocated test refuses any monetary
// figure in the rendered page that is not attached to a `data-source` link.
// Where a figure is not publicly reported it is omitted, never estimated.
//
// The "illustrative SVI" band is BlockID's reading of which canonical stage
// the public record puts the company in today. It is not an assessment of
// the company (neither is a BlockID customer, neither has been scored) and
// the disclaimer below is rendered on every surface that shows this data.

import type { StageKey } from "@/lib/journey-vocabulary";

export const ILLUSTRATIVE_SVI_DISCLAIMER =
  "Illustrative SVI only — not an assessment of the company. " +
  "This page is a market reference compiled from public sources (company newsroom, filings, press). " +
  "The stage band is BlockID's reading of the public record, not a score BlockID has produced; " +
  "the company is not a BlockID customer and does not endorse BlockID. " +
  "Figures without a public source are omitted, not estimated.";

export interface PublicSource {
  /** Absolute https URL of the page the fact was read from. */
  url: string;
  /** Publisher as it appears on the page (company newsroom, Reuters, …). */
  publisher: string;
  /** Date of the source: YYYY-MM or YYYY-MM-DD. */
  date: string;
}

export interface PublicStat {
  label: string;
  value: string;
  hint?: string;
  source: PublicSource;
}

export interface PublicMilestone {
  /** YYYY or YYYY-MM as printed in the source. */
  date: string;
  /** 12-phase showcase slot (1..12) — same grouping the other showcase pages use. */
  phase: number;
  headline: string;
  detail: string;
  /** Round size / amount badge, e.g. "US$300M". Only when the source states it. */
  figure?: string;
  /** Post-money / reported valuation badge, e.g. "US$6.2B". */
  valuation?: string;
  source: PublicSource;
}

export interface PublicRecordCase {
  slug: "airwallex" | "culture-amp";
  name: string;
  flag: string;
  /** Founding year with the source and any note on conflicting public records. */
  founded: { year: number; city: string; note?: string; source: PublicSource };
  hq: { value: string; source: PublicSource };
  sector: string;
  founders: { names: string[]; source: PublicSource };
  /** Prose summary — must not carry any monetary figure (test-enforced). */
  summary: string;
  stats: PublicStat[];
  milestones: PublicMilestone[];
  /** Lessons — prose only, no monetary figures (test-enforced). */
  lessons: Array<{ title: string; body: string }>;
  illustrativeSvi: {
    canonicalStage: StageKey;
    /** The 12-phase slot that the latest public milestone lands in. */
    phase: number;
    rationale: string;
  };
}

// ── Airwallex ───────────────────────────────────────────────────────────────

const AWX_WIKI: PublicSource = {
  url: "https://en.wikipedia.org/wiki/Airwallex",
  publisher: "Wikipedia",
  date: "2026-09",
};
const AWX_SERIES_D: PublicSource = {
  url: "https://www.airwallex.com/newsroom/airwallex-closes-usd160m-in-record-fundraising-round-to-date",
  publisher: "Airwallex newsroom",
  date: "2020-04",
};
const AWX_2_6B: PublicSource = {
  url: "https://www.airwallex.com/global/newsroom/airwallexs-latest-capital-puts-valuation-at-usd-2-6-billion",
  publisher: "Airwallex newsroom",
  date: "2021-03",
};
const AWX_SERIES_E: PublicSource = {
  url: "https://www.businesswire.com/news/home/20210920005361/en/Airwallex-Raised-US$200-Million-Series-E-Funding-Round-Led-by-Lone-Pine-Capital",
  publisher: "Business Wire",
  date: "2021-09-20",
};
const AWX_SERIES_E1: PublicSource = {
  url: "https://www.airwallex.com/global/newsroom/airwallex-raises-additional-usd100-million-in-series-e1-led-by-lone-pine",
  publisher: "Airwallex newsroom",
  date: "2021-11",
};
const AWX_2022: PublicSource = {
  url: "https://techcrunch.com/2022/10/10/airwallex-raises-100m-to-power-cross-border-business-banking-valuation-stays-flat-at-5-5b/",
  publisher: "TechCrunch",
  date: "2022-10-10",
};
const AWX_SERIES_F: PublicSource = {
  url: "https://www.businesswire.com/news/home/20250521819845/en/Airwallex-Raises-US$300-Million-at-US$6.2-Billion-Valuation-to-Build-the-Future-of-Global-Finance",
  publisher: "Business Wire",
  date: "2025-05-21",
};
const AWX_SERIES_G: PublicSource = {
  url: "https://www.airwallex.com/global/newsroom/awx-raises-usd330m-series-g-at-usd8b-valuation-establishes-sf-as-dual-global-hq",
  publisher: "Airwallex newsroom",
  date: "2025-12",
};
const AWX_SERIES_H: PublicSource = {
  url: "https://www.airwallex.com/global/newsroom/airwallex-secures-320-million-in-series-h-funding-valuation-hits-11-billion",
  publisher: "Airwallex newsroom",
  date: "2026-06-25",
};
const AWX_SERIES_H_CNBC: PublicSource = {
  url: "https://www.cnbc.com/2026/06/26/airwallex-series-h-funding-11-billion-valuation-ai-finance.html",
  publisher: "CNBC",
  date: "2026-06-26",
};

export const AIRWALLEX_CASE: PublicRecordCase = {
  slug: "airwallex",
  name: "Airwallex",
  flag: "🇦🇺",
  founded: { year: 2015, city: "Melbourne", source: AWX_WIKI },
  hq: {
    value: "Co-headquartered in San Francisco and Singapore",
    source: AWX_SERIES_G,
  },
  sector: "Fintech — cross-border payments and global business accounts",
  founders: {
    names: ["Jack Zhang", "Max Li", "Lucy Liu", "Xijing Dai", "Ki-lok Wong"],
    source: AWX_WIKI,
  },
  summary:
    "Five co-founders started Airwallex in Melbourne in 2015 after running into the cost and friction of paying overseas suppliers. " +
    "A decade of successive venture rounds — each one documented in the company's own newsroom — took it from a cross-border payments " +
    "product to a global business-account platform that now reports annualised revenue in the billions of US dollars and is " +
    "co-headquartered in Singapore and San Francisco. It is still private, which makes it the reference case for a late-stage " +
    "company that keeps raising priced rounds instead of listing.",
  stats: [
    { label: "Founded", value: "2015", hint: "Melbourne", source: AWX_WIKI },
    {
      label: "Latest valuation",
      value: "US$11B",
      hint: "Series H, June 2026",
      source: AWX_SERIES_H,
    },
    {
      label: "Total raised",
      value: ">US$1B",
      hint: "as reported at Series F, May 2025",
      source: AWX_SERIES_F,
    },
    {
      label: "Annualised revenue",
      value: "US$1.3B",
      hint: "March 2026, per company",
      source: AWX_SERIES_H,
    },
  ],
  milestones: [
    {
      date: "2015",
      phase: 1,
      headline: "Founded in Melbourne",
      detail:
        "Jack Zhang, Max Li, Lucy Liu, Xijing Dai and Ki-lok Wong start Airwallex to cut the cost of cross-border payments for businesses.",
      source: AWX_WIKI,
    },
    {
      date: "2018-07",
      phase: 10,
      headline: "Series B",
      detail: "Series B round reported at US$80M.",
      figure: "US$80M",
      source: AWX_WIKI,
    },
    {
      date: "2019-03",
      phase: 10,
      headline: "Series C — first unicorn valuation",
      detail: "Series C of US$100M takes the company past a US$1B valuation.",
      figure: "US$100M",
      valuation: "US$1B",
      source: AWX_WIKI,
    },
    {
      date: "2020-04",
      phase: 10,
      headline: "Series D — record round to date",
      detail:
        "US$160M Series D with new investors ANZi Ventures and Salesforce Ventures alongside DST Global, Tencent, Sequoia Capital China, Hillhouse and Horizons Ventures. Valuation not stated in the release.",
      figure: "US$160M",
      source: AWX_SERIES_D,
    },
    {
      date: "2021-03",
      phase: 10,
      headline: "Series D extension at US$2.6B",
      detail: "A further US$100M puts the company's valuation at US$2.6B.",
      figure: "US$100M",
      valuation: "US$2.6B",
      source: AWX_2_6B,
    },
    {
      date: "2021-09",
      phase: 10,
      headline: "Series E led by Lone Pine Capital",
      detail:
        "Oversubscribed US$200M Series E led by Lone Pine Capital with G Squared and Vetamer joining 1835i, DST Global, Salesforce Ventures and Sequoia Capital China; valuation US$4B.",
      figure: "US$200M",
      valuation: "US$4B",
      source: AWX_SERIES_E,
    },
    {
      date: "2021-11",
      phase: 10,
      headline: "Series E1 extension",
      detail: "Additional US$100M led by Lone Pine Capital lifts the valuation to US$5.5B.",
      figure: "US$100M",
      valuation: "US$5.5B",
      source: AWX_SERIES_E1,
    },
    {
      date: "2022-10",
      phase: 11,
      headline: "Flat extension through the 2022 reset",
      detail: "US$100M raised with the valuation held flat at US$5.5B — a flat round rather than a down round during the 2022 correction.",
      figure: "US$100M",
      valuation: "US$5.5B",
      source: AWX_2022,
    },
    {
      date: "2025-05",
      phase: 11,
      headline: "Series F — US$6.2B, total financing passes US$1B",
      detail:
        "US$300M Series F (including US$150M of secondary sales) led by Square Peg with DST Global, Lone Pine, Blackbird, Airtree, Salesforce Ventures, Hostplus, NGS Super and Visa Ventures; annualised revenue of US$720M reported for March 2025.",
      figure: "US$300M",
      valuation: "US$6.2B",
      source: AWX_SERIES_F,
    },
    {
      date: "2025-12",
      phase: 11,
      headline: "Series G and a second global HQ in San Francisco",
      detail:
        "US$330M Series G led by Addition with T. Rowe Price, Activant, Lingotto, Robinhood Ventures and TIAA Ventures at an US$8B valuation; annualised revenue passed US$1B in October 2025.",
      figure: "US$330M",
      valuation: "US$8B",
      source: AWX_SERIES_G,
    },
    {
      date: "2026-06",
      phase: 11,
      headline: "Series H at US$11B",
      detail:
        "US$320M Series H led by Addition; the company reports US$1.3B annualised revenue for March 2026 and remains private.",
      figure: "US$320M",
      valuation: "US$11B",
      source: AWX_SERIES_H_CNBC,
    },
  ],
  lessons: [
    {
      title: "Solve your own procurement pain first.",
      body:
        "The founding problem was the cost of paying overseas suppliers for a business the founders ran themselves. Validation came from being the customer before building for others.",
    },
    {
      title: "A flat round is a strategic choice.",
      body:
        "Holding valuation flat through the 2022 correction kept the cap table clean for the rounds that followed, instead of resetting every earlier investor's marks with a down round.",
    },
    {
      title: "Report the operating metric, not just the valuation.",
      body:
        "Every recent Airwallex release pairs the round with annualised revenue. Founders using the BlockID data room should do the same — a valuation without the revenue line behind it reads as a headline, not evidence.",
    },
    {
      title: "Staying private is a financing plan, not the absence of one.",
      body:
        "Successive priced rounds with secondary components gave early holders liquidity without a listing. The cap-table and vesting tools model that path explicitly.",
    },
  ],
  illustrativeSvi: {
    canonicalStage: "late_stage",
    phase: 11,
    rationale:
      "Multiple priced rounds after a unicorn valuation, revenue reported in the billions, still pre-listing — the public record sits squarely in the late-stage (pre-IPO) band of the canonical journey.",
  },
};

// ── Culture Amp ─────────────────────────────────────────────────────────────

const CA_WIKI: PublicSource = {
  url: "https://en.wikipedia.org/wiki/Culture_Amp",
  publisher: "Wikipedia",
  date: "2026-09",
};
const CA_SERIES_C: PublicSource = {
  url: "https://www.cultureamp.com/blog/culture-amp-raises-20-million-in-series-c-funding",
  publisher: "Culture Amp blog",
  date: "2017-06-15",
};
const CA_SERIES_B: PublicSource = {
  url: "https://www.crunchbase.com/funding_round/cultureamp-series-b--4fdfd03d",
  publisher: "Crunchbase",
  date: "2016-03",
};
const CA_SERIES_E: PublicSource = {
  url: "https://www.cultureamp.com/company/announcements/culture-amp-raises-82-million-dollars-in-global-funding",
  publisher: "Culture Amp announcements",
  date: "2019-09-04",
};
const CA_SERIES_F: PublicSource = {
  url: "https://www.cultureamp.com/company/announcements/global-employee-experience-leader-culture-amp-raises-100-million",
  publisher: "Culture Amp announcements",
  date: "2021-07-29",
};
const CA_SERIES_F_TC: PublicSource = {
  url: "https://techcrunch.com/2021/07/29/employee-engagement-platform-culture-amp-raises-100m-at-a-1-5b-valuation",
  publisher: "TechCrunch",
  date: "2021-07-29",
};

export const CULTURE_AMP_CASE: PublicRecordCase = {
  slug: "culture-amp",
  name: "Culture Amp",
  flag: "🇦🇺",
  founded: {
    year: 2011,
    city: "Melbourne",
    note: "The company's own announcements say founded 2011; Wikipedia lists 2009. Both are shown, neither is adjusted.",
    source: CA_SERIES_E,
  },
  hq: { value: "Melbourne, with offices in San Francisco, New York and London", source: CA_SERIES_E },
  sector: "HR tech — employee experience platform (engagement, performance, development)",
  founders: {
    names: ["Didier Elzinga", "Doug English", "Rod Hamilton", "Jon Williams"],
    source: CA_WIKI,
  },
  summary:
    "Culture Amp turned employee surveys into an employee-experience platform sold to people teams worldwide, and did it from Melbourne " +
    "with a deliberately culture-first company. Its funding path is the classic Australian SaaS ladder — local seed money, a US Series A, " +
    "then growth rounds led by global funds — ending in a unicorn valuation in 2021 while it stayed private. It is the reference case " +
    "for a B2B SaaS founder who wants to see what each round bought in customers and headcount, in the company's own words.",
  stats: [
    { label: "Founded", value: "2011", hint: "Melbourne (Wikipedia lists 2009)", source: CA_SERIES_E },
    {
      label: "Latest valuation",
      value: ">US$1.5B",
      hint: "Series F post-money, July 2021",
      source: CA_SERIES_F,
    },
    {
      label: "Raised to Series E",
      value: ">US$158M",
      hint: "as reported at Series E, September 2019",
      source: CA_SERIES_E,
    },
    {
      label: "Customers",
      value: "4,000+ organisations",
      hint: "25 million employees on the platform, July 2021",
      source: CA_SERIES_F,
    },
  ],
  milestones: [
    {
      date: "2011",
      phase: 1,
      headline: "Founded in Melbourne",
      detail:
        "Didier Elzinga, Doug English, Rod Hamilton and Jon Williams start Culture Amp to give people teams the analytics that finance and marketing already had. Company announcements date the founding to 2011; Wikipedia lists 2009.",
      source: CA_WIKI,
    },
    {
      date: "2015-03",
      phase: 10,
      headline: "Series A led by Felicis",
      detail: "US$6.3M Series A; first international office opens in San Francisco the same year.",
      figure: "US$6.3M",
      source: CA_WIKI,
    },
    {
      date: "2016-03",
      phase: 10,
      headline: "Series B led by Index Ventures",
      detail: "Series B led by Index Ventures. Round size is not stated in the company's later announcements, so none is shown here.",
      source: CA_SERIES_B,
    },
    {
      date: "2017-06",
      phase: 10,
      headline: "Series C led by Sapphire Ventures",
      detail:
        "US$20M Series C led by Sapphire Ventures with Index Ventures, Felicis Ventures and Blackbird Ventures, announced at HR Tech World in San Francisco. Offices in Melbourne, San Francisco, New York and London.",
      figure: "US$20M",
      source: CA_SERIES_C,
    },
    {
      date: "2019-09",
      phase: 11,
      headline: "Series E led by Sequoia Capital China",
      detail:
        "US$82M Series E led by Sequoia Capital China with Sapphire, Felicis, Index, Blackbird, Hostplus, Skip Capital, Grok Ventures, Global Founders Capital and TDM Growth Partners. Total raised passes US$158M; more than 2,500 customers and nearly 400 staff.",
      figure: "US$82M",
      source: CA_SERIES_E,
    },
    {
      date: "2021-07",
      phase: 11,
      headline: "Series F — unicorn",
      detail:
        "US$100M Series F led by TDM Growth Partners and Sequoia Capital China with Salesforce Ventures joining; post-money valuation over US$1.5B. More than 4,000 organisations and 25 million employees on the platform.",
      figure: "US$100M",
      valuation: ">US$1.5B",
      source: CA_SERIES_F_TC,
    },
    {
      date: "2024",
      phase: 11,
      headline: "Acquisitions widen the platform",
      detail: "Zugata (2019), Disco (2021) and Orgnostic (2024) are folded into the platform; an AI coaching product follows in 2025.",
      source: CA_WIKI,
    },
  ],
  lessons: [
    {
      title: "Sell the analytics gap, not the survey.",
      body:
        "The pitch was that people teams lacked the data every other function had. That framing turned a survey tool into a platform category and set up every later round.",
    },
    {
      title: "Announce what the money bought.",
      body:
        "Each Culture Amp release states customers and headcount alongside the round. Put the same operating lines in your BlockID data room so investors see progress, not just capital.",
    },
    {
      title: "A US Series A can come before a US office.",
      body:
        "The Series A was led from the US in the year the first US office opened. Founders scoring their own readiness should not treat physical presence as a prerequisite for overseas capital.",
    },
    {
      title: "Culture is an operating system, not a perk.",
      body:
        "Building a culture-first company was an explicit founder goal from the Series C onward, and it is the product the company sells. Consistency between the two is what investors were buying.",
    },
  ],
  illustrativeSvi: {
    canonicalStage: "series_b_c",
    phase: 11,
    rationale:
      "A unicorn-priced growth round, global offices and platform acquisitions, with no public filing or listing since — the public record sits in the Series B/C scale band with late-stage characteristics.",
  },
};

export const PUBLIC_RECORD_CASES: readonly PublicRecordCase[] = [AIRWALLEX_CASE, CULTURE_AMP_CASE];

export function publicRecordCase(slug: PublicRecordCase["slug"]): PublicRecordCase {
  const c = PUBLIC_RECORD_CASES.find((x) => x.slug === slug);
  if (!c) throw new Error(`unknown public-record case ${slug}`);
  return c;
}

/**
 * Every monetary figure in a string — "US$300M", "A$1.2B", ">US$1B", "US$6.3M".
 * Shared with the render test so the "no invented numbers" guard and the
 * data guard agree on what a figure is.
 */
export const MONEY_FIGURE_RE = /(?:>|~)?(?:US|A|NZ)?\$\s?\d[\d,]*(?:\.\d+)?\s?(?:[MBK]|million|billion)?/g;

export function moneyFigures(text: string): string[] {
  return (text.match(MONEY_FIGURE_RE) ?? []).map((s) => s.replace(/\s+/g, ""));
}

/** Distinct sources across a case, in first-use order (for the footer list). */
export function caseSources(c: PublicRecordCase): PublicSource[] {
  const seen = new Map<string, PublicSource>();
  const push = (s: PublicSource) => {
    if (!seen.has(s.url)) seen.set(s.url, s);
  };
  push(c.founded.source);
  push(c.hq.source);
  push(c.founders.source);
  for (const s of c.stats) push(s.source);
  for (const m of c.milestones) push(m.source);
  return Array.from(seen.values());
}
