// Small request-hardening helpers shared by the JSON API routes (S8-C API
// security review, 2026-09-11). Pure — no DB, no `server-only` — so route
// tests can exercise them with a plain `Request`.
//
//   readJsonBody(request, maxBytes)  size-capped JSON parse → 400 / 413 result
//   rejectCrossSite(request)         CSRF posture for cookie-auth mutations
//   isUuid(v)                        canonical 8-4-4-4-12 hex check
//   isGrantId(v)                     au_grants / au_programs id shape
//   PRIVATE_JSON_HEADERS             `Cache-Control: private, no-store`

import { NextResponse } from "next/server";

/** Default byte cap for a JSON body on the funding / evaluations routes. */
export const DEFAULT_JSON_MAX_BYTES = 64 * 1024;

/** Headers for JSON that is specific to the signed-in user — never shared-cache it. */
export const PRIVATE_JSON_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  "Cache-Control": "private, no-store",
});

export type JsonBodyResult<T = unknown> =
  | { ok: true; body: T }
  | { ok: false; status: 400 | 413; error: "invalid_json" | "payload_too_large"; response: NextResponse };

/**
 * Read and parse a JSON body with a hard byte cap. The raw text is measured
 * before `JSON.parse` so a multi-megabyte body is refused (413) without ever
 * being parsed; a body that is not valid JSON is a 400, never a 500.
 * Content-Length is advisory only and is not trusted.
 */
export async function readJsonBody<T = unknown>(
  request: Request,
  maxBytes: number = DEFAULT_JSON_MAX_BYTES,
): Promise<JsonBodyResult<T>> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return {
      ok: false,
      status: 400,
      error: "invalid_json",
      response: NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }),
    };
  }
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return {
      ok: false,
      status: 413,
      error: "payload_too_large",
      response: NextResponse.json({ ok: false, error: "payload_too_large", max_bytes: maxBytes }, { status: 413 }),
    };
  }
  try {
    // An empty body is not JSON — `request.json()` threw on it before, keep that.
    return { ok: true, body: JSON.parse(text) as T };
  } catch {
    return {
      ok: false,
      status: 400,
      error: "invalid_json",
      response: NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }),
    };
  }
}

/**
 * CSRF posture for cookie-authenticated mutations.
 *
 * The app's primary defence is the session cookie itself (`SameSite=Lax`,
 * HttpOnly — lib/auth.ts + supabase/server-anon.ts), which browsers omit on
 * cross-site POST/PUT/PATCH/DELETE. This adds the fetch-metadata check as a
 * second layer: a browser stamps `Sec-Fetch-Site: cross-site` on any request
 * initiated by another site, and we refuse those outright. The header is
 * only ever set by browsers, so curl / cron / server-to-server calls
 * (no header) are unaffected — the check never rejects a request merely for
 * lacking the header, and `same-site` (our own subdomains) is allowed.
 *
 * Returns a ready 403 for a cross-site request, else null.
 */
export function rejectCrossSite(request: Pick<Request, "headers">): NextResponse | null {
  const site = (request.headers.get("sec-fetch-site") ?? "").trim().toLowerCase();
  if (site === "cross-site") {
    return NextResponse.json({ ok: false, error: "cross_site_request_refused" }, { status: 403 });
  }
  return null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Canonical UUID (any version). Postgres rejects anything else with a 22P02 that would otherwise surface as a 500. */
export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

/** au_grants / au_programs primary keys: lower-case slug, ≤ 80 chars (seed max is 40). */
export const GRANT_ID_RE = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function isGrantId(v: unknown): v is string {
  return typeof v === "string" && GRANT_ID_RE.test(v);
}
