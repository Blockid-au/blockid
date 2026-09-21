// G21 P0-D — institutional (FI) event envelope.
//
//   emitFiEvent(name, envelope)  — one entry point for the 18-name FI
//   reporting vocabulary (events.ts FI_EVENT_CATALOGUE). Aliases resolve to
//   the existing canonical event so no funnel step is double-counted; the FI
//   name travels on the row as `fi_event`. The envelope
//   { organisation, startup, plan, channel, ts, qa } is normalised: `startup`
//   is mirrored to `project_id` (what every existing reducer keys on), `ts`
//   becomes `fi_ts`, empty strings are dropped, `qa` is derived from the
//   e-mail when given.
//
//   onInvoicePaid(invoice, user)  — `subscription_renewed` for a Stripe
//   `invoice.paid` on a subscription cycle. The Stripe webhook is lane
//   P0-C's file; the merging session adds ONE line inside
//   handleInvoicePaid() after `paidUser` is resolved:
//       void onInvoicePaid(invoice, paidUser ? { id: paidUser.id, email: paidUser.email, plan: paidUser.plan } : null);
//
//   onPilotStarted(order)  — `pilot_started`. RETIRED as a producer by G25
//   (2026-09-21): the paid Cohort Validation Pilot and the comp are gone, so
//   nothing calls it any more; the builder and the event name stay so the
//   historical rows in analytics_events keep reducing on /admin/funnel.
//
// Never throws, never awaits the network (trackEvent swallows). Callers `void`.

import {
  canonicalFiEvent,
  FI_EVENT_ALIASES,
  qaFlag,
  trackEvent,
  type AnalyticsEvent,
  type FiEventName,
} from "./events";

export interface FiEnvelope {
  /** Evaluator / program account id (the organisation doing the assessing). */
  organisation?: string | null;
  /** Project id of the startup being assessed. */
  startup?: string | null;
  /** Plan code of the acting account (app_users.plan). */
  plan?: string | null;
  /** Acquisition / usage channel: "intake_link", "csv_import", "workspace", "api", "webhook:stripe", … */
  channel?: string | null;
  /** ISO time the emitter observed; defaults to now. */
  ts?: string | null;
  /** Force the QA flag (otherwise derived from `email`). */
  qa?: boolean;
  /** Actor e-mail — used ONLY to derive `qa`; never sent. */
  email?: string | null;
  /** Actor user id (row user_id). */
  userId?: string | null;
  /** Session id (anonymous runs). */
  sessionId?: string | null;
  /** Idempotency key. */
  eventId?: string;
  /** Row source label (default "server"). */
  source?: string;
  /** Any event-specific params (project_id, sku, …). */
  [key: string]: unknown;
}

const RESERVED = new Set(["organisation", "startup", "plan", "channel", "ts", "qa", "email", "userId", "sessionId", "eventId", "source"]);

/** Pure: the params object trackEvent receives for an FI envelope. */
export function normaliseFiEnvelope(name: FiEventName, envelope: FiEnvelope, now: Date = new Date()): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(envelope)) {
    if (RESERVED.has(k)) continue;
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null);
  const organisation = str(envelope.organisation);
  const startup = str(envelope.startup);
  const plan = str(envelope.plan);
  const channel = str(envelope.channel);
  if (organisation) out.organisation = organisation;
  if (startup) {
    out.startup = startup;
    if (out.project_id === undefined) out.project_id = startup;
  }
  if (plan) out.plan = plan;
  if (channel) out.channel = channel;
  const ts = str(envelope.ts);
  out.fi_ts = ts && Number.isFinite(Date.parse(ts)) ? new Date(ts).toISOString() : now.toISOString();
  if (name in FI_EVENT_ALIASES) out.fi_event = name;
  const qa = envelope.qa === true ? { qa: true as const } : qaFlag(envelope.email);
  if (qa.qa) out.qa = true;
  return out;
}

/**
 * Emit an FI-catalogue event. Resolves aliases to the canonical stored name
 * and attaches the normalised envelope. Fire-and-forget.
 */
export function emitFiEvent(name: FiEventName, envelope: FiEnvelope = {}): void {
  const canonical = canonicalFiEvent(name);
  const params = normaliseFiEnvelope(name, envelope);
  void trackEvent(canonical as AnalyticsEvent["name"], params as never, {
    userId: envelope.userId ?? null,
    sessionId: envelope.sessionId ?? null,
    eventId: envelope.eventId,
    ...(envelope.source ? { source: envelope.source } : {}),
    consentGranted: true,
  });
}

// ── Webhook hooks (called from lane P0-C's files with one line each) ──

/** The slice of Stripe.Invoice the renewal event needs (no Stripe import here). */
export interface InvoicePaidLike {
  id?: string | null;
  billing_reason?: string | null;
  amount_paid?: number | null;
  customer?: string | { id?: string } | null;
}

