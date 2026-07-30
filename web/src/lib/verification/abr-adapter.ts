/**
 * ABR (Australian Business Register) adapter — Phase 2 Batch F sub-F2.
 *
 * Master Upgrade Plan §11.1 Business ID first-class: a Level-2 verification
 * requires an ABR-confirmed Active ABN. This adapter is the single entry
 * point the verification-level engine and the POST /api/verification/abr
 * route both call.
 *
 * The public ABR Web Services endpoint at
 *   https://abr.business.gov.au/json/AbnDetails.aspx?abn=...&guid=...&callback=abn_data
 * returns a JSONP payload of the form `abn_data({...})`. We unwrap the
 * envelope, normalise both the v202001 and v202108 payload shapes, and
 * return a Zod-validated result.
 *
 * Security note
 * -------------
 * NEVER log the ABR_GUID. On failure log only the ABN (public data) and the
 * HTTP status code so we can diagnose transient outages without leaking the
 * registered credential.
 *
 * Overlap with lib/compliance/abn.ts::lookupAbnLive — that helper predates
 * the Business ID feature and returns a different (compliance-shaped) type.
 * The two live in parallel until Phase 6 collapses them; this adapter is
 * the one wired into the verification-level engine.
 */

import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Public schema                                                       */
/* ------------------------------------------------------------------ */

export const AbnLookupResultSchema = z.object({
  abn: z.string().regex(/^\d{11}$/, "ABN must be 11 digits"),
  entityName: z.string().min(1),
  entityType: z.string().min(1),
  status: z.enum(["Active", "Cancelled"]),
  effectiveFrom: z.string(), // ISO 8601 date (YYYY-MM-DD) or empty-string-tolerant
  gstRegistered: z.boolean(),
  postcode: z.string().optional(),
  state: z.string().optional(),
  source: z.enum(["abr_web_services", "stub"]),
});

export type AbnLookupResult = z.infer<typeof AbnLookupResultSchema>;

/* ------------------------------------------------------------------ */
/* In-memory 24h cache (best-effort, single process)                   */
/* ------------------------------------------------------------------ */

interface CacheEntry {
  result: AbnLookupResult;
  expiresAt: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

/** Test-only: reset the in-memory cache. */
export function _resetAbrAdapterCache(): void {
  cache.clear();
}

/* ------------------------------------------------------------------ */
/* JSONP + shape normalisation                                         */
/* ------------------------------------------------------------------ */

/**
 * The ABR endpoint wraps the JSON payload in a `callback(...)` envelope
 * when a callback query param is supplied. Strip it (and any trailing
 * semicolon) so JSON.parse can consume the body.
 */
function stripJsonpWrapper(body: string): string {
  const trimmed = body.trim();
  // Allow any bare identifier (not just abn_data) — some ABR mirrors echo
  // whatever callback we passed. Suffix semicolon is optional.
  const match = trimmed.match(/^[A-Za-z_$][\w$]*\(([\s\S]*)\)\s*;?\s*$/);
  return match ? match[1] : trimmed;
}

/**
 * Union of both known ABR JSON shapes:
 *   - v202001 uses PascalCase leaves and `Gst` as a date string (empty when
 *     not registered).
 *   - v202108 nests entity name inside `EntityName.OrganisationName` and
 *     surfaces GST as an explicit boolean `GstRegistered`.
 * Extra unknown keys are tolerated.
 */
interface AbrRawPayload {
  Abn?: string;
  AbnStatus?: string;
  AbnStatusEffectiveFrom?: string;
  EntityName?: string | { OrganisationName?: string; FullName?: string };
  EntityTypeName?: string;
  EntityTypeCode?: string;
  Gst?: string; // v202001: empty string ⇒ not registered
  GstRegistered?: boolean; // v202108
  AddressPostcode?: string;
  AddressState?: string;
  Message?: string;
  BusinessName?: string[];
}

function extractEntityName(raw: AbrRawPayload): string | null {
  if (typeof raw.EntityName === "string" && raw.EntityName.trim().length > 0) {
    return raw.EntityName.trim();
  }
  if (raw.EntityName && typeof raw.EntityName === "object") {
    return (
      raw.EntityName.OrganisationName?.trim() ||
      raw.EntityName.FullName?.trim() ||
      null
    );
  }
  if (raw.BusinessName && raw.BusinessName.length > 0) {
    return raw.BusinessName[0]?.trim() ?? null;
  }
  return null;
}

function normaliseStatus(raw: string | undefined): "Active" | "Cancelled" | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (lower === "active") return "Active";
  if (lower === "cancelled" || lower === "canceled") return "Cancelled";
  return null;
}

