// Financial figures from the founder's own words — revenue, the ask, a
// stated valuation cap, and paid pilots.
//
// One parser, shared by `extractSignals` (stage + revenue band), the input
// echo ("what we read"), and the first-analysis valuation section, so the
// three can never disagree about which number the founder gave.
//
// Live evidence 2026-09-15 (analysis bc9de1ac-…): the text said
// "Revenue: A$36,000 in the last 6 months … raising A$1.2M seed on a SAFE at
// A$6M cap" and the report answered "No revenue figure was provided", priced
// the company at A$29.7M–55.1M and never mentioned the cap. Every pattern
// below is pinned by a test with that sentence or a Vietnamese variant.
//
// Rules:
//   * a figure is only ever read, never inferred — "we have revenue" with no
//     number returns null;
//   * a period revenue ("A$36,000 in the last 6 months") becomes MRR =
//     amount / months, ARR = MRR × 12, and says so in `kind`;
//   * a bare revenue figure with no period is treated as the trailing
//     12 months (the conservative reading) and flagged `unspecified`;
//   * "2 paid pilots (A$18,000 each)" is traction, not recurring revenue —
//     it is returned separately and excluded from the revenue candidates.
//
// Pure and client-safe: no `server-only`, no I/O.

export interface MoneyHit {
  amountAud: number;
  /** The exact phrase the figure was read from. */
  quote: string;
}

export type RevenueKind = "mrr" | "arr" | "period" | "unspecified";

export interface RevenueFigure {
  mrrAud: number;
  arrAud: number;
  /** How the figure was stated: monthly, annual, over N months, or bare. */
  kind: RevenueKind;
  /** Months the stated amount covers when `kind` is `period`. */
  periodMonths?: number;
  quote: string;
}

export type CapKind = "cap" | "pre_money" | "post_money" | "valuation";

export interface CapFigure extends MoneyHit {
  kind: CapKind;
}

export interface PilotFigure {
  count?: number;
  amountEachAud: number;
  quote: string;
}

export interface FinancialFigures {
  revenue: RevenueFigure | null;
  ask: MoneyHit | null;
  cap: CapFigure | null;
  pilots: PilotFigure | null;
}

// ─── Money ────────────────────────────────────────────────────────────────

// Currency before the number: A$ / AU$ / AUD / US$ / $.
const CUR_PRE = String.raw`(?:A\$|AU\$|AUD\s?|US\$|\$)`;
// Currency after the number: "36,000 AUD", "6 triệu đô", "1.2 million dollars".
const CUR_POST = String.raw`(?:AUD|A\$|đô(?:\s?la)?(?:\s?úc)?|dollars?)`;
// Digits with , or . separators (36,000 / 36.000 / 1.2 / 1,2).
const NUM = String.raw`\d+(?:[.,]\d+)*`;
// Scale words, English and Vietnamese. Bounded so "6 months" is not "6m".
const UNIT = String.raw`(?:k|mm|m|bn|b|million|thousand|billion|triệu|trieu|nghìn|ngàn|nghin|ngan|tỷ|tỉ|ty|ti)(?![a-zà-ỹ])`;

/**
 * An amount with a currency mark, a scale word, or both. A bare "6" is never
 * money; "6 triệu" and "$6" are. Five capture groups — (num, unit) for the
 * currency-first and unit-only shapes, (num) for currency-after.
 */
const AMOUNT = String.raw`(?:${CUR_PRE}\s?(${NUM})\s?(${UNIT})?(?:\s?${CUR_POST})?|(${NUM})\s?(${UNIT})\s?(?:${CUR_POST})?|(${NUM})\s?${CUR_POST})`;
// AMOUNT contributes five capture groups: (num, unit) | (num, unit) | (num).
const AMOUNT_GROUPS = 5;

function unitScale(unit: string | undefined): number {
  const u = (unit ?? "").toLowerCase();
  if (!u) return 1;
  if (["k", "thousand", "nghìn", "ngàn", "nghin", "ngan"].includes(u)) return 1_000;
  if (["m", "mm", "million", "triệu", "trieu"].includes(u)) return 1_000_000;
  if (["b", "bn", "billion", "tỷ", "tỉ", "ty", "ti"].includes(u)) return 1_000_000_000;
  return 1;
}