export interface InvoicePaidUser {
  id: string | null;
  email?: string | null;
  plan?: string | null;
}

/** Billing reasons that mean "a renewal" (the create is `subscription_created` already). */
export const RENEWAL_BILLING_REASONS: readonly string[] = Object.freeze(["subscription_cycle", "subscription_update"]);

/**
 * `subscription_renewed` — once per invoice (event_id derived from the
 * invoice id by the sink's idempotency); only for renewal billing reasons.
 * Returns true when an event was emitted (pure decision, testable).
 */
export function onInvoicePaid(invoice: InvoicePaidLike, user: InvoicePaidUser | null): boolean {
  const reason = invoice.billing_reason ?? "";
  if (!RENEWAL_BILLING_REASONS.includes(reason)) return false;
  const invoiceId = typeof invoice.id === "string" ? invoice.id : "";
  if (!invoiceId) return false;
  emitFiEvent("subscription_renewed", {
    invoice_id: invoiceId,
    billing_reason: reason,
    gross_aud_cents: invoice.amount_paid ?? 0,
    ...(user?.id ? { user_id: user.id } : {}),
    organisation: user?.id ?? null,
    plan: user?.plan ?? null,
    channel: "webhook:stripe",
    userId: user?.id ?? null,
    email: user?.email ?? null,
    source: "webhook:stripe",
  });
  return true;
}

export interface PilotStartedInput {
  id: string;
  sku: string;
  applicantsCap: number;
  amountCents: number;
  source: "paid" | "comp";
  userId?: string | null;
  email?: string | null;
  plan?: string | null;
  projectId?: string | null;
  channel?: string | null;
}

/** `pilot_started` — one per pilot row. */
export function onPilotStarted(order: PilotStartedInput): void {
  emitFiEvent("pilot_started", {
    pilot_id: order.id,
    sku: order.sku,
    applicants_cap: order.applicantsCap,
    amount_cents: order.amountCents,
    pilot_source: order.source === "paid" ? "paid" : "comp",
    ...(order.userId ? { user_id: order.userId } : {}),
    organisation: order.userId ?? null,
    startup: order.projectId ?? null,
    plan: order.plan ?? null,
    channel: order.channel ?? (order.source === "paid" ? "checkout:pilot" : "admin:comp"),
    userId: order.userId ?? null,
    email: order.email ?? null,
  });
}

// ── Intake-side helpers (wired in this lane) ─────────────────────────

export interface ImportedInput {
  userId: string | null;
  email?: string | null;
  sessionId?: string | null;
  analysisId?: string | null;
  projectId?: string | null;
  plan?: string | null;
  channel: "analyze" | "intake" | "intake_link" | "api";
}

/** `website_imported` — a URL was fetched and folded into the analysis. */
export function emitWebsiteImported(input: ImportedInput & { url: string }): void {
  let host = "";
  try {
    host = new URL(input.url.startsWith("http") ? input.url : `https://${input.url}`).hostname;
  } catch {
    host = "";
  }
  emitFiEvent("website_imported", {
    ...(host ? { url_host: host } : {}),
    ...(input.analysisId ? { analysis_id: input.analysisId } : {}),
    startup: input.projectId ?? input.analysisId ?? null,
    plan: input.plan ?? null,
    channel: input.channel,
    userId: input.userId,
    sessionId: input.sessionId ?? null,
    email: input.email ?? null,
  });
}

/** `deck_uploaded` (alias → evidence_upload with evidence_kind "pitch_deck"). */
export function emitDeckUploaded(input: ImportedInput & { sizeBytes: number; mimeType?: string | null }): void {
  emitFiEvent("deck_uploaded", {
    evidence_kind: "pitch_deck",
    size_bytes: Math.max(0, Math.floor(input.sizeBytes)),
    ...(input.mimeType ? { mime_type: input.mimeType } : {}),
    startup: input.projectId ?? input.analysisId ?? null,
    plan: input.plan ?? null,
    channel: input.channel,
    userId: input.userId,
    sessionId: input.sessionId ?? null,
    email: input.email ?? null,
  });
}


// ── Evidence-side + score-side helpers (G21 P1-C) ─────────────────────
//
// Three FI events with the envelope { organisation = the startup OWNER's
// user id (the founder account holds the record), startup = project id,
// plan = the owner's plan, channel }. Each has a pure `…Envelope()` builder
// (tested) and an `emit…()` wrapper that fires it through emitFiEvent.

export interface EvidenceActorInput {
  /** The startup owner's user id — the FI "organisation" for founder-held records. */
  ownerUserId: string | null;
  /** The acting user (owner or an editor member); defaults to the owner. */
  actorUserId?: string | null;
  email?: string | null;
  plan?: string | null;
  projectId: string | null;
  channel: "workspace" | "vault" | "connector" | "admin_review" | "api" | "cron";
}

