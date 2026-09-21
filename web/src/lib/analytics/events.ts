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

/**
 * G16-A — how the account was created. `email` = password form,
 * `magic_link` = /auth/verify, `google` = GIS / redirect OAuth, `card` =
 * evaluator register-with-card, `temp_password` = auto-created from an
 * anonymous SVI run / guest report, `wallet` = reserved (never emitted yet).
 */
export type SignUpMethod = "email" | "google" | "wallet" | "magic_link" | "card" | "temp_password";

/** G16-A — where the free-tier cut / unlock rail was rendered (lane B picks the value). */
export type PaywallSurface = "tbr_locked_chapter" | "tbr_unlock_rail" | "report_paywall_gate" | "gate_card" | "funding_paywall" | "other";

/** G16-A — under which entitlement the founder saw the report. */
export type ReportViewTier = "free" | "paid" | "plan";

// ── Discriminated union of all tracked events ──────────────────────────

export type AnalyticsEvent =
  // ── G16-A funnel steps (server-side, once per step; `qa: true` on qa-live-* accounts) ──
  //   sign_up                — lib/auth.ts (every app_users creation path) + register-with-card
  //   svi_analyze            — POST /api/intake (`first` = caller's first saved run) + POST /api/svi
  //   svi_score_computed     — same two routes, once a score exists
  //   report_view            — /workspace/reports/business render (+ client via /api/analytics/event)
  //   paywall_view           — client (lane B) via POST /api/analytics/event
  //   checkout               — POST /api/reports/checkout (Stripe session created)
  //   trust_report_purchased — Stripe webhook (below)
  | { name: "sign_up"; params: { segment: UserSegment; method: SignUpMethod; jurisdiction?: string; persona?: string; qa?: boolean } }
  | { name: "trial_start"; params: { plan: PlanCode; segment: UserSegment; days: number } }
  | { name: "trial_end"; params: { plan: PlanCode; converted: boolean; reason?: "expired" | "canceled" | "converted" } }
  | { name: "subscribe"; params: { plan: PlanCode; price_aud: number; gst_aud: number; interval: "month" | "year"; via?: "checkout" | "portal" } }
  | { name: "plan_upgrade"; params: { from_plan: PlanCode; to_plan: PlanCode; delta_aud: number } }
  | { name: "plan_downgrade"; params: { from_plan: PlanCode; to_plan: PlanCode; delta_aud: number } }
  | { name: "plan_cancel"; params: { plan: PlanCode; reason?: string; at_period_end: boolean } }
  | { name: "report_generate"; params: { report_kind: string; credits_spent: number; word_count?: number; project_id?: string } }
  | { name: "dashboard_view"; params: { dashboard: string; segment: UserSegment } }
  | { name: "feature_gate_hit"; params: { feature: string; current_plan: PlanCode; required_plan?: PlanCode; surface?: string; qa?: boolean } }
  | { name: "credits_spend"; params: { amount: number; reason: string; balance_after?: number } }
  | { name: "credits_purchase"; params: { amount: number; price_aud: number; gst_aud: number } }
  | { name: "equity_offer_request"; params: { deal_id: string; offer_aud: number; segment: UserSegment } }
  | { name: "share_link_open"; params: { link_kind: "report" | "deal" | "profile"; token_hash: string } }
  | { name: "evidence_upload"; params: { evidence_kind: string; size_bytes: number; project_id?: string } }
  | { name: "svi_analyze"; params: { project_id: string; first: boolean; score?: number; percentile?: number; analysis_id?: string; qa?: boolean } }
  | { name: "report_view"; params: { tier: ReportViewTier; pages_est?: number; project_id: string; qa?: boolean } }
  | { name: "paywall_view"; params: { surface: PaywallSurface | string; sku: string; amount_cents: number; project_id?: string; qa?: boolean } }
  | { name: "checkout"; params: { sku: string; amount_cents: number; project_id?: string; order_id?: string; qa?: boolean } }
  // ── G25-D review-before-pay (client via /api/analytics/event; anonymous allowed on the first) ──
  //   checkout_review_viewed — /checkout/review rendered (plan / pack / sku, interval, trial, entry surface)
  //   checkout_started       — the explicit Pay / Add-card button was pressed (the ONLY Stripe hand-off)
  | { name: "checkout_review_viewed"; params: { plan: string; kind: "plan" | "pack" | "sku"; interval: "monthly" | "annual" | "once"; trial: boolean; entry: string; amount_cents: number; qa?: boolean } }
  | { name: "checkout_started"; params: { plan: string; kind: "plan" | "pack" | "sku"; interval: "monthly" | "annual" | "once"; trial: boolean; entry: string; amount_cents: number; qa?: boolean } }
  | { name: "agent_invoke"; params: { agent: string; credits_spent: number; duration_ms?: number } }
  | { name: "cohort_action"; params: { cohort: string; action: string; detail?: Record<string, string | number | boolean> } }
  | { name: "investor_view_deal"; params: { deal_id: string; segment: UserSegment; source?: string } }
  | { name: "session_start"; params: { segment: UserSegment; jurisdiction?: string; referrer?: string } }
  // ── SVI score pipeline (CDO T-1009 — BQ analytics export) ─────────────
  | { name: "svi_score_computed"; params: { project_id: string; score: number; slug: string; user_id?: string; analysis_id?: string; qa?: boolean } }
  | { name: "investor_pack_generated"; params: { project_id: string; user_id: string; pages?: number } }
  | { name: "trial_activated"; params: { plan: PlanCode; user_id: string; trial_end_at?: string } }
  | { name: "checkout_completed"; params: { plan: PlanCode; user_id: string; session_id: string; gross_aud_cents?: number } }
  // ── G14-S33 money events (server-side; see lib/analytics.ts for the client-map twin) ──
  | { name: "trust_report_purchased"; params: { sku: string; gross_aud_cents: number; reconciled: boolean; user_id: string; session_id: string; qa?: boolean } }
  | { name: "funding_report_paid"; params: { paid_via: "one_off" | "credits" | "plan"; report_id: string; gross_aud_cents?: number } }
  | { name: "evaluator_trial_started"; params: { plan: string; trial_days: number; account_type: string; user_id: string } }
  | { name: "subscription_created"; params: { plan: string; plan_label?: string; status: string; trialing: boolean; interval: string; user_id?: string } }
  | { name: "tbr_share_created"; params: { project_scope: "default" | "project"; user_id: string } }
  // ── G19-S45 (D6) report-clarity survey — server twin of the client event, emitted by POST /api/nps ──
  | { name: "tbr_clarity_answered"; params: { score: number; surface: "founder" | "share"; has_comment: boolean; snapshot_id?: string; user_id?: string; qa?: boolean } }
  // ── G19-S45 engagement twins (client-emitted today; typed here so the GA4 limits test covers both maps) ──
  | { name: "tbr_section_view"; params: { section: string; surface: "founder" | "share" | "order_page" | "demo"; tier?: string; user_id?: string } }
  | { name: "tbr_export"; params: { format: "pdf" | "docx"; surface: string; user_id?: string } }
  // ── G25-C free allowance (server-side; lib/analytics/funnel.ts emitFreeReport*) ──
  //   free_report_submitted — a free report was reserved for an address (sequence_no 1 | 2, source guest | account)
  //   free_report_delivered — the PDF e-mail for that report was accepted by the provider
  | { name: "free_report_submitted"; params: { grant_id: string; sequence_no: 1 | 2; source: "guest" | "account"; queued: boolean; analysis_id?: string; qa?: boolean } }
  | { name: "free_report_delivered"; params: { grant_id: string; sequence_no: 1 | 2; source: "guest" | "account"; analysis_id?: string; qa?: boolean } }
  | { name: "dossier_view"; params: { evaluation_id: string; consent_tier: string; role: "assessor" | "founder"; surface: "page" | "api"; user_id: string } }
  // ── G13-S-D2 / G14 GA4 audit leftover — evaluator submitted their assessment ──
  | { name: "assessment_submitted"; params: { evaluation_id: string; decision: "pass" | "track" | "proceed" | "none"; version: number; user_id: string } }
  // ── G14-S34 founder feedback letter (server-side twins of the lib/analytics.ts client events) ──
  | { name: "feedback_letter_sent"; params: { letter_id: string; project_id: string; k: number; org_count: number; weakest_dim: string; user_id: string; delivered: boolean } }
  | { name: "feedback_letter_opened"; params: { letter_id: string; k: number; weakest_dim: string; user_id: string } }
  | { name: "feedback_letter_viewed"; params: { letter_id: string; k: number; weakest_dim: string; phase: string; user_id?: string } }
  | { name: "feedback_action_clicked"; params: { letter_id: string; action_id: string; dimension: string; href: string; user_id?: string } }
  // ── G21 P0-D institutional (FI) events — every one carries the FI envelope
  //    { organisation?, startup?, plan?, channel?, fi_ts?, qa? } (lib/analytics/fi-events.ts emitFiEvent);
  //    the names below are the ones the FI catalogue has no existing twin for.
  //    FI names that DO have a twin are aliases (FI_EVENT_ALIASES) — never duplicated.
  | { name: "website_imported"; params: FiEnvelopeParams & { url_host?: string; analysis_id?: string; project_id?: string } }
  | { name: "evidence_verified"; params: FiEnvelopeParams & { evidence_id: string; level: string; reviewer_id?: string; project_id?: string } }
  | { name: "score_recalculated"; params: FiEnvelopeParams & { project_id: string; reason: "evidence" | "schedule" | "version" | "correction" | "manual"; score?: number; svi_version?: string } }
  | { name: "cohort_created"; params: FiEnvelopeParams & { cohort_id: string; kind: "batch" | "intake" | "programme"; user_id?: string } }
  | { name: "startup_added_to_cohort"; params: FiEnvelopeParams & { cohort_id: string; project_id?: string; via: "intake" | "import" | "manual" | "batch" } }
  | { name: "batch_scored"; params: FiEnvelopeParams & { batch_id: string; items: number; failed: number; svi_version?: string } }
  | { name: "pilot_started"; params: FiEnvelopeParams & { pilot_id: string; sku: string; applicants_cap: number; amount_cents: number; pilot_source: "paid" | "comp"; user_id?: string } }
  | { name: "subscription_renewed"; params: FiEnvelopeParams & { invoice_id: string; billing_reason: string; gross_aud_cents: number; user_id?: string } }
  // ── G21 P3-A outcome ledger — an outcome recorded / proposed / resolved on a project ──
  | { name: "outcome_recorded"; params: FiEnvelopeParams & { outcome_id: string; project_id: string; kind: string; outcome_source: string; status: "proposed" | "confirmed" | "rejected"; user_id?: string } }
  // G21 P3-B: one row per institutional API read — resource + the key's sha256 handle, never PII.
  | { name: "institutional_api_read"; params: FiEnvelopeParams & { resource: string; resource_id?: string; key_id: string; status: number; user_id?: string } };

