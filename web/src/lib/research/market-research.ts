import "server-only";
// Market research for valuation (founder request 2026-09-26).
//
//   researchMarketForValuation({ company, website, sector, country, stage }, deps)
//
// For the company being analysed: plan ≤ 5 public queries (name / website
// host / sector / country ONLY — never deck text) → search (Brave, budgeted;
// on quota_exhausted / unavailable → one Claude CLI WebSearch call; else skip)
// → rank and fetch the best ≤ 5 pages with the bounded R01 fetcher → ONE
// DeepInfra extraction call → keep only facts whose quote is verbatim in the
// fetched page and whose numbers are written in the quote → cache 7 days.
//
// It SUPPORTS the CFO valuation as public reference ranges; it never replaces
// the company's own numbers and never throws into the report pipeline.

import { createHash } from "node:crypto";
import {
  emptyMarketResearch, MARKET_RESEARCH_INSTRUCTION, MARKET_RESEARCH_VERSION, marketResearchSchema,
  type MarketResearchResult, type MarketResearchRetrieval, type MarketResearchSource,
} from "./market-research-contract";
import {
  EXTRACTION_SYSTEM, estimateExtractionCostUsd, extractionUserPrompt, fetchableCandidate, parseJsonObject, planMarketQueries, publicScopeFor, rankSources, selectPassages,
  verifyExtraction, type MarketResearchInput, type PlannedQuery, type PublicScope, type SearchHit,
} from "./market-research-core";

export type { MarketResearchInput } from "./market-research-core";

/** Hard caps (per analysis). */
export const MARKET_RESEARCH_WALL_MS = 45_000;
export const MARKET_RESEARCH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** An "unavailable" outcome is cached briefly so a burst of analyses does not re-probe dead providers. */
export const MARKET_RESEARCH_NEGATIVE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_SEARCH_CALLS = 5;
const MAX_FETCHES = 5;
/** Time kept back from the search phase for fetch (≤ 6 s, parallel) + extraction (≤ 12 s). */
const FETCH_MS = 6_000;
const EXTRACT_MS = 12_000;

export type SearchStatus = "ok" | "quota_exhausted" | "unavailable" | "timeout" | "budget_denied" | "not_configured";

export interface SearchOutcome {
  status: SearchStatus;
  hits: SearchHit[];
  /** Provider requests actually dispatched (Brave: one per query; Claude CLI: one per run). */
  calls: number;
  reasons: string[];
}

export interface MarketSearchProvider {
  id: MarketResearchRetrieval;
  search(queries: PlannedQuery[], ctx: { signal: AbortSignal; timeoutMs: number; jobId: string; maxCalls: number }): Promise<SearchOutcome>;
}

export interface FetchedPage {
  ok: boolean;
  /** Raw HTML / text body. */
  body: string;
  finalUrl?: string;
  contentType?: string;
  reason?: string;
}

export interface MarketResearchCache {
  get(key: string, now: number): Promise<MarketResearchResult | null>;
  set(key: string, value: MarketResearchResult, now: number, ttlMs: number): Promise<void>;
}

export interface MarketResearchDeps {
  now?: () => number;
  cache?: MarketResearchCache | null;
  brave?: MarketSearchProvider | null;
  claudeCli?: MarketSearchProvider | null;
  fetchPage?: (url: string, opts: { signal: AbortSignal; timeoutMs: number }) => Promise<FetchedPage>;
  /** ONE extraction call; returns the model's text. */
  extract?: (args: { system: string; user: string; maxTokens: number; timeoutMs: number }) => Promise<string>;
  /** Plain text + <title> from a fetched body (R01 plain-text helper). */
  toText?: (body: string) => { text: string; title: string };
  /** Wall-clock cap (≤ 45 s). */
  wallMs?: number;
  /** false → cache-only (free tier / partial re-run): no search, fetch or AI call. */
  allowNetwork?: boolean;
  signal?: AbortSignal;
}

