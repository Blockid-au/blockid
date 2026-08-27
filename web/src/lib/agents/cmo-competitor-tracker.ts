// src/lib/agents/cmo-competitor-tracker.ts
//
// CMO domain helper — Competitor Feature Release Tracker (T0175).
//
// Pure-logic library that catalogs recent public feature releases from
// competitors in the AU startup tooling / valuation / cap-table space and
// exposes helpers to filter, rank, and summarise them. No network calls, no
// AI: the seed dataset is curated from vendor changelogs and public blog
// posts and can be augmented programmatically by callers (e.g. from a nightly
// research cron) via `mergeReleases`.
//
// Consumers:
//   - CMO daily report — surfaces the top N most recent + high-threat items.
//   - Report pipeline "market intel" section — cited comparables.
//   - /admin/competitors dashboard (future) — filterable table.
//
// The module is deliberately dependency-free so it can be imported from any
// server, edge, or worker context.

export type ThreatTier = "watch" | "moderate" | "high" | "critical";

export type ReleaseCategory =
  | "valuation"
  | "cap-table"
  | "esop"
  | "data-room"
  | "fundraising"
  | "investor-network"
  | "compliance"
  | "ai-insights"
  | "reporting"
  | "integrations";

export interface CompetitorRelease {
  /** Human-friendly product/company name. */
  competitor: string;
  /** Optional company homepage — helpful for citation. */
  url?: string;
  /** ISO date the feature shipped (YYYY-MM-DD). */
  shippedOn: string;
  /** One-line title of the release. */
  title: string;
  /** One or two sentence description of what shipped. */
  summary: string;
  category: ReleaseCategory;
  threat: ThreatTier;
  /** Optional tags such as sector or region for filtering. */
  tags?: string[];
  /** Optional citation source (blog URL, changelog anchor). */
  source?: string;
}

const THREAT_SCORE: Record<ThreatTier, number> = {
  watch: 1,
  moderate: 2,
  high: 3,
  critical: 4,
};

/**
 * Seed dataset — curated from public changelogs and product announcements
 * from vendors that overlap BlockID.au's positioning (AU cap-table, valuation,
 * fundraising, ESOP). Kept short and dated so stale entries roll off naturally
 * when the report pipeline calls `topRecentReleases`.
 */
