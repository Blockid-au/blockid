// Chapter 3 (Market Research) IBISWorld deep-link surface.
//
// Closes docs/plans/atlassian-standard-mapping-goal.md §1 phase 3 P2 gap
// ("IBISWorld link-out surface (Chapter 3 copy references it but no
// per-industry deep-link module)"). The sibling ABS live SDMX pass-through
// remains open — this ships only the IBISWorld half so the founder-facing
// "cite an IBISWorld report per your sector" nudge on Chapter 3 has a
// deterministic backing lib.
//
// Design posture: this module is a thin READ-ONLY projection over the
// already-shipped AU_MARKET_INDUSTRIES seed in au-market-lookup.ts (single
// source of truth for the per-vertical sources[] array). Every entry that
// carries an IBISWorld source becomes an IbisworldDeeplink here — no new
// URL data is added by this file, so refreshes to the underlying report set
// happen in one place (au-market-lookup.ts) and this module rehydrates
// automatically.
//
// Boundary: IBISWorld is a paywalled research service — the link-outs
// resolve to their marketing landing page and the full report is behind a
// subscription. Consumers surfacing these links in a founder-facing
// surface should attach `IBISWORLD_DEEPLINKS_DISCLAIMER` so the reader
// knows the anchor is factual context, not personal financial product
// advice under s766B Corporations Act 2001 (Cth).

import {
  AU_MARKET_INDUSTRIES,
  ANZSIC_DIVISIONS,
  type AnzsicDivision,
  type AuIndustrySnapshot,
} from "./au-market-lookup";

export const IBISWORLD_DEEPLINKS_DISCLAIMER =
  "IBISWorld industry reports are paywalled — link-outs resolve to the " +
  "publisher's marketing landing page. Report titles and publication years " +
  "are anchor context (not audited), and any figure cited in a founder " +
  "report should be secondary-source-checked before use. General " +
  "information only — not personal financial product advice under s766B " +
  "Corporations Act 2001 (Cth).";

/**
 * IBISWorld's Australian industry-reports index (top-level portal). Kept
 * separate from the per-vertical `ibisworldUrl` entries so a Chapter 3
 * surface can offer the "browse the full IBISWorld AU index" fallback when
 * a founder's sector is not in the seeded set.
 */
export const IBISWORLD_INDEX_URL = "https://www.ibisworld.com/au/industry/";

export type IbisworldDeeplink = {
  anzsicCode: string;
  division: AnzsicDivision;
  divisionLabel: string;
  industryLabel: string;
  keywords: readonly string[];
  ibisworldUrl: string;
  /**
   * Parsed numeric report id (the trailing path segment on the IBISWorld
   * URL e.g. `1979` for `/au/industry/software-publishing/1979/`). Null when
   * the URL does not follow the canonical pattern — callers that key on the
   * id (e.g. for deterministic sort or link-hash) can fall back to
   * `ibisworldUrl` in that case.
   */
  ibisworldReportId: string | null;
  /** Report title as cited in au-market-lookup.ts sources[] (verbatim). */
  reportTitle: string;
  publishedYear: number;
};

export type IbisworldSearchInput = {
  /** Free-text vertical hint (e.g. "saas", "fintech", "cleantech"). */
  sector?: string;
  /** ANZSIC 2006 class code (e.g. "J5810"). Case-insensitive. */
  anzsicCode?: string;
  /** Cap on returned matches. Defaults to 5 (mirrors searchByKeyword). */
  limit?: number;
};

export type IbisworldSearchResult = {
  sector: string | null;
  anzsicCode: string | null;
  count: number;
  matches: IbisworldDeeplink[];
  /** Present on every response so downstream renderers do not forget it. */
  disclaimer: string;
  /** Top-level portal — always safe to surface as a fallback link. */
  index_url: string;
};

/**
 * Extract IBISWorld sources[] rows from every seeded industry. A single
 * industry can (rarely) cite multiple IBISWorld reports; each becomes its
 * own IbisworldDeeplink so the caller sees one entry per URL.
 */
