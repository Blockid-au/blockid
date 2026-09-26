// Test / demo fixture: a verified market research result (public, unverified tier).
import { MARKET_RESEARCH_INSTRUCTION, type MarketResearchResult } from "./market-research-contract";

export function sampleMarketResearch(over: Partial<MarketResearchResult> = {}): MarketResearchResult {
  const A = "https://www.startupdaily.net/acme-pay-series-a";
  const B = "https://www.abc.net.au/news/payments";
  return {
    version: "market-research-v1",
    status: "found",
    reasons: ["brave_quota_exhausted", "claude_cli_ok"],
    retrieval: "claude_cli_websearch",
    cached: false,
    researchedAt: "2026-09-26T02:00:00.000Z",
    scope: { company: "Acme Pay", websiteHost: "acmepay.com.au", sector: "Fintech", country: "Australia", stage: "seed" },
    queries: ['"Acme Pay" competitors', "Fintech market size Australia 2026"],
    sources: [
      { id: "S1", url: A, title: "Acme Pay raises A$12 million Series A", fetchedAt: "2026-09-26T02:00:10.000Z", retrieval: "claude_cli_websearch", publisherClass: "business_press", evidenceTier: "public_unverified" },
      { id: "S2", url: B, title: "Payments market", fetchedAt: "2026-09-26T02:00:10.000Z", retrieval: "claude_cli_websearch", publisherClass: "business_press", evidenceTier: "public_unverified" },
    ],
    facts: {
      marketSize: [{ value: 4.2, unit: "billion", currency: "AUD", year: 2025, geography: "Australian", quote: "The Australian payments software market was worth A$4.2 billion in 2025, according to the report.", url: A, sourceId: "S1" }],
      competitors: [{ name: "BetaPay", website: null, stage: null, funding: "A$30 million", valuation: null, quote: "Rival BetaPay raised A$30 million last year and trades at 8x revenue, analysts said.", url: A, sourceId: "S1" }],
      comparables: [
        { company: "BetaPay", metric: "revenue_multiple", value: 8, unit: "x", currency: null, date: "2025", quote: "Rival BetaPay raised A$30 million last year and trades at 8x revenue, analysts said.", url: A, sourceId: "S1" },
        { company: "Gamma Ledger", metric: "valuation", value: 1.5, unit: "billion", currency: "USD", date: "2024", quote: "Competitor Gamma Ledger was valued at US$1.5 billion in 2024 after its Series C round.", url: B, sourceId: "S2" },
      ],
    },
    limits: { searchCalls: 2, fetches: 2, extractionCalls: 1, maxSearchCalls: 5, maxFetches: 5, maxExtractionCalls: 1, wallMs: 31_000 },
    costUsd: 0.0012,
    evidenceTier: "public_unverified",
    instruction: MARKET_RESEARCH_INSTRUCTION,
    ...over,
  };
}
