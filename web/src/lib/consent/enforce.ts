// enforceConsent — server-only middleware helper.
//
// Master Upgrade Plan §9.4 (consent domain) — Stage 4 Batch E sub-task E4.
//
// Given a share_token presented on a public URL, this helper:
//   1. Loads the share_packages row + its parent consents row.
//   2. Applies the pure decideConsentAccess() predicate (see enforce-logic.ts)
//      to determine expiry / revocation / recipient-mismatch outcome.
//   3. On allow: bumps access_count, sets first/last_accessed_at, and appends
//      a `viewed` row to consent_state_events. No PII is written into the
//      event metadata — only coarse buckets safe for compliance logs.
//   4. On deny: returns { ok: false, status: 403|410 } for the caller to
//      surface as an HTTP response.

import "server-only";
import { getSupabaseAdmin } from "../supabase";
import {
  decideConsentAccess,
  type ConsentDecisionInput,
} from "./enforce-logic";

export type ViewerCtx = {
  userAgent?: string;
  ip?: string;
  /** The recipient the viewer is asserting they are (e.g. verified email). */
  recipient?: string;
};

/** Narrow view of a share_packages row we hand back on success. */
export type SharePackageRow = {
  id: string;
  business_id: string;
  owner_user_id: string;
  consent_id: string;
  share_token: string;
  report_order_id: string | null;
  included_resources: unknown;
  watermark: string | null;
  access_count: number;
  first_accessed_at: string | null;
  last_accessed_at: string | null;
  created_at: string;
};

export type EnforceConsentResult =
  | { ok: true; sharePackage: SharePackageRow }
  | { ok: false; status: 403 | 410 };

/**
 * Coarse user-agent bucket safe to store in consent_state_events.metadata.
 * We intentionally throw away the full UA string — that's PII-adjacent
 * (device fingerprinting) and §9.4 says no PII in the event log.
 */
function uaBucket(ua: string | undefined): string {
  if (!ua) return "unknown";
  const s = ua.toLowerCase();
  if (s.includes("bot") || s.includes("spider") || s.includes("crawl")) {
    return "bot";
  }
  if (s.includes("mobile") || s.includes("android") || s.includes("iphone")) {
    return "mobile";
  }
  if (s.includes("mac") || s.includes("windows") || s.includes("linux")) {
    return "desktop";
  }
  return "other";
}

export async function enforceConsent(
  shareToken: string,
  viewerCtx: ViewerCtx,
): Promise<EnforceConsentResult> {
  const admin = getSupabaseAdmin();
  if (!admin) {
    // Fail closed. Consent enforcement cannot silently degrade.
    return { ok: false, status: 403 };
  }

  // 1. Load share_package + governing consent.
  const { data: pkg, error: pkgErr } = await admin
    .from("share_packages")
    .select(
      "id, business_id, owner_user_id, consent_id, share_token, report_order_id, included_resources, watermark, access_count, first_accessed_at, last_accessed_at, created_at",
    )
    .eq("share_token", shareToken)
    .maybeSingle();

  if (pkgErr || !pkg) {
    return { ok: false, status: 403 };
  }

  const { data: consent, error: consentErr } = await admin
    .from("consents")
    .select(
      "id, expires_at, revoked_at, onward_share_prohibited, recipient_kind, recipient_id",
    )
    .eq("id", (pkg as SharePackageRow).consent_id)
    .maybeSingle();

  if (consentErr || !consent) {
    return { ok: false, status: 403 };
  }

  // 2. Pure decision.
  const decision = decideConsentAccess({
    expires_at: (consent as { expires_at: string | null }).expires_at,
    revoked_at: (consent as { revoked_at: string | null }).revoked_at,
    onward_share_prohibited: (consent as {
      onward_share_prohibited: boolean;
    }).onward_share_prohibited,
    recipient_kind: (consent as {
      recipient_kind: ConsentDecisionInput["recipient_kind"];
    }).recipient_kind,
    recipient_id: (consent as { recipient_id: string | null }).recipient_id,
    viewer_recipient: viewerCtx.recipient,
  });

  if (!decision.ok) {
    return { ok: false, status: decision.status };
  }

  // 3. Allow path — update telemetry + append viewed event. Failure to update
  //    telemetry should NOT block access (view is the primary right); we log
  //    but return ok. The consent decision itself already succeeded.
  const nowIso = new Date().toISOString();
  const sharePackage = pkg as SharePackageRow;

  const nextFirstAccessed = sharePackage.first_accessed_at ?? nowIso;

  const { error: updateErr } = await admin
    .from("share_packages")
    .update({
      access_count: (sharePackage.access_count ?? 0) + 1,
      first_accessed_at: nextFirstAccessed,
      last_accessed_at: nowIso,
    })
    .eq("id", sharePackage.id);

  if (updateErr) {
    console.error(
      "[enforceConsent] telemetry update failed for share_package=",
      sharePackage.id,
      updateErr,
    );
  }

  // 4. Append consent_state_events row. metadata is deliberately PII-free
  //    — no raw IP, no full user-agent, no recipient email. See §9.4.
  const { error: eventErr } = await admin
    .from("consent_state_events")
    .insert({
      consent_id: sharePackage.consent_id,
      event_type: "viewed",
      actor_user_id: null,
      metadata: {
        ua_bucket: uaBucket(viewerCtx.userAgent),
        share_package_id: sharePackage.id,
      },
    });

  if (eventErr) {
    console.error(
      "[enforceConsent] consent_state_events insert failed for consent=",
      sharePackage.consent_id,
      eventErr,
    );
  }

  return {
    ok: true,
    sharePackage: {
      ...sharePackage,
      access_count: (sharePackage.access_count ?? 0) + 1,
      first_accessed_at: nextFirstAccessed,
      last_accessed_at: nowIso,
    },
  };
}