export type AnalyticsEventName = AnalyticsEvent["name"];

// ── G21 P0-D: the FI reporting vocabulary ─────────────────────────────

/**
 * Mandatory envelope on every institutional event (goal doc § P0-D):
 * organisation (evaluator / program account id), startup (project id), the
 * plan code the actor is on, the acquisition / usage channel, and the
 * ISO time the emitter observed (`fi_ts` — the row's own `ts` is the sink's).
 * All optional at the type level so a route that lacks one field can still
 * emit; `emitFiEvent` fills `fi_ts` and normalises the rest.
 */
export interface FiEnvelopeParams {
  organisation?: string;
  startup?: string;
  plan?: string;
  channel?: string;
  fi_ts?: string;
  /** The FI catalogue name when the row was stored under an alias target. */
  fi_event?: string;
  qa?: boolean;
}

/**
 * FI catalogue names that already have a server twin. The FI list is the
 * REPORTING vocabulary (/admin/funnel institutional section, the pilot
 * report); rows are stored under the existing canonical name so no funnel
 * step is double-counted, and `fi_event` on the row keeps the FI name.
 */
export const FI_EVENT_ALIASES = Object.freeze({
  startup_created: "svi_analyze",
  deck_uploaded: "evidence_upload",
  initial_score_generated: "svi_score_computed",
  evidence_added: "evidence_upload",
  report_opened: "report_view",
  report_shared: "tbr_share_created",
  evaluator_reviewed: "dossier_view",
  decision_recorded: "assessment_submitted",
  payment_completed: "checkout_completed",
  subscription_started: "subscription_created",
} as const satisfies Record<string, AnalyticsEventName>);

