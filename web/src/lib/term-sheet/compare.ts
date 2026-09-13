/**
 * Term-sheet comparison (S26-B) — pure side-by-side of 2–4 previously
 * analysed sheets.
 *
 * Inputs are the stored `TermSheetAnalysis` objects (lib/term-sheet/schema.ts)
 * plus, optionally, the raw pasted text. The structured `keyTerms` carry
 * valuation / instrument / discount / cap / liquidation preference / board
 * seats / pro-rata / ESOP top-up; the four terms the schema does NOT
 * structure (anti-dilution, drag / tag, founder vesting reset) are
 * EXTRACTED — from the redline clauses, the AU-market deviations and the
 * raw text — by conservative keyword rules, and left `null` ("not stated")
 * when nothing matches. Nothing is ever invented: a missing term scores the
 * neutral midpoint and is listed in `missing`.
 *
 * Matrix rows (12) — each with the per-sheet value, a display string, a
 * 0–1 founder-friendliness sub-score and the `friendliest` sheet index(es):
 *
 *   valuation_pre       higher = friendlier (relative to the best sheet)
 *   valuation_post      informational (relative), weight 0
 *   instrument          SAFE / note (post-money cap) vs priced — informational
 *   discount            lower = friendlier (0 % → 1.0, 30 %+ → 0)
 *   cap                 higher = friendlier (relative to the best sheet)
 *   liq_pref_multiple   1× → 1.0, 1.5× → 0.5, 2×+ → 0
 *   liq_pref_participation  non-participating → 1.0, capped → 0.5, full → 0
 *   anti_dilution       none → 1.0, broad-based weighted average → 0.8,
 *                       narrow-based → 0.4, full ratchet → 0
 *   board_seats         0 → 1.0, 1 → 0.7, 2 → 0.3, 3+ → 0
 *   pro_rata            none → 1.0, with sunset / major-investor only → 0.7,
 *                       unlimited → 0.5 (a normal AU term, mildly dilutive)
 *   drag_tag            drag ≥ 75 % threshold with tag → 1.0, drag 50–74 %
 *                       with tag → 0.6, drag < 50 % or drag without tag →
 *                       0.2, tag only → 0.8
 *   esop_topup          ≤ 5 % → 1.0, 10 % → 0.6, 15 %+ → 0.2 (pre-money
 *                       top-ups dilute founders alone)
 *   founder_vesting_reset  none → 1.0, partial credit / acceleration → 0.5,
 *                       full reset → 0
 *
 * Founder-friendliness score (0–100) = Σ weight × sub-score / Σ weight, with
 *
 *   valuation_pre 20 · liq_pref (multiple 12 + participation 8) 20 ·
 *   anti_dilution 15 · board_seats 10 · founder_vesting_reset 10 ·
 *   drag_tag 8 · esop_topup 7 · pro_rata 5 · discount 3 · cap 2
 *   (valuation_post, instrument weight 0)                      = 100
 *
 * The weights follow what moves founder outcomes most in an AU seed /
 * Series A: price and preference stack first, then dilution protection and
 * control, then the terms founders can usually negotiate around. Weights
 * are exported (`COMPARE_WEIGHTS`) so the UI can print them.
 */

import type { TermSheetAnalysis } from "./schema";

export interface CompareSheetInput {
  id: string;
  /** Company / lead investor / date label for the column header. */
  label: string;
  analysis: TermSheetAnalysis;
  rawText?: string | null;
  createdAt?: string | null;
}

export type CompareRowKey =
  | "valuation_pre"
  | "valuation_post"
  | "instrument"
  | "discount"
  | "cap"
  | "liq_pref_multiple"
  | "liq_pref_participation"
  | "anti_dilution"
  | "board_seats"
  | "pro_rata"
  | "drag_tag"
  | "esop_topup"
  | "founder_vesting_reset";

export const COMPARE_WEIGHTS: Record<CompareRowKey, number> = {
  valuation_pre: 20,
  valuation_post: 0,
  instrument: 0,
  discount: 3,
  cap: 2,
  liq_pref_multiple: 12,
  liq_pref_participation: 8,
  anti_dilution: 15,
  board_seats: 10,
  pro_rata: 5,
  drag_tag: 8,
  esop_topup: 7,
  founder_vesting_reset: 10,
};