/**
 * "36,000" → 36000; "36.000" → 36000; "1.2" → 1.2; "1,2" → 1.2;
 * "1.200.000" → 1200000. A separator followed by exactly three digits is a
 * thousands mark; one or two digits after the last separator is a decimal.
 */
export function parseNumber(raw: string): number | null {
  const s = raw.replace(/\s+/g, "");
  if (!/^\d+(?:[.,]\d+)*$/.test(s)) return null;
  const seps = s.match(/[.,]/g) ?? [];
  let normalised: string;
  if (seps.length === 0) {
    normalised = s;
  } else {
    const lastSep = Math.max(s.lastIndexOf("."), s.lastIndexOf(","));
    const tail = s.slice(lastSep + 1);
    const distinct = new Set(seps);
    if (distinct.size === 2) {
      // Both marks present: the last one is the decimal mark.
      const dec = s[lastSep];
      const thou = dec === "." ? "," : ".";
      normalised = s.split(thou).join("").replace(dec, ".");
    } else if (tail.length !== 3) {
      normalised = s.slice(0, lastSep).replace(/[.,]/g, "") + "." + tail;
    } else {
      normalised = s.replace(/[.,]/g, "");
    }
  }
  const n = Number.parseFloat(normalised);
  return Number.isFinite(n) ? n : null;
}

/** Amount groups of one AMOUNT occurrence inside a larger match. */
function amountFrom(groups: (string | undefined)[], offset: number): number | null {
  const num = groups[offset] ?? groups[offset + 2] ?? groups[offset + 4];
  const unit = groups[offset + 1] ?? groups[offset + 3];
  if (!num) return null;
  const n = parseNumber(num);
  if (n == null || n <= 0) return null;
  return n * unitScale(unit);
}

/** Read the amount out of a fragment that starts with money ("A$1.2M seed"). */
export function parseMoney(fragment: string): number | null {
  const m = new RegExp(`^\\s*${AMOUNT}`, "iu").exec(fragment);
  if (!m) return null;
  return amountFrom(Array.from(m), 1);
}

/** A gap inside one sentence. */
// JS `\b` is ASCII-only, so "định giá" or "đang gọi" never sit on a word
// boundary. These are the Unicode-aware equivalents (patterns use the `u` flag).
const LB = String.raw`(?<![\p{L}\d])`;
const RB = String.raw`(?![\p{L}\d])`;

const GAP = (n: number) => String.raw`[^.!?\n]{0,${n}}?`;
/**
 * A gap that stops at another amount so a keyword-led match never jumps
 * over the founder's nearest number. "." is a sentence stop here, but a
 * decimal like 1.2 is still allowed because a digit follows.
 */
const GAP_NO_MONEY = (n: number) => String.raw`(?:(?!${CUR_PRE}\d)(?!\d)[^.!?\n]|\.(?=\d)){0,${n}}?`;
/** GAP_NO_MONEY that also refuses to cross a raise verb. */
const GAP_NO_ASK = (n: number) => String.raw`(?:(?!${CUR_PRE}\d)(?!\d)(?!\b(?:rais|seek|ask)\w*\b)[^.!?\n]|\.(?=\d)){0,${n}}?`;

// ─── Pilots (traction, not recurring revenue) ─────────────────────────────

const PILOTS_RE = new RegExp(
  String.raw`\b(\d{1,3})?\s*(?:paid|paying)\s+pilots?\b${GAP(20)}\(?\s?${AMOUNT}\s?(?:each|per pilot|/pilot|a pilot|mỗi (?:dự án|pilot))?\)?`,
  "iu",
);

// ─── Revenue ──────────────────────────────────────────────────────────────

