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
//
// G24-D: a declared assumption / projection is that admission in prose form.
// The 09:02 showcase run's revenue section carried eight uncited sentences of
// the shape "Assuming an LTV of A$1,788 …", "we estimate CAC at A$200–500",
// "Base scenario: … reaching A$6,980 MRR" — the model saying, in words, that
// the number is its own working rather than a fact. Those phrases count as
// the marker; a bare benchmark ("typical ARR is A$50k–200k") still does not.
export const UNEVIDENCED_MARKERS =
  /[([](?:unevidenced|uncited|no evidence|estimates?|estimated|illustrative|assumptions?)\b[^)\]]{0,80}[)\]]|\b(?:not disclosed|not provided|no evidence (?:was )?(?:supplied|provided)|unverified|self-reported|founder-reported|indicative only)\b|\b(?:we|i|our model) (?:estimate|assume|project|model)s?\b|\bassuming\b|\b(?:bear|base|bull)[- ](?:case|scenario)\b|\bscenario\b|\bhypothetical(?:ly)?\b|\brule of thumb\b|\billustrative\b|\b(?:this|which|that) (?:implies|suggests|would imply)\b|^\s*\|\s*(?:bear|base|bull)\s*\|/i;

/**
 * G24-D: a markdown table whose caption (the nearest prose line above it) or
 * header row carries the unevidenced marker is a declared-estimate table —
 * the CMO's "Channel Economics" grid of sector-typical CAC ranges. Its rows
 * inherit the marker. Returns, per line, whether that line is a declared
 * table row.
 */
export function declaredTableRows(text: string): boolean[] {
  const lines = text.split("\n");
  const out = new Array<boolean>(lines.length).fill(false);
  let i = 0;
  while (i < lines.length) {
    if (!/^\s*\|/.test(lines[i]!)) { i += 1; continue; }
    const start = i;
    while (i < lines.length && /^\s*\|/.test(lines[i]!)) i += 1;
    let caption = start - 1;
    while (caption >= 0 && !lines[caption]!.trim()) caption -= 1;
    const header = lines[start]!;
    const declared = UNEVIDENCED_MARKERS.test(header) || (caption >= 0 && UNEVIDENCED_MARKERS.test(lines[caption]!));
    if (declared) for (let k = start; k < i; k += 1) out[k] = true;
  }
  return out;
}

/**
 * G24-D: free models shorten a 36-char id to its first block ("[ev:f73c3a4a]").
 * When the prefix (≥ 8 hex chars) names exactly one allowed id, that is the
 * id — rewrite the marker to the full id so the gate, the critic filter and
 * the footnote renderer all resolve it. An ambiguous or unknown prefix is
 * left as written (and stays uncited).
 */
export function expandShortCitations(text: string, allowedIds: Iterable<string>): string {
  const allowed = Array.from(allowedIds);
  if (!allowed.length || !/\[ev:/i.test(text)) return text;
  return text.replace(EV_MARKER_RE, (whole, raw: string) => {
    const id = raw.trim();
    const lower = id.toLowerCase();
    if (allowed.some((a) => a.toLowerCase() === lower)) return whole;
    if (!/^[0-9a-f]{8,}(?:-[0-9a-f]*)*$/i.test(id) || lower.length < 8) return whole;
    const matches = allowed.filter((a) => a.toLowerCase().startsWith(lower));
    if (matches.length === 1) return `[ev:${matches[0]}]`;
    // A full-length id with one or two wrong characters ("…-4f3e-…" for
    // "…-43f4-…") names the one allowed id within Hamming distance 2 — ids are
    // random hex, so a second id that close does not occur.
    if (lower.length >= 32) {
      const near = allowed.filter((a) => a.length === lower.length && hamming(a.toLowerCase(), lower) <= 2);
      if (near.length === 1) return `[ev:${near[0]}]`;
    }
    return whole;
  });
}

/**
 * G24-D: an action-plan line ("[30d] Validate SAM with 10 accounting-firm
 * interviews — owner: CEO", "1. [90d] …") is a target, not a claim about the
 * world — the gate does not count it. Only the window-tagged shape the
 * dispatcher renders qualifies; a sentence that merely recommends something
 * is still checked for the facts it carries.
 */
export const PRESCRIPTIVE_LINE_RE = /^\s*(?:[-*]\s*|\d+\.\s*)?\[(?:\d+\s?d|this_week|30d|60d|90d)\]/i;

/** The dispatcher's risk row: `- **title** (severity) — mitigation`. */
const RISK_LINE_RE = /^\s*[-*]\s*\*\*[^*]+\*\*\s*\((?:low|medium|high|critical)(?:\/[a-z ]+)?\)\s*[—–-]\s*/i;

export function isPrescriptiveClaim(claim: string): boolean {
  if (PRESCRIPTIVE_LINE_RE.test(claim)) return true;
  // A risk row whose numbers sit only in the mitigation ("offer 0.5–1 % equity
  // each") is a plan; a number in the title ("leaves A$50K on the table") is
  // still a claim.
  const risk = RISK_LINE_RE.exec(claim);
  if (risk) {
    const title = claim.slice(0, risk[0].length);
    return !MATERIAL_PATTERNS.some((p) => p.test(title));
  }
  return false;
}

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

/** A specific, checkable assertion — money, percentage, large count, metric, multiple. The citation markers themselves never count (a uuid's "-1076-" block is not a figure). */
export function isMaterialClaim(claim: string): boolean {
  const bare = claim.replace(EV_MARKER_RE, " ").replace(UUID_RE, " ");
  return MATERIAL_PATTERNS.some(p => p.test(bare));
}

function hamming(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < a.length && d <= 2; i += 1) if (a[i] !== b[i]) d += 1;
  return d;
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