export const COMPARE_ROW_LABELS: Record<CompareRowKey, string> = {
  valuation_pre: "Pre-money valuation",
  valuation_post: "Post-money valuation",
  instrument: "Instrument",
  discount: "Discount",
  cap: "Valuation cap",
  liq_pref_multiple: "Liquidation preference (multiple)",
  liq_pref_participation: "Liquidation preference (participation)",
  anti_dilution: "Anti-dilution",
  board_seats: "Investor board seats",
  pro_rata: "Pro-rata rights",
  drag_tag: "Drag-along / tag-along",
  esop_topup: "ESOP top-up (post-money)",
  founder_vesting_reset: "Founder vesting reset",
};

export type AntiDilution = "none" | "broad_weighted_average" | "narrow_weighted_average" | "full_ratchet";
export type Participation = "non_participating" | "capped_participating" | "full_participating";
export type ProRata = "none" | "limited" | "full";
export type VestingReset = "none" | "partial" | "full";

export interface DragTag {
  drag: boolean;
  dragThresholdPct: number | null;
  tag: boolean;
}

export interface ExtractedTerms {
  preMoneyAud: number | null;
  postMoneyAud: number | null;
  instrument: TermSheetAnalysis["instrumentType"];
  discountPct: number | null;
  capAud: number | null;
  liqPrefMultiple: number | null;
  participation: Participation | null;
  antiDilution: AntiDilution | null;
  boardSeats: number | null;
  proRata: ProRata | null;
  dragTag: DragTag | null;
  esopTopUpPct: number | null;
  vestingReset: VestingReset | null;
}

export interface CompareCell {
  sheetId: string;
  /** Raw extracted value (null = not stated). */
  value: unknown;
  display: string;
  /** 0–1 founder-friendliness sub-score; null when not stated (neutral 0.5 is used in the total). */
  score: number | null;
  founderFriendlier: boolean;
}

export interface CompareRow {
  key: CompareRowKey;
  label: string;
  weight: number;
  cells: CompareCell[];
  /** False when fewer than two sheets state the term. */
  comparable: boolean;
}

export interface CompareSheetScore {
  sheetId: string;
  label: string;
  /** 0–100 weighted founder-friendliness. */
  score: number;
  /** Row keys the sheet did not state (scored neutral). */
  missing: CompareRowKey[];
  /** Rows where this sheet is (joint) friendliest. */
  wins: CompareRowKey[];
}

export interface TermSheetComparison {
  version: "tsc-v1";
  sheets: Array<{ id: string; label: string; createdAt: string | null; instrument: string }>;
  rows: CompareRow[];
  scores: CompareSheetScore[];
  /** Sheet id with the highest score (ties → first in input order). */
  friendliestSheetId: string;
  weights: Record<CompareRowKey, number>;
  /** Plain-English lines the UI / print view shows under the table. */
  notes: string[];
}

export const MIN_SHEETS = 2;
export const MAX_SHEETS = 4;

/* ── Extraction ───────────────────────────────────────────────────────── */

function textPool(input: CompareSheetInput): string {
  const a = input.analysis;
  const parts: string[] = [];
  for (const r of a.redline ?? []) parts.push(r.clause, r.issue, r.suggestedRevision);
  for (const d of a.auMarketComparison?.deviations ?? []) parts.push(d.term, d.yourTerm);
  for (const f of a.riskFlags ?? []) parts.push(f.flag, f.why);
  parts.push(a.plainEnglishSummary ?? "");
  parts.push(a.keyTerms?.liquidationPreference ?? "");
  if (input.rawText) parts.push(input.rawText);
  return parts.filter(Boolean).join("\n").toLowerCase();
}