export const SEED_COMPETITOR_RELEASES: CompetitorRelease[] = [
  {
    competitor: "Cake Equity",
    url: "https://cakeequity.com",
    shippedOn: "2026-07-18",
    title: "AU ESIC eligibility wizard inside cap-table",
    summary:
      "Guided ESIC self-assessment tied to shareholder register — issues an eligibility PDF founders can attach to investor updates.",
    category: "esop",
    threat: "high",
    tags: ["au", "esic"],
  },
  {
    competitor: "Cake Equity",
    url: "https://cakeequity.com",
    shippedOn: "2026-06-02",
    title: "Real-time cap-table sync to ASIC Form 484",
    summary:
      "Auto-generates ASIC 484 change-of-share notices when shares are issued or transferred inside Cake.",
    category: "cap-table",
    threat: "moderate",
    tags: ["au", "asic"],
  },
  {
    competitor: "Carta",
    url: "https://carta.com",
    shippedOn: "2026-07-30",
    title: "Fair-market-value AI benchmarks per stage",
    summary:
      "Adds sector-adjusted FMV bands sourced from Carta's private-market dataset with quarterly refresh.",
    category: "valuation",
    threat: "high",
    tags: ["us-first", "benchmarks"],
  },
  {
    competitor: "Pulley",
    url: "https://pulley.com",
    shippedOn: "2026-06-25",
    title: "SAFE-to-priced-round modeller",
    summary:
      "Founders can simulate uncapped/valuation-cap SAFEs converting into a priced round with pro-rata options built in.",
    category: "fundraising",
    threat: "moderate",
    tags: ["safe", "modelling"],
  },
  {
    competitor: "Ledgy",
    url: "https://ledgy.com",
    shippedOn: "2026-05-12",
    title: "ESOP grant approval workflow with e-signature",
    summary:
      "Board approval + digital signature workflow for option grants, with per-jurisdiction vesting templates.",
    category: "esop",
    threat: "moderate",
    tags: ["eu-first", "signatures"],
  },
  {
    competitor: "AngelList (Stack)",
    url: "https://angellist.com",
    shippedOn: "2026-07-04",
    title: "Rolling-fund style investor updates auto-drafted from Stripe MRR",
    summary:
      "Pipes Stripe metrics into a monthly investor-update template — reduces founder update burden to a single review click.",
    category: "reporting",
    threat: "moderate",
    tags: ["us-first", "stripe"],
  },
  {
    competitor: "Sydecar",
    url: "https://sydecar.io",
    shippedOn: "2026-06-14",
    title: "Australia-friendly SPV closing checklist",
    summary:
      "Adds AU-signer support and Section 708 documentation aids inside its SPV formation flow.",
    category: "compliance",
    threat: "watch",
    tags: ["au", "spv", "s708"],
  },
  {
    competitor: "Kruze Consulting",
    url: "https://kruzeconsulting.com",
    shippedOn: "2026-05-28",
    title: "Startup R&D Tax Credit AI calculator (US)",
    summary:
      "US-only, but signals the direction: an interactive AI tool that estimates refundable R&D credit before filing.",
    category: "ai-insights",
    threat: "watch",
    tags: ["us-only", "rd-tax"],
  },
  {
    competitor: "Foresight (AI)",
    url: "https://foresight.co",
    shippedOn: "2026-07-22",
    title: "Board-deck generator wired to accounting data",
    summary:
      "Generates 12-slide board deck from Xero/QuickBooks with commentary. Overlaps CFO reporting features.",
    category: "reporting",
    threat: "high",
    tags: ["us-first", "xero"],
  },
  {
    competitor: "Vestd",
    url: "https://vestd.com",
    shippedOn: "2026-06-08",
    title: "Growth-shares template library for early hires",
    summary:
      "UK-focused, but exposes a downloadable library of growth-share templates that undercuts our ESOP checklist tool.",
    category: "esop",
    threat: "watch",
    tags: ["uk-first", "growth-shares"],
  },
  {
    competitor: "Capdesk (by Orrick)",
    url: "https://capdesk.com",
    shippedOn: "2026-04-30",
    title: "Data-room templates included in cap-table subscription",
    summary:
      "Bundles a 12-section investor data-room with cap-table plans, undercutting standalone data-room upsells.",
    category: "data-room",
    threat: "moderate",
    tags: ["uk-first", "bundled"],
  },
];

/**
 * Utility — returns the numeric threat weight for a tier (1..4).
 */
export function threatScore(tier: ThreatTier): number {
  return THREAT_SCORE[tier];
}

export interface FilterOptions {
  category?: ReleaseCategory;
  minThreat?: ThreatTier;
  /** Only return releases shipped on/after this ISO date. */
  sinceDate?: string;
  /** Case-insensitive substring match against tags. */
  tag?: string;
}

/**
 * Returns releases sorted newest-first, filtered by the supplied options.
 * A missing/invalid filter falls back to "no filter" for that dimension so
 * partial input never accidentally hides data.
 */
export function filterReleases(
  releases: CompetitorRelease[],
  opts: FilterOptions = {},
): CompetitorRelease[] {
  const minScore = opts.minThreat ? THREAT_SCORE[opts.minThreat] : 0;
  const sinceMs = opts.sinceDate ? Date.parse(opts.sinceDate) : NaN;
  const tagLower = opts.tag?.toLowerCase();
  return releases
    .filter((r) => (opts.category ? r.category === opts.category : true))
    .filter((r) => THREAT_SCORE[r.threat] >= minScore)
    .filter((r) => (Number.isFinite(sinceMs) ? Date.parse(r.shippedOn) >= sinceMs : true))
    .filter((r) => (tagLower ? (r.tags ?? []).some((t) => t.toLowerCase().includes(tagLower)) : true))
    .slice()
    .sort((a, b) => Date.parse(b.shippedOn) - Date.parse(a.shippedOn));
}