/** Cache key: normalised company + website host + sector + country + month. */
export function marketResearchCacheKey(scope: PublicScope, now: number): string {
  const month = new Date(now).toISOString().slice(0, 7);
  const n = (v: string | null) => (v ?? "").normalize("NFKC").toLowerCase().replace(/[^a-z0-9.]+/g, " ").trim();
  return createHash("sha256").update(JSON.stringify(["market-research-v1", n(scope.company), n(scope.websiteHost), n(scope.sector), n(scope.country), month])).digest("hex");
}

function remaining(deadline: number, now: () => number): number {
  return Math.max(0, deadline - now());
}

function defaultToText(body: string): { text: string; title: string } {
  const strip = (h: string) => h.replace(/<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  return { text: strip(body), title: strip(body.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").slice(0, 200) };
}

/**
 * Never throws. Returns `status: "found"` with ≥ 1 verified fact, "no_facts"
 * when sources were read but nothing verifiable was quoted, "unavailable"
 * when no search provider could run, "skipped" when there is nothing public
 * to search for (or cache-only mode missed).
 */
export async function researchMarketForValuation(input: MarketResearchInput, deps: MarketResearchDeps = {}): Promise<MarketResearchResult> {
  const now = deps.now ?? Date.now;
  const started = now();
  const wallMs = Math.max(1_000, Math.min(MARKET_RESEARCH_WALL_MS, deps.wallMs ?? MARKET_RESEARCH_WALL_MS));
  const deadline = started + wallMs;
  const at = new Date(started).toISOString();
  let scope: PublicScope = { company: null, websiteHost: null, sector: null, country: "Australia", stage: null };
  try {
    scope = publicScopeFor(input);
    const queries = planMarketQueries(scope, new Date(started).getUTCFullYear());
    if (!queries.length) return emptyMarketResearch({ status: "skipped", reasons: ["no_public_identifiers"], researchedAt: at, scope });
    const key = marketResearchCacheKey(scope, started);
    const cached = await deps.cache?.get(key, started).catch(() => null) ?? null;
    if (cached) return { ...cached, cached: true, costUsd: 0 };
    if (deps.allowNetwork === false) return emptyMarketResearch({ status: "skipped", reasons: ["cache_only_miss"], researchedAt: at, scope, queries: queries.map((q) => q.query) });

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    deps.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), wallMs);
    try {
      const work = run(scope, queries, key, deps, { now, deadline, started, at, wallMs, signal: controller.signal });
      // The wall clock is absolute: a provider that ignores its signal cannot hold the pipeline.
      const timeout = new Promise<MarketResearchResult>((resolve) => {
        const t = setTimeout(() => resolve(emptyMarketResearch({ status: "unavailable", reasons: ["wall_time_exceeded"], researchedAt: at, scope, queries: queries.map((q) => q.query), wallMs })), wallMs + 250);
        work.finally(() => clearTimeout(t)).catch(() => undefined);
      });
      return await Promise.race([work, timeout]);
    } finally {
      clearTimeout(timer);
      deps.signal?.removeEventListener("abort", onAbort);
    }
  } catch {
    return emptyMarketResearch({ status: "unavailable", reasons: ["internal_error"], researchedAt: at, scope });
  }
}

async function run(
  scope: PublicScope, queries: PlannedQuery[], key: string, deps: MarketResearchDeps,
  t: { now: () => number; deadline: number; started: number; at: string; wallMs: number; signal: AbortSignal },
): Promise<MarketResearchResult> {
  const reasons: string[] = [];
  const base = () => emptyMarketResearch({ status: "unavailable", reasons, researchedAt: t.at, scope, queries: queries.map((q) => q.query) });
  const searchBudgetEnd = t.deadline - FETCH_MS - EXTRACT_MS;
  const jobId = `${key.slice(0, 32)}:${t.at.slice(0, 10)}`;
  let searchCalls = 0;
  let hits: SearchHit[] = [];
  let retrieval: MarketResearchRetrieval | null = null;

  // 1. Brave (budgeted + ledger). quota_exhausted / unavailable → Claude CLI.
  if (deps.brave) {
    const out = await safeSearch(deps.brave, queries, { signal: t.signal, timeoutMs: Math.min(15_000, remaining(searchBudgetEnd, t.now)), jobId, maxCalls: MAX_SEARCH_CALLS });
    searchCalls += Math.min(out.calls, MAX_SEARCH_CALLS);
    reasons.push(`brave_${out.status}`, ...out.reasons.map((r) => `brave:${r}`));
    if (out.status === "ok" && out.hits.length) { hits = out.hits; retrieval = "brave"; }
  } else reasons.push("brave_not_configured");

  // 2. Claude CLI web search — at most one call, only while the search budget lasts.
  if (!retrieval) {
    const left = remaining(searchBudgetEnd, t.now);
    if (!deps.claudeCli) reasons.push("claude_cli_not_configured");
    else if (searchCalls >= MAX_SEARCH_CALLS) reasons.push("search_call_cap");
    else if (left < 8_000 || t.signal.aborted) reasons.push("claude_cli_no_time");
    else {
      const out = await safeSearch(deps.claudeCli, queries, { signal: t.signal, timeoutMs: Math.min(60_000, left), jobId, maxCalls: 1 });
      searchCalls += Math.min(out.calls, 1);
      reasons.push(`claude_cli_${out.status}`, ...out.reasons.map((r) => `claude_cli:${r}`));
      if (out.status === "ok" && out.hits.length) { hits = out.hits; retrieval = "claude_cli_websearch"; }
    }
  }
  if (!retrieval) {
    const result = { ...base(), limits: { ...base().limits, searchCalls, wallMs: Math.round(t.now() - t.started) } };
    await deps.cache?.set(key, result, t.now(), MARKET_RESEARCH_NEGATIVE_TTL_MS).catch(() => undefined);
    return result;
  }

  // 3. Rank → fetch the best ≤ 5 with the bounded R01 fetcher (parallel, one deadline).
  const ranked = rankSources(hits, { websiteHost: scope.websiteHost, max: MAX_FETCHES });
  const toText = deps.toText ?? defaultToText;
  let fetches = 0;
  const fetched: Array<{ id: string; url: string; title: string; text: string; passages: string; publisherClass: MarketResearchSource["publisherClass"]; fetchedAt: string }> = [];
  if (deps.fetchPage && ranked.length) {
    const fetchTimeout = Math.max(1_000, Math.min(FETCH_MS, remaining(t.deadline - EXTRACT_MS, t.now)));
    const pages = await Promise.all(ranked.slice(0, MAX_FETCHES).map(async (r) => {
      fetches++;
      try {
        const page = await deps.fetchPage!(r.url, { signal: t.signal, timeoutMs: fetchTimeout });
        if (!page.ok) return null;
        if (page.contentType && !/html|text\/plain|xml/i.test(page.contentType)) return null;
        // A redirect is followed only to another fetchable public page (no query, no file share, no paywall).
        const url = page.finalUrl && page.finalUrl !== r.url ? fetchableCandidate(page.finalUrl) : r.url;
        if (!url) return null;
        const { text, title } = toText(page.body);
        if (text.length < 200) return null;
        const passages = selectPassages(text, { company: scope.company });
        if (!passages) return null;
        return { url, title: title || r.title?.slice(0, 200) || new URL(r.url).hostname, text, passages, publisherClass: r.publisherClass, fetchedAt: new Date(t.now()).toISOString() };
      } catch { return null; }
    }));
    pages.forEach((p) => { if (p && !fetched.some((f) => f.url === p.url)) fetched.push({ ...p, id: `S${fetched.length + 1}` }); });
  } else if (!deps.fetchPage) reasons.push("fetch_not_configured");
  const limitsSoFar = () => ({ searchCalls, fetches, extractionCalls: 0, maxSearchCalls: 5 as const, maxFetches: 5 as const, maxExtractionCalls: 1 as const, wallMs: Math.round(t.now() - t.started) });
  if (!fetched.length) {
    reasons.push("no_readable_sources");
    const result: MarketResearchResult = { ...base(), status: "no_facts", retrieval, limits: limitsSoFar() };
    await deps.cache?.set(key, result, t.now(), MARKET_RESEARCH_NEGATIVE_TTL_MS).catch(() => undefined);
    return result;
  }

  // 4. ONE extraction call, then code-side verification of every quote and number.
  let extractionCalls = 0;
  let costUsd = 0;
  let parsed: unknown = null;
  const left = remaining(t.deadline, t.now);
  if (!deps.extract) reasons.push("extract_not_configured");
  else if (left < 3_000 || t.signal.aborted) reasons.push("extract_no_time");
  else {
    const user = extractionUserPrompt({ scope, sources: fetched.map((f) => ({ id: f.id, url: f.url, title: f.title, passages: f.passages })) });
    extractionCalls = 1;
    try {
      const text = await deps.extract({ system: EXTRACTION_SYSTEM, user, maxTokens: 1_400, timeoutMs: Math.min(EXTRACT_MS, left - 500) });
      costUsd = estimateExtractionCostUsd(EXTRACTION_SYSTEM.length + user.length, text.length);
      parsed = parseJsonObject(text);
      if (parsed === null) reasons.push("extract_unparseable");
    } catch { reasons.push("extract_failed"); }
  }
  const { facts, dropped } = verifyExtraction(parsed, fetched.map((f) => ({ id: f.id, url: f.url, text: f.text })));
  if (dropped) reasons.push(`dropped_unverified_${Math.min(dropped, 99)}`);
  const used = new Set([...facts.marketSize, ...facts.competitors, ...facts.comparables].map((f) => f.sourceId));
  const sources: MarketResearchSource[] = fetched.map((f) => ({ id: f.id, url: f.url, title: f.title, fetchedAt: f.fetchedAt, retrieval: retrieval!, publisherClass: f.publisherClass, evidenceTier: "public_unverified" as const }));
  const result: MarketResearchResult = {
    version: MARKET_RESEARCH_VERSION,
    status: used.size ? "found" : "no_facts",
    reasons: [...new Set(reasons)].slice(0, 24),
    retrieval,
    cached: false,
    researchedAt: t.at,
    scope,
    queries: queries.map((q) => q.query),
    // Sources without a verified fact are not references — keep only the ones facts point at.
    sources: sources.filter((s) => used.has(s.id)),
    facts,
    limits: { ...limitsSoFar(), extractionCalls },
    costUsd: Math.min(0.05, costUsd),
    evidenceTier: "public_unverified",
    instruction: MARKET_RESEARCH_INSTRUCTION,
  };
  const safe = marketResearchSchema.safeParse(result);
  if (!safe.success) return { ...base(), reasons: [...new Set([...reasons, "result_schema_invalid"])] };
  // A failed / unparseable extraction is a transient outcome: short cache only.
  const ttl = used.size || (extractionCalls && parsed !== null) ? MARKET_RESEARCH_CACHE_TTL_MS : MARKET_RESEARCH_NEGATIVE_TTL_MS;
  await deps.cache?.set(key, result, t.now(), ttl).catch(() => undefined);
  return result;
}

async function safeSearch(provider: MarketSearchProvider, queries: PlannedQuery[], ctx: { signal: AbortSignal; timeoutMs: number; jobId: string; maxCalls: number }): Promise<SearchOutcome> {
  if (ctx.timeoutMs < 1_000 || ctx.signal.aborted) return { status: "timeout", hits: [], calls: 0, reasons: ["no_time"] };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<SearchOutcome>((resolve) => { timer = setTimeout(() => resolve({ status: "timeout", hits: [], calls: 0, reasons: [] }), ctx.timeoutMs + 500); });
    const out = await Promise.race([provider.search(queries.slice(0, MAX_SEARCH_CALLS), ctx), timeout]);
    return { status: out.status, hits: Array.isArray(out.hits) ? out.hits.slice(0, 25) : [], calls: Math.max(0, out.calls | 0), reasons: (out.reasons ?? []).filter((r) => typeof r === "string").map((r) => r.slice(0, 60)).slice(0, 6) };
  } catch {
    return { status: "unavailable", hits: [], calls: 1, reasons: ["provider_threw"] };
  } finally { if (timer) clearTimeout(timer); }
}
