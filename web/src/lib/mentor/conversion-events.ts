// Mentor-funnel conversion events — GA4 + reseller_audit_log dual-write.
//
// Fires one typed event per funnel step:
//   attributed → invite_sent → invite_accepted → tier_a → tier_b → tier_c
//     → check_in_completed → consent_expiring_soon → consent_expired
//
// Every helper is safe to call from BOTH server actions AND "use client"
// components — the GA4 side guards `typeof window` and no-ops on the server,
// while the audit-log side lazy-imports getSupabaseAdmin() only when called
// from a server context (see writeAuditLog).
//
// See docs/plans/mentor-consent-model.md — audit log is the source of truth;
// GA4 is best-effort funnel telemetry. A nightly reconciliation job diffs
// the two and alerts on drift > 2%.

import type { MentorAccessTier } from "./access-tiers";

// ─── GA4 event names (stable — never rename without a data-team ticket) ─

export const MENTOR_GA4_EVENTS = {
  inviteSent: "mentor_invite_sent",
  inviteAccepted: "mentor_invite_accepted",
  inviteDeclined: "mentor_invite_declined",
  tierUpgraded: "mentor_tier_upgraded",
  tierRevoked: "mentor_tier_revoked",
  checkInCompleted: "mentor_check_in_completed",
  consentExpiringSoon: "mentor_consent_expiring_soon",
  consentExpired: "mentor_consent_expired",
  drawerOpen: "mentor_drawer_open",
} as const;

export type MentorGa4EventName =
  (typeof MENTOR_GA4_EVENTS)[keyof typeof MENTOR_GA4_EVENTS];

// ─── Event payload types ───────────────────────────────────────────────

interface BaseCtx {
  /** The mentor's reseller_id (mentor is a reseller-type user). */
  resellerId: string;
  founderId: string;
  projectId?: string | null;
}

export interface InviteSentPayload extends BaseCtx {
  requestedTier: MentorAccessTier;
}

export interface InviteAcceptedPayload extends BaseCtx {
  tier: MentorAccessTier;
}

export interface InviteDeclinedPayload extends BaseCtx {
  requestedTier: MentorAccessTier;
  reason?: string;
}

export interface TierUpgradedPayload extends BaseCtx {
  fromTier: MentorAccessTier;
  toTier: MentorAccessTier;
}

export interface TierRevokedPayload extends BaseCtx {
  tier: MentorAccessTier;
  reason?: string;
}

export interface CheckInCompletedPayload extends BaseCtx {
  noteId: string;
}

export interface ConsentExpiringSoonPayload extends BaseCtx {
  tier: MentorAccessTier;
  daysRemaining: number;
}

export interface ConsentExpiredPayload extends BaseCtx {
  tier: MentorAccessTier;
}

export interface DrawerOpenPayload extends BaseCtx {
  tier: MentorAccessTier;
}

// ─── GA4 client — window.gtag / dataLayer wrapper ──────────────────────

/**
 * Thin GA4 wrapper. SSR-safe: no-ops if window is undefined. Mirrors the
 * pattern in components/sales/paywall-nudge.tsx so behaviour is consistent
 * across the app.
 */
export function fireGa4(
  event: MentorGa4EventName,
  params: Record<string, unknown>,
): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: Array<Record<string, unknown>>;
  };
  try {
    w.gtag?.("event", event, params);
  } catch {
    /* ignore — telemetry must never break user flow */
  }
  try {
    w.dataLayer = w.dataLayer || [];
    w.dataLayer.push({ event, ...params });
  } catch {
    /* ignore */
  }
}

// ─── Audit log — server-only, lazy imported ────────────────────────────

interface AuditEntry {
  event_type: string; // e.g. "mentor.invite_sent"
  reseller_id: string;
  actor_user_id: string; // the mentor for outbound, the founder for inbound
  subject_user_id: string; // always the founder
  route: string;
  metadata: Record<string, unknown>;
}

/**
 * Write a mentor.* audit row. Only runs server-side — from "use client"
 * callsites the helper no-ops (the server action that mirrors the client
 * event is responsible for the audit write).
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  if (typeof window !== "undefined") return; // client-side no-op
  try {
    // Function-constructor hides the import from Turbopack static analysis so
    // supabase.ts (server-only) is not pulled into the browser bundle via the
    // transitive client-component chain (mentor-invite/form → conversion-events).
    // The server bundle still resolves it normally at runtime.
    const loadSupabase = new Function(
      "return import(\"@/lib/supabase\")",
    ) as () => Promise<typeof import("@/lib/supabase")>;
    const mod = await loadSupabase();
    const supabase = mod.getSupabaseAdmin?.();
    if (!supabase) return;
    await supabase.from("reseller_audit_log").insert({
      reseller_id: entry.reseller_id,
      actor_user_id: entry.actor_user_id,
      subject_user_id: entry.subject_user_id,
      action: entry.event_type,
      fields: [],
      route: entry.route,
      metadata: entry.metadata,
    });
  } catch {
    /* audit failures never break the caller — surfaced via nightly recon */
  }
}

// ─── Typed emit helpers ────────────────────────────────────────────────
//
// Each helper: (1) fires GA4 (client-side no-op if SSR), (2) writes an
// audit-log row (server-side no-op if in browser). Callers on the server
// should await; callers in the browser can fire-and-forget.

