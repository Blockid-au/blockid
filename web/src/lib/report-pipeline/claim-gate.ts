// claim-gate — the §5.4 citation gate predicates, shared by the llm-auditor
// Stage-1 sweep and the G23-A auto-citer so both agree on what a material
// claim is and what counts as "cite it or say you cannot". Pure, no
// dependencies (llm-auditor pulls in the ADK layer; tests mock it).

// A "material" claim is a specific, checkable assertion — the class of
// statement free models fabricate. Qualitative prose is deliberately NOT
// material: flagging it would drown the real signal.
export const MATERIAL_PATTERNS: RegExp[] = [
  /(?:A?\$|AUD\s?|USD\s?)\s?\d[\d,.]*\s*(?:k|m|bn?|million|billion|thousand)?/i,
  /\b\d+(?:\.\d+)?\s?%/,
  /\b\d[\d,]{3,}\b/,
  /\b(?:ARR|MRR|CAC|LTV|TAM|SAM|SOM|NPS|MAU|DAU|CAGR|churn|runway)\b[^.]{0,40}?\d/i,
  /\b\d+(?:\.\d+)?x\b/i,
];

// An explicit admission that a claim is not evidenced satisfies §5.4 just as
// a citation does — the rule is "cite it or say you cannot".
export const UNEVIDENCED_MARKERS =
  /[([](?:unevidenced|uncited|no evidence|estimate|estimated|illustrative|assumption)[)\]]|\b(?:not disclosed|not provided|no evidence (?:was )?(?:supplied|provided)|unverified|self-reported|founder-reported|indicative only)\b/i;

export const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
/** The inline citation marker every owner contract asks for. */
export const EV_MARKER_RE = /\[ev:([^\]]+)\]/gi;

/** Split prose into claim-sized units: sentences, list items, table rows. */
export function splitClaims(text: string): string[] {
  return text
    .split("\n")
    .filter(line => !line.trim().startsWith("<!--"))
    .flatMap(line => line.split(/(?<=[.!?])\s+/))
    .map(s => s.trim())
    .filter(Boolean);
}

/** A specific, checkable assertion — money, percentage, large count, metric, multiple. */
export function isMaterialClaim(claim: string): boolean {
  return MATERIAL_PATTERNS.some(p => p.test(claim));
}

/**
 * True when the claim carries an evidence id from `allowed` (any well-formed
 * uuid when the set is empty — callers without a catalogue still get the
 * cite-something rule) or an explicit unevidenced marker.
 */
export function hasCitationOrMarker(claim: string, allowed: ReadonlySet<string> | string[] = []): boolean {
  if (UNEVIDENCED_MARKERS.test(claim)) return true;
  const set = Array.isArray(allowed) ? new Set(allowed.map(id => id.toLowerCase())) : allowed;
  // G23-A: an `[ev:<id>]` marker counts for ANY allowed id (register ids are
  // uuid-shaped in the pipeline, but demo / fixture rows use readable ids);
  // a bare uuid still counts, as before.
  const ids = [...Array.from(claim.matchAll(EV_MARKER_RE), m => m[1]!.trim()), ...(claim.match(UUID_RE) ?? [])];
  return set.size === 0 ? ids.length > 0 : ids.some(u => set.has(u.toLowerCase()));
}