function finite(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** "1x non-participating" / "2× participating capped at 3x" → multiple + participation. */
export function parseLiquidationPreference(text: string | null | undefined): { multiple: number | null; participation: Participation | null } {
  if (!text) return { multiple: null, participation: null };
  const t = text.toLowerCase();
  const m = /(\d+(?:\.\d+)?)\s*[x×]/.exec(t);
  const multiple = m ? Number(m[1]) : /\bone\s*times?\b|\b1\s*times?\b/.test(t) ? 1 : null;
  let participation: Participation | null = null;
  if (/non[-\s]?participat/.test(t)) participation = "non_participating";
  else if (/participat/.test(t)) participation = /capped|cap of|up to/.test(t) ? "capped_participating" : "full_participating";
  return { multiple, participation };
}

export function extractAntiDilution(pool: string): AntiDilution | null {
  if (/full[-\s]?ratchet/.test(pool)) return "full_ratchet";
  if (/narrow[-\s]?based/.test(pool)) return "narrow_weighted_average";
  if (/broad[-\s]?based|weighted[-\s]?average/.test(pool)) return "broad_weighted_average";
  if (/no anti[-\s]?dilution|without anti[-\s]?dilution|anti[-\s]?dilution[^.]{0,40}(not apply|none|waived)/.test(pool)) return "none";
  return null;
}

export function extractDragTag(pool: string): DragTag | null {
  const dragMentioned = /drag[-\s]?along/.test(pool);
  const tagMentioned = /tag[-\s]?along|co[-\s]?sale/.test(pool);
  if (!dragMentioned && !tagMentioned) return null;
  // "No tag-along" / "without drag-along" negate the mention.
  const drag = dragMentioned && !/\b(no|without( a| any)?)\s+drag[-\s]?along/.test(pool);
  const tag = tagMentioned && !/\b(no|without( a| any)?)\s+(tag[-\s]?along|co[-\s]?sale)/.test(pool);
  let threshold: number | null = null;
  if (drag) {
    const m = /drag[-\s]?along[^.%]{0,120}?(\d{2,3})\s*%/.exec(pool) ?? /(\d{2,3})\s*%[^.]{0,80}?drag[-\s]?along/.exec(pool);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 100) threshold = n;
    }
  }
  return { drag, dragThresholdPct: threshold, tag };
}

export function extractVestingReset(pool: string): VestingReset | null {
  const mentions = /(founder|management)[^.]{0,60}(vesting|re-?vest)|(vesting|re-?vest)[^.]{0,60}(founder|reset|restart)/.test(pool) || /re-?vest/.test(pool);
  if (!mentions) return null;
  if (/no (founder )?vesting reset|\bno reset\b|vesting (will |shall )?not (be )?reset|existing vesting (is )?(honoured|honored|preserved|credited)|full credit/.test(pool)) return "none";
  // An explicit reset statement outranks a stray "acceleration" elsewhere in the analysis.
  if (/(will|shall|to) (be )?(reset|restart)|reset (at|on|upon) (closing|completion|conversion)|re-?vest(ed|ing)? (over|from)|new (4|four)[-\s]year/.test(pool)) return "full";
  if (/partial credit|credit for (time|service)|acceleration|accelerat/.test(pool)) return "partial";
  if (/reset|restart|re-?vest/.test(pool)) return "full";
  return null;
}

export function extractProRata(analysis: TermSheetAnalysis, pool: string): ProRata | null {
  const flag = analysis.keyTerms?.proRataRights;
  if (flag === false) return "none";
  if (flag === true) return /sunset|major investor|expires|until the|for the next round only|one round/.test(pool) ? "limited" : "full";
  if (/pro[-\s]?rata/.test(pool)) return /sunset|major investor|expires/.test(pool) ? "limited" : "full";
  return null;
}

export function extractTerms(input: CompareSheetInput): ExtractedTerms {
  const a = input.analysis;
  const k = a.keyTerms ?? ({} as TermSheetAnalysis["keyTerms"]);
  const pool = textPool(input);
  const lp = parseLiquidationPreference(k.liquidationPreference);
  return {
    preMoneyAud: finite(k.preMoneyAud),
    postMoneyAud: finite(k.postMoneyAud) ?? (finite(k.preMoneyAud) != null && finite(k.investorAmountAud) != null ? (k.preMoneyAud as number) + (k.investorAmountAud as number) : null),
    instrument: a.instrumentType ?? "Other",
    discountPct: finite(k.discountPct),
    capAud: finite(k.valuationCapAud),
    liqPrefMultiple: lp.multiple,
    participation: lp.participation,
    antiDilution: extractAntiDilution(pool),
    boardSeats: finite(k.boardSeatsToInvestor),
    proRata: extractProRata(a, pool),
    dragTag: extractDragTag(pool),
    esopTopUpPct: finite(k.optionPoolPostMoneyPct),
    vestingReset: extractVestingReset(pool),
  };
}

/* ── Scoring ──────────────────────────────────────────────────────────── */

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function fmtAud(v: number): string {
  if (v >= 1_000_000) return `A$${(v / 1_000_000).toFixed(v % 1_000_000 === 0 ? 0 : 1)}M`;
  if (v >= 1_000) return `A$${Math.round(v / 1_000)}K`;
  return `A$${Math.round(v)}`;
}

const NOT_STATED = "not stated";

type Scorer = (t: ExtractedTerms, all: ExtractedTerms[]) => { value: unknown; display: string; score: number | null };