export interface EvidenceAddedInput extends EvidenceActorInput {
  evidenceId?: string | null;
  dimension: string | null;
  evidenceType: string;
  confidenceLevel: string;
}

/** Pure: the envelope `evidence_added` (alias → evidence_upload) is emitted with. */
export function evidenceAddedEnvelope(input: EvidenceAddedInput): FiEnvelope {
  return {
    ...(input.evidenceId ? { evidence_id: input.evidenceId } : {}),
    dimension: input.dimension ?? "general",
    evidence_type: input.evidenceType,
    confidence_level: input.confidenceLevel,
    organisation: input.ownerUserId,
    startup: input.projectId,
    plan: input.plan ?? null,
    channel: input.channel,
    userId: input.actorUserId ?? input.ownerUserId,
    email: input.email ?? null,
  };
}

export function emitEvidenceAdded(input: EvidenceAddedInput): void {
  emitFiEvent("evidence_added", evidenceAddedEnvelope(input));
}

export interface EvidenceVerifiedInput extends EvidenceActorInput {
  evidenceId: string;
  /** The level the row now carries (third_party_verified for a reviewer approval). */
  level: string;
  reviewerId?: string | null;
  dimension?: string | null;
  evidenceType?: string | null;
}

/** Pure: the envelope `evidence_verified` (native) is emitted with. */
export function evidenceVerifiedEnvelope(input: EvidenceVerifiedInput): FiEnvelope {
  return {
    evidence_id: input.evidenceId,
    level: input.level,
    ...(input.reviewerId ? { reviewer_id: input.reviewerId } : {}),
    ...(input.dimension ? { dimension: input.dimension } : {}),
    ...(input.evidenceType ? { evidence_type: input.evidenceType } : {}),
    ...(input.projectId ? { project_id: input.projectId } : {}),
    organisation: input.ownerUserId,
    startup: input.projectId,
    plan: input.plan ?? null,
    channel: input.channel,
    userId: input.actorUserId ?? input.reviewerId ?? input.ownerUserId,
    email: input.email ?? null,
  };
}

export function emitEvidenceVerified(input: EvidenceVerifiedInput): void {
  emitFiEvent("evidence_verified", evidenceVerifiedEnvelope(input));
}

export type ScoreRecalcReason = "evidence" | "schedule" | "version" | "correction" | "manual";

export interface ScoreRecalculatedInput extends EvidenceActorInput {
  reason: ScoreRecalcReason;
  score: number;
  previousScore?: number | null;
  sviVersion?: string | null;
  stage?: number | null;
}

/** Pure: the envelope `score_recalculated` (native) is emitted with. Requires a project id. */
export function scoreRecalculatedEnvelope(input: ScoreRecalculatedInput): FiEnvelope | null {
  if (!input.projectId) return null;
  const delta = typeof input.previousScore === "number" ? input.score - input.previousScore : null;
  return {
    project_id: input.projectId,
    reason: input.reason,
    score: input.score,
    ...(delta !== null ? { delta } : {}),
    ...(typeof input.stage === "number" ? { stage: input.stage } : {}),
    ...(input.sviVersion ? { svi_version: input.sviVersion } : {}),
    organisation: input.ownerUserId,
    startup: input.projectId,
    plan: input.plan ?? null,
    channel: input.channel,
    userId: input.actorUserId ?? input.ownerUserId,
    email: input.email ?? null,
  };
}

/** Returns true when an event was emitted (false when there is no project to key on). */
export function emitScoreRecalculated(input: ScoreRecalculatedInput): boolean {
  const env = scoreRecalculatedEnvelope(input);
  if (!env) return false;
  emitFiEvent("score_recalculated", env);
  return true;
}

// ── G21 P3-A: outcome ledger ───────────────────────────────────────────

export interface OutcomeRecordedInput extends EvidenceActorInput {
  outcomeId: string;
  kind: string;
  source: string;
  status: "proposed" | "confirmed" | "rejected";
}

/** Pure: the envelope `outcome_recorded` (native) is emitted with. Requires a project id. */
export function outcomeRecordedEnvelope(input: OutcomeRecordedInput): FiEnvelope | null {
  if (!input.projectId) return null;
  return {
    outcome_id: input.outcomeId,
    project_id: input.projectId,
    kind: input.kind,
    // `source` is the sink's own column (RESERVED) — the outcome's source rides as outcome_source.
    outcome_source: input.source,
    status: input.status,
    organisation: input.ownerUserId,
    startup: input.projectId,
    plan: input.plan ?? null,
    channel: input.channel,
    userId: input.actorUserId ?? input.ownerUserId,
    email: input.email ?? null,
  };
}

/** Returns true when an event was emitted (false when there is no project to key on). */
export function emitOutcomeRecorded(input: OutcomeRecordedInput): boolean {
  const env = outcomeRecordedEnvelope(input);
  if (!env) return false;
  emitFiEvent("outcome_recorded", env);
  return true;
}
