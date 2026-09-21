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
//
// G28-A: the same admission in Vietnamese — the VI contract asks the owner to
// keep the bracket marker in Latin letters ("(unevidenced)") but a VI writer
// also says "chúng tôi ước tính …", "giả định …", "(chưa có bằng chứng)",
// "kịch bản cơ sở / lạc quan / bi quan". Vietnamese letters are not \w, so
// those alternatives are anchored on whitespace / punctuation, never on \b.
// A bold label that names the number as an estimate ("**Premium estimate:**
// ~$1,200–$2,000/year" — the CLO's insurance lines) is the same admission.
export const UNEVIDENCED_MARKERS =
  /\*\*[^*\n]{0,40}\bestimates?\b:?\*\*|[([](?:unevidenced|uncited|no evidence|estimates?|estimated|illustrative|assumptions?|chưa có bằng chứng|chưa được chứng minh|ước tính|giả định|minh họa)\b[^)\]]{0,80}[)\]]|\b(?:not disclosed|not provided|no evidence (?:was )?(?:supplied|provided)|unverified|self-reported|founder-reported|indicative only)\b|\b(?:we|i|our model) (?:estimate|assume|project|model)s?\b|\bassuming\b|\b(?:bear|base|bull)[- ](?:case|scenario)\b|\bhypothetical(?:ly)?\b|\brule of thumb\b|^\s*(?:this|that) (?:implies|suggests|would imply)\b|^\s*\|\s*(?:bear|base|bull)\s*\||(?:^|[\s(*"“])(?:chúng tôi|tôi|mô hình của chúng tôi) (?:ước tính|giả định|dự phóng|dự kiến|mô hình hóa)(?=$|[\s.,;:)])|(?:^|[\s(*"“])giả định rằng(?=$|[\s.,;:)])|(?:^|[\s(*"“])(?:chưa có bằng chứng|chưa được chứng minh|chưa được xác minh|không được công bố)(?=$|[\s.,;:)\]])|(?:^|[\s(*"“|])kịch bản (?:cơ sở|lạc quan|bi quan|xấu|tốt)(?=$|[\s.,;:)|])/i;
// Review G24 P2: bare "scenario", "illustrative" and a mid-sentence "which
// suggests" were stand-alone exemptions — "MRR is A$50K, which suggests early
// PMF" is a fact with an inference attached, not an admission. A sentence
// that STARTS "This implies …" is a derivation from the numbers before it and
// still counts as declared working.

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

/**
 * A target sentence (G24 merge, after the 10:15 verification run): "Define a
 * 90-day retention target of 60 %", "LTV:CAC should target > 3x", "**Action**:
 * post 3x/week", "target 18 months of runway". The sentence must read as
 * advice (an imperative lead or a modal) AND every number in it must sit next
 * to a target cue — a fact hidden in advice ("should note revenue was A$1.2M")
 * has an uncued number and is still checked.
 */
// G28-A: "We recommend 3–5 cornerstone articles …" / "the site needs a content
// pillar strategy: 3–5 articles, each with 2,000+ words" (the 11:34 showcase's
// website residual) are plans too — a "we recommend / suggest / propose" lead
// and a plain "needs" modal count as advice, and inside an advice sentence an
// open-ended "N+" or a range "N–M" is a target cue like "at least".
const ADVICE_LEAD_RE = /^\s*(?:[-*]\s*|\d+\.\s*)?(?:\*\*(?:action|ongoing|next(?: step)?|recommendation|priority|target|by day \d+)[^*]*\*\*\s*:?\s*)?(?:(?:we|i) (?:recommend|suggest|propose)\b|(?:define|set|target|monitor|aim|consider|prioritise|prioritize|hire|offer|launch|run|build|publish|post|reach|convert|secure|raise|recommend|establish|track|commit|allocate|plan|schedule|negotiate|validate|test|pilot|ship|introduce|add)\b)/i;
const ADVICE_MODAL_RE = /\b(?:should|must|needs?(?: to| an?)?|aim(?:s|ing)? to|ought to|target(?:s|ing)?|recommend(?:ed|s)?|goal)\b/i;
const TARGET_CUE_RE = /(?:\btargets?\b|\btargeting\b|\baim(?:s|ing)?\b|\bgoal\b|\bat least\b|\bup to\b|\bno more than\b|\b(?:minimum|maximum) of\b|[≥≤<>]|\bwithin\b|\bper (?:week|month|day)\b|\/\s?week\b|\ba (?:week|month)\b|\bmonths? of runway\b)/i;
/** After a number: "2,000+ words", "3–5 articles"; before a number: the "3–" of "3–5". */
const TARGET_CUE_AFTER_RE = /^\s?(?:\+(?!\d)|[–-]\s?\d)/;
const TARGET_CUE_BEFORE_RE = /\d\s?[–-]\s?$/;
const NUMBER_RE = /(?:A?\$|AUD\s?|USD\s?)?\d[\d,.]*\s?(?:k|m|bn?|x|%|million|billion|thousand|-day|-month|-week)?/gi;

/**
 * Review v3.27.0 P2: a fact embedded in advice ("We recommend the team, which
 * currently serves 1,200–1,500 paying customers, …", "needs a bridge: MRR was
 * A$40–60K") must stay a claim — a sentence that STATES what is / was is never
 * a target, whatever cues sit next to its numbers.
 */
const FACT_INDICATOR_RE = /\b(?:was|were|has been|have been|had|currently|serves?|serving|recorded|reached|generated|grew|declined|stands? at|sits? at|totals? (?:of|to)|amounts? to)\b/i;

export function isTargetSentence(claim: string): boolean {
  const bare = claim.replace(EV_MARKER_RE, " ").replace(UUID_RE, " ");
  if (!ADVICE_LEAD_RE.test(bare) && !ADVICE_MODAL_RE.test(bare)) return false;
  if (FACT_INDICATOR_RE.test(bare)) return false;
  let sawNumber = false;
  for (const m of bare.matchAll(NUMBER_RE)) {
    if (!/\d/.test(m[0])) continue;
    sawNumber = true;
    const before = bare.slice(Math.max(0, m.index! - 30), m.index!);
    const after = bare.slice(m.index! + m[0].length, m.index! + m[0].length + 30);
    if (TARGET_CUE_RE.test(before) || TARGET_CUE_RE.test(after)) continue;
    if (TARGET_CUE_AFTER_RE.test(after) || TARGET_CUE_BEFORE_RE.test(before)) continue;
    return false;
  }
  return sawNumber;
}

export function isPrescriptiveClaim(claim: string): boolean {
  if (PRESCRIPTIVE_LINE_RE.test(claim)) return true;
  if (isTargetSentence(claim)) return true;
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