export function emitMentorInviteSent(
  p: InviteSentPayload,
  actorUserId: string,
): Promise<void> {
  const params = {
    reseller_id: p.resellerId,
    founder_id: p.founderId,
    project_id: p.projectId ?? null,
    requested_tier: p.requestedTier,
  };
  fireGa4(MENTOR_GA4_EVENTS.inviteSent, params);
  return writeAuditLog({
    event_type: "mentor.invite_sent",
    reseller_id: p.resellerId,
    actor_user_id: actorUserId,
    subject_user_id: p.founderId,
    route: "/api/mentor/grants/request",
    metadata: params,
  });
}

export function emitMentorInviteAccepted(
  p: InviteAcceptedPayload,
  actorUserId: string,
): Promise<void> {
  const params = {
    reseller_id: p.resellerId,
    founder_id: p.founderId,
    project_id: p.projectId ?? null,
    tier: p.tier,
  };
  fireGa4(MENTOR_GA4_EVENTS.inviteAccepted, params);
  return writeAuditLog({
    event_type: "mentor.invite_accepted",
    reseller_id: p.resellerId,
    actor_user_id: actorUserId,
    subject_user_id: p.founderId,
    route: "/dashboard/mentor-invite",
    metadata: params,
  });
}

export function emitMentorInviteDeclined(
  p: InviteDeclinedPayload,
  actorUserId: string,
): Promise<void> {
  const params = {
    reseller_id: p.resellerId,
    founder_id: p.founderId,
    project_id: p.projectId ?? null,
    requested_tier: p.requestedTier,
    reason: p.reason ?? null,
  };
  fireGa4(MENTOR_GA4_EVENTS.inviteDeclined, params);
  return writeAuditLog({
    event_type: "mentor.invite_declined",
    reseller_id: p.resellerId,
    actor_user_id: actorUserId,
    subject_user_id: p.founderId,
    route: "/dashboard/mentor-invite",
    metadata: params,
  });
}

export function emitMentorTierUpgraded(
  p: TierUpgradedPayload,
  actorUserId: string,
): Promise<void> {
  const params = {
    reseller_id: p.resellerId,
    founder_id: p.founderId,
    project_id: p.projectId ?? null,
    from_tier: p.fromTier,
    to_tier: p.toTier,
  };
  fireGa4(MENTOR_GA4_EVENTS.tierUpgraded, params);
  return writeAuditLog({
    event_type: "mentor.tier_upgraded",
    reseller_id: p.resellerId,
    actor_user_id: actorUserId,
    subject_user_id: p.founderId,
    route: "/dashboard/mentor-invite",
    metadata: params,
  });
}

export function emitMentorTierRevoked(
  p: TierRevokedPayload,
  actorUserId: string,
): Promise<void> {
  const params = {
    reseller_id: p.resellerId,
    founder_id: p.founderId,
    project_id: p.projectId ?? null,
    tier: p.tier,
    reason: p.reason ?? null,
  };
  fireGa4(MENTOR_GA4_EVENTS.tierRevoked, params);
  return writeAuditLog({
    event_type: "mentor.tier_revoked",
    reseller_id: p.resellerId,
    actor_user_id: actorUserId,
    subject_user_id: p.founderId,
    route: "/api/mentor/grants/revoke",
    metadata: params,
  });
}

export function emitMentorCheckInCompleted(
  p: CheckInCompletedPayload,
  actorUserId: string,
): Promise<void> {
  const params = {
    reseller_id: p.resellerId,
    founder_id: p.founderId,
    project_id: p.projectId ?? null,
    note_id: p.noteId,
  };
  fireGa4(MENTOR_GA4_EVENTS.checkInCompleted, params);
  return writeAuditLog({
    event_type: "mentor.check_in_completed",
    reseller_id: p.resellerId,
    actor_user_id: actorUserId,
    subject_user_id: p.founderId,
    route: "/api/mentor/notes",
    metadata: params,
  });
}

export function emitMentorConsentExpiringSoon(
  p: ConsentExpiringSoonPayload,
): Promise<void> {
  const params = {
    reseller_id: p.resellerId,
    founder_id: p.founderId,
    project_id: p.projectId ?? null,
    tier: p.tier,
    days_remaining: p.daysRemaining,
  };
  fireGa4(MENTOR_GA4_EVENTS.consentExpiringSoon, params);
  return writeAuditLog({
    event_type: "mentor.consent_expiring_soon",
    reseller_id: p.resellerId,
    actor_user_id: p.founderId, // system-initiated; attribute to founder
    subject_user_id: p.founderId,
    route: "cron/consent-expiry",
    metadata: params,
  });
}

export function emitMentorConsentExpired(
  p: ConsentExpiredPayload,
): Promise<void> {
  const params = {
    reseller_id: p.resellerId,
    founder_id: p.founderId,
    project_id: p.projectId ?? null,
    tier: p.tier,
  };
  fireGa4(MENTOR_GA4_EVENTS.consentExpired, params);
  return writeAuditLog({
    event_type: "mentor.consent_expired",
    reseller_id: p.resellerId,
    actor_user_id: p.founderId,
    subject_user_id: p.founderId,
    route: "cron/consent-expiry",
    metadata: params,
  });
}

export function emitMentorDrawerOpen(
  p: DrawerOpenPayload,
  actorUserId: string,
): Promise<void> {
  const params = {
    reseller_id: p.resellerId,
    founder_id: p.founderId,
    project_id: p.projectId ?? null,
    tier: p.tier,
  };
  fireGa4(MENTOR_GA4_EVENTS.drawerOpen, params);
  return writeAuditLog({
    event_type: "mentor.drawer_open",
    reseller_id: p.resellerId,
    actor_user_id: actorUserId,
    subject_user_id: p.founderId,
    route: "/reseller/customers",
    metadata: params,
  });
}