function normaliseGst(raw: AbrRawPayload): boolean {
  if (typeof raw.GstRegistered === "boolean") return raw.GstRegistered;
  // v202001 shape — Gst is a date string when registered, empty string otherwise.
  if (typeof raw.Gst === "string") return raw.Gst.trim().length > 0;
  return false;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface LookupAbnOpts {
  /** Injectable fetch for tests. Defaults to global `fetch`. */
  fetchImpl?: typeof fetch;
  /** Timeout in ms. Defaults to 4000. */
  timeoutMs?: number;
  /** Bypass the in-memory 24h cache. Defaults to false. */
  skipCache?: boolean;
}

/**
 * Look up an ABN against the public ABR Web Services endpoint.
 *
 *   - Returns `null` when `ABR_GUID` is unset (never throws).
 *   - Returns `null` on network error, timeout, non-2xx response, malformed
 *     payload, or any missing required field.
 *   - On success returns a `AbnLookupResult` validated by Zod.
 *
 * The result is cached in-memory for 24h keyed by ABN. Cache is process-local
 * (best-effort); no shared cache is desired here because ABR data is
 * effectively free and the founder flow is low-volume.
 */
export async function lookupAbn(
  abn: string,
  opts: LookupAbnOpts = {},
): Promise<AbnLookupResult | null> {
  const cleaned = abn.replace(/\D+/g, "");
  if (cleaned.length !== 11) return null;

  const guid = process.env.ABR_GUID;
  if (!guid) return null;

  if (!opts.skipCache) {
    const hit = cache.get(cleaned);
    if (hit && hit.expiresAt > Date.now()) return hit.result;
  }

  const timeoutMs = opts.timeoutMs ?? 4000;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url =
    `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${encodeURIComponent(cleaned)}` +
    `&guid=${encodeURIComponent(guid)}&callback=abn_data`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(url, { signal: ctrl.signal });
  } catch (err) {
    // NEVER log the URL (contains GUID). Log ABN + error name only.
    console.warn("[blockid:abr-adapter] fetch failed", {
      abn: cleaned,
      error: (err as Error)?.name ?? "unknown",
    });
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    // NEVER include the URL or GUID in the log line.
    console.warn("[blockid:abr-adapter] non-2xx", {
      abn: cleaned,
      status: response.status,
    });
    return null;
  }

  let bodyText: string;
  try {
    bodyText = await response.text();
  } catch {
    return null;
  }

  let raw: AbrRawPayload;
  try {
    const jsonText = stripJsonpWrapper(bodyText);
    raw = JSON.parse(jsonText) as AbrRawPayload;
  } catch {
    console.warn("[blockid:abr-adapter] parse failed", { abn: cleaned });
    return null;
  }

  if (raw.Message && raw.Message.trim().length > 0) {
    // ABR returns Message on invalid/unknown ABN.
    return null;
  }

  const entityName = extractEntityName(raw);
  const status = normaliseStatus(raw.AbnStatus);
  const entityType = (raw.EntityTypeName ?? raw.EntityTypeCode ?? "").trim();
  const reportedAbn = (raw.Abn ?? cleaned).replace(/\D+/g, "");

  if (!entityName || !status || !entityType || reportedAbn.length !== 11) {
    return null;
  }

  const candidate = {
    abn: reportedAbn,
    entityName,
    entityType,
    status,
    effectiveFrom: (raw.AbnStatusEffectiveFrom ?? "").trim(),
    gstRegistered: normaliseGst(raw),
    ...(raw.AddressPostcode ? { postcode: raw.AddressPostcode.trim() } : {}),
    ...(raw.AddressState ? { state: raw.AddressState.trim() } : {}),
    source: "abr_web_services" as const,
  };

  const parsed = AbnLookupResultSchema.safeParse(candidate);
  if (!parsed.success) {
    console.warn("[blockid:abr-adapter] schema mismatch", { abn: cleaned });
    return null;
  }

  cache.set(cleaned, {
    result: parsed.data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return parsed.data;
}
