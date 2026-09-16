// G14-S36 / decision D4 — confidence is capped by WHO produced the evidence,
// never by what the text says.
//
// Before this module `extractSignals()` (svi-analysis.ts) promoted a whole
// analysis to `third_party_verified` when the founder's prose contained the
// words "audit", "asic" or "third party", and the dimension-evidence upload
// route honoured any `confidenceLevel` the founder posted. Both are the same
// hole: the party making a claim was also the party grading it.
//
// The ladder (EVIDENCE_CONFIDENCE in svi-analysis.ts) stays what it was; this
// module only bounds how high each origin can reach on it:
//
//   founder_text    ≤ self_declared      (public_url when the text carries a URL)
//   founder_upload  ≤ document_uploaded
//   connector       ∈ {connected_source, transaction_data}   (machine-read)
//   reviewer/admin  ≤ third_party_verified                    (a human signed it)
//
// Pure: no I/O, safe in the extractor, route handlers and tests.

export const CONFIDENCE_LEVELS = [
  "self_declared",
  "public_url",
  "document_uploaded",
  "connected_source",
  "transaction_data",
  "third_party_verified",
] as const;

export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export type EvidenceOrigin = "founder_text" | "founder_upload" | "connector" | "reviewer" | "admin";

export const EVIDENCE_ORIGINS: readonly EvidenceOrigin[] = ["founder_text", "founder_upload", "connector", "reviewer", "admin"];

const RANK: Record<ConfidenceLevel, number> = Object.fromEntries(CONFIDENCE_LEVELS.map((l, i) => [l, i])) as Record<ConfidenceLevel, number>;

export function isConfidenceLevel(v: unknown): v is ConfidenceLevel {
  return typeof v === "string" && (CONFIDENCE_LEVELS as readonly string[]).includes(v);
}

export function confidenceRank(level: ConfidenceLevel): number {
  return RANK[level];
}

/** The highest rung an origin may reach. `hasUrl` only matters for founder_text. */
export function originCeiling(origin: EvidenceOrigin, hasUrl = false): ConfidenceLevel {
  switch (origin) {
    case "founder_text":
      return hasUrl ? "public_url" : "self_declared";
    case "founder_upload":
      return "document_uploaded";
    case "connector":
      return "transaction_data";
    case "reviewer":
    case "admin":
      return "third_party_verified";
    default: {
      const _exhaustive: never = origin;
      return _exhaustive;
    }
  }
}

export interface CapConfidenceInput {
  /** What the caller asked for (a founder-posted level, a catalog default, a keyword guess…). Unknown strings count as self_declared. */
  requested: string | null | undefined;
  origin: EvidenceOrigin;
  /** founder_text only: the text (or value) contains a URL, so `public_url` is honest. */
  hasUrl?: boolean;
}

export interface CapConfidenceResult {
  level: ConfidenceLevel;
  /** The requested level, normalised (unknown → self_declared). */
  requested: ConfidenceLevel;
  ceiling: ConfidenceLevel;
  /** True when the stored level is lower than what was asked for. */
  capped: boolean;
}

/**
 * Bound `requested` by the origin's ceiling. Only ever lowers a level, with
 * one exception: a `connector` row is by definition machine-read, so a
 * requested level below `connected_source` is lifted to it — a Stripe
 * callback can never file `self_declared`.
 */
export function capConfidence(input: CapConfidenceInput): CapConfidenceResult {
  const requested: ConfidenceLevel = isConfidenceLevel(input.requested) ? input.requested : "self_declared";
  const ceiling = originCeiling(input.origin, input.hasUrl === true);
  let level: ConfidenceLevel = RANK[requested] > RANK[ceiling] ? ceiling : requested;
  if (input.origin === "connector" && RANK[level] < RANK.connected_source) level = "connected_source";
  return { level, requested, ceiling, capped: RANK[level] < RANK[requested] };
}

/** Convenience for callers that only need the level. */
export function cappedLevel(input: CapConfidenceInput): ConfidenceLevel {
  return capConfidence(input).level;
}

const URL_RE = /\bhttps?:\/\/[^\s)"'<>]+/i;

/** Does the text carry an http(s) URL the founder could be pointing at? */
export function textHasUrl(text: string | null | undefined): boolean {
  return typeof text === "string" && URL_RE.test(text);
}

/** Plain-English cap rules for the public methodology page (one line per origin). */
export const CAP_RULES_PLAIN: ReadonlyArray<{ origin: EvidenceOrigin; who: string; ceiling: ConfidenceLevel; rule: string }> = [
  { origin: "founder_text", who: "Founder — typed text", ceiling: "public_url", rule: "Prose never grades itself: a description is self-declared, or public-URL when it links to a page we can open. Writing \"ASIC audit\" changes nothing." },
  { origin: "founder_upload", who: "Founder — uploaded file or link", ceiling: "document_uploaded", rule: "An upload counts as a document. It cannot post itself as connected, transactional or third-party verified." },
  { origin: "connector", who: "Connector (Stripe, Xero, GitHub, GA4…)", ceiling: "transaction_data", rule: "Machine-read from the source of record via OAuth; revenue and payouts are transaction data, everything else is a connected source." },
  { origin: "reviewer", who: "BlockID reviewer", ceiling: "third_party_verified", rule: "Only a named human reviewer can mark a row third-party verified, after the founder requests review. The approval is audit-logged." },
];
