// s708(1) Corporations Act 2001 (Cth) — small-scale personal-offer counter.
//
// The "20 investors / A$2M / 12 months" rule (aka the "small-scale offering
// exemption") lets a company issue securities without preparing a full
// disclosure document (Prospectus / OIS / PDS) provided the trailing-12-month
// tally of PERSONAL offers stays under both caps at the moment each new
// offer is accepted:
//
//   - No more than 20 issues of shares under personal offers in any
//     rolling 12-month window (Corporations Act 2001 (Cth) s708(1)(a) &
//     s708(3)); and
//   - No more than A$2,000,000 raised under personal offers in the same
//     rolling 12-month window (s708(1)(b) & s708(3)).
//
// The s707 on-sale rule extends the counter to secondary transfers of
// shares issued under the exemption when the transfer happens within 12
// months of the original issue — those transferees consume s708(1) headroom
// too. See /guide/09-funding chapter body (startup-journey.ts:896) for the
// founder-facing walkthrough.
//
// ASIC ref (retrieved 2026):
//   https://asic.gov.au/regulatory-resources/fundraising/small-scale-offers/
//
// This module is a counter, not an offer-classifier — it assumes the caller
// has already tagged which events are personal offers under s708(1). Offers
// captured under s708(8) (sophisticated), s708(10) (professional), s708(11)
// (senior manager), CSF (s738G), or a full disclosure document are OUT of
// scope and MUST NOT be passed in.

export const S708_SMALL_SCALE_DISCLAIMER =
  "Not legal advice — the s708(1) counter only tracks offers you tag as personal offers under s708(1)/(3). Related-body-corporate, spouse, and s707 on-sale re-issues can alter the tally. Confirm with an Australian securities lawyer before relying on this figure to skip a disclosure document.";

/** Small-scale investor cap under s708(1)(a). */
export const S708_INVESTOR_CAP = 20 as const;
/** Small-scale dollar cap under s708(1)(b). */
export const S708_DOLLAR_CAP_AUD = 2_000_000 as const;
/** Rolling window length used by s708(3). */
export const S708_WINDOW_DAYS = 365 as const;
/** Amber-band trigger: within one investor OR A$200k of either cap. */
export const S708_WARN_INVESTOR_HEADROOM = 1 as const;
export const S708_WARN_DOLLAR_HEADROOM_AUD = 200_000 as const;

export type S708OfferType = "primary" | "secondary_on_sale";

export interface S708OfferEvent {
  /** ISO date (YYYY-MM-DD) the offer was accepted / shares issued. */
  offer_date: string;
  /**
   * Stable identifier for the offeree (email, contact_id, uuid). Used to
   * de-duplicate the investor tally when the same person subscribes across
   * multiple tranches within the window.
   */
  investor_id: string;
  /** Amount raised from THIS offer, in AUD. */
  amount_aud: number;
  /**
   * Primary = new shares issued by the company under s708(1).
   * Secondary_on_sale = re-sale of s708-issued shares within 12 months of
   * original issue, captured by the s707 on-sale rule (also consumes s708(1)
   * headroom per s707(3)).
   */
  offer_type?: S708OfferType;
}

export interface S708PreviewInput {
  /** Number of NEW investors the proposed round would add. */
  new_investors: number;
  /** Total AUD the proposed round would raise. */
  amount_aud: number;
}

export interface S708CounterInput {
  events: readonly S708OfferEvent[];
  /**
   * "Now" for windowing — defaults to system clock. Pass a fixed Date in
   * tests + when replaying a historical snapshot.
   */
  now?: Date;
  /** Optional "what if we accept this new round" preview. */
  preview?: S708PreviewInput;
}

export type S708Status = "ok" | "warn" | "block";

export interface S708CounterResult {
  window_start_iso: string;
  window_end_iso: string;
  investor_count_12mo: number;
  dollars_raised_12mo_aud: number;
  investor_cap: typeof S708_INVESTOR_CAP;
  dollar_cap_aud: typeof S708_DOLLAR_CAP_AUD;
  investors_remaining: number;
  dollars_remaining_aud: number;
  status: S708Status;
  /**
   * Set when a preview was supplied. `true` means accepting the previewed
   * round would push at least one cap over the s708(1) line.
   */
  would_breach_investor_cap?: boolean;
  would_breach_dollar_cap?: boolean;
  reason: string;
  next_action: string;
  disclaimer: string;
}

function toUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function parseIsoDay(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(iso + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function currency(amountAud: number): string {
  return `A$${Math.round(amountAud).toLocaleString("en-AU")}`;
}

/**
 * Roll a set of personal-offer events forward to `now` and return the
 * s708(1) counter state. Events outside the trailing 365-day window are
 * dropped; events with malformed dates, negative amounts, or missing
 * investor_id are skipped (but never throw).
 *
 * When `preview` is supplied the return value also reports whether
 * accepting that round would breach either cap.
 */
export function assessS708SmallScale(
  input: S708CounterInput,
): S708CounterResult {
  const now = input.now ?? new Date();
  const nowDay = toUtcDay(now);
  const windowStartDay = new Date(nowDay);
  windowStartDay.setUTCDate(windowStartDay.getUTCDate() - S708_WINDOW_DAYS);

  const uniqueInvestors = new Set<string>();
  let dollarsAud = 0;

  for (const event of input.events) {
    if (!event || typeof event.investor_id !== "string") continue;
    const investorId = event.investor_id.trim();
    if (investorId === "") continue;
    const parsedDate = parseIsoDay(event.offer_date);
    if (!parsedDate) continue;
    if (parsedDate < windowStartDay || parsedDate > nowDay) continue;
    const amount = Number.isFinite(event.amount_aud) ? event.amount_aud : 0;
    if (amount < 0) continue;
    uniqueInvestors.add(investorId);
    dollarsAud += amount;
  }

  const investorCount = uniqueInvestors.size;
  const investorsRemaining = Math.max(0, S708_INVESTOR_CAP - investorCount);
  const dollarsRemaining = Math.max(0, S708_DOLLAR_CAP_AUD - dollarsAud);

  let wouldBreachInvestor: boolean | undefined;
  let wouldBreachDollar: boolean | undefined;
  if (input.preview) {
    const projectedInvestors =
      investorCount + Math.max(0, Math.floor(input.preview.new_investors));
    const projectedDollars =
      dollarsAud + Math.max(0, input.preview.amount_aud || 0);
    wouldBreachInvestor = projectedInvestors > S708_INVESTOR_CAP;
    wouldBreachDollar = projectedDollars > S708_DOLLAR_CAP_AUD;
  }

  const status = classify({
    investorCount,
    dollarsAud,
    wouldBreachInvestor,
    wouldBreachDollar,
  });

  return {
    window_start_iso: isoDay(windowStartDay),
    window_end_iso: isoDay(nowDay),
    investor_count_12mo: investorCount,
    dollars_raised_12mo_aud: dollarsAud,
    investor_cap: S708_INVESTOR_CAP,
    dollar_cap_aud: S708_DOLLAR_CAP_AUD,
    investors_remaining: investorsRemaining,
    dollars_remaining_aud: dollarsRemaining,
    status,
    would_breach_investor_cap: wouldBreachInvestor,
    would_breach_dollar_cap: wouldBreachDollar,
    reason: buildReason({
      investorCount,
      dollarsAud,
      investorsRemaining,
      dollarsRemaining,
      status,
      preview: input.preview,
      wouldBreachInvestor,
      wouldBreachDollar,
    }),
    next_action: buildNextAction(status, {
      wouldBreachInvestor,
      wouldBreachDollar,
    }),
    disclaimer: S708_SMALL_SCALE_DISCLAIMER,
  };
}

function classify(args: {
  investorCount: number;
  dollarsAud: number;
  wouldBreachInvestor?: boolean;
  wouldBreachDollar?: boolean;
}): S708Status {
  if (args.wouldBreachInvestor || args.wouldBreachDollar) return "block";
  if (
    args.investorCount >= S708_INVESTOR_CAP ||
    args.dollarsAud >= S708_DOLLAR_CAP_AUD
  ) {
    return "block";
  }
  const investorHeadroom = S708_INVESTOR_CAP - args.investorCount;
  const dollarHeadroom = S708_DOLLAR_CAP_AUD - args.dollarsAud;
  if (
    investorHeadroom <= S708_WARN_INVESTOR_HEADROOM ||
    dollarHeadroom <= S708_WARN_DOLLAR_HEADROOM_AUD
  ) {
    return "warn";
  }
  return "ok";
}

function buildReason(args: {
  investorCount: number;
  dollarsAud: number;
  investorsRemaining: number;
  dollarsRemaining: number;
  status: S708Status;
  preview?: S708PreviewInput;
  wouldBreachInvestor?: boolean;
  wouldBreachDollar?: boolean;
}): string {
  const base = `s708(1) rolling 12-month window: ${args.investorCount} of ${S708_INVESTOR_CAP} investors used, ${currency(args.dollarsAud)} of ${currency(S708_DOLLAR_CAP_AUD)} raised.`;
  if (args.status === "block") {
    if (args.preview && (args.wouldBreachInvestor || args.wouldBreachDollar)) {
      const parts: string[] = [];
      if (args.wouldBreachInvestor)
        parts.push(`the 20-investor cap (adds ${args.preview.new_investors})`);
      if (args.wouldBreachDollar)
        parts.push(`the A$2M dollar cap (adds ${currency(args.preview.amount_aud)})`);
      return `${base} Accepting this round would breach ${parts.join(" and ")} — the s708(1) exemption drops away and a disclosure document (or an alternative exemption like s708(8) wholesale) is required.`;
    }
    return `${base} At least one cap has already been reached — any further personal offers in this window need a disclosure document or a different exemption (s708(8)/(10)/(11), CSF s738G, or a full Prospectus).`;
  }
  if (args.status === "warn") {
    return `${base} Only ${args.investorsRemaining} investors and ${currency(args.dollarsRemaining)} of headroom remain — one more offer could push you over the exemption line.`;
  }
  return `${base} ${args.investorsRemaining} investors and ${currency(args.dollarsRemaining)} of headroom remain in this window.`;
}

function buildNextAction(
  status: S708Status,
  flags: { wouldBreachInvestor?: boolean; wouldBreachDollar?: boolean },
): string {
  if (status === "block") {
    if (flags.wouldBreachInvestor || flags.wouldBreachDollar) {
      return "Convert the incoming round to wholesale-only under s708(8)/(11), split it across offerees who already hold shares in the company (s708(4) issue-to-existing-holders is a separate carve-out), or prepare an Offer Information Statement (s709(4)) before accepting.";
    }
    return "Stop accepting new personal offers under s708(1) — reclassify future offerees as wholesale (s708(8)) with an accountant certificate, run a CSF round under s738G, or prepare a disclosure document.";
  }
  if (status === "warn") {
    return "Model the next planned tranche against the counter (pass it as `preview` to assessS708SmallScale) before accepting — decide now whether the next offer stays under s708(1) or shifts to wholesale under s708(8).";
  }
  return "Log every accepted personal offer via the /dashboard/data-room Folder 1 register (data-room-templates.ts item 1.6 Register of Members) and re-run the counter before the next tranche.";
}
