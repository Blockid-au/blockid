// Consent event recorder.
//
// Every disclaimer acknowledgement, ToS acceptance, wholesale-investor
// certification, and marketing opt-in is written here. Rows are append-only
// (enforced at the DB layer via a RULE) and immediately mirrored into the
// audit_events hash chain so that a tamper attempt at the consent table can
// be detected by chain-verification.
//
// The disclaimer_hash column is denormalised on purpose: it captures the
// exact bytes of the disclaimer body_md the user actually saw, so a later
// counsel review can prove content ↔ ack alignment even if the
// disclaimer_registry row is superseded.

import "server-only";
import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "./supabase";
import { appendAudit } from "./audit";
import { commercialPreferenceDefaults, ensureEmailPreferences } from "./email-preferences";
import {
  MARKETING_CONSENT_LABEL,
  MARKETING_CONSENT_VERSION,
  type MarketingConsentMethod,
} from "./email/marketing-consent-copy";

export type RecordConsentParams = {
  user_id: string;
  kind: string; // see consent_events.consent_kind CHECK constraint (migration 0076)
  disclaimer_version: string;
  disclaimer_hash: string; // sha256 hex of body_md the user saw
  ip: string;
  ua: string;
  jurisdiction: string;
  granted: boolean;
  detail?: Record<string, unknown>;
};

export type RecordConsentResult = { id: string };

/** Convenience: hash disclaimer body_md so callers can produce a stable hash. */
export function hashDisclaimerBody(body_md: string): string {
  return createHash("sha256").update(body_md, "utf8").digest("hex");
}

/**
 * Persist a consent event and append a matching row to the audit chain.
 * Returns the consent_events.id (uuid) on success.
 *
 * Throws if supabase is not configured — consent MUST be durably recorded
 * before any legally-gated action proceeds; silent no-op would defeat the
 * whole compliance surface.
 */
export async function recordConsent(
  params: RecordConsentParams,
): Promise<RecordConsentResult> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    throw new Error("recordConsent: Supabase admin client unavailable");
  }

  const row = {
    user_id: params.user_id,
    consent_kind: params.kind,
    disclaimer_version: params.disclaimer_version,
    disclaimer_hash: params.disclaimer_hash,
    ip_address: params.ip || null,
    user_agent: params.ua || null,
    jurisdiction: params.jurisdiction,
    granted: params.granted,
    detail: params.detail ?? {},
  };

  const { data, error } = await admin
    .from("consent_events")
    .insert(row)
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`recordConsent: insert failed — ${error?.message ?? "no row returned"}`);
  }

  // Mirror into the hash-chained audit log. Failure here should NOT roll back
  // the consent row (the consent record itself is the legal artefact); we
  // log the failure via console so ops can reconcile.
  try {
    await appendAudit({
      user_id: params.user_id,
      actor: "user",
      action: "consent.recorded",
      resource_type: "consent_events",
      resource_id: data.id,
      detail: {
        kind: params.kind,
        version: params.disclaimer_version,
        hash: params.disclaimer_hash,
        granted: params.granted,
        jurisdiction: params.jurisdiction,
      },
    });
  } catch (e) {
    console.error(
      "[consent] audit append failed for consent_events.id=",
      data.id,
      e,
    );
  }

  return { id: data.id as string };
}

// ---------------------------------------------------------------------------
// G34-BT2 EM05 — express marketing consent (D24-e)
// ---------------------------------------------------------------------------

export interface MarketingConsentParams {
  email: string;
  /** Present for an account; a guest (/analyze free report) has none. */
  userId?: string | null;
  /** The checkbox state. Only `true` writes anything — an unticked box leaves the (false-by-default) row alone. */
  granted: boolean;
  method: MarketingConsentMethod;
  ip?: string | null;
  ua?: string | null;
}

/**
 * Record an express marketing opt-in from an unticked checkbox.
 *
 *   * email_preferences: the commercial categories go TRUE and
 *     `marketing_consent_at / _method / _version` are stamped (0465). Before
 *     0465 is applied the stamp is skipped; lib/email-sends.ts then reads no
 *     consent for a new account or guest and sends nothing commercial
 *     (fail-closed), which is the safe side.
 *   * consent_events (kind `marketing`, the wording's version + sha256) for an
 *     account, mirrored into the audit chain by recordConsent.
 *
 * Best-effort and never throws: a consent write must not break a signup or a
 * free report. Returns true when the preference row was updated.
 */
export async function recordMarketingConsent(params: MarketingConsentParams): Promise<boolean> {
  if (!params.granted) return false;
  const email = params.email.trim().toLowerCase();
  if (!email.includes("@")) return false;
  let updated = false;
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return false;
    await ensureEmailPreferences(email, params.userId ?? undefined);
    const now = new Date().toISOString();
    const flags = { ...commercialPreferenceDefaults(true), updated_at: now };
    const full = await admin
      .from("email_preferences")
      .update({
        ...flags,
        marketing_consent_at: now,
        marketing_consent_method: params.method,
        marketing_consent_version: MARKETING_CONSENT_VERSION,
      })
      .eq("email", email);
    if (full.error) {
      const base = await admin.from("email_preferences").update(flags).eq("email", email);
      updated = !base.error;
    } else {
      updated = true;
    }
  } catch (e) {
    console.error("[consent] marketing preference write failed", e instanceof Error ? e.message : e);
  }

  if (params.userId) {
    try {
      await recordConsent({
        user_id: params.userId,
        kind: "marketing",
        disclaimer_version: MARKETING_CONSENT_VERSION,
        disclaimer_hash: hashDisclaimerBody(MARKETING_CONSENT_LABEL),
        ip: params.ip ?? "",
        ua: params.ua ?? "",
        jurisdiction: "AU",
        granted: true,
        detail: { method: params.method },
      });
    } catch (e) {
      console.error("[consent] marketing consent_events write failed", e instanceof Error ? e.message : e);
    }
  }
  return updated;
}
