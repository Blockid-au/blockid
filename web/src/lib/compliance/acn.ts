// ACN (Australian Company Number) validation + ASIC/ABR live lookup.
//
// This module ships two independent capabilities:
//   1. `validateAcnChecksum(acn)` — pure, deterministic, offline. Implements
//      the ASIC modulus-10 checksum algorithm documented at
//      https://asic.gov.au/for-business/registering-a-company/steps-to-register-a-company/australian-company-numbers/australian-company-number-digit-check/
//      Correct 9-digit ACNs always pass; typos almost always fail.
//   2. `lookupAcnLive(acn)` — calls the free ABR AcnDetails web service at
//      https://abr.business.gov.au/json/AcnDetails.aspx to fetch the
//      registered entity name, ACN/ABN linkage, ABN status, GST registration,
//      and business state. Requires `ABR_GUID` env var (register at
//      https://abr.business.gov.au/Tools/WebServices — free).
//
// ASIC Connect's own paid Company Extract product is out of scope for this
// public probe. We surface the free ABR-side view so a founder can confirm
// the incorporating entity is real and current in ≤ 60 seconds; deeper
// diligence (charges, historical officers) still requires a paid ASIC extract.
//
// Reference for the guide gap this closes: docs/plans/atlassian-standard-mapping-goal.md
// §2 Folder 1 item 1.2 ("Company Extract (ASIC) — NUDGE (auto-probe via
// ASIC Connect API — currently no /api/asic/extract)"), spun off as P1h.
//
// Boundary: the ASIC/ABR data is factual (name/status/GST), not advice. No
// AFSL disclaimer needed because we are not giving personal financial
// product advice.

export const ACN_CHECKSUM_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 1] as const;

/**
 * Strip whitespace + non-digits and return a canonical 9-digit ACN string.
 * Returns null if the cleaned value isn't exactly 9 digits.
 */
export function normalizeAcn(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = String(input).replace(/\D+/g, "");
  return digits.length === 9 ? digits : null;
}

/**
 * Modulus-10 checksum. Multiply the first 8 digits by weights 8..1, sum,
 * take mod 10, and complement to 10. The 9th (check) digit must equal
 * (10 - sum%10) % 10.
 */
export function validateAcnChecksum(input: string | null | undefined): boolean {
  const acn = normalizeAcn(input);
  if (!acn) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += Number(acn[i]) * ACN_CHECKSUM_WEIGHTS[i];
  }
  const check = (10 - (sum % 10)) % 10;
  return check === Number(acn[8]);
}

/** Format as `NNN NNN NNN` for display. */
export function formatAcn(input: string | null | undefined): string | null {
  const acn = normalizeAcn(input);
  if (!acn) return null;
  return `${acn.slice(0, 3)} ${acn.slice(3, 6)} ${acn.slice(6, 9)}`;
}

export type AcnLookupSource = "checksum" | "abr-live";

export interface AcnLookupResult {
  acn: string;
  acn_formatted: string;
  valid_checksum: boolean;
  source: AcnLookupSource;
  live: AcnLiveDetails | null;
  live_error: string | null;
}

export interface AcnLiveDetails {
  entity_name: string | null;
  entity_type_name: string | null;
  abn: string | null;
  abn_status: string | null;
  abn_status_effective_from: string | null;
  gst_registered: boolean | null;
  gst_effective_from: string | null;
  business_state: string | null;
  business_postcode: string | null;
}

// The ABR AcnDetails.aspx endpoint returns JSONP wrapped as
// `callback({...})` when no explicit callback is passed. We request no
// callback and get a plain JSON body — but some deployments still wrap in
// the JSONP shell, so this unwraps defensively.
function stripJsonpWrapper(body: string): string {
  const trimmed = body.trim();
  const match = trimmed.match(/^[A-Za-z_$][\w$]*\((.*)\);?$/s);
  return match ? match[1] : trimmed;
}

interface AbrAcnRaw {
  Abn?: string;
  AbnStatus?: string;
  AbnStatusEffectiveFrom?: string;
  Acn?: string;
  AddressPostcode?: string;
  AddressState?: string;
  EntityName?: string;
  EntityTypeCode?: string;
  EntityTypeName?: string;
  Gst?: string;
  Message?: string;
  BusinessName?: string[];
}

function coerceLive(raw: AbrAcnRaw): AcnLiveDetails {
  return {
    entity_name: raw.EntityName || (raw.BusinessName && raw.BusinessName[0]) || null,
    entity_type_name: raw.EntityTypeName || null,
    abn: raw.Abn || null,
    abn_status: raw.AbnStatus || null,
    abn_status_effective_from: raw.AbnStatusEffectiveFrom || null,
    gst_registered: raw.Gst ? raw.Gst !== "" : null,
    gst_effective_from: raw.Gst || null,
    business_state: raw.AddressState || null,
    business_postcode: raw.AddressPostcode || null,
  };
}

/**
 * Optional live probe of the free ABR AcnDetails web service. Returns null
 * when ABR_GUID is unset (registered users only). Never throws — errors are
 * surfaced in the result payload as `live_error`.
 *
 * Note: this is a *free* ABR-side view of an ASIC-registered company. The
 * paid ASIC Company Extract (charges, historical officers) is not covered
 * by this probe and would require a separate ASIC Connect API key.
 */
export async function lookupAcnLive(
  acn: string,
  opts?: { guid?: string; timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<{ live: AcnLiveDetails | null; live_error: string | null }> {
  const guid = opts?.guid ?? process.env.ABR_GUID;
  if (!guid) {
    return {
      live: null,
      live_error: "ABR_GUID not configured (register free at https://abr.business.gov.au/Tools/WebServices)",
    };
  }
  const timeoutMs = opts?.timeoutMs ?? 4000;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const url = `https://abr.business.gov.au/json/AcnDetails.aspx?acn=${encodeURIComponent(acn)}&guid=${encodeURIComponent(guid)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    if (!res.ok) {
      return { live: null, live_error: `ABR HTTP ${res.status}` };
    }
    const bodyText = await res.text();
    const jsonText = stripJsonpWrapper(bodyText);
    let raw: AbrAcnRaw;
    try {
      raw = JSON.parse(jsonText) as AbrAcnRaw;
    } catch (parseErr) {
      return { live: null, live_error: `ABR parse error: ${(parseErr as Error).message}` };
    }
    if (raw.Message && raw.Message.trim().length > 0) {
      // ABR returns Message when the ACN is invalid or unknown.
      return { live: null, live_error: raw.Message };
    }
    return { live: coerceLive(raw), live_error: null };
  } catch (err) {
    const message = (err as Error)?.name === "AbortError"
      ? `ABR timeout after ${timeoutMs}ms`
      : (err as Error).message;
    return { live: null, live_error: message };
  } finally {
    clearTimeout(timer);
  }
}