/**
 * Returns the top N most recent releases from `releases` (defaults to the
 * seed dataset). Ties broken by higher threat first, then by title.
 */
export function topRecentReleases(
  n = 5,
  releases: CompetitorRelease[] = SEED_COMPETITOR_RELEASES,
): CompetitorRelease[] {
  return releases
    .slice()
    .sort((a, b) => {
      const dateDelta = Date.parse(b.shippedOn) - Date.parse(a.shippedOn);
      if (dateDelta !== 0) return dateDelta;
      const threatDelta = THREAT_SCORE[b.threat] - THREAT_SCORE[a.threat];
      if (threatDelta !== 0) return threatDelta;
      return a.title.localeCompare(b.title);
    })
    .slice(0, Math.max(0, n));
}

export interface CompetitorSummary {
  competitor: string;
  releaseCount: number;
  weightedThreat: number;
  latestShippedOn: string;
  categories: ReleaseCategory[];
}

/**
 * Aggregates releases by competitor so a CMO report can rank rival velocity
 * at a glance. Weighted threat sums the tier scores, so a competitor shipping
 * three "high" items outranks one shipping a single "critical".
 */
export function summariseByCompetitor(
  releases: CompetitorRelease[] = SEED_COMPETITOR_RELEASES,
): CompetitorSummary[] {
  const map = new Map<string, CompetitorSummary>();
  for (const r of releases) {
    const existing = map.get(r.competitor);
    if (!existing) {
      map.set(r.competitor, {
        competitor: r.competitor,
        releaseCount: 1,
        weightedThreat: THREAT_SCORE[r.threat],
        latestShippedOn: r.shippedOn,
        categories: [r.category],
      });
      continue;
    }
    existing.releaseCount += 1;
    existing.weightedThreat += THREAT_SCORE[r.threat];
    if (Date.parse(r.shippedOn) > Date.parse(existing.latestShippedOn)) {
      existing.latestShippedOn = r.shippedOn;
    }
    if (!existing.categories.includes(r.category)) existing.categories.push(r.category);
  }
  return [...map.values()].sort((a, b) => {
    if (b.weightedThreat !== a.weightedThreat) return b.weightedThreat - a.weightedThreat;
    return Date.parse(b.latestShippedOn) - Date.parse(a.latestShippedOn);
  });
}

/**
 * Merges new releases into an existing list, de-duplicating by
 * (competitor + shippedOn + title). Later entries overwrite earlier ones so
 * the caller can re-run an ingestion job idempotently.
 */
export function mergeReleases(
  base: CompetitorRelease[],
  incoming: CompetitorRelease[],
): CompetitorRelease[] {
  const key = (r: CompetitorRelease) => `${r.competitor}|${r.shippedOn}|${r.title}`;
  const merged = new Map<string, CompetitorRelease>();
  for (const r of base) merged.set(key(r), r);
  for (const r of incoming) merged.set(key(r), r);
  return [...merged.values()];
}

/**
 * Renders a short markdown block suitable for embedding in the CMO daily
 * report. Deterministic ordering (newest-first, threat tie-break) so
 * snapshot tests stay stable.
 */
export function renderMarkdownDigest(
  releases: CompetitorRelease[] = SEED_COMPETITOR_RELEASES,
  limit = 5,
): string {
  const items = topRecentReleases(limit, releases);
  if (items.length === 0) return "_No recent competitor releases tracked._";
  const lines = items.map(
    (r) =>
      `- **${r.shippedOn} — ${r.competitor}** (${r.threat}): ${r.title}. ${r.summary}`,
  );
  return `### Competitor releases (last ${items.length})\n${lines.join("\n")}`;
}
