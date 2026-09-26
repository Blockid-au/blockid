import { describe, expect, it, vi } from "vitest";
import { researchMarketForValuation, marketResearchCacheKey, type MarketResearchCache, type MarketSearchProvider, type SearchOutcome } from "./market-research";
import { planMarketQueries, publicScopeFor, rankSources, verifyExtraction, valueInQuote, currencyInQuote } from "./market-research-core";
import { marketResearchSchema, marketReferenceSourceCount, type MarketResearchResult } from "./market-research-contract";

const NOW = Date.parse("2026-09-26T02:00:00Z");
const PRIVATE_DECK = "CONFIDENTIAL deck: our secret churn is 3% and we are talking to Blackbird about a A$9M round";

const PAGE_A = `<html><head><title>Acme Pay raises A$12 million Series A</title></head><body>
<p>Sydney fintech Acme Pay has raised A$12 million in a Series A round led by Square Peg, valuing the company at A$60 million.</p>
<p>The Australian payments software market was worth A$4.2 billion in 2025, according to the report.</p>
<p>Rival BetaPay raised A$30 million last year and trades at 8x revenue, analysts said.</p>
<p>${"Filler sentence about nothing in particular. ".repeat(10)}</p></body></html>`;
const PAGE_B = `<html><head><title>Payments market</title></head><body><p>Competitor Gamma Ledger was valued at US$1.5 billion in 2024 after its Series C round.</p><p>${"More filler text for the page body here. ".repeat(10)}</p></body></html>`;

function scopeInput(extra: Record<string, unknown> = {}) {
  return { company: "Acme Pay", website: "https://acmepay.com.au/about", sector: "Fintech", country: "Australia", stage: "seed", ...extra };
}

function provider(id: MarketSearchProvider["id"], outcome: SearchOutcome | (() => Promise<SearchOutcome>)): MarketSearchProvider & { search: ReturnType<typeof vi.fn> } {
  return { id, search: vi.fn(async () => (typeof outcome === "function" ? outcome() : outcome)) } as never;
}

function memoryCache(): MarketResearchCache & { store: Map<string, { v: MarketResearchResult; exp: number }> } {
  const store = new Map<string, { v: MarketResearchResult; exp: number }>();
  return {
    store,
    async get(key, now) { const r = store.get(key); return r && r.exp > now ? r.v : null; },
    async set(key, v, now, ttl) { store.set(key, { v, exp: now + ttl }); },
  };
}

const goodExtraction = JSON.stringify({
  marketSize: [
    { value: 4.2, unit: "billion", currency: "AUD", year: 2025, geography: "Australian", quote: "The Australian payments software market was worth A$4.2 billion in 2025, according to the report.", url: "https://startupdaily.net/acme-pay-series-a" },
    // Number not in the quote → dropped.
    { value: 7.9, unit: "billion", currency: "AUD", year: 2025, geography: null, quote: "The Australian payments software market was worth A$4.2 billion in 2025, according to the report.", url: "https://startupdaily.net/acme-pay-series-a" },
  ],
  competitors: [
    { name: "BetaPay", website: null, stage: null, funding: "A$30 million", valuation: null, quote: "Rival BetaPay raised A$30 million last year and trades at 8x revenue, analysts said.", url: "https://startupdaily.net/acme-pay-series-a" },
    // Quote not in the page → dropped.
    { name: "DeltaPay", website: null, stage: null, funding: "A$5 million", valuation: null, quote: "DeltaPay raised A$5 million from angels in a seed round.", url: "https://startupdaily.net/acme-pay-series-a" },
  ],
  comparables: [
    { company: "BetaPay", metric: "revenue_multiple", value: 8, unit: "x", currency: null, date: "2025", quote: "Rival BetaPay raised A$30 million last year and trades at 8x revenue, analysts said.", url: "https://startupdaily.net/acme-pay-series-a" },
    { company: "Gamma Ledger", metric: "valuation", value: 1.5, unit: "billion", currency: "USD", date: "2024", quote: "Competitor Gamma Ledger was valued at US$1.5 billion in 2024 after its Series C round.", url: "https://www.abc.net.au/news/payments" },
    // Invented multiple (12x is not written) → dropped.
    { company: "BetaPay", metric: "revenue_multiple", value: 12, unit: "x", currency: null, date: null, quote: "Rival BetaPay raised A$30 million last year and trades at 8x revenue, analysts said.", url: "https://startupdaily.net/acme-pay-series-a" },
  ],
});

