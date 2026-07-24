// ABN (Australian Business Number) validation + ABR live lookup.
//
// This module ships two independent capabilities:
//   1. `validateAbnChecksum(abn)` — pure, deterministic, offline. Implements
//      the ABR modulus-89 checksum algorithm documented at
//      https://abr.business.gov.au/Help/AbnFormat. Correct 11-digit ABNs
//      always pass; typos almost always fail.
//   2. `lookupAbnLive(abn)` — calls the free ABR web service at
//      https://abr.business.gov.au/json/AbnDetails.aspx to fetch the
//      registered entity name, ABN status, GST registration, and business
//      state. Requires `ABR_GUID` env var (register at
//      https://abr.business.gov.au/Tools/WebServices — free).
//
// Reference for the guide gap this closes: docs/plans/atlassian-standard-mapping-goal.md
// §1 phase 1 ("Missing: live ABR ABN-lookup probe"), spun off as P1g.
//
// Boundary: the ATO/ABR data is factual (name/status/GST), not advice. No
// AFSL disclaimer needed because we are not giving personal financial
// product advice — but callers surfacing the entity name into a founder
// workflow (e.g. auto-populating a Founder Agreement) should still let the
// user confirm the match.

export const ABN_CHECKSUM_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19] as const;

/**
 * Strip whitespace + non-digits and return a canonical 11-digit ABN string.
 * Returns null if the cleaned value isn't exactly 11 digits.
 */
export function normalizeAbn(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = String(input).replace(/\D+/g, "");
  return digits.length === 11 ? digits : null;
}

/**
 * Modulus-89 checksum. Subtract 1 from the leading digit, multiply each
 * digit by its weight, sum. Sum must be divisible by 89.
 */
export function validateAbnChecksum(input: string | null | undefined): boolean {
  const abn = normalizeAbn(input);
  if (!abn) return false;
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = Number(abn[i]);
    const weighted = i === 0 ? (digit - 1) * ABN_CHECKSUM_WEIGHTS[i] : digit * ABN_CHECKSUM_WEIGHTS[i];
    sum += weighted;
  }
  return sum > 0 && sum % 89 === 0;
}

/** Format as `NN NNN NNN NNN` for display. */
export function formatAbn(input: string | null | undefined): string | null {
  const abn = normalizeAbn(input);
  if (!abn) return null;
  return `${abn.slice(0, 2)} ${abn.slice(2, 5)} ${abn.slice(5, 8)} ${abn.slice(8, 11)}`;
}

export type AbnLookupSource = "checksum" | "abr-live";

export interface AbnLookupResult {
  abn: string;
  abn_formatted: string;
  valid_checksum: boolean;
  source: AbnLookupSource;
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

// The ABR AbnDetails.aspx endpoint returns JSONP wrapped as
// `callback({...})` when no explicit callback is passed. We request no
// callback and get a plain JSON body — but some deployments still wrap in
// the JSONP shell, so this unwraps defensively.
function stripJsonpWrapper(body: string): string {
  const trimmed = body.trim();
  const match = trimmed.match(/^[A-Za-z_$][\w$]*\((.*)\);?$/s);
  return match ? match[1] : trimmed;
}

interface AbrLiveRaw {
  Abn?: string;
  AbnStatus?: string;
  AbnStatusEffectiveFrom?: string;
  Acn?: string;
  AddressDate?: string;
  AddressPostcode?: string;
  AddressState?: string;
  EntityName?: string;
  EntityTypeCode?: string;
  EntityTypeName?: string;
  Gst?: string;
  Message?: string;
  BusinessName?: string[];
}

function coerceLive(raw: AbrLiveRaw): AbnLiveDetails {
  return {
    entity_name: raw.EntityName || (raw.BusinessName && raw.BusinessName[0]) || null,
    entity_type_name: raw.EntityTypeName || null,
    abn_status: raw.AbnStatus || null,
    abn_status_effective_from: raw.AbnStatusEffectiveFrom || null,
    gst_registered: raw.Gst ? raw.Gst !== "" : null,
    gst_effective_from: raw.Gst || null,
    business_state: raw.AddressState || null,
    business_postcode: raw.AddressPostcode || null,
    acn: raw.Acn || null,
  };
}

/**
 * Optional live probe of the ABR web service. Returns null when ABR_GUID is
 * unset (registered users only). Never throws — errors are surfaced in the
 * result payload as `live_error`.
 */
export async function lookupAbnLive(
  abn: string,
  opts?: { guid?: string; timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<{ live: AbnLiveDetails | null; live_error: string | null }> {
  const guid = opts?.guid ?? process.env.ABR_GUID;
  if (!guid) {
    return {
      live: null,
      live_error: "ABR_GUID not configured (register free at https://abr.business.gov.au/Tools/WebServices)",
    };
  }
  const timeoutMs = opts?.timeoutMs ?? 4000;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const url = `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${encodeURIComponent(abn)}&guid=${encodeURIComponent(guid)}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    if (!res.ok) {
      return { live: null, live_error: `ABR HTTP ${res.status}` };
    }
    const bodyText = await res.text();
    const jsonText = stripJsonpWrapper(bodyText);
    let raw: AbrLiveRaw;
    try {
      raw = JSON.parse(jsonText) as AbrLiveRaw;
    } catch (parseErr) {
      return { live: null, live_error: `ABR parse error: ${(parseErr as Error).message}` };
    }
    if (raw.Message && raw.Message.trim().length > 0) {
      // ABR returns Message when the ABN is invalid or unknown.
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