const MONTHLY_TAIL = String.raw`(?:mrr|per\s+month|a\s+month|/\s?mo(?:nth)?|monthly(?:\s+recurring)?\s+revenue|mỗi\s+tháng|một\s+tháng|/\s?tháng|hàng\s+tháng)`;
const ANNUAL_TAIL = String.raw`(?:arr|per\s+(?:year|annum)|a\s+year|/\s?yr|/\s?year|annual(?:ised|ized)?(?:\s+recurring)?\s+revenue|in\s+(?:annual\s+)?revenue\s+(?:last|this|in|for|over)\s+(?:the\s+)?(?:year|12\s+months|fy\s?\d{2,4})|mỗi\s+năm|một\s+năm|/\s?năm|hàng\s+năm)`;
const REVENUE_WORD = String.raw`(?:revenue|revenues|turnover|sales|doanh\s+thu|doanh\s+số)`;
const MONTHS_TAIL = String.raw`(?:in|over|for|during|across|trong|of)?\s?(?:the\s+)?(?:last|past|trailing|first|previous)?\s?(\d{1,2})\s?(?:months?|tháng)(?:\s+(?:qua|vừa\s+qua|gần\s+đây|đầu))?`;
const YEAR_TAIL = String.raw`(?:in|over|for|during|trong)?\s?(?:the\s+)?(?:last|past|trailing|previous|calendar|financial)?\s?(?:year|12\s+months|fy\s?\d{2,4}|năm\s+(?:qua|ngoái|vừa\s+qua|nay|tài\s+chính)|20\d{2})${RB}`;
const QUARTER_TAIL = String.raw`(?:in|over|for|during|trong)?\s?(?:the\s+)?(?:last|past|previous)?\s?(?:quarter|3\s+months|quý(?:\s+(?:qua|vừa\s+qua|trước|này))?)${RB}`;

interface RevenueCandidate extends RevenueFigure {
  index: number;
}

function candidate(
  m: RegExpExecArray,
  amountOffset: number,
  kind: RevenueKind,
  periodMonths?: number,
): RevenueCandidate | null {
  const amount = amountFrom(Array.from(m), amountOffset);
  if (amount == null) return null;
  const quote = m[0].trim();
  const index = m.index ?? 0;
  if (kind === "mrr") return { mrrAud: amount, arrAud: amount * 12, kind, quote, index };
  if (kind === "arr") return { mrrAud: amount / 12, arrAud: amount, kind, quote, index };
  if (kind === "period") {
    const months = periodMonths && periodMonths > 0 ? periodMonths : 12;
    const mrr = amount / months;
    return { mrrAud: mrr, arrAud: mrr * 12, kind, periodMonths: months, quote, index };
  }
  return { mrrAud: amount / 12, arrAud: amount, kind: "unspecified", quote, index };
}

/** Does this candidate sit inside the pilots phrase? Then it is not revenue. */
function overlaps(a: { index: number; quote: string }, b: { index: number; length: number } | null): boolean {
  if (!b) return false;
  const aEnd = a.index + a.quote.length;
  const bEnd = b.index + b.length;
  return a.index < bEnd && b.index < aEnd;
}

const DENIAL_RE = /\bpre-?revenue\b|\bno revenue\b|\bzero revenue\b|chưa có doanh thu|không có doanh thu/i;

interface RevenueTry {
  re: RegExp;
  kind: RevenueKind;
  months?: (m: RegExpExecArray) => number | undefined;
}

