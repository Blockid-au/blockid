// auto-cite — G23-A fix (a): map the obvious references a dimension owner
// left uncited to the evidence-register row they point at.
//
// The §5.4 gate (llm-auditor findUncitedClaims) flags every MATERIAL claim —
// money, percentage, large count, metric, multiple — that carries neither an
// `[ev:<id>]` citation nor an explicit unevidenced marker. On the BlockID
// showcase run (2026-09-20, groundedShare 0.41) most flagged sentences quoted
// a number that IS in the register the model was given ("3,302 weekly
// snapshots", "A$3 report", "0 active subscriptions") — the owner simply
// omitted the 36-character id. This pass adds the id when, and only when,
// every material number in the sentence appears in a register row (or in a
// quote the model itself cited); it prefers the row whose label the sentence
// names. Nothing else changes: an unmatched number stays uncited and the
// auditor still downgrades it. Ids are never invented — only ids from the
// supplied items are ever written.
//
// Pure and client-safe (no I/O, no model call).

import { expandShortCitations, hasCitationOrMarker, isMaterialClaim, splitClaims } from "./claim-gate";
import { COMPUTED_FACT_IDS } from "./computed-facts";

/** One citable thing: an evidence-register row (label + value / content) or a model-cited quote. */
export interface CitableItem {
  id: string;
  label: string;
  text: string;
  /** G24-D: when set, the row is chosen only for a claim that names its topic — the AU-context knowledge row (R&DTI / ESIC / GST rates) must not back "20% growth". */
  topicRe?: RegExp;
}

export interface AutoCiteResult {
  text: string;
  /** Claims that received a citation from this pass. */
  added: number;
  /** Material claims seen (cited before, cited now, or still uncited). */
  material: number;
  /** Material claims still carrying no citation or marker after the pass. */
  uncited: number;
}

export interface AutoCiteOptions {
  /** At most this many ids appended to one claim (default 2). */
  maxIdsPerClaim?: number;
}

export interface NumToken {
  raw: string;
  /** Comma-stripped digits, e.g. "3302", "1.2". */
  digits: string;
  currency: boolean;
  unit: "" | "%" | "k" | "m" | "bn" | "x";
  strong: boolean;
}

const NUMBER_RE = /(A\$|AUD\s?|US\$|USD\s?|\$)?(\d[\d,]*(?:\.\d+)?)\s?(%|percent|per cent|bn|billion|million|mn|m|k|thousand|x|×)?(?![\w$])/gi;
const UNIT: Record<string, NumToken["unit"]> = { "%": "%", percent: "%", "per cent": "%", bn: "bn", billion: "bn", million: "m", mn: "m", m: "m", k: "k", thousand: "k", x: "x", "×": "x" };
// G24-D: the computed rows (computed-facts.ts) start with svi / benchmarks / valuation so "+6 points vs the p50 benchmark" can name its row.
const SOURCE_WORDS = ["stripe", "xero", "ga4", "github", "linkedin", "abr", "grantconnect", "asic", "abs", "svi", "benchmark", "valuation"];

