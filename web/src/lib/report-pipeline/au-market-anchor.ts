// AU market anchor injector for the CMO market-research wave.
//
// Closes docs/plans/atlassian-standard-mapping-goal.md §1 phase 3 P1 gap
// follow-up: "CMO deep-pass agent-side consumer wiring — auto-firing the
// [AU market lookup] endpoint during a market-research analysis so the
// LLM's TAM/SAM/SOM section is grounded in ABS + IBISWorld anchors rather
// than hallucinated numbers".
//
// Complements the Chapter 3 founder-facing UI (P3c, abs-lookup-panel.tsx)
// and the public GET /api/abs/lookup route (P3b) around the seeded
// au-market-lookup.ts fixture (P3a). This module is the AGENT-side
// consumer: it maps the founder's free-form startup description into an
// ANZSIC 2006 industry snapshot and returns a markdown block the CMO
// prompt embeds before it calls the LLM.
//
// Boundary: pure text-in / text-out. No network, no DB, no LLM. The
// AU_MARKET_LOOKUP_DISCLAIMER stays attached so any surface that
// re-renders the block (transcripts, section-assembler, LLM audit trails)
// carries the anchor-only hedge — treats industry-size as factual
// context, not personal financial product advice under s766B Corps Act.

import {
  AU_MARKET_INDUSTRIES,
  AU_MARKET_LOOKUP_DISCLAIMER,
  estimateTamSamSom,
  lookupByAnzsic,
  searchByKeyword,
  type AuIndustrySnapshot,
  type TamSamSomResult,
} from "@/lib/market/au-market-lookup";

/** Uppercased, whitespace-stripped ANZSIC 2006 class code (e.g. "J5810"). */
const ANZSIC_CODE_PATTERN = /\b([A-Sa-s])\s*(\d{4})\b/;

/**
 * Scan free-form startup description for an ANZSIC 2006 class code (like
 * "J5810" or "K 6419"). Returns the canonical uppercased code or null.
 */
export function extractAnzsicCode(rawText: string | null | undefined): string | null {
  if (!rawText) return null;
  const match = String(rawText).match(ANZSIC_CODE_PATTERN);
  if (!match) return null;
  return `${match[1].toUpperCase()}${match[2]}`;
}

/**
 * Derive the best-fit ANZSIC industry keyword from a founder's raw text.
 * Scores each seeded industry by counting keyword hits (word-boundary
 * matches, lowercase-normalised) plus a bonus for label-token hits. Ties
 * break on larger TAM (parent-market preference matches
 * searchByKeyword). Returns the industry's top-ranked keyword so
 * downstream callers can round-trip it into estimateTamSamSom({ keyword })
 * and get the same snapshot back.
 */
export function deriveIndustryKeyword(
  rawText: string | null | undefined,
): string | null {
  if (!rawText) return null;
  const lower = String(rawText).toLowerCase();
  if (!lower.trim()) return null;

  let best: { industry: AuIndustrySnapshot; keyword: string; score: number } | null = null;
  for (const industry of AU_MARKET_INDUSTRIES) {
    let score = 0;
    let topKeyword: string | null = null;
    let topKeywordScore = 0;
    for (const kw of industry.keywords) {
      const kwLower = kw.toLowerCase();
      const pattern = new RegExp(`\\b${escapeRegex(kwLower)}\\b`, "g");
      const hits = (lower.match(pattern) ?? []).length;
      if (hits > 0) {
        const contribution = hits * 10;
        score += contribution;
        if (contribution > topKeywordScore) {
          topKeyword = kw;
          topKeywordScore = contribution;
        }
      }
    }
    // Label-token bonus (matches searchByKeyword's label-prefix + label-
    // includes rules). Weighted lower than a keyword hit so a stray label
    // word alone cannot outrank a genuine keyword match.
    const labelLower = industry.label.toLowerCase();
    for (const token of labelLower.split(/[^a-z0-9]+/)) {
      if (token.length < 4) continue;
      const pattern = new RegExp(`\\b${escapeRegex(token)}\\b`);
      if (pattern.test(lower)) score += 3;
    }
    if (score > 0 && (!best || score > best.score || (score === best.score && industry.tamAud > best.industry.tamAud))) {
      best = { industry, keyword: topKeyword ?? industry.keywords[0], score };
    }
  }
  return best?.keyword ?? null;
}