function revenueTries(): RevenueTry[] {
  const A = AMOUNT;
  const monthsOf = (m: RegExpExecArray) => Number.parseInt(m[1 + AMOUNT_GROUPS] ?? "", 10) || undefined;
  return [
    // "MRR is A$18,500", "MRR: $4k", "doanh thu hàng tháng 5.000 AUD"
    { re: new RegExp(String.raw`${LB}(?:mrr|monthly\s+recurring\s+revenue|monthly\s+revenue|doanh\s+thu\s+(?:định\s+kỳ\s+)?(?:hàng\s+)?tháng)${RB}${GAP_NO_MONEY(30)}${A}`, "giu"), kind: "mrr" },
    // "A$4k a month in revenue", "$18,500 MRR", "5.000 AUD mỗi tháng"
    { re: new RegExp(String.raw`${A}${GAP(20)}${LB}${MONTHLY_TAIL}${RB}`, "giu"), kind: "mrr" },
    // "ARR of A$1.2M", "annual revenue A$250k", "doanh thu năm 300.000 AUD"
    { re: new RegExp(String.raw`${LB}(?:arr|annual(?:ised|ized)?(?:\s+recurring)?\s+revenue|doanh\s+thu\s+(?:hàng\s+)?năm)${RB}${GAP_NO_MONEY(30)}${A}`, "giu"), kind: "arr" },
    // "$250k in annual revenue", "A$680,000 ARR", "A$300k in revenue last year"
    { re: new RegExp(String.raw`${A}${GAP(25)}${LB}${ANNUAL_TAIL}${RB}`, "giu"), kind: "arr" },
    // "Revenue: A$36,000 in the last 6 months", "doanh thu 36.000 AUD trong 6 tháng qua"
    { re: new RegExp(String.raw`${LB}${REVENUE_WORD}${RB}${GAP_NO_MONEY(30)}${A}\s?${GAP(30)}${LB}${MONTHS_TAIL}${RB}`, "giu"), kind: "period", months: monthsOf },
    // "A$36,000 revenue in the last 6 months", "36.000 AUD doanh thu trong 6 tháng"
    { re: new RegExp(String.raw`${A}${GAP(20)}${LB}(?:in\s+|of\s+)?${REVENUE_WORD}${RB}${GAP(30)}${LB}${MONTHS_TAIL}${RB}`, "giu"), kind: "period", months: monthsOf },
    // "Revenue of A$300k last year", "doanh thu năm ngoái 300.000 AUD", "revenue in FY25 A$1.1M"
    { re: new RegExp(String.raw`${LB}${REVENUE_WORD}${RB}${GAP_NO_MONEY(30)}${A}\s?${GAP(30)}${LB}${YEAR_TAIL}`, "giu"), kind: "arr" },
    { re: new RegExp(String.raw`${LB}${REVENUE_WORD}${RB}\s?${YEAR_TAIL}${GAP_NO_MONEY(20)}${A}`, "giu"), kind: "arr" },
    // "Revenue of A$90k last quarter" → 3 months
    { re: new RegExp(String.raw`${LB}${REVENUE_WORD}${RB}${GAP_NO_MONEY(30)}${A}\s?${GAP(30)}${LB}${QUARTER_TAIL}`, "giu"), kind: "period", months: () => 3 },
    // Bare "revenue of A$120,000" / "doanh thu 120.000 AUD" — period not stated.
    // The gap must not cross a raise verb: "pre-revenue and raising A$500k"
    // is an ask, not revenue.
    { re: new RegExp(String.raw`${LB}${REVENUE_WORD}${RB}(?:\s+(?:of|to\s+date|so\s+far|is|was|at|:|đạt|là|khoảng))?${GAP_NO_ASK(20)}${A}`, "giu"), kind: "unspecified" },
    { re: new RegExp(String.raw`${A}${GAP(12)}${LB}(?:in|of)\s+${REVENUE_WORD}${RB}`, "giu"), kind: "unspecified" },
  ];
}

const REVENUE_TRIES = revenueTries();

/**
 * Every pattern is tried and the tightest, most specific reading wins: a
 * stated period / MRR / ARR beats a bare "revenue of A$X", and among equals
 * the shortest quote — so "A$40k MRR in a $1m market" reads A$40k, not A$1M,
 * and "Revenue: A$36,000 in the last 6 months" keeps its 6 months.
 */
