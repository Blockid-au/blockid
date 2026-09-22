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
// every material number in the sentence appears in a register row (in the actual source text); it prefers the row whose label the sentence
// names. Nothing else changes: an unmatched number stays uncited and the
// auditor still downgrades it. Ids are never invented — only ids from the
// supplied items are ever written.
//
// Pure and client-safe (no I/O, no model call).

import { expandShortCitations, hasCitationOrMarker, isMaterialClaim, splitClaims } from "./claim-gate";
import { COMPUTED_FACT_IDS } from "./computed-facts";

/** One source-backed evidence-register row (label + value / content). */
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

const NUMBER_RE = /(?<![\w.])(?:[−-]\s*)?(A\$\s*|AUD\s*|US\$\s*|USD\s*|\$\s*)?([−-]?(?:\d[\d,]*(?:\.\d+)?|\.\d+))\s?(%|percent|per cent|pct|bn|billion|million|mn|m|k|thousand|x|×)?(?![\w$])/gi;
const UNIT: Record<string, NumToken["unit"]> = { "%": "%", percent: "%", "per cent": "%", pct: "%", bn: "bn", billion: "bn", million: "m", mn: "m", m: "m", k: "k", thousand: "k", x: "x", "×": "x" };
// G24-D: the computed rows (computed-facts.ts) start with svi / benchmarks / valuation so "+6 points vs the p50 benchmark" can name its row.
// G28-A: "asic" already names the fee row ("ASIC and IP Australia fees: …"); "sector" names the entity-count row.
const SOURCE_WORDS = ["stripe", "xero", "ga4", "github", "linkedin", "abr", "grantconnect", "asic", "abs", "svi", "benchmark", "valuation", "sector"];