/**
 * Options for buildAuMarketAnchorBlock. All optional — the caller can
 * pass either an explicit anzsicCode (from founder-supplied criteria
 * data), a keyword (already derived), or let the function derive one from
 * rawText.
 */
export interface AuMarketAnchorInput {
  rawText?: string | null;
  anzsicCode?: string | null;
  keyword?: string | null;
  addressablePct?: number;
  targetSharePct?: number;
}

/**
 * Return a markdown block ready to paste into an LLM user-prompt, or
 * null when no ANZSIC snapshot matches. Precedence: explicit anzsicCode →
 * explicit keyword → rawText-extracted ANZSIC → rawText-derived keyword.
 * The block always carries source citations + the anchor-only disclaimer
 * so the LLM's downstream TAM/SAM/SOM claims are traceable.
 */
export function buildAuMarketAnchorBlock(
  input: AuMarketAnchorInput,
): string | null {
  const explicitCode = input.anzsicCode?.trim() ?? null;
  const extractedCode = extractAnzsicCode(input.rawText);
  const keyword = input.keyword?.trim() || deriveIndustryKeyword(input.rawText);
  const industry =
    (explicitCode && lookupByAnzsic(explicitCode)) ||
    (extractedCode && lookupByAnzsic(extractedCode)) ||
    (keyword ? searchByKeyword(keyword, 1)[0] ?? null : null);
  if (!industry) return null;

  const result: TamSamSomResult | null = estimateTamSamSom({
    anzsicCode: industry.anzsicCode,
    addressablePct: input.addressablePct,
    targetSharePct: input.targetSharePct,
  });
  if (!result) return null;

  const cagrPct = (result.industry.cagr * 100).toFixed(1);
  const addressablePct = (result.addressablePct * 100).toFixed(0);
  const targetSharePct = (result.targetSharePct * 100).toFixed(1);
  const sources = result.industry.sources
    .map((s) => `  - ${s.publisher} — ${s.title} (${s.publishedYear}) ${s.url}`)
    .join("\n");

  return [
    "## AU Market Anchor (ABS / IBISWorld)",
    "> Ground your TAM/SAM/SOM in these anchors before quoting a number the founder cannot defend.",
    "",
    `- **ANZSIC 2006:** ${result.industry.anzsicCode} — ${result.industry.label}`,
    `- **Total Addressable Market (AU):** ${formatAud(result.tamAud)}`,
    `- **Serviceable Available Market:** ${formatAud(result.samAud)} (${addressablePct}% of TAM)`,
    `- **Serviceable Obtainable Market:** ${formatAud(result.somAud)} (${targetSharePct}% 3-yr capture of SAM)`,
    `- **Trailing 5-yr CAGR:** ${cagrPct}%`,
    `- **Active AU business count (ABS 8165.0 basis):** ${result.industry.businessCount.toLocaleString("en-AU")}`,
    `- **Anchor notes:** ${result.industry.notes}`,
    "- **Sources:**",
    sources,
    "",
    `_${result.disclaimer ?? AU_MARKET_LOOKUP_DISCLAIMER}_`,
  ].join("\n");
}

function formatAud(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "A$—";
  if (n >= 1_000_000_000) return `A$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `A$${Math.round(n / 1_000_000).toLocaleString("en-AU")}M`;
  if (n >= 1_000) return `A$${Math.round(n / 1_000).toLocaleString("en-AU")}k`;
  return `A$${Math.round(n).toLocaleString("en-AU")}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