const SCORERS: Record<CompareRowKey, Scorer> = {
  valuation_pre: (t, all) => {
    const v = t.preMoneyAud;
    if (v == null) return { value: null, display: NOT_STATED, score: null };
    const best = Math.max(...all.map((x) => x.preMoneyAud ?? 0));
    return { value: v, display: fmtAud(v), score: best > 0 ? clamp01(v / best) : null };
  },
  valuation_post: (t, all) => {
    const v = t.postMoneyAud;
    if (v == null) return { value: null, display: NOT_STATED, score: null };
    const best = Math.max(...all.map((x) => x.postMoneyAud ?? 0));
    return { value: v, display: fmtAud(v), score: best > 0 ? clamp01(v / best) : null };
  },
  instrument: (t) => ({ value: t.instrument, display: t.instrument, score: null }),
  discount: (t) => {
    const v = t.discountPct;
    if (v == null) return { value: null, display: NOT_STATED, score: null };
    return { value: v, display: `${v}%`, score: clamp01(1 - v / 30) };
  },
  cap: (t, all) => {
    const v = t.capAud;
    if (v == null) return { value: null, display: NOT_STATED, score: null };
    const best = Math.max(...all.map((x) => x.capAud ?? 0));
    return { value: v, display: fmtAud(v), score: best > 0 ? clamp01(v / best) : null };
  },
  liq_pref_multiple: (t) => {
    const v = t.liqPrefMultiple;
    if (v == null) return { value: null, display: NOT_STATED, score: null };
    return { value: v, display: `${v}×`, score: v <= 1 ? 1 : v >= 2 ? 0 : clamp01(1 - (v - 1)) };
  },
  liq_pref_participation: (t) => {
    const v = t.participation;
    if (!v) return { value: null, display: NOT_STATED, score: null };
    const map: Record<Participation, [string, number]> = { non_participating: ["non-participating", 1], capped_participating: ["participating (capped)", 0.5], full_participating: ["fully participating", 0] };
    return { value: v, display: map[v][0], score: map[v][1] };
  },
  anti_dilution: (t) => {
    const v = t.antiDilution;
    if (!v) return { value: null, display: NOT_STATED, score: null };
    const map: Record<AntiDilution, [string, number]> = { none: ["none", 1], broad_weighted_average: ["broad-based weighted average", 0.8], narrow_weighted_average: ["narrow-based weighted average", 0.4], full_ratchet: ["full ratchet", 0] };
    return { value: v, display: map[v][0], score: map[v][1] };
  },
  board_seats: (t) => {
    const v = t.boardSeats;
    if (v == null) return { value: null, display: NOT_STATED, score: null };
    return { value: v, display: `${v}`, score: v <= 0 ? 1 : v === 1 ? 0.7 : v === 2 ? 0.3 : 0 };
  },
  pro_rata: (t) => {
    const v = t.proRata;
    if (!v) return { value: null, display: NOT_STATED, score: null };
    const map: Record<ProRata, [string, number]> = { none: ["none", 1], limited: ["limited (sunset / major investors)", 0.7], full: ["yes (unlimited)", 0.5] };
    return { value: v, display: map[v][0], score: map[v][1] };
  },
  drag_tag: (t) => {
    const v = t.dragTag;
    if (!v) return { value: null, display: NOT_STATED, score: null };
    const th = v.dragThresholdPct;
    const display = `${v.drag ? `drag${th != null ? ` ≥ ${th}%` : ""}` : "no drag"} / ${v.tag ? "tag" : "no tag"}`;
    let score: number;
    if (!v.drag) score = 0.8;
    else if (!v.tag) score = 0.2;
    else if (th == null) score = 0.6;
    else if (th >= 75) score = 1;
    else if (th >= 50) score = 0.6;
    else score = 0.2;
    return { value: v, display, score };
  },
  esop_topup: (t) => {
    const v = t.esopTopUpPct;
    if (v == null) return { value: null, display: NOT_STATED, score: null };
    return { value: v, display: `${v}%`, score: v <= 5 ? 1 : v >= 15 ? 0.2 : clamp01(1 - ((v - 5) / 10) * 0.8) };
  },
  founder_vesting_reset: (t) => {
    const v = t.vestingReset;
    if (!v) return { value: null, display: NOT_STATED, score: null };
    const map: Record<VestingReset, [string, number]> = { none: ["none (existing vesting honoured)", 1], partial: ["partial (credit / acceleration)", 0.5], full: ["full reset", 0] };
    return { value: v, display: map[v][0], score: map[v][1] };
  },
};

