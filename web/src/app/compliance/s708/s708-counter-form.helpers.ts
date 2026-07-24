// Pure helpers for the s708(1) small-scale personal-offer counter form
// (P1n-s708-form).
//
// Kept isolated from the React client so the CSV parse, wire mapping, and
// traffic-light banding can be unit-tested without a DOM. Mirrors the WGEA /
// Modern Slavery / GST form.helpers shape from P1n-form + P1n-gst-form so
// every compliance detail-page form carries the same round-trip contract.
//
// Wire shape (S708CounterInput / S708CounterResult / S708OfferEvent) is owned
// by web/src/lib/compliance/s708-small-scale-counter.ts. This module carries
// UI state as strings (so <textarea> + <input> values round-trip cleanly),
// coerces to a numerically-clean S708CounterInput on submit, and picks the
// traffic-light band for the result banner.
//
// The counter is a preview tool, not a persisted snapshot — there is no
// `fromS708CounterInput()` here because the parent page does not rehydrate a
// prior run. Sibling share-register-schema agent will unlock a persisted
// `events[]` source in a future tick; this ships the stateless form so a
// founder can already model tranches by pasting from their register.

import type {
  S708CounterInput,
  S708CounterResult,
  S708OfferEvent,
  S708OfferType,
} from "@/lib/compliance/s708-small-scale-counter";

/** Form state — every numeric field is a string so <input> can round-trip. */
export interface S708CounterFormState {
  /**
   * One offer per line. Columns: `offer_date, investor_id, amount_aud
   * [, offer_type]`. Whitespace tolerated around commas. Blank lines +
   * malformed rows silently dropped so a raw share-register paste is safe.
   */
  events_text: string;
  preview_enabled: boolean;
  preview_new_investors: string;
  preview_amount_aud: string;
}

export function makeEmptyS708CounterFormState(): S708CounterFormState {
  return {
    events_text: "",
    preview_enabled: false,
    preview_new_investors: "",
    preview_amount_aud: "",
  };
}

function num(s: string, fallback = 0): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : fallback;
}

const VALID_OFFER_TYPES = new Set<S708OfferType>([
  "primary",
  "secondary_on_sale",
]);

/**
 * Parse a multi-line CSV of `offer_date, investor_id, amount_aud
 * [, offer_type]` rows into `S708OfferEvent[]`. Blank lines, malformed rows
 * (bad ISO date, missing investor_id, non-numeric amount) are silently
 * dropped — the counter itself already tolerates these, but pre-filtering
 * here gives a founder a cleaner preview shape (the count reported
 * upstream matches what they see).
 */
export function parseS708EventsCsv(text: string): S708OfferEvent[] {
  if (!text.trim()) return [];
  const rows: S708OfferEvent[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const cells = line.split(",").map((c) => c.trim());
    if (cells.length < 3) continue;
    const [offerDate, investorId, amountStr, offerType] = cells;
    if (!offerDate || !investorId) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(offerDate)) continue;
    const amount = num(amountStr, NaN);
    if (!Number.isFinite(amount) || amount < 0) continue;
    const typed: S708OfferEvent = {
      offer_date: offerDate,
      investor_id: investorId,
      amount_aud: amount,
    };
    if (offerType && VALID_OFFER_TYPES.has(offerType as S708OfferType)) {
      typed.offer_type = offerType as S708OfferType;
    }
    rows.push(typed);
  }
  return rows;
}

/** Convert form state → the S708CounterInput POSTed to the counter route. */
export function toS708CounterInput(
  state: S708CounterFormState,
): S708CounterInput {
  const events = parseS708EventsCsv(state.events_text);
  const wire: S708CounterInput = { events };
  if (state.preview_enabled) {
    const newInvestors = num(state.preview_new_investors, 0);
    const amountAud = num(state.preview_amount_aud, 0);
    if (newInvestors > 0 || amountAud > 0) {
      wire.preview = {
        new_investors: Math.max(0, Math.floor(newInvestors)),
        amount_aud: Math.max(0, amountAud),
      };
    }
  }
  return wire;
}

export type S708Band = "green" | "amber" | "red";

/**
 * Traffic-light band for the result banner:
 *
 *   red   — block  (at or over either cap, or preview would breach)
 *   amber — warn   (within one investor OR A$200k of either cap)
 *   green — ok     (comfortable headroom)
 */
export function pickS708Band(result: S708CounterResult): S708Band {
  switch (result.status) {
    case "block":
      return "red";
    case "warn":
      return "amber";
    case "ok":
    default:
      return "green";
  }
}