/** Every number in a claim with its currency / unit context. Single plain digits and "NN/100" score echoes are ignored. */
export function numericTokens(claim: string): NumToken[] {
  const out: NumToken[] = [];
  for (const m of claim.matchAll(NUMBER_RE)) {
    const currency = Boolean(m[1]);
    const unsignedDigits = m[2]!.replace(/,/g, "").replace(/^[−-]/, "");
    const digits = /^[−-]/.test(m[0]) || /^[−-]/.test(m[2]!) ? `-${unsignedDigits}` : unsignedDigits;
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

const MAGNITUDE: Record<NumToken["unit"], number> = { "": 1, "%": 1, x: 1, k: 1_000, m: 1_000_000, bn: 1_000_000_000 };
type Currency = "AUD" | "USD" | "unspecified" | null;

function currencyOf(prefix: string): Currency {
  prefix = prefix.replace(/^[−-]\s*/, "");
  if (/^(?:A\$|AUD)/i.test(prefix)) return "AUD";
  if (/^(?:US\$|USD)/i.test(prefix)) return "USD";
  return prefix.includes("$") ? "unspecified" : null;
}

/**
 * Compare normalized amounts, never just matching digits. A$310 and A$310M
 * are different evidence, as are AUD and USD. This is numeric compatibility
 * only: the caller still needs metric/entity/period and claim entailment.
 */
export function itemHasNumber(itemText: string, token: NumToken): boolean {
  const expected = Number(token.digits) * MAGNITUDE[token.unit];
  if (!Number.isFinite(expected) || (token.currency && (token.unit === "%" || token.unit === "x"))) return false;
  const expectedCurrency = token.currency ? currencyOf(token.raw) : null;
  const expectedKind = token.currency ? "money" : token.unit === "%" ? "percent" : token.unit === "x" ? "ratio" : "count";
  for (const match of itemText.matchAll(NUMBER_RE)) {
    const unit = match[3] ? (UNIT[match[3].toLowerCase()] ?? "") : "";
    const numeric = Number(match[2]!.replace(/,/g, "").replace(/^[−-]/, ""));
    const negative = /^[−-]/.test(match[0]) || /^[−-]/.test(match[2]!);
    const amount = numeric * (negative ? -1 : 1) * MAGNITUDE[unit];
    if (!Number.isFinite(amount) || Math.abs(amount - expected) > Number.EPSILON * Math.max(1, Math.abs(amount), Math.abs(expected)) * 4) continue;
    const before = itemText.slice(Math.max(0, match.index! - 70), match.index!);
    const after = itemText.slice(match.index! + match[0].length, match.index! + match[0].length + 25);
    // Typed connector keys and explicit suffixes can identify currency. A bare
    // revenue/MRR label, zero subscriptions or an unspecified $ cannot prove AUD.
    const keyCurrency = /(?:^|[_\s])(?:aud|usd)\s*[:=]?\s*$/i.exec(before)?.[0].match(/aud|usd/i)?.[0];
    const suffixCurrency = /^\s*(AUD|USD)\b/i.exec(after)?.[1];
    const currency: Currency = currencyOf(match[1] ?? "") ?? ((keyCurrency ?? suffixCurrency)?.toUpperCase() as "AUD" | "USD" | undefined) ?? null;
    if (currency && (unit === "%" || unit === "x")) continue;
    const percentKey = /(?:pct|percent|percentage)\s*[:=]?\s*$/i.test(before);
    const ratioKey = /(?:ratio|multiple|ltv[_/ ]?cac)\s*[:=]?\s*$/i.test(before);
    const kind = currency ? "money" : unit === "%" || percentKey ? "percent" : unit === "x" || ratioKey ? "ratio" : "count";
    if (kind !== expectedKind) continue;
    if (expectedKind === "money" && currency !== expectedCurrency) continue;
    // Reject date, identifier, decimal and fraction fragments for plain counts.
    if (kind === "count" && (/[\w.\-/:]$/.test(before) || /^[\w\-/:]/.test(after))) continue;
    return true;
  }
  return false;
}

const isDescriptionItem = (item: CitableItem): boolean => /^startup description/i.test(item.label);

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
      // G24-D: on a tie the specific row (founder text, connector, computed) beats the whole-description row.
      .sort((a, b) => Number(b.mentioned) - Number(a.mentioned) || b.gain - a.gain || Number(isDescriptionItem(a.item)) - Number(isDescriptionItem(b.item)) || a.order - b.order)[0];
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
 * quote pairs) must match a source excerpt; they never expand the
 * available evidence beyond the register. Whitespace inside a line is
 * normalised; lines, list markers and table rows are kept.
 */
export function autoCite(text: string, items: CitableItem[], citations: Array<{ evidence_id: string; quote: string }> = [], options: AutoCiteOptions = {}): AutoCiteResult {
  const max = Math.max(1, options.maxIdsPerClaim ?? 2);
  const allowed = new Set(items.map((i) => i.id.toLowerCase()));
  const pool: CitableItem[] = [
    ...items.filter((i) => i.id && i.text),
    // G30/E03: an allowed ID does not authenticate model-authored text.
    // Only accept an excerpt present in the source, and retain the source's
    // full context and topic restriction rather than trusting a quote alone.
    ...citations.flatMap((c) => {
      const quote = c.quote.trim().replace(/\s+/g, " ");
      if (quote.length < 3) return [];
      const source = items.find((i) => i.id.toLowerCase() === c.evidence_id.toLowerCase()
        && i.text.replace(/\s+/g, " ").includes(quote));
      return source ? [source] : [];
    }),
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

/** The SaaS-benchmark knowledge row is cited only by a sentence about a benchmark / band / funnel stage. */
export const SAAS_BENCHMARK_TOPIC_RE = /\b(?:benchmarks?|typical(?:ly)?|rule of thumb|funnel|nrr|net revenue retention|retention|retained|trial|conversion|series [ab]|seed|band|median|world-class)\b/i;

/** G28-A: the ASIC / IP Australia fee row is cited only by a sentence about the annual review, a statutory or filing fee, or a trade mark. */
export const AU_LEGAL_TOPIC_RE = /\b(?:asic|annual (?:review|statement)|trade ?marks?|ip australia|late (?:payment|fee)|statutory|filing fee|registration fee|per class)\b/i;

/** G28-A: the sector entity-count row is cited only by a sentence about the industry's businesses / entities / organisations (or its market). */
export const SECTOR_ENTITIES_TOPIC_RE = /\b(?:entities|organisations|organizations|businesses|firms|companies|accounts|sector|industry|anzsic|abs|tam|sam|som)\b/i;

function withTopic(item: CitableItem): CitableItem {
  if (item.id === COMPUTED_FACT_IDS["au-context"]) return { ...item, topicRe: AU_CONTEXT_TOPIC_RE };
  if (item.id === COMPUTED_FACT_IDS["saas-benchmarks"]) return { ...item, topicRe: SAAS_BENCHMARK_TOPIC_RE };
  if (item.id === COMPUTED_FACT_IDS["au-legal"]) return { ...item, topicRe: AU_LEGAL_TOPIC_RE };
  if (item.id === COMPUTED_FACT_IDS["sector-entities"]) return { ...item, topicRe: SECTOR_ENTITIES_TOPIC_RE };
  return item;
}

/** W1–W3 catalogue entries (label + content) as citable items. */
export function itemsFromCatalogue(entries: Array<{ evidence_id: string; label: string; content: string }>): CitableItem[] {
  return entries.map((e) => withTopic({ id: e.evidence_id, label: e.label, text: `${e.label} — ${e.content}` }));
}

/**
 * G24-D: deterministic module outputs (module-precompute.ts) as citable items —
 * the id is the module id the owner prompt lists ("agents/clo-compliance.ts:calculateComplianceScore"),
 * the text its output flattened to "key = value" pairs so the number matcher sees plain digits.
 */
export function itemsFromModuleOutputs(modules: Array<{ id: string; output: Record<string, unknown> }>): CitableItem[] {
  // A 0–100 number under a pct / rate / score / share key is also spelled as a
  // percentage so "75% complete" matches `score = 75`.
  const pctKey = /(?:pct|percent|rate|share|margin|growth|score|complete)/i;
  const flat = (v: unknown, prefix = ""): string[] => {
    if (v === null || v === undefined) return [];
    if (typeof v !== "object") {
      const pct = typeof v === "number" && v >= 0 && v <= 100 && pctKey.test(prefix) ? ` (${v} %)` : "";
      return [`${prefix} = ${String(v)}${pct}`];
    }
    if (Array.isArray(v)) return v.flatMap((x, i) => flat(x, `${prefix}[${i}]`));
    return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => flat(x, prefix ? `${prefix}.${k}` : k));
  };
  return modules.map((m) => ({ id: m.id, label: `Module: ${m.id}`, text: flat(m.output).join("; ").slice(0, 4000) }));
}
