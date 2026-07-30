// Pure decision logic for enforceConsent — extracted so it can be unit-tested
// without any Supabase mocking. `enforce.ts` composes DB IO around this.
//
// Master Upgrade Plan §9.4 (consent domain) — Stage 4 Batch E sub-task E4.

/**
 * Minimal shape of a joined share_packages + consents row that the decision
 * needs. Kept intentionally narrow so the pure logic doesn't drift when the
 * DB grows extra columns.
 */
export type ConsentDecisionInput = {
  /** ISO string or null. */
  expires_at: string | null;
  /** ISO string or null — non-null means already revoked. */
  revoked_at: string | null;
  /** If true, share_token is scoped to a single recipient. */
  onward_share_prohibited: boolean;
  /** The kind of recipient bound to the consent. */
  recipient_kind:
    | "email"
    | "org"
    | "link"
    | "api_partner"
    | "public";
  /** Recipient handle stored on the consent. */
  recipient_id: string | null;
  /** Viewer's asserted recipient (e.g. email captured at link open). */
  viewer_recipient?: string;
  /** Clock — injected for testability. */
  now?: Date;
};

export type ConsentDecision =
  | { ok: true }
  | { ok: false; status: 403 | 410; reason: string };

/**
 * Decide whether a viewer may access the share_package fronted by this
 * consent. Ordering matters: expiry (410) is checked before revoke (403)
 * because an expired consent should return the RFC-9110 semantic
 * "Gone" — the resource intentionally no longer exists — whereas a
 * revoked consent is an authorisation failure the viewer might contest.
 */
export function decideConsentAccess(
  input: ConsentDecisionInput,
): ConsentDecision {
  const now = input.now ?? new Date();

  // Expiry — 410 Gone. Boundary is strict (expired the instant now >= expires_at).
  if (input.expires_at) {
    const exp = new Date(input.expires_at);
    if (now.getTime() >= exp.getTime()) {
      return { ok: false, status: 410, reason: "consent_expired" };
    }
  }

  // Revocation — 403 Forbidden.
  if (input.revoked_at) {
    return { ok: false, status: 403, reason: "consent_revoked" };
  }

  // Recipient enforcement — only applies when onward-share is prohibited
  // AND the consent is scoped to a *specific* recipient. public and link
  // kinds are unrestricted by definition; email/org/api_partner require a
  // matching viewer_recipient.
  if (input.onward_share_prohibited) {
    if (
      input.recipient_kind === "email" ||
      input.recipient_kind === "org" ||
      input.recipient_kind === "api_partner"
    ) {
      const asserted = (input.viewer_recipient ?? "").trim().toLowerCase();
      const expected = (input.recipient_id ?? "").trim().toLowerCase();
      if (!expected || asserted !== expected) {
        return { ok: false, status: 403, reason: "recipient_mismatch" };
      }
    }
  }

  return { ok: true };
}
