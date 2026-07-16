// Legal fail-closed gates.
//
// These helpers throw when a compliance precondition is not met so that
// route handlers, server components, and blockchain paths never proceed
// past a missing consent, an unpassed legal review, or a non-wholesale
// user hitting an equity-offer surface.
//
// Each thrown Error has a `.status` property so the calling route handler
// can map it directly to an HTTP status code (403 / 409).

import "server-only";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "./../supabase";
import { SESSION_COOKIE } from "./../auth";
import { getCurrentVersion } from "./versions";

export class LegalGateError extends Error {
  status: number;
  code: string;
  constructor(message: string, opts: { status: number; code: string }) {
    super(message);
    this.name = "LegalGateError";
    this.status = opts.status;
    this.code = opts.code;
  }
}

async function currentUserId(): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  try {
    const store = await cookies();
    const token = store.get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const { data } = await admin
      .from("sessions")
      .select("user_id")
      .eq("token", token)
      .maybeSingle();
    return (data?.user_id as string) ?? null;
  } catch {
    return null;
  }
}

/**
 * Throws 403 if the current user's account has not passed internal legal
 * review (app_users.legal_review_passed = true). Called before any
 * equity-offer or tokenised-share write.
 */
export async function assertLegalReviewPassed(): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new LegalGateError("Supabase unavailable", {
      status: 503,
      code: "supabase_unavailable",
    });
  }
  const userId = await currentUserId();
  if (!userId) {
    throw new LegalGateError("Not authenticated", {
      status: 401,
      code: "unauthenticated",
    });
  }
  const { data, error } = await admin
    .from("app_users")
    .select("legal_review_passed")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw new LegalGateError(
      `Legal review lookup failed: ${error.message}`,
      { status: 500, code: "lookup_failed" },
    );
  }
  if (!data?.legal_review_passed) {
    throw new LegalGateError(
      "Legal review has not been passed for this account",
      { status: 403, code: "legal_review_required" },
    );
  }
}

/**
 * Throws 403 if the given user is not certified as a wholesale investor
 * per s708(8)/(11). Reads app_users.wholesale_status = 'wholesale_certified'.
 */
export async function assertWholesaleCertified(user_id: string): Promise<void> {
  if (!user_id) {
    throw new LegalGateError("user_id is required", {
      status: 400,
      code: "bad_request",
    });
  }
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new LegalGateError("Supabase unavailable", {
      status: 503,
      code: "supabase_unavailable",
    });
  }
  const { data, error } = await admin
    .from("app_users")
    .select("wholesale_status")
    .eq("id", user_id)
    .maybeSingle();
  if (error) {
    throw new LegalGateError(
      `Wholesale status lookup failed: ${error.message}`,
      { status: 500, code: "lookup_failed" },
    );
  }
  if (data?.wholesale_status !== "wholesale_certified") {
    throw new LegalGateError(
      "Wholesale investor certification required (Corporations Act s708(8)/(11))",
      { status: 403, code: "wholesale_required" },
    );
  }
}

/**
 * Ensure the user has an outstanding, granted consent for the given
 * disclaimer kind at its CURRENT version. Throws 409 if missing, revoked,
 * or superseded.
 *
 * Returns the consent_events.id and granted flag on success so callers can
 * link downstream records to the specific consent row.
 */
export async function requireAck(
  user_id: string,
  disclaimer_kind: string,
): Promise<{ id: string; granted: boolean }> {
  if (!user_id) {
    throw new LegalGateError("user_id is required", {
      status: 400,
      code: "bad_request",
    });
  }
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new LegalGateError("Supabase unavailable", {
      status: 503,
      code: "supabase_unavailable",
    });
  }
  const currentVersion = getCurrentVersion(disclaimer_kind);

  const { data, error } = await admin
    .from("consent_events")
    .select("id, granted, disclaimer_version, ts")
    .eq("user_id", user_id)
    .eq("consent_kind", disclaimer_kind)
    .eq("disclaimer_version", currentVersion)
    .order("ts", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new LegalGateError(
      `Consent lookup failed: ${error.message}`,
      { status: 500, code: "lookup_failed" },
    );
  }
  if (!data) {
    throw new LegalGateError(
      `Consent missing for '${disclaimer_kind}' at version ${currentVersion}`,
      { status: 409, code: "consent_missing" },
    );
  }
  if (data.granted === false) {
    throw new LegalGateError(
      `Consent explicitly revoked for '${disclaimer_kind}'`,
      { status: 409, code: "consent_revoked" },
    );
  }
  return { id: data.id as string, granted: Boolean(data.granted) };
}
