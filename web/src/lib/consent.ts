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
