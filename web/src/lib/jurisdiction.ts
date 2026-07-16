// Jurisdiction detection.
//
// We triangulate three signals to decide which regulatory regime applies:
//   1. IP country — from Cloudflare's `cf-ipcountry` header (preferred, since
//      Cloudflare fronts the site per MEMORY.md reverse-proxy notes). Falls
//      back to Vercel's `x-vercel-ip-country` and then `x-country`.
//   2. Declared — read from the `bid_jur` cookie set by the middleware or an
//      explicit user selection in settings.
//   3. Billing — pulled from the authenticated user's `app_users.jurisdiction`
//      column when `jurisdiction_source = 'billing'` (populated from Stripe
//      customer address on webhook receipt).
//
// Confidence rules:
//   - `high`   → 2 or more distinct signals agree on the same country.
//   - `medium` → exactly one signal is available.
//   - `low`    → no signal available; we fall back to 'AU' default.
//
// The `source` returned reflects which signal "won" — used by callers that
// want to surface a "you appear to be in X — change?" affordance.

import "server-only";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "./supabase";
import { SESSION_COOKIE } from "./auth";

export type JurisdictionSource = "ip" | "declared" | "billing" | "default";
export type Confidence = "high" | "medium" | "low";

export type JurisdictionResult = {
  country: string; // ISO 3166-1 alpha-2, upper-case
  source: JurisdictionSource;
  confidence: Confidence;
};

/** Australian state / territory codes — used for state-level breakdown in analytics dashboards. */
export const AU_STATES: string[] = [
  "NSW",
  "VIC",
  "QLD",
  "WA",
  "SA",
  "TAS",
  "ACT",
  "NT",
];

/** Cookie name shared with middleware.ts — bump if we ever change the format. */
export const JUR_COOKIE = "bid_jur";

/** Session cookie name re-exported so middleware and API routes agree. */
const DEFAULT_COUNTRY = "AU";

function readHeader(req: Request | NextRequest, name: string): string | null {
  const v = req.headers.get(name);
  if (!v) return null;
  const trimmed = v.trim().toUpperCase();
  // Cloudflare returns 'XX' when country is unknown; treat as no signal.
  if (!trimmed || trimmed === "XX" || trimmed.length !== 2) return null;
  return trimmed;
}

function readIpCountry(req: Request | NextRequest): string | null {
  return (
    readHeader(req, "cf-ipcountry") ||
    readHeader(req, "x-vercel-ip-country") ||
    readHeader(req, "x-country")
  );
}

async function readDeclaredCookie(req: Request | NextRequest): Promise<string | null> {
  // Prefer the request's own cookie header when passed a NextRequest (middleware/edge).
  // Fall back to next/headers cookies() for standard route handlers.
  const raw = req.headers.get("cookie");
  if (raw) {
    const match = raw
      .split(/;\s*/)
      .map((p) => p.split("="))
      .find((kv) => kv[0] === JUR_COOKIE);
    if (match && match[1]) {
      const v = decodeURIComponent(match[1]).toUpperCase();
      if (v.length === 2) return v;
    }
  }
  try {
    const store = await cookies();
    const c = store.get(JUR_COOKIE);
    if (c?.value) {
      const v = c.value.toUpperCase();
      if (v.length === 2) return v;
    }
  } catch {
    // cookies() throws outside a request scope (e.g. edge middleware); ignore.
  }
  return null;
}

async function readBillingCountry(req: Request | NextRequest): Promise<string | null> {
  // Best-effort: look up the current session's user and read the stored
  // jurisdiction column when its source is 'billing'. Silently returns null
  // if the request is unauthenticated, supabase is unconfigured, or the
  // lookup fails — jurisdiction detection must never throw.
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return null;

    let sessionToken: string | null = null;
    const raw = req.headers.get("cookie");
    if (raw) {
      const match = raw
        .split(/;\s*/)
        .map((p) => p.split("="))
        .find((kv) => kv[0] === SESSION_COOKIE);
      if (match && match[1]) sessionToken = decodeURIComponent(match[1]);
    }
    if (!sessionToken) {
      try {
        const store = await cookies();
        sessionToken = store.get(SESSION_COOKIE)?.value ?? null;
      } catch {
        // outside request scope
      }
    }
    if (!sessionToken) return null;

    const { data: session } = await admin
      .from("sessions")
      .select("user_id")
      .eq("token", sessionToken)
      .maybeSingle();
    if (!session?.user_id) return null;

    const { data: user } = await admin
      .from("app_users")
      .select("jurisdiction, jurisdiction_source")
      .eq("id", session.user_id)
      .maybeSingle();
    if (!user) return null;
    if (user.jurisdiction_source !== "billing") return null;
    const v = String(user.jurisdiction || "").toUpperCase();
    return v.length === 2 ? v : null;
  } catch {
    return null;
  }
}

/**
 * Detect the caller's jurisdiction by triangulating IP, declared cookie,
 * and stored billing address. Never throws.
 */
export async function detectJurisdiction(
  req: Request | NextRequest,
): Promise<JurisdictionResult> {
  const ip = readIpCountry(req);
  const declared = await readDeclaredCookie(req);
  const billing = await readBillingCountry(req);

  const signals: Array<{ source: JurisdictionSource; value: string }> = [];
  if (ip) signals.push({ source: "ip", value: ip });
  if (declared) signals.push({ source: "declared", value: declared });
  if (billing) signals.push({ source: "billing", value: billing });

  if (signals.length === 0) {
    return { country: DEFAULT_COUNTRY, source: "default", confidence: "low" };
  }

  // Tally agreement.
  const counts = new Map<string, number>();
  for (const s of signals) counts.set(s.value, (counts.get(s.value) || 0) + 1);
  let winner = signals[0].value;
  let winnerCount = 0;
  for (const [k, v] of counts.entries()) {
    if (v > winnerCount) {
      winner = k;
      winnerCount = v;
    }
  }

  // Prefer 'declared' as the reported source when it wins or ties, otherwise
  // 'billing', otherwise 'ip'. This matches the intuitive precedence for
  // audit and UI ("you told us you're in X").
  const priority: JurisdictionSource[] = ["declared", "billing", "ip"];
  let reportedSource: JurisdictionSource = signals[0].source;
  for (const p of priority) {
    const match = signals.find((s) => s.source === p && s.value === winner);
    if (match) {
      reportedSource = match.source;
      break;
    }
  }

  const confidence: Confidence = winnerCount >= 2 ? "high" : "medium";
  return { country: winner, source: reportedSource, confidence };
}