export type FiAliasName = keyof typeof FI_EVENT_ALIASES;

/** FI names stored under their own name (no existing twin). */
export const FI_NATIVE_EVENTS = Object.freeze([
  "website_imported",
  "evidence_verified",
  "score_recalculated",
  "cohort_created",
  "startup_added_to_cohort",
  "batch_scored",
  "pilot_started",
  "subscription_renewed",
  "outcome_recorded",
  "institutional_api_read",
] as const satisfies readonly AnalyticsEventName[]);

export type FiNativeName = (typeof FI_NATIVE_EVENTS)[number];
export type FiEventName = FiAliasName | FiNativeName;

/** The 20 FI catalogue names, in funnel order (18 from P0-D + `outcome_recorded` P3-A + `institutional_api_read` P3-B). */
export const FI_EVENT_CATALOGUE: readonly FiEventName[] = Object.freeze([
  "startup_created",
  "deck_uploaded",
  "website_imported",
  "initial_score_generated",
  "evidence_added",
  "evidence_verified",
  "score_recalculated",
  "report_opened",
  "report_shared",
  "cohort_created",
  "startup_added_to_cohort",
  "batch_scored",
  "evaluator_reviewed",
  "decision_recorded",
  "pilot_started",
  "payment_completed",
  "subscription_started",
  "subscription_renewed",
  "outcome_recorded",
  "institutional_api_read",
]);