function parseRevenue(text: string, pilots: { index: number; length: number } | null): RevenueFigure | null {
  let best: RevenueCandidate | null = null;
  const rank = (k: RevenueKind) => (k === "unspecified" ? 1 : 0);
  const better = (a: RevenueCandidate, b: RevenueCandidate) =>
    rank(a.kind) !== rank(b.kind)
      ? rank(a.kind) < rank(b.kind)
      : a.quote.length !== b.quote.length
        ? a.quote.length < b.quote.length
        : a.index < b.index;
  for (const t of REVENUE_TRIES) {
    t.re.lastIndex = 0;
    let m: RegExpExecArray | null = t.re.exec(text);
    while (m !== null) {
      const c = candidate(m, 1, t.kind, t.months?.(m));
      // A "revenue" keyword match must not be a denial ("pre-revenue, A$0")
      // and must not be the pilots phrase.
      const around = c ? text.slice(Math.max(0, c.index - 8), c.index + c.quote.length) : "";
      if (c && !overlaps(c, pilots) && !DENIAL_RE.test(around) && (!best || better(c, best))) {
        best = c;
      }
      m = t.re.exec(text);
    }
  }
  if (!best) return null;
  return {
    mrrAud: best.mrrAud,
    arrAud: best.arrAud,
    kind: best.kind,
    ...(best.periodMonths != null ? { periodMonths: best.periodMonths } : {}),
    quote: best.quote,
  };
}

// ─── The ask ──────────────────────────────────────────────────────────────

const ASK_LEAD = String.raw`(?:raising|raise|seeking|looking\s+for|looking\s+to\s+raise|the\s+ask|our\s+ask|we\s+ask|ask(?:ing)?\s+for|round\s+of|pre-?seed\s+of|seed\s+of|gọi\s+vốn|kêu\s+gọi(?:\s+vốn)?|huy\s+động(?:\s+vốn)?|đang\s+gọi|cần\s+(?:huy\s+động|gọi))`;
// The gap must not cross "at", "valuation" or "cap": "raising at a A$6M
// valuation" is a cap, not an ask.
const ASK_GAP = String.raw`(?:(?!\bat\b|\bvaluation\b|\bcap\b|\bpre-?money\b|\bđịnh\s+giá\b)[^.!?\n]){0,40}?`;
const ASK_RE = new RegExp(String.raw`${LB}${ASK_LEAD}${RB}${ASK_GAP}${AMOUNT}`, "iu");
const ASK_FALLBACK_RE = new RegExp(String.raw`${LB}${ASK_LEAD}${RB}${ASK_GAP}(${NUM})\s?(${UNIT})`, "iu");

function parseAsk(text: string): MoneyHit | null {
  const m = ASK_RE.exec(text);
  if (m) {
    const amount = amountFrom(Array.from(m), 1);
    if (amount != null) return { amountAud: amount, quote: m[0].trim() };
  }
  // "raising 1.2M seed" — a scale word with no currency mark.
  const f = ASK_FALLBACK_RE.exec(text);
  if (f) {
    const n = parseNumber(f[1] ?? "");
    if (n != null && n > 0) return { amountAud: n * unitScale(f[2]), quote: f[0].trim() };
  }
  return null;
}

// ─── Stated cap / pre-money ───────────────────────────────────────────────

const CAP_WORD_AFTER = String.raw`(?:valuation\s+cap|cap|pre-?money(?:\s+valuation)?|post-?money(?:\s+valuation)?|valuation)`;
const CAP_WORD_BEFORE = String.raw`(?:cap\s+of|capped\s+at|(?:a\s+)?valuation\s+cap\s+(?:of|at)|pre-?money(?:\s+valuation)?(?:\s+(?:of|at|is|:))?|post-?money(?:\s+valuation)?(?:\s+(?:of|at|is|:))?|valuation\s+(?:of|at|is|:)|valued\s+at|(?:mức\s+|trần\s+)?định\s+giá(?:\s+(?:là|ở\s+mức|khoảng|trước|sau))?(?:\s+(?:khi\s+)?(?:đầu\s+tư|gọi\s+vốn))?)`;
const CAP_AFTER_RE = new RegExp(String.raw`${AMOUNT}\s?(?:\(?\s?)?${LB}${CAP_WORD_AFTER}${RB}`, "iu");
const CAP_BEFORE_RE = new RegExp(String.raw`${LB}${CAP_WORD_BEFORE}${RB}${GAP_NO_MONEY(20)}${AMOUNT}`, "iu");
// Bare-unit fallback for "SAFE at 6M cap" / "định giá 6 triệu".
const CAP_AFTER_BARE_RE = new RegExp(String.raw`(${NUM})\s?(${UNIT})\s?${LB}${CAP_WORD_AFTER}${RB}`, "iu");
const CAP_BEFORE_BARE_RE = new RegExp(String.raw`${LB}${CAP_WORD_BEFORE}${RB}${GAP_NO_MONEY(20)}(${NUM})\s?(${UNIT})`, "iu");