function toDeeplinks(industry: AuIndustrySnapshot): IbisworldDeeplink[] {
  return industry.sources
    .filter((s) => s.publisher === "IBISWorld")
    .map((s) => ({
      anzsicCode: industry.anzsicCode,
      division: industry.division,
      divisionLabel: ANZSIC_DIVISIONS[industry.division],
      industryLabel: industry.label,
      keywords: industry.keywords,
      ibisworldUrl: s.url,
      ibisworldReportId: extractIbisworldReportId(s.url),
      reportTitle: s.title,
      publishedYear: s.publishedYear,
    }));
}

/**
 * Full seeded set. Returned as a fresh array so callers can sort / slice
 * without disturbing the internal state.
 */
export function listAllIbisworldDeeplinks(): IbisworldDeeplink[] {
  const all: IbisworldDeeplink[] = [];
  for (const industry of AU_MARKET_INDUSTRIES) {
    for (const link of toDeeplinks(industry)) all.push(link);
  }
  return all;
}

/**
 * Score-and-rank IBISWorld deep-links for a founder-supplied sector or
 * ANZSIC code. Mirrors searchByKeyword's ranking (exact keyword hit >
 * label prefix > substring) so a Chapter-3 tile that already displays
 * au-market-lookup's TAM anchor can present a consistent ordering of the
 * IBISWorld backing links.
 */
export function findIbisworldDeeplinks(input: IbisworldSearchInput): IbisworldSearchResult {
  const sectorRaw = (input.sector ?? "").trim().toLowerCase();
  const anzsicRaw = (input.anzsicCode ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const limit = Math.max(0, Number.isFinite(input.limit) ? Number(input.limit) : 5);

  const shape = (matches: IbisworldDeeplink[]): IbisworldSearchResult => ({
    sector: sectorRaw || null,
    anzsicCode: anzsicRaw || null,
    count: matches.length,
    matches: matches.slice(0, limit),
    disclaimer: IBISWORLD_DEEPLINKS_DISCLAIMER,
    index_url: IBISWORLD_INDEX_URL,
  });

  if (anzsicRaw) {
    const hit = AU_MARKET_INDUSTRIES.find((i) => i.anzsicCode === anzsicRaw);
    if (!hit) return shape([]);
    return shape(toDeeplinks(hit));
  }

  if (!sectorRaw) return shape([]);

  const scored: Array<{ link: IbisworldDeeplink; score: number }> = [];
  for (const industry of AU_MARKET_INDUSTRIES) {
    let score = 0;
    if (industry.keywords.includes(sectorRaw)) score += 100;
    if (industry.label.toLowerCase().startsWith(sectorRaw)) score += 40;
    if (industry.label.toLowerCase().includes(sectorRaw)) score += 20;
    for (const kw of industry.keywords) {
      if (kw.includes(sectorRaw)) score += 10;
      if (sectorRaw.includes(kw)) score += 5;
    }
    if (score <= 0) continue;
    for (const link of toDeeplinks(industry)) scored.push({ link, score });
  }
  scored.sort((a, b) => b.score - a.score || b.link.publishedYear - a.link.publishedYear);
  return shape(scored.map((s) => s.link));
}

/**
 * Parse the canonical IBISWorld report id out of a URL. Their AU industry
 * pages follow the shape `https://www.ibisworld.com/au/industry/<slug>/<id>/`
 * where `<id>` is a numeric identifier. Returns null when the URL is not
 * a canonical IBISWorld AU industry URL — callers should treat that as
 * "id unavailable" rather than a validation error.
 */
export function extractIbisworldReportId(url: string): string | null {
  if (typeof url !== "string" || !url.trim()) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (!/(^|\.)ibisworld\.com$/i.test(parsed.hostname)) return null;
  const segments = parsed.pathname.split("/").filter(Boolean);
  // Expect ["au", "industry", "<slug>", "<id>"] at minimum.
  if (segments.length < 4) return null;
  if (segments[0].toLowerCase() !== "au" || segments[1].toLowerCase() !== "industry") return null;
  const idCandidate = segments[3];
  return /^\d{2,10}$/.test(idCandidate) ? idCandidate : null;
}
