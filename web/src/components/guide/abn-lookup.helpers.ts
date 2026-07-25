// P1g-founder-panel — pure form + formatting helpers for the ABN lookup panel
// mounted on Chapter 1 (Vision / Day-0 Idea). The panel calls the existing
// public GET /api/abr/lookup route (shipped by P1g) with the founder's raw
// ABN input and renders the checksum + optional ABR live entity payload.
//
// Kept in a separate module so the URL-builder + input sanitiser + response
// types can be unit-tested without spinning up jsdom or fetch mocks.

export interface AbnLookupFormState {
  /** Raw founder input — may contain spaces, dashes, or partial digits. */
  abn: string;
}

export function makeEmptyAbnLookupFormState(initialAbn?: string): AbnLookupFormState {
  return { abn: initialAbn?.trim() ?? "" };
}

/** Strip whitespace + non-digits and return whatever digit run remains.
 * Returns null when the cleaned value is empty so the URL builder can bail
 * without firing a request that the route will 400 on. */
export function normaliseAbnInput(raw: string): string | null {
  const digits = raw.replace(/\D+/g, "");
  return digits.length > 0 ? digits : null;
}

/**
 * Build the /api/abr/lookup URL from form state. Returns null when the ABN
 * input has no digits (submit button should stay disabled — no reason to
 * fire a request that will 400). The route itself validates the 11-digit
 * length + modulus-89 checksum, so we don't pre-reject shorter inputs here
 * — a founder who has only typed 5 digits should not see the submit fire
 * anyway (canSubmit gates on isProbablyCompleteAbn).
 */
export function buildAbnLookupUrl(state: AbnLookupFormState): string | null {
  const digits = normaliseAbnInput(state.abn);
  if (!digits) return null;
  const params = new URLSearchParams();
  params.set("abn", digits);
  return `/api/abr/lookup?${params.toString()}`;
}

/** Founder-facing: block submit until the cleaned input is exactly 11 digits.
 * A partial ABN would always 400 with `invalid_abn_format`, so the panel
 * keeps the button disabled and shows an inline hint instead. */
export function isProbablyCompleteAbn(state: AbnLookupFormState): boolean {
  const digits = normaliseAbnInput(state.abn);
  return digits !== null && digits.length === 11;
}

/** Response shape from GET /api/abr/lookup 200. Mirrors route.ts +
 * AbnLookupResult in web/src/lib/compliance/abn.ts. */
export interface AbnLookupSuccess {
  abn: string;
  abn_formatted: string;
  valid_checksum: boolean;
  source: "checksum" | "abr-live";
  live: AbnLiveDetails | null;
  live_error: string | null;
}

export interface AbnLiveDetails {
  entity_name: string | null;
  entity_type_name: string | null;
  abn_status: string | null;
  abn_status_effective_from: string | null;
  gst_registered: boolean | null;
  gst_effective_from: string | null;
  business_state: string | null;
  business_postcode: string | null;
  acn: string | null;
}

export interface AbnLookupError {
  error: string;
  message: string;
  input?: string | null;
}

/** Pick the founder-facing traffic-light band for the lookup result. Order
 * matters: `red` (checksum failed) beats `amber` (checksum ok but no live
 * confirmation yet) beats `emerald` (ABR confirms an active ABN). */
export function pickAbnBand(body: AbnLookupSuccess): "red" | "amber" | "emerald" {
  if (!body.valid_checksum) return "red";
  if (!body.live) return "amber";
  const status = (body.live.abn_status ?? "").toLowerCase();
  if (status && status !== "active") return "amber";
  return "emerald";
}

/** Format an ACN as `NNN NNN NNN` for display. Returns em-dash when the
 * input is missing or malformed so the panel never renders a raw NULL. */
export function formatAcnDisplay(acn: string | null | undefined): string {
  if (!acn) return "—";
  const digits = acn.replace(/\D+/g, "");
  if (digits.length !== 9) return acn;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
}

/** Format a YYYY-MM-DD-like ABR date string as a founder-readable date.
 * ABR returns ISO-like strings but sometimes empty; empty → em-dash. */
export function formatAbrDate(raw: string | null | undefined): string {
  if (!raw) return "—";
  const trimmed = raw.trim();
  if (!trimmed) return "—";
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  return parsed.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