function capKind(quote: string): CapKind {
  const q = quote.toLowerCase();
  if (/post-?money|định giá sau/.test(q)) return "post_money";
  if (/pre-?money|định giá trước/.test(q)) return "pre_money";
  if (/\bcap\b|trần/.test(q)) return "cap";
  return "valuation";
}

function capFrom(m: RegExpExecArray | null, bare: boolean): CapFigure | null {
  if (!m) return null;
  let amount: number | null;
  if (bare) {
    const n = parseNumber(m[1] ?? "");
    amount = n != null && n > 0 ? n * unitScale(m[2]) : null;
  } else {
    amount = amountFrom(Array.from(m), 1);
  }
  if (amount == null) return null;
  const quote = m[0].trim();
  return { amountAud: amount, quote, kind: capKind(quote) };
}

function parseCap(text: string): CapFigure | null {
  // Ignore market-sizing sentences: "a A$2B market valuation" is not a cap.
  const scrubbed = text.replace(/\b(?:market|industry|sector|tam|sam|som)\s+(?:valuation|cap)\b/gi, "market-size");
  return (
    capFrom(CAP_AFTER_RE.exec(scrubbed), false) ??
    capFrom(CAP_BEFORE_RE.exec(scrubbed), false) ??
    capFrom(CAP_AFTER_BARE_RE.exec(scrubbed), true) ??
    capFrom(CAP_BEFORE_BARE_RE.exec(scrubbed), true)
  );
}

// ─── Pilots ───────────────────────────────────────────────────────────────

function parsePilots(text: string): (PilotFigure & { index: number; length: number }) | null {
  const m = PILOTS_RE.exec(text);
  if (!m) return null;
  const amount = amountFrom(Array.from(m), 2);
  if (amount == null) return null;
  const count = m[1] ? Number.parseInt(m[1], 10) : undefined;
  return { count, amountEachAud: amount, quote: m[0].trim(), index: m.index ?? 0, length: m[0].length };
}

// ─── Public API ───────────────────────────────────────────────────────────

const EMPTY: FinancialFigures = { revenue: null, ask: null, cap: null, pilots: null };

/**
 * Read revenue, ask, cap and paid pilots out of free text. Never throws;
 * every field is null unless the founder actually wrote a figure.
 */
export function parseFinancialFigures(text: string | null | undefined): FinancialFigures {
  if (!text || typeof text !== "string") return { ...EMPTY };
  try {
    const pilotsHit = parsePilots(text);
    const revenue = parseRevenue(text, pilotsHit ? { index: pilotsHit.index, length: pilotsHit.length } : null);
    const ask = parseAsk(text);
    const cap = parseCap(text);
    const pilots = pilotsHit
      ? { count: pilotsHit.count, amountEachAud: pilotsHit.amountEachAud, quote: pilotsHit.quote }
      : null;
    // The same figure cannot be both the ask and the cap; the cap wording
    // ("at A$6M cap") is the more specific claim.
    const askOut = ask && cap && ask.amountAud === cap.amountAud ? null : ask;
    return { revenue, ask: askOut, cap, pilots };
  } catch {
    return { ...EMPTY };
  }
}

/** A$ formatting for echo rows and assumptions: A$6,000 / A$1.2M. */
export function formatFigureAud(value: number): string {
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `A$${Number.isInteger(m) ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  return `A$${Math.round(value).toLocaleString("en-AU")}`;
}