export const COMPARE_ROW_ORDER: CompareRowKey[] = [
  "valuation_pre",
  "valuation_post",
  "instrument",
  "discount",
  "cap",
  "liq_pref_multiple",
  "liq_pref_participation",
  "anti_dilution",
  "board_seats",
  "pro_rata",
  "drag_tag",
  "esop_topup",
  "founder_vesting_reset",
];

export function compareTermSheets(inputs: CompareSheetInput[]): TermSheetComparison {
  if (!Array.isArray(inputs) || inputs.length < MIN_SHEETS || inputs.length > MAX_SHEETS) {
    throw new RangeError(`compareTermSheets needs ${MIN_SHEETS}–${MAX_SHEETS} sheets`);
  }
  const terms = inputs.map(extractTerms);
  const rows: CompareRow[] = [];
  const totals = inputs.map(() => ({ weighted: 0, weight: 0, missing: [] as CompareRowKey[], wins: [] as CompareRowKey[] }));

  for (const key of COMPARE_ROW_ORDER) {
    const weight = COMPARE_WEIGHTS[key];
    const scored = terms.map((t) => SCORERS[key](t, terms));
    const stated = scored.filter((s) => s.score != null).length;
    const best = stated > 0 ? Math.max(...scored.map((s) => s.score ?? -1)) : null;
    const comparable = stated >= 2;
    const cells: CompareCell[] = scored.map((s, i) => {
      const friendlier = comparable && s.score != null && best != null && s.score >= best - 1e-9 && scored.some((o, j) => j !== i && (o.score ?? -1) < s.score! - 1e-9);
      if (weight > 0) {
        const sub = s.score ?? 0.5;
        totals[i].weighted += weight * sub;
        totals[i].weight += weight;
        if (s.score == null) totals[i].missing.push(key);
      }
      if (friendlier) totals[i].wins.push(key);
      return { sheetId: inputs[i].id, value: s.value, display: s.display, score: s.score, founderFriendlier: friendlier };
    });
    rows.push({ key, label: COMPARE_ROW_LABELS[key], weight, cells, comparable });
  }

  const scores: CompareSheetScore[] = inputs.map((s, i) => ({
    sheetId: s.id,
    label: s.label,
    score: totals[i].weight > 0 ? Math.round((totals[i].weighted / totals[i].weight) * 100) : 50,
    missing: totals[i].missing,
    wins: totals[i].wins,
  }));
  let friendliest = scores[0];
  for (const sc of scores) if (sc.score > friendliest.score) friendliest = sc;

  const notes: string[] = [
    `Founder-friendliness weights: ${COMPARE_ROW_ORDER.filter((k) => COMPARE_WEIGHTS[k] > 0).map((k) => `${COMPARE_ROW_LABELS[k]} ${COMPARE_WEIGHTS[k]}`).join(" · ")} (total 100). A term a sheet does not state scores the neutral midpoint and is listed under "not stated".`,
    "Anti-dilution, drag / tag and founder vesting terms are read from the analysed clauses and the pasted text by keyword — confirm them against the sheet before relying on the row.",
    "General information only — not legal or financial advice. Have an Australian startup lawyer review any sheet before you sign.",
  ];
  const anyMissing = scores.filter((s) => s.missing.length > 0);
  if (anyMissing.length > 0) notes.unshift(`${anyMissing.map((s) => `${s.label}: ${s.missing.length} term${s.missing.length === 1 ? "" : "s"} not stated`).join("; ")}.`);

  return {
    version: "tsc-v1",
    sheets: inputs.map((s, i) => ({ id: s.id, label: s.label, createdAt: s.createdAt ?? null, instrument: terms[i].instrument })),
    rows,
    scores,
    friendliestSheetId: friendliest.sheetId,
    weights: COMPARE_WEIGHTS,
    notes,
  };
}

/** "Acme Pty Ltd (Blackbird) · 3 Sep 2026" — column header from the stored row. */
export function sheetLabel(row: { company_name?: string | null; created_at?: string | null; analysis?: TermSheetAnalysis | null }, fallback: string): string {
  const lead = row.analysis?.keyTerms?.leadInvestorName ?? null;
  const name = row.company_name?.trim() || fallback;
  const when = row.created_at ? new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" }).format(new Date(row.created_at)) : null;
  return `${name}${lead ? ` (${lead})` : ""}${when ? ` · ${when}` : ""}`;
}