function deps(over: Partial<Parameters<typeof researchMarketForValuation>[1]> = {}) {
  const pages: Record<string, string> = { "https://startupdaily.net/acme-pay-series-a": PAGE_A, "https://www.abc.net.au/news/payments": PAGE_B };
  return {
    now: () => NOW,
    cache: memoryCache(),
    brave: provider("brave", { status: "quota_exhausted", hits: [], calls: 1, reasons: ["monthly_quota_0"] }),
    claudeCli: provider("claude_cli_websearch", { status: "ok", calls: 1, reasons: [], hits: [
      { url: "https://startupdaily.net/acme-pay-series-a", title: "Acme Pay raises" },
      { url: "https://www.abc.net.au/news/payments", title: "Payments market" },
      { url: "https://www.afr.com/paywalled-story", title: "Paywalled" },
      { url: "https://www.openpr.com/news/spam", title: "SEO spam" },
    ] }),
    fetchPage: vi.fn(async (url: string) => (pages[url] ? { ok: true, body: pages[url], contentType: "text/html" } : { ok: false, body: "" })),
    extract: vi.fn(async () => goodExtraction),
    ...over,
  };
}

describe("public scope + query plan", () => {
  it("never includes private deck text; the name is searched only with a public website", () => {
    const scope = publicScopeFor({ company: "Acme Pay", website: null, sector: PRIVATE_DECK, country: "Australia" });
    expect(scope.company).toBeNull();
    expect(scope.sector).toBeNull();
    expect(planMarketQueries(scope, 2026)).toEqual([]);
    const withSite = publicScopeFor(scopeInput());
    const queries = planMarketQueries(withSite, 2026);
    expect(queries.length).toBeLessThanOrEqual(5);
    expect(queries.map((q) => q.query)).toEqual([
      '"Acme Pay" competitors',
      "Fintech market size Australia 2026",
      '"Acme Pay" funding round valuation',
      "Fintech startup valuation revenue multiple 2026",
      "Fintech startups Australia funding round 2026",
    ]);
  });

  it("the providers only ever see the planned public queries (extra input fields are ignored)", async () => {
    const d = deps();
    await researchMarketForValuation({ ...scopeInput(), description: PRIVATE_DECK, rawText: PRIVATE_DECK } as never, d);
    const seen = JSON.stringify([d.brave.search.mock.calls, d.claudeCli.search.mock.calls]);
    expect(seen).not.toMatch(/CONFIDENTIAL|churn|Blackbird|9M/);
    expect(JSON.stringify((d.extract as ReturnType<typeof vi.fn>).mock.calls)).not.toMatch(/CONFIDENTIAL|churn/);
  });

  it("skips (no calls) when there is nothing public to search for", async () => {
    const d = deps();
    const r = await researchMarketForValuation({ company: "Stealth Co", website: null, sector: null }, d);
    expect(r.status).toBe("skipped");
    expect(d.brave.search).not.toHaveBeenCalled();
    expect(d.claudeCli.search).not.toHaveBeenCalled();
  });
});

