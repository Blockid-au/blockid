// Credit line for a show-cost-first preview / result (client-safe, pure).
//
// Every paid-with-preview route (dividend statements, annual tax statements,
// board resolutions, listing-readiness PDF, expense categorisation) answers
// `{ cost, listedCost, included, balance, creditNote }`. Live QA lane 2 P3-d
// (2026-09-13): when the feature was INCLUDED for the caller (Growth+ /
// equity add-on) the note still read "Charged to your credits." next to
// `cost: 0` and `balance: null`. The note must say what actually happens.
//
//   cost > 0            → the charge note (whose wallet pays — lib/projects
//                         `creditChargeNote(scope)`)
//   cost = 0, included  → INCLUDED_CREDIT_NOTE
//   cost = 0, otherwise → NO_CHARGE_CREDIT_NOTE (already paid / nothing to do)

export const INCLUDED_CREDIT_NOTE = "Included in your plan — no credits charged.";
export const NO_CHARGE_CREDIT_NOTE = "No credits charged.";

export interface CreditNoteInput {
  /** What this call will (or did) charge. */
  cost: number;
  /** The plan / add-on covers it. */
  included: boolean;
  /** `creditChargeNote(scope)` — "Charged to your credits." / "…your own credits — not the project owner's." */
  chargeNote: string;
}

export function creditNoteFor({ cost, included, chargeNote }: CreditNoteInput): string {
  if (cost > 0) return chargeNote;
  if (included) return INCLUDED_CREDIT_NOTE;
  return NO_CHARGE_CREDIT_NOTE;
}