/** Canonical stored name for an FI name (alias target, or itself). */
export function canonicalFiEvent(name: FiEventName): AnalyticsEventName {
  return name in FI_EVENT_ALIASES ? FI_EVENT_ALIASES[name as FiAliasName] : (name as FiNativeName);
}

// ── G16-A: QA accounts + client-emittable funnel events ────────────────

/**
 * Live-QA accounts (`tests/live-qa/lib/env.ts`): `qa-live-<yyyymmdd-hhmm>`,
 * `qa-live-member-<stamp>`, `qa-live-evaluator-<stamp>` @blockid.au. Every
 * funnel emit point stamps `qa: true` for them so scripts/funnel-report.mjs
 * and the traction snapshot exclude them from the counts.
 */
export const QA_EMAIL_RE = /^qa-live-(evaluator-|member-)?[0-9]{8}-[0-9]{4}@blockid\.au$/i;

export function isQaEmail(email: string | null | undefined): boolean {
  if (typeof email !== "string") return false;
  return QA_EMAIL_RE.test(email.trim());
}

/** `{ qa: true }` for a QA account, `{}` otherwise — spread into event params. */
export function qaFlag(email: string | null | undefined): { qa?: true } {
  return isQaEmail(email) ? { qa: true } : {};
}

/**
 * Event names a browser may send through POST /api/analytics/event. The
 * route drops anything else and always overwrites `user_id` / `qa`.
 */
export const CLIENT_EMITTABLE_EVENTS = Object.freeze([
  "paywall_view",
  "checkout",
  "checkout_review_viewed",
  "checkout_started",
  "report_view",
  "dashboard_view",
  "share_link_open",
] as const satisfies readonly AnalyticsEventName[]);

export type ClientEmittableEvent = (typeof CLIENT_EMITTABLE_EVENTS)[number];

export function isClientEmittableEvent(name: string): name is ClientEmittableEvent {
  return (CLIENT_EMITTABLE_EVENTS as readonly string[]).includes(name);
}

/** Events an anonymous browser (no session cookie) may still send — the public /tbr/* paywall. */
export const ANON_EMITTABLE_EVENTS: readonly ClientEmittableEvent[] = Object.freeze(["paywall_view", "share_link_open", "checkout_review_viewed"]);

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
  /** G16-A: `"client"` for browser-originated rows via /api/analytics/event (default `"server"`). */
  source?: string;
  /** G16-A: forwarded to the GA4 mirror (client rows are only mirrored when consented). */
  consentGranted?: boolean;
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
      ...(opts.source ? { source: opts.source } : {}),
      ...(typeof opts.consentGranted === "boolean" ? { consentGranted: opts.consentGranted } : {}),
    });
    return { ok: true };
  } catch (err) {
    console.warn(`[analytics] trackEvent failed for ${name}:`, (err as Error).message);
    return { ok: false, reason: (err as Error).message };
  }
}

// Exported for tests
export const _internal = { containsPii, PII_FIELDS };