describe("provider chain", () => {
  it("Brave quota_exhausted → Claude CLI fallback → verified facts (retrieval claude_cli_websearch)", async () => {
    const d = deps();
    const r = await researchMarketForValuation(scopeInput(), d);
    expect(d.brave.search).toHaveBeenCalledTimes(1);
    expect(d.claudeCli.search).toHaveBeenCalledTimes(1);
    expect(r.status).toBe("found");
    expect(r.retrieval).toBe("claude_cli_websearch");
    expect(r.reasons).toContain("brave_quota_exhausted");
    expect(r.sources.every((s) => s.retrieval === "claude_cli_websearch" && s.evidenceTier === "public_unverified")).toBe(true);
    // Paywall + SEO spam never fetched.
    const fetched = (d.fetchPage as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
    expect(fetched).not.toContain("https://www.afr.com/paywalled-story");
    expect(fetched).not.toContain("https://www.openpr.com/news/spam");
    expect(marketResearchSchema.safeParse(r).success).toBe(true);
    expect(marketReferenceSourceCount(r)).toBe(2);
  });

  it("Brave OK with results → no Claude CLI call", async () => {
    const d = deps({ brave: provider("brave", { status: "ok", calls: 5, reasons: [], hits: [{ url: "https://startupdaily.net/acme-pay-series-a" }] }) });
    const r = await researchMarketForValuation(scopeInput(), d);
    expect(r.retrieval).toBe("brave");
    expect(d.claudeCli.search).not.toHaveBeenCalled();
    expect(r.limits.searchCalls).toBe(5);
  });

  it("Brave quota_exhausted + Claude CLI timeout → unavailable, nothing fetched, the report proceeds", async () => {
    const d = deps({ claudeCli: provider("claude_cli_websearch", { status: "timeout", hits: [], calls: 1, reasons: ["cli_timeout"] }) });
    const r = await researchMarketForValuation(scopeInput(), d);
    expect(r.status).toBe("unavailable");
    expect(r.reasons).toEqual(expect.arrayContaining(["brave_quota_exhausted", "claude_cli_timeout"]));
    expect(d.fetchPage).not.toHaveBeenCalled();
    expect(d.extract).not.toHaveBeenCalled();
  });

  it("a provider that throws never throws into the pipeline", async () => {
    const d = deps({ brave: provider("brave", async () => { throw new Error("boom"); }), claudeCli: null });
    const r = await researchMarketForValuation(scopeInput(), d);
    expect(r.status).toBe("unavailable");
    expect(r.reasons).toContain("brave_unavailable");
  });
});

describe("extraction verification", () => {
  it("drops numbers not written in the quote and quotes not in the fetched page", async () => {
    const r = await researchMarketForValuation(scopeInput(), deps());
    expect(r.facts.marketSize).toHaveLength(1);
    expect(r.facts.marketSize[0]).toMatchObject({ value: 4.2, unit: "billion", currency: "AUD", year: 2025 });
    expect(r.facts.competitors.map((c) => c.name)).toEqual(["BetaPay"]);
    expect(r.facts.comparables.map((c) => [c.company, c.metric, c.value])).toEqual([["BetaPay", "revenue_multiple", 8], ["Gamma Ledger", "valuation", 1.5]]);
    expect(r.facts.comparables[1].currency).toBe("USD");
    expect(r.reasons.some((x) => x.startsWith("dropped_unverified_"))).toBe(true);
  });

  it("verifyExtraction: a bare year is not a market size; a currency needs its marker", () => {
    const text = "The market reached 2025 levels. The sector was worth $3 billion in 2024 according to the ABS.";
    const out = verifyExtraction({ marketSize: [
      { value: 2025, unit: null, quote: "The market reached 2025 levels.", url: "https://abs.gov.au/x" },
      { value: 3, unit: "billion", currency: "AUD", year: 2023, quote: "The sector was worth $3 billion in 2024 according to the ABS.", url: "https://abs.gov.au/x" },
    ] }, [{ id: "S1", url: "https://abs.gov.au/x", text }]);
    expect(out.facts.marketSize).toHaveLength(1);
    // Bare "$" is not an AUD marker; 2023 is not in the quote.
    expect(out.facts.marketSize[0]).toMatchObject({ value: 3, currency: null, year: null });
    expect(valueInQuote(3_000_000_000, null, "worth $3 billion")).toBe(true);
    expect(valueInQuote(3.5, "billion", "worth $3 billion")).toBe(false);
    expect(currencyInQuote("AUD", "raised A$12 million")).toBe("AUD");
  });

  it("an unparseable extraction yields no facts (and is cached briefly, not for 7 days)", async () => {
    const d = deps({ extract: vi.fn(async () => "sorry, no JSON here") });
    const r = await researchMarketForValuation(scopeInput(), d);
    expect(r.status).toBe("no_facts");
    expect(r.sources).toEqual([]);
    const entry = [...d.cache.store.values()][0];
    expect(entry.exp - NOW).toBeLessThanOrEqual(6 * 60 * 60 * 1000);
  });
});

describe("cache + caps", () => {
  it("a cache hit makes no search, fetch or AI call", async () => {
    const d = deps();
    const first = await researchMarketForValuation(scopeInput(), d);
    expect(first.cached).toBe(false);
    const again = deps({ cache: d.cache });
    const second = await researchMarketForValuation(scopeInput({ company: "  acme pay " }), again);
    expect(second.cached).toBe(true);
    expect(second.costUsd).toBe(0);
    expect(again.brave.search).not.toHaveBeenCalled();
    expect(again.claudeCli.search).not.toHaveBeenCalled();
    expect(again.fetchPage).not.toHaveBeenCalled();
    expect(again.extract).not.toHaveBeenCalled();
    const entry = d.cache.store.get(marketResearchCacheKey(publicScopeFor(scopeInput()), NOW))!;
    expect(entry.exp - NOW).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("cache-only mode (free tier / partial re-run) makes no calls on a miss", async () => {
    const d = deps();
    const r = await researchMarketForValuation(scopeInput(), { ...d, allowNetwork: false });
    expect(r.status).toBe("skipped");
    expect(r.reasons).toContain("cache_only_miss");
    expect(d.brave.search).not.toHaveBeenCalled();
    expect(d.extract).not.toHaveBeenCalled();
  });

  it("≤ 5 fetches, ≤ 1 extraction call, ≤ 5 search calls, cost ≤ US$0.01", async () => {
    const hits = Array.from({ length: 12 }, (_, i) => ({ url: `https://site${i}.com.au/story`, title: `t${i}` }));
    const page = `<title>x</title><p>${"The Australian fintech market was worth A$4.2 billion in 2025 said the report. ".repeat(40)}</p>`;
    const d = deps({ claudeCli: provider("claude_cli_websearch", { status: "ok", calls: 1, reasons: [], hits }), fetchPage: vi.fn(async () => ({ ok: true, body: page, contentType: "text/html" })) });
    const r = await researchMarketForValuation(scopeInput(), d);
    expect(d.fetchPage).toHaveBeenCalledTimes(5);
    expect(d.extract).toHaveBeenCalledTimes(1);
    expect(r.limits.fetches).toBeLessThanOrEqual(5);
    expect(r.limits.searchCalls).toBeLessThanOrEqual(5);
    expect(r.limits.extractionCalls).toBe(1);
    expect(r.costUsd).toBeLessThanOrEqual(0.01);
    expect(r.sources.length).toBeLessThanOrEqual(5);
  });

  it("the wall clock is absolute: a hung provider returns unavailable within the cap", async () => {
    const d = deps({ now: Date.now, brave: provider("brave", () => new Promise<SearchOutcome>(() => {})), claudeCli: null });
    const t0 = Date.now();
    const r = await researchMarketForValuation(scopeInput(), { ...d, wallMs: 1_000 });
    expect(Date.now() - t0).toBeLessThan(3_000);
    expect(r.status).toBe("unavailable");
  });
});

describe("ranking", () => {
  it("prefers official / statistics / press, one page per host, drops paywalls and spam", () => {
    const ranked = rankSources([
      { url: "https://www.grandviewresearch.com/industry/payments" },
      { url: "https://www.openpr.com/news/1" },
      { url: "https://www.abs.gov.au/statistics/industry" },
      { url: "https://acmepay.com.au/about" },
      { url: "https://acmepay.com.au/pricing" },
      { url: "https://www.bloomberg.com/news/x" },
      { url: "https://example-blog.io/post?utm=1" },
      { url: "https://techcrunch.com/2025/acme" },
    ], { websiteHost: "acmepay.com.au" });
    expect(ranked.map((r) => r.publisherClass)).toEqual(["official_company", "statistics", "business_press", "other"]);
    expect(ranked.map((r) => r.url)).not.toContain("https://www.bloomberg.com/news/x");
  });
});
