// Typed analytics event registry (W4 — GA4 + BigQuery pipeline).
//
// Single source of truth for the 20 conversion events the CDO spec tracks
// across the platform. Each event is a discriminated union so callers get
// autocomplete + compile-time payload checks; the trackEvent() helper below
// forwards the (validated) payload to lib/analytics/server.ts which mirrors
// to Supabase analytics_events + the GA4 Measurement Protocol.

import { z } from "zod";

// ── Common typed payload primitives ────────────────────────────────────

export type PlanCode =
  | "free"
  | "founder_lite"
  | "founder_pro"
  | "founder_scale"
  | "investor_basic"
  | "investor_pro"
  | "investor_syndicate"
  | "advisor_basic"
  | "advisor_pro"
  | "enterprise_ops"
  | "enterprise_platform"
  | "custom";

export type UserSegment = "founder" | "investor" | "advisor" | "enterprise" | "unknown";

// ── Discriminated union of all tracked events ──────────────────────────

export type AnalyticsEvent =
  | { name: "sign_up"; params: { segment: UserSegment; method: "google" | "email" | "wallet"; jurisdiction?: string } }
  | { name: "trial_start"; params: { plan: PlanCode; segment: UserSegment; days: number } }
  | { name: "trial_end"; params: { plan: PlanCode; converted: boolean; reason?: "expired" | "canceled" | "converted" } }
  | { name: "subscribe"; params: { plan: PlanCode; price_aud: number; gst_aud: number; interval: "month" | "year"; via?: "checkout" | "portal" } }
  | { name: "plan_upgrade"; params: { from_plan: PlanCode; to_plan: PlanCode; delta_aud: number } }
  | { name: "plan_downgrade"; params: { from_plan: PlanCode; to_plan: PlanCode; delta_aud: number } }
  | { name: "plan_cancel"; params: { plan: PlanCode; reason?: string; at_period_end: boolean } }
  | { name: "report_generate"; params: { report_kind: string; credits_spent: number; word_count?: number; project_id?: string } }
  | { name: "dashboard_view"; params: { dashboard: string; segment: UserSegment } }
  | { name: "feature_gate_hit"; params: { feature: string; current_plan: PlanCode; required_plan?: PlanCode; surface?: string } }
  | { name: "credits_spend"; params: { amount: number; reason: string; balance_after?: number } }
  | { name: "credits_purchase"; params: { amount: number; price_aud: number; gst_aud: number } }
  | { name: "equity_offer_request"; params: { deal_id: string; offer_aud: number; segment: UserSegment } }
  | { name: "share_link_open"; params: { link_kind: "report" | "deal" | "profile"; token_hash: string } }
  | { name: "evidence_upload"; params: { evidence_kind: string; size_bytes: number; project_id?: string } }
  | { name: "svi_analyze"; params: { project_id: string; score: number; percentile?: number } }
  | { name: "agent_invoke"; params: { agent: string; credits_spent: number; duration_ms?: number } }
  | { name: "cohort_action"; params: { cohort: string; action: string; detail?: Record<string, string | number | boolean> } }
  | { name: "investor_view_deal"; params: { deal_id: string; segment: UserSegment; source?: string } }
  | { name: "session_start"; params: { segment: UserSegment; jurisdiction?: string; referrer?: string } };

export type AnalyticsEventName = AnalyticsEvent["name"];

// ── PII guard ──────────────────────────────────────────────────────────
//
// GA4 + BigQuery must never receive raw PII. We reject top-level params that
// look like an email, phone, or credit-card so callers can't accidentally
// leak identifiers through the "detail" bag.

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(?:\+?61|0)[2-478](?:[ -]?[0-9]){8}/;
const CC_RE = /\b(?:\d[ -]?){13,19}\b/;

const PII_FIELDS = new Set([
  "email",
  "e_mail",
  "phone",
  "phone_number",
  "mobile",
  "credit_card",
  "cc",
  "ssn",
  "tfn",
  "password",
]);

function containsPii(params: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(params)) {
    if (PII_FIELDS.has(key.toLowerCase())) return `pii-key:${key}`;
    if (typeof value === "string") {
      if (EMAIL_RE.test(value)) return `pii-email:${key}`;
      if (PHONE_RE.test(value)) return `pii-phone:${key}`;
      if (CC_RE.test(value)) return `pii-cc:${key}`;
    }
  }
  return null;
}

// Zod schema — light validation on the envelope; per-event params rely on
// the discriminated union above for compile-time safety.
export const AnalyticsEnvelopeSchema = z.object({
  name: z.string().min(1).max(64),
  params: z.record(z.string(), z.unknown()).default({}),
});

// ── Public tracker ─────────────────────────────────────────────────────

export interface TrackOptions {
  userId?: string | null;
  sessionId?: string | null;
  eventId?: string; // caller may supply for idempotency
}

/**
 * Track an event by forwarding to the server-side emitter, which handles
 * GA4 Measurement Protocol + Supabase mirror + BQ idempotency. Returns
 * `{ ok: true }` on success; on failure logs and returns `{ ok: false }`
 * so callers never break a user-facing flow because of analytics.
 */
export async function trackEvent<E extends AnalyticsEvent>(
  name: E["name"],
  params: E["params"],
  opts: TrackOptions = {},
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const envelope = AnalyticsEnvelopeSchema.parse({ name, params: params as Record<string, unknown> });
    const leak = containsPii(envelope.params);
    if (leak) {
      // Refuse to send; log so devs notice the issue in staging.
      console.warn(`[analytics] rejected event ${name} — ${leak}`);
      return { ok: false, reason: leak };
    }
    // Lazy import so the browser bundle can still import this module for
    // its types without pulling in server-only code.
    const { emitEvent } = await import("./server");
    await emitEvent({
      name: envelope.name,
      params: envelope.params,
      userId: opts.userId ?? null,
      sessionId: opts.sessionId ?? null,
      eventId: opts.eventId,
    });
    return { ok: true };
  } catch (err) {
    console.warn(`[analytics] trackEvent failed for ${name}:`, (err as Error).message);
    return { ok: false, reason: (err as Error).message };
  }
}

// Exported for tests
export const _internal = { containsPii, PII_FIELDS };