/** Every number in a claim with its currency / unit context. Single plain digits and "NN/100" score echoes are ignored. */
export function numericTokens(claim: string): NumToken[] {
  const out: NumToken[] = [];
  for (const m of claim.matchAll(NUMBER_RE)) {
    const currency = Boolean(m[1]);
    const digits = m[2]!.replace(/,/g, "");
    const unit = m[3] ? (UNIT[m[3].toLowerCase()] ?? "") : "";
    const strong = currency || unit !== "" || digits.replace(/\D/g, "").length >= 4;
    if (!strong && digits.replace(/\D/g, "").length < 2) continue;
    const after = claim.slice(m.index! + m[0].length, m.index! + m[0].length + 5);
    const before = claim.slice(Math.max(0, m.index! - 2), m.index!);
    if (!strong && /^\s?\/\s?100/.test(after)) continue;
    if (/\/\s?$/.test(before)) continue; // the denominator of "44/100"
    out.push({ raw: m[0], digits, currency, unit, strong });
  }
  return out;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function scaled(digits: string, factor: number): string | null {
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  const v = n * factor;
  return Number.isInteger(v) ? String(v) : null;
}

/** Normalise register text: thousands separators dropped, lower-cased, "per cent" → "%". */
function normaliseItemText(text: string): string {
  return text.replace(/(\d),(?=\d{3}\b)/g, "$1").replace(/per cent/gi, "%").toLowerCase();
}

/** True when the register text carries this number in a compatible form (bounded, unit-aware). */
export function itemHasNumber(itemText: string, token: NumToken): boolean {
  const t = normaliseItemText(itemText);
  const forms = new Set<string>([token.digits]);
  if (token.unit === "k") { const s = scaled(token.digits, 1000); if (s) forms.add(s); }
  if (token.unit === "m") { const s = scaled(token.digits, 1_000_000); if (s) forms.add(s); }
  if (token.unit === "bn") { const s = scaled(token.digits, 1_000_000_000); if (s) forms.add(s); }
  if (token.unit === "" && /^\d+$/.test(token.digits) && Number(token.digits) >= 1000 && Number(token.digits) % 1000 === 0) forms.add(`${Number(token.digits) / 1000}k`);
  const bounded = (d: string) => new RegExp(`(?<![\\d.])${esc(d)}(?![\\d])`);
  for (const d of forms) {
    if (token.currency) {
      // G24-D: "A$0 ARR" / "A$0 MRR" is what a pre-revenue row says — "0 active subscriptions", "0 MRR", "pre-revenue".
      if (d === "0" && /\bpre-revenue\b|\b0 (?:mrr|arr|revenue|active subscriptions|subscriptions|paying customers)\b/.test(t)) return true;
      if (new RegExp(`(?:a\\$|aud\\s?|us\\$|usd\\s?|\\$)\\s?${esc(d)}(?![\\d])`).test(t)) return true;
      if (new RegExp(`(?<![\\d.])${esc(d)}\\s?(?:aud|usd|dollars|k\\b|m\\b)`).test(t)) return true;
      if (new RegExp(`(?:aud|usd|revenue|mrr|arr|price|cost|fee|charge)[^\\d]{0,12}${esc(d)}(?![\\d])`).test(t)) return true;
      // Never a bare digit match for money (review G23 P1): "A$1,200 million"
      // must not cite a row that only says "1200 sessions".
      continue;
    }
    if (token.unit === "%") {
      if (new RegExp(`(?<![\\d.])${esc(d)}\\s?(?:%|pct|percent)`).test(t)) return true;
      if (new RegExp(`(?:%|pct|percent|rate|margin|churn|growth|share)[^\\d]{0,12}${esc(d)}(?![\\d])`).test(t)) return true;
      continue;
    }
    if (token.unit === "x") {
      if (new RegExp(`(?<![\\d.])${esc(d)}\\s?[x×]`).test(t)) return true;
      if (new RegExp(`(?:ratio|multiple|coverage|ltv[_/ ]?cac)[^\\d]{0,12}${esc(d)}(?![\\d])`).test(t)) return true;
      continue;
    }
    // A plain 2–3 digit number must not be a date / ratio fragment ("2026-09-13", "4/100").
    if (token.strong ? bounded(d).test(t) : new RegExp(`(?<![\\d.\\-/:])${esc(d)}(?![\\d\\-/:])`).test(t)) return true;
  }
  return false;
}

function labelMentioned(claim: string, label: string): boolean {
  const c = claim.toLowerCase();
  const l = label.toLowerCase().replace(/^(founder evidence|uploaded file|link|criterion input):\s*/i, "").trim();
  if (l.length >= 8 && c.includes(l)) return true;
  // Singular stem: the "Benchmarks: …" row is named by "benchmark" as much as by "benchmarks".
  const raw = l.split(/[^a-z0-9]+/)[0] ?? "";
  const first = SOURCE_WORDS.includes(raw) ? raw : raw.replace(/s$/, "");
  return SOURCE_WORDS.includes(first) && new RegExp(`\\b${esc(first)}s?\\b`).test(c);
}

/** Insert citation markers before the terminal punctuation (so the sentence splitter keeps them in the claim). */
function appendMarkers(claim: string, ids: string[]): string {
  const markers = ids.map((id) => `[ev:${id}]`).join(" ");
  const m = /([.!?]["’”)\]]*)(\s*\|?)\s*$/.exec(claim);
  if (m && m.index > 0) return `${claim.slice(0, m.index).trimEnd()} ${markers}${m[1]}${m[2] ?? ""}`;
  const pipe = /\s*\|\s*$/.exec(claim);
  if (pipe && pipe.index > 0) return `${claim.slice(0, pipe.index).trimEnd()} ${markers} |`;
  return `${claim.trimEnd()} ${markers}`;
}

/** Pick ≤ `max` items that together cover every needed token; null when they cannot. */
function chooseItems(claim: string, need: NumToken[], items: CitableItem[], max: number): CitableItem[] | null {
  const coverage = items
    .filter((item) => !item.topicRe || item.topicRe.test(claim))
    .map((item, order) => ({ item, order, covered: need.filter((tok) => itemHasNumber(item.text, tok)), mentioned: labelMentioned(claim, item.label) }));
  // A claim whose only numbers are weak (2–3 plain digits) is cited only
  // when the sentence names the row's source (review G23 P1) — "38 signups"
  // alone must not attach the first row that happens to contain 38.
  const weakOnly = need.every((tok) => !tok.strong);
  const chosen: CitableItem[] = [];
  let remaining = [...need];
  while (remaining.length && chosen.length < max) {
    const best = coverage
      .filter((c) => !chosen.includes(c.item))
      .map((c) => ({ ...c, gain: c.covered.filter((tok) => remaining.includes(tok)).length }))
      .filter((c) => c.gain > 0 && (!weakOnly || c.mentioned))
      .sort((a, b) => Number(b.mentioned) - Number(a.mentioned) || b.gain - a.gain || a.order - b.order)[0];
    if (!best) return null;
    chosen.push(best.item);
    remaining = remaining.filter((tok) => !best.covered.includes(tok));
  }
  return remaining.length ? null : chosen;
}

/** Which ids one claim should cite, or null when its numbers are not all in the register. Exported for tests. */
export function idsForClaim(claim: string, items: CitableItem[], max = 2): string[] | null {
  const tokens = numericTokens(claim);
  const strong = tokens.filter((t) => t.strong);
  const need = strong.length ? strong : tokens;
  if (!need.length) return null;
  const chosen = chooseItems(claim, need, items, max);
  return chosen ? chosen.map((c) => c.id) : null;
}

/**
 * Add `[ev:<id>]` to every material claim in `text` whose numbers all appear
 * in the citable items. `citations` (the model’s own evidence_id + verbatim
 * quote pairs, already filtered to allowed ids) are searched after the
 * register rows so a real row wins a tie. Whitespace inside a line is
 * normalised; lines, list markers and table rows are kept.
 */
export function autoCite(text: string, items: CitableItem[], citations: Array<{ evidence_id: string; quote: string }> = [], options: AutoCiteOptions = {}): AutoCiteResult {
  const max = Math.max(1, options.maxIdsPerClaim ?? 2);
  const allowed = new Set(items.map((i) => i.id.toLowerCase()));
  const pool: CitableItem[] = [
    ...items.filter((i) => i.id && i.text),
    ...citations.filter((c) => allowed.has(c.evidence_id.toLowerCase()) && c.quote.trim().length >= 3).map((c) => ({ id: c.evidence_id, label: "quote", text: c.quote })),
  ];
  let added = 0;
  let material = 0;
  let uncited = 0;
  if (!text.trim()) return { text, added, material, uncited };
  // G24-D: "[ev:f73c3a4a]" (a free model's shortened id) → the one allowed id it names, before anything is counted.
  const lines = expandShortCitations(text, items.map((i) => i.id)).split("\n").map((line) => {
    if (!line.trim() || line.trim().startsWith("<!--") || line.trim().startsWith("```")) return line;
    const indent = /^\s*/.exec(line)?.[0] ?? "";
    const units = splitClaims(line);
    if (!units.length) return line;
    const out = units.map((unit) => {
      if (!isMaterialClaim(unit)) return unit;
      material += 1;
      if (hasCitationOrMarker(unit, allowed)) return unit;
      const ids = pool.length ? idsForClaim(unit, pool, max) : null;
      if (!ids) {
        uncited += 1;
        return unit;
      }
      added += 1;
      return appendMarkers(unit, ids);
    });
    return `${indent}${out.join(" ")}`;
  });
  return { text: lines.join("\n"), added, material, uncited };
}

/** Evidence rows (W4 / appendix shape) as citable items: label + value. */
export function itemsFromEvidenceRows(rows: Array<{ evidence_id: string; label: string; value?: string | null }>): CitableItem[] {
  return rows.map((r) => withTopic({ id: r.evidence_id, label: r.label, text: [r.label, r.value ?? ""].filter(Boolean).join(" — ") }));
}

/** The AU-context knowledge row is cited only by a sentence about tax / R&D / ESIC / GST. */
export const AU_CONTEXT_TOPIC_RE = /\b(?:r&d|r&dti|esic|gst|tax|offset|incentive)\b/i;

function withTopic(item: CitableItem): CitableItem {
  return item.id === COMPUTED_FACT_IDS["au-context"] ? { ...item, topicRe: AU_CONTEXT_TOPIC_RE } : item;
}

/** W1–W3 catalogue entries (label + content) as citable items. */
export function itemsFromCatalogue(entries: Array<{ evidence_id: string; label: string; content: string }>): CitableItem[] {
  return entries.map((e) => withTopic({ id: e.evidence_id, label: e.label, text: `${e.label} — ${e.content}` }));
}
