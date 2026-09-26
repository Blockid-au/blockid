// Market research for valuation — the stored contract (client-safe, no I/O).
//
// `appendix.marketResearch` on ReportV2 and `gatherResults.marketResearch`
// carry this shape. Everything in it is PUBLIC web material read by the
// bounded R01 fetcher: a source is a page we fetched ourselves, a fact is a
// verbatim quote from that page whose numbers were re-checked in code. It is
// tier "public_unverified" (T3) — never "verified", never a valuation of the
// company being analysed. Search-provider candidates (Brave / Claude CLI
// result lists, snippets, ranks) are request-local and never stored here.

import { z } from "zod";

export const MARKET_RESEARCH_VERSION = "market-research-v1" as const;
export const MARKET_RESEARCH_MAX_SOURCES = 5;
export const MARKET_RESEARCH_MAX_QUERIES = 5;

export type MarketResearchRetrieval = "brave" | "claude_cli_websearch";
export type MarketResearchStatus = "found" | "no_facts" | "unavailable" | "skipped";
export type MarketPublisherClass = "official_company" | "government_or_regulator" | "statistics" | "business_press" | "other";

export interface MarketResearchSource {
  /** "S1" … "S5" — the id facts point at. */
  id: string;
  url: string;
  title: string;
  fetchedAt: string;
  retrieval: MarketResearchRetrieval;
  publisherClass: MarketPublisherClass;
  evidenceTier: "public_unverified";
}

export interface MarketSizeFact {
  value: number;
  unit: string | null;
  currency: string | null;
  year: number | null;
  geography: string | null;
  quote: string;
  url: string;
  sourceId: string;
}

export interface CompetitorFact {
  name: string;
  website: string | null;
  stage: string | null;
  funding: string | null;
  valuation: string | null;
  quote: string;
  url: string;
  sourceId: string;
}

export type ComparableMetric = "valuation" | "revenue_multiple" | "round";

export interface ComparableFact {
  company: string;
  metric: ComparableMetric;
  value: number;
  /** Scale word the figure was quoted with ("million", "billion", "x" …) — null when bare. */
  unit: string | null;
  currency: string | null;
  date: string | null;
  quote: string;
  url: string;
  sourceId: string;
}

export interface MarketResearchResult {
  version: typeof MARKET_RESEARCH_VERSION;
  status: MarketResearchStatus;
  /** Machine reasons (provider outcomes, drops) — no provider bodies, keys or snippets. */
  reasons: string[];
  /** Search provider that produced the sources ("none" when no search ran). */
  retrieval: MarketResearchRetrieval | "none";
  /** True when this result was served from the 7-day cache (no calls made). */
  cached: boolean;
  researchedAt: string;
  /** Public identifiers only — the scope the queries were planned from. */
  scope: { company: string | null; websiteHost: string | null; sector: string | null; country: string; stage: string | null };
  /** The public queries planned (≤ 5). Never contains private deck text. */
  queries: string[];
  sources: MarketResearchSource[];
  facts: { marketSize: MarketSizeFact[]; competitors: CompetitorFact[]; comparables: ComparableFact[] };
  limits: {
    searchCalls: number; fetches: number; extractionCalls: number;
    maxSearchCalls: 5; maxFetches: 5; maxExtractionCalls: 1;
    wallMs: number;
  };
  /** Estimated AI spend of the extraction call (USD); 0 on a cache hit. */
  costUsd: number;
  evidenceTier: "public_unverified";
  instruction: string;
}

export const MARKET_RESEARCH_INSTRUCTION =
  "Public market references: quotes from public web pages read by BlockID, not verified by BlockID or the company. " +
  "They describe other companies and the market; they are reference ranges only, never a valuation of this company, " +
  "and never override the company's own verified figures.";

export function emptyMarketResearch(args: { status: MarketResearchStatus; reasons: string[]; researchedAt: string; scope: MarketResearchResult["scope"]; queries?: string[]; wallMs?: number }): MarketResearchResult {
  return {
    version: MARKET_RESEARCH_VERSION,
    status: args.status,
    reasons: [...new Set(args.reasons)],
    retrieval: "none",
    cached: false,
    researchedAt: args.researchedAt,
    scope: args.scope,
    queries: args.queries ?? [],
    sources: [],
    facts: { marketSize: [], competitors: [], comparables: [] },
    limits: { searchCalls: 0, fetches: 0, extractionCalls: 0, maxSearchCalls: 5, maxFetches: 5, maxExtractionCalls: 1, wallMs: args.wallMs ?? 0 },
    costUsd: 0,
    evidenceTier: "public_unverified",
    instruction: MARKET_RESEARCH_INSTRUCTION,
  };
}

/** Number of distinct sources that back at least one fact. */
export function marketReferenceSourceCount(r: MarketResearchResult | null | undefined): number {
  if (!r || r.status !== "found") return 0;
  const used = new Set<string>();
  for (const f of [...r.facts.marketSize, ...r.facts.competitors, ...r.facts.comparables]) used.add(f.sourceId);
  return r.sources.filter((s) => used.has(s.id)).length;
}

const str = (max: number) => z.string().max(max);
const quote = z.string().min(1).max(600);
const httpsUrl = z.string().max(2048).regex(/^https:\/\//);
const sourceId = z.string().regex(/^S[1-5]$/);

export const marketResearchSchema = z.object({
  version: z.literal(MARKET_RESEARCH_VERSION),
  status: z.enum(["found", "no_facts", "unavailable", "skipped"]),
  reasons: z.array(str(80)).max(24),
  retrieval: z.enum(["brave", "claude_cli_websearch", "none"]),
  cached: z.boolean(),
  researchedAt: z.string(),
  scope: z.object({ company: str(80).nullable(), websiteHost: str(253).nullable(), sector: str(60).nullable(), country: str(40), stage: str(40).nullable() }),
  queries: z.array(str(180)).max(MARKET_RESEARCH_MAX_QUERIES),
  sources: z.array(z.object({
    id: sourceId, url: httpsUrl, title: str(200), fetchedAt: z.string(),
    retrieval: z.enum(["brave", "claude_cli_websearch"]),
    publisherClass: z.enum(["official_company", "government_or_regulator", "statistics", "business_press", "other"]),
    evidenceTier: z.literal("public_unverified"),
  })).max(MARKET_RESEARCH_MAX_SOURCES),
  facts: z.object({
    marketSize: z.array(z.object({ value: z.number().finite(), unit: str(20).nullable(), currency: str(8).nullable(), year: z.number().int().nullable(), geography: str(80).nullable(), quote, url: httpsUrl, sourceId })).max(5),
    competitors: z.array(z.object({ name: str(80), website: str(253).nullable(), stage: str(40).nullable(), funding: str(80).nullable(), valuation: str(80).nullable(), quote, url: httpsUrl, sourceId })).max(8),
    comparables: z.array(z.object({ company: str(80), metric: z.enum(["valuation", "revenue_multiple", "round"]), value: z.number().finite(), unit: str(20).nullable(), currency: str(8).nullable(), date: str(20).nullable(), quote, url: httpsUrl, sourceId })).max(8),
  }),
  limits: z.object({
    searchCalls: z.number().int().min(0).max(5), fetches: z.number().int().min(0).max(5), extractionCalls: z.number().int().min(0).max(1),
    maxSearchCalls: z.literal(5), maxFetches: z.literal(5), maxExtractionCalls: z.literal(1), wallMs: z.number().int().nonnegative(),
  }),
  costUsd: z.number().min(0).max(0.05),
  evidenceTier: z.literal("public_unverified"),
  instruction: z.string().max(600),
});
