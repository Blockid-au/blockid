// Adapter: normalise share-register / equity-events rows into the
// S708OfferEvent[] shape that `assessS708SmallScale` (Corporations Act 2001
// (Cth) s708(1) small-scale counter) consumes.
//
// Contract:
//   docs/plans/atlassian-standard-mapping-goal.md §1 phase 10 P1 gap
//   ("s708(1) counter … deferred to P10-s708counter-wire").
//
// Founders capture their share-register rows in different shapes depending on
// source (equity_events table, ASIC Form 484 export, cap-table CSV, dataroom
// register-of-members upload). This adapter is a pure normaliser — it does
// NOT touch any table itself. Downstream loaders should read rows from their
// source, hand them here, and pipe the output straight into
// `assessS708SmallScale({ events, now, preview })`.
//
// The adapter deliberately errs on the side of INCLUDING rows: the counter
// itself is the safety net, and dropping ambiguous rows silently would hide
// exposure from the founder. But rows that carry an explicit non-s708(1)
// exemption tag (wholesale s708(8), professional s708(10), CSF s738G, full
// disclosure document, etc.) MUST be excluded — including them would
// double-count and shrink the founder's s708(1) headroom incorrectly.

import type { S708OfferEvent, S708OfferType } from "./s708-small-scale-counter";

/**
 * Loose input row shape. Every field optional so a caller can hand us
 * whatever their register export produces without pre-normalising.
 */
export interface ShareRegisterRow {
  /** ISO date (`YYYY-MM-DD`) or full ISO-8601 timestamp. */
  event_date?: string;
  /**
   * Event kind. `issue` / `primary` / `primary_issue` / `grant` map to
   * `primary`. `transfer` / `secondary` / `secondary_on_sale` /
   * `on_sale` map to `secondary_on_sale`. Anything else is skipped.
   */
  event_type?: string;
  /**
   * Explicit exemption tag if the founder / lawyer has classified the offer.
   * Recognised: `s708(1)` (personal offer — included), `s708(8)` (wholesale),
   * `s708(10)` (professional), `s708(11)` (senior manager), `csf` /
   * `s738G` (crowd-sourced funding), `prospectus` / `pds` / `ois` /
   * `disclosure` (full disclosure document). Missing/blank defaults to
   * s708(1) — the safe presumption because the counter is the guard-rail.
   */
  exemption?: string | null;
  investor_id?: string | null;
  investor_email?: string | null;
  investor_name?: string | null;
  amount_aud?: number | null;
  consideration_aud?: number | null;
  shares?: number | null;
  price_per_share_aud?: number | null;
}

export type S708AdapterSkipReason =
  | "missing_date"
  | "invalid_date"
  | "unknown_event_type"
  | "non_s708_exemption"
  | "missing_investor_id"
  | "missing_amount"
  | "negative_amount";

export interface S708AdapterSkip {
  index: number;
  reason: S708AdapterSkipReason;
}

export interface S708AdapterResult {
  events: S708OfferEvent[];
  skipped: S708AdapterSkip[];
}

const PRIMARY_EVENT_TYPES = new Set([
  "issue",
  "primary",
  "primary_issue",
  "grant",
  "allotment",
]);

const SECONDARY_EVENT_TYPES = new Set([
  "transfer",
  "secondary",
  "secondary_on_sale",
  "on_sale",
]);

const S708_INCLUDED_EXEMPTIONS = new Set([
  "",
  "s708(1)",
  "s708_1",
  "s708.1",
  "small_scale",
  "personal_offer",
]);

/** Coerce anything into a trimmed lowercase key or `""`. */
function keyish(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim().toLowerCase();
}

/** Normalise an ISO date input — accepts `YYYY-MM-DD` or full timestamp. */
function normaliseDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // Full ISO timestamp — take the date part if it parses.
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/** Classify event_type → offer_type, or `null` if unknown. */
function classifyEventType(raw: unknown): S708OfferType | null {
  const key = keyish(raw);
  if (key === "") return "primary"; // blank event_type defaults to primary
  if (PRIMARY_EVENT_TYPES.has(key)) return "primary";
  if (SECONDARY_EVENT_TYPES.has(key)) return "secondary_on_sale";
  return null;
}

/** True when the row's exemption tag counts against s708(1) headroom. */
function includesInS708(exemption: unknown): boolean {
  return S708_INCLUDED_EXEMPTIONS.has(keyish(exemption));
}

/** Pick investor_id in preference order; falls back to normalised name. */
function resolveInvestorId(row: ShareRegisterRow): string | null {
  const direct = keyish(row.investor_id);
  if (direct !== "") return direct;
  const email = keyish(row.investor_email);
  if (email !== "") return email;
  const name = keyish(row.investor_name);
  if (name !== "") return name;
  return null;
}

/**
 * Resolve monetary consideration. Prefers explicit `amount_aud`, then
 * `consideration_aud`, then `shares * price_per_share_aud`. Returns `null`
 * when nothing usable is available, and the raw negative when the caller
 * provided a negative value (so the caller can distinguish "missing" from
 * "explicitly bad").
 */
function resolveAmountAud(row: ShareRegisterRow): number | null {
  const explicit = row.amount_aud;
  if (typeof explicit === "number" && Number.isFinite(explicit)) return explicit;
  const alt = row.consideration_aud;
  if (typeof alt === "number" && Number.isFinite(alt)) return alt;
  const shares = row.shares;
  const price = row.price_per_share_aud;
  if (
    typeof shares === "number" &&
    Number.isFinite(shares) &&
    typeof price === "number" &&
    Number.isFinite(price)
  ) {
    return shares * price;
  }
  return null;
}

/**
 * Normalise a batch of share-register rows into `S708OfferEvent[]`, dropping
 * rows that cannot be counted under s708(1). Never throws; the `skipped[]`
 * array carries `(index, reason)` pairs so a UI can surface a "we couldn't
 * parse N rows" hint next to the counter.
 */
export function adaptShareRegisterRows(
  rows: readonly ShareRegisterRow[],
): S708AdapterResult {
  const events: S708OfferEvent[] = [];
  const skipped: S708AdapterSkip[] = [];

  rows.forEach((row, index) => {
    if (!row || typeof row !== "object") {
      skipped.push({ index, reason: "unknown_event_type" });
      return;
    }

    if (!includesInS708(row.exemption)) {
      skipped.push({ index, reason: "non_s708_exemption" });
      return;
    }

    const offerType = classifyEventType(row.event_type);
    if (offerType === null) {
      skipped.push({ index, reason: "unknown_event_type" });
      return;
    }

    if (row.event_date === undefined || row.event_date === null || row.event_date === "") {
      skipped.push({ index, reason: "missing_date" });
      return;
    }
    const isoDate = normaliseDate(row.event_date);
    if (isoDate === null) {
      skipped.push({ index, reason: "invalid_date" });
      return;
    }

    const investorId = resolveInvestorId(row);
    if (investorId === null) {
      skipped.push({ index, reason: "missing_investor_id" });
      return;
    }

    const amount = resolveAmountAud(row);
    if (amount === null) {
      skipped.push({ index, reason: "missing_amount" });
      return;
    }
    if (amount < 0) {
      skipped.push({ index, reason: "negative_amount" });
      return;
    }

    events.push({
      offer_date: isoDate,
      investor_id: investorId,
      amount_aud: amount,
      offer_type: offerType,
    });
  });

  return { events, skipped };
}
