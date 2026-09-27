// V04a (G32, founder decision D22, 2026-09-24): the SVI is an uncapped
// index, not a score out of 100 and not a dollar valuation. A valuation
// figure may only come from a CFO valuation method with qualified inputs
// (report pipeline `cfo-valuation.ts` + revenue qualification, or the
// `lib/valuation/cfo-*` scenario core). When no method can run, every
// surface shows "not estimable" plus the evidence that would unlock a
// method — never a range derived from the SVI or its dimension scores.
//
// This module is the single source of that copy (EN + VI) so the web
// widgets, PDFs, e-mails and stored rows say the same thing. It is pure:
// no I/O, safe on server and client.

export type NotEstimableLocale = "en" | "vi";

/** Stable reason code stored on rows / report chapters that carry no figure. */
export const VALUATION_NOT_ESTIMABLE = "not_estimable" as const;

export interface ValuationNotEstimable {
  status: typeof VALUATION_NOT_ESTIMABLE;
  /** Short value for a tile / card slot: "Not estimable". */
  label: string;
  /** Evidence that would unlock a CFO valuation method, most useful first. */
  unlock: string[];
  /** One sentence: "Not estimable — add … to unlock a valuation method." */
  line: string;
  /** Why no figure is shown: the SVI is an index, not a dollar value. */
  why: string;
  /** Compact unlock hint for a small card subtitle. */
  hint: string;
  /** Short one-liner for tight slots (cover "worth" line): "Not estimable — connect revenue or add financials to unlock". */
  short: string;
}

const COPY = {
  en: {
    label: "Not estimable",
    unlock: [
      "connected revenue (Stripe or Xero)",
      "financial statements with a stated period",
      "the terms of your last priced round",
    ],
    or: "or",
    line: (inputs: string) => `Not estimable — add ${inputs} to unlock a valuation method.`,
    why: "The SVI is an uncapped index, not a dollar figure. A valuation comes only from a CFO method with qualified inputs.",
    hint: "Connect revenue or add financials to unlock",
  },
  vi: {
    label: "Chưa ước tính được",
    unlock: [
      "doanh thu qua kết nối (Stripe hoặc Xero)",
      "báo cáo tài chính có kỳ đo",
      "điều khoản vòng gọi vốn có định giá gần nhất",
    ],
    or: "hoặc",
    line: (inputs: string) => `Chưa ước tính được — bổ sung ${inputs} để mở một phương pháp định giá.`,
    why: "SVI là chỉ số không giới hạn, không phải số tiền. Định giá chỉ đến từ phương pháp CFO có dữ liệu đủ điều kiện.",
    hint: "Kết nối doanh thu hoặc thêm báo cáo tài chính để mở",
  },
} as const;

function joinOr(items: readonly string[], or: string): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${or} ${items[items.length - 1]}`;
}

/** The default unlock list for a locale (a copy — safe to mutate). */
export function defaultUnlockInputs(locale: NotEstimableLocale = "en"): string[] {
  return [...COPY[locale === "vi" ? "vi" : "en"].unlock];
}

/**
 * The "not estimable" state for any surface that used to print an
 * SVI-derived dollar figure. `unlock` overrides the default evidence list
 * (e.g. a report chapter's own `missingInputs`).
 */
export function valuationNotEstimable(opts: { locale?: NotEstimableLocale | string | null; unlock?: readonly string[] | null } = {}): ValuationNotEstimable {
  const copy = COPY[opts.locale === "vi" ? "vi" : "en"];
  const unlock = opts.unlock && opts.unlock.length > 0 ? opts.unlock.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()) : [...copy.unlock];
  const list = unlock.length > 0 ? unlock : [...copy.unlock];
  return {
    status: VALUATION_NOT_ESTIMABLE,
    label: copy.label,
    unlock: list,
    line: copy.line(joinOr(list, copy.or)),
    why: copy.why,
    hint: copy.hint,
    short: `${copy.label} — ${copy.hint.charAt(0).toLowerCase()}${copy.hint.slice(1)}`,
  };
}
