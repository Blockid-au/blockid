// Market references — how researched public figures SUPPORT the CFO valuation
// (pure, client-safe; web / PDF / DOCX read the same rows).
//
//   marketReferencesFor(research)   the "Market references" block: ≤ 5 sources,
//                                   figures with links and dates, provenance.
//   marketReferenceCrossCheck(...)  ONE cross-check row "Public market references
//                                   (n sources)": the researched revenue multiples
//                                   × the company's OWN qualified ARR. It is a
//                                   reference range beside the weighted estimate —
//                                   never a method, never a weight, never a
//                                   consensus input — and it only exists when the
//                                   valuation chapter itself is available (the
//                                   evidence gates admitted the company's numbers;
//                                   D22 / H10: no SVI → money, no research → money).

import type { ComparableFact, CompetitorFact, MarketResearchResult, MarketSizeFact } from "@/lib/research/market-research-contract";
import { marketReferenceSourceCount } from "@/lib/research/market-research-contract";

export interface MarketReferenceRow {
  kind: "market_size" | "competitor" | "comparable";
  subject: string;
  figure: string;
  date: string | null;
  url: string;
  sourceTitle: string;
  quote: string;
}

export interface MarketReferencesBlock {
  sourceCount: number;
  retrieval: MarketResearchResult["retrieval"];
  researchedAt: string;
  rows: MarketReferenceRow[];
  sources: Array<{ id: string; url: string; title: string; fetchedAt: string }>;
  /** Researched revenue multiples (≥ 1) — the only figure that may be scaled by the company's ARR. */
  revenueMultiples: { n: number; low: number; median: number; high: number } | null;
}

const CURRENCY_PREFIX: Record<string, string> = { AUD: "A$", USD: "US$", EUR: "€", GBP: "£", NZD: "NZ$", SGD: "S$", CAD: "C$" };
const MAX_ROWS = 8;

function money(value: number, unit: string | null, currency: string | null): string {
  const n = Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
  const scale = unit && !/^x|times$/i.test(unit) ? ` ${unit}` : "";
  return `${currency ? CURRENCY_PREFIX[currency] ?? `${currency} ` : ""}${n}${scale}`;
}

function comparableFigure(c: ComparableFact): string {
  if (c.metric === "revenue_multiple") return `${c.value}× revenue`;
  return `${money(c.value, c.unit, c.currency)} ${c.metric === "valuation" ? "valuation" : "round"}`;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function marketReferencesFor(research: MarketResearchResult | null | undefined): MarketReferencesBlock | null {
  if (!research || marketReferenceSourceCount(research) === 0) return null;
  const titleOf = new Map(research.sources.map((s) => [s.id, s.title]));
  const rows: MarketReferenceRow[] = [];
  const push = (r: MarketReferenceRow) => { if (rows.length < MAX_ROWS) rows.push(r); };
  research.facts.marketSize.forEach((m: MarketSizeFact) => push({
    kind: "market_size", subject: m.geography ? `Market size (${m.geography})` : "Market size", figure: money(m.value, m.unit, m.currency),
    date: m.year !== null ? String(m.year) : null, url: m.url, sourceTitle: titleOf.get(m.sourceId) ?? m.url, quote: m.quote,
  }));
  research.facts.comparables.forEach((c) => push({
    kind: "comparable", subject: c.company, figure: comparableFigure(c), date: c.date, url: c.url, sourceTitle: titleOf.get(c.sourceId) ?? c.url, quote: c.quote,
  }));
  research.facts.competitors.forEach((c: CompetitorFact) => push({
    kind: "competitor", subject: c.name, figure: [c.funding ? `raised ${c.funding}` : null, c.valuation ? `valued ${c.valuation}` : null].filter(Boolean).join(" · ") || "named competitor",
    date: null, url: c.url, sourceTitle: titleOf.get(c.sourceId) ?? c.url, quote: c.quote,
  }));
  const multiples = research.facts.comparables.filter((c) => c.metric === "revenue_multiple" && c.value >= 0.1 && c.value <= 200).map((c) => c.value);
  const used = new Set(rows.map((r) => r.url));
  return {
    sourceCount: marketReferenceSourceCount(research),
    retrieval: research.retrieval,
    researchedAt: research.researchedAt,
    rows,
    sources: research.sources.filter((s) => used.has(s.url)).slice(0, 5).map((s) => ({ id: s.id, url: s.url, title: s.title, fetchedAt: s.fetchedAt })),
    revenueMultiples: multiples.length ? { n: multiples.length, low: Math.min(...multiples), median: median(multiples), high: Math.max(...multiples) } : null,
  };
}

/**
 * The reference range row: researched revenue multiples × the company's own
 * qualified ARR. Null without ARR (pre-revenue / unqualified revenue) or
 * without a researched multiple — references never create a number the
 * company's evidence did not already admit.
 */
export function marketReferenceCrossCheck(block: MarketReferencesBlock | null, arrAud: number | null | undefined): {
  label: string; lowAud: number; midAud: number; highAud: number; source: string; asOf: string; n: number;
} | null {
  if (!block?.revenueMultiples || typeof arrAud !== "number" || !Number.isFinite(arrAud) || arrAud <= 0) return null;
  const m = block.revenueMultiples;
  const via = block.retrieval === "brave" ? "Brave search" : block.retrieval === "claude_cli_websearch" ? "Claude web search" : "public search";
  return {
    label: `Public market references (${block.sourceCount} source${block.sourceCount === 1 ? "" : "s"}) — revenue multiple ${m.low}–${m.high}× applied to your ARR`,
    lowAud: Math.round(arrAud * m.low),
    midAud: Math.round(arrAud * m.median),
    highAud: Math.round(arrAud * m.high),
    source: `Public web pages via ${via}, quotes checked against the page, not independently verified; reference range only, not part of the weighted estimate`,
    asOf: block.researchedAt.slice(0, 10),
    n: m.n,
  };
}
