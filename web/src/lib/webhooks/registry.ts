// S20-B — outbound webhook event registry + enqueue.
//
// Events (payload = ids + a small summary; never PII beyond the owner's own
// project data — no emails, no share tokens, no report bodies):
//
//   svi.rescored             { project_id, account_id, svi_total, previous_svi,
//                              delta, stage, source: "rescore" | "snapshot" | "connector_resync",
//                              snapshot_date }
//   evidence.uploaded        { project_id, evidence_id, category, label,
//                              content_type, size_bytes, sha256 }
//   funding.report_ready     { report_id, project_id, grant_count,
//                              program_count, url }
//   evaluation.report_ready  { evaluation_id, project_id, report_id, kind,
//                              svi_total, via }
//   ping                     { endpoint_id, sent_at }   (test button only)
//
// Envelope on the wire (also what `webhook_deliveries.payload` stores):
//   { id, event, created_at, api_version, data }
//
// `enqueueWebhook(event, projectId, payload, opts)` ONLY writes
// webhook_deliveries rows — delivery is /api/cron/webhook-dispatch. It
// never throws (a webhook must never break the writer that emitted it) and
// returns the number of rows queued. Recipients of user-level endpoints
// default to the project's owner; pass `opts.userIds` for events whose
// natural subscriber is someone else (the evaluator who ran a report).
//
// Plan gate (`webhookAccessForPlan` / `canUseWebhooks`): founder tier ≥
// Growth (planIdToTier — grandfathers legacy growth / growth_annual), an
// active Startup Package, every evaluator tier (Scout / Firm / Program /
// VC Enterprise), or the `api.access` flag (Enterprise founder,
// Accelerator Enterprise). Checked on create AND at dispatch so a
// downgraded account stops receiving.
//
// No `server-only` — the writers' colocated route tests import this
// module with `@/lib/supabase` mocked; everything Supabase-shaped lives
// behind the store (./store.ts) and is fully wrapped in try/catch.

import { randomUUID } from "node:crypto";
import { planIdToTier, type PlanTier } from "@/lib/segments";
import { planHasGrowthExtras } from "@/lib/funding/growth-extras";
import { supabaseWebhookStore, type WebhookStore } from "./store";

export const WEBHOOK_EVENTS = ["svi.rescored", "evidence.uploaded", "funding.report_ready", "evaluation.report_ready"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];
/** `ping` is sent by the test button only — never subscribable. */
export type WebhookWireEvent = WebhookEvent | "ping";

export const WEBHOOK_API_VERSION = "2026-09-12";

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, { label: string; description: string }> = {
  "svi.rescored": { label: "SVI rescored", description: "The project's SVI changed — manual rescore, the nightly snapshot, or the weekly Stripe/Xero resync." },
  "evidence.uploaded": { label: "Evidence uploaded", description: "A file landed in the Evidence Vault (after the malware scan)." },
  "funding.report_ready": { label: "Money Finder report ready", description: "A paid Money Finder report finished generating." },
  "evaluation.report_ready": { label: "Evaluation report ready", description: "A Trust BizReport / rescore you ran on a startup you evaluate is ready." },
};

export function isWebhookEvent(v: unknown): v is WebhookEvent {
  return typeof v === "string" && (WEBHOOK_EVENTS as readonly string[]).includes(v);
}

export interface SviRescoredPayload {
  project_id: string | null;
  account_id: string;
  svi_total: number;
  previous_svi: number | null;
  delta: number | null;
  stage: number | null;
  /** S25-A adds "connector_resync": the weekly Stripe/Xero re-pull moved the score. */
  source: "rescore" | "snapshot" | "connector_resync";
  snapshot_date: string;
}
export interface EvidenceUploadedPayload {
  project_id: string;
  evidence_id: string;
  category: string | null;
  label: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
}
export interface FundingReportReadyPayload {
  report_id: string;
  project_id: string | null;
  grant_count: number;
  program_count: number;
  url: string;
}
export interface EvaluationReportReadyPayload {
  evaluation_id: string;
  project_id: string;
  report_id: string | null;
  kind: "full" | "rescore";
  svi_total: number | null;
  via: string;
}
export interface PingPayload {
  endpoint_id: string;
  sent_at: string;
}

export interface WebhookPayloads {
  "svi.rescored": SviRescoredPayload;
  "evidence.uploaded": EvidenceUploadedPayload;
  "funding.report_ready": FundingReportReadyPayload;
  "evaluation.report_ready": EvaluationReportReadyPayload;
  ping: PingPayload;
}

export interface WebhookEnvelope<E extends WebhookWireEvent = WebhookWireEvent> {
  id: string;
  event: E;
  created_at: string;
  api_version: string;
  data: WebhookPayloads[E];
}

export function buildEnvelope<E extends WebhookWireEvent>(
  event: E,
  data: WebhookPayloads[E],
  opts: { id?: string; now?: Date } = {},
): WebhookEnvelope<E> {
  return {
    id: opts.id ?? randomUUID(),
    event,
    created_at: (opts.now ?? new Date()).toISOString(),
    api_version: WEBHOOK_API_VERSION,
    data,
  };
}

// ── Plan gate ───────────────────────────────────────────────────────────────

const EVALUATOR_TIERS: ReadonlySet<PlanTier> = new Set<PlanTier>(["angel", "advisor", "vc_small", "vc_ent"]);

export type WebhookAccessReason = "founder_growth" | "evaluator" | "api_access" | "startup_package" | "admin" | "none";

/**
 * Pure: does this plan id / role unlock webhooks on its own? `none` means
 * "only if the user holds an active Startup Package" — the caller resolves
 * that with a DB read (`canUseWebhooks`).
 */
export function webhookAccessForPlan(
  planId: string | null | undefined,
  opts: { role?: string | null; features?: readonly string[] } = {},
): WebhookAccessReason {
  if (opts.role === "admin") return "admin";
  if (planHasGrowthExtras(planId)) return "founder_growth";
  if (EVALUATOR_TIERS.has(planIdToTier(planId))) return "evaluator";
  if (opts.features?.includes("api.access")) return "api_access";
  return "none";
}

export interface WebhookUser {
  id: string;
  plan: string | null | undefined;
  role?: string | null;
}

/**
 * Server: plan rung OR an active Startup Package. Never throws. Feature
 * flags are read through `getEntitlements` so a manual `api.access` grant
 * (entitlements table) counts too.
 */
export async function canUseWebhooks(
  user: WebhookUser | null | undefined,
  deps: { store?: WebhookStore | null; features?: (u: WebhookUser) => Promise<readonly string[]> } = {},
): Promise<{ allowed: boolean; reason: WebhookAccessReason }> {
  if (!user) return { allowed: false, reason: "none" };
  let reason = webhookAccessForPlan(user.plan, { role: user.role });
  if (reason !== "none") return { allowed: true, reason };
  try {
    const features = deps.features
      ? await deps.features(user)
      : await (await import("@/lib/entitlements")).getEntitlements(user.plan, user.id);
    reason = webhookAccessForPlan(user.plan, { role: user.role, features });
    if (reason !== "none") return { allowed: true, reason };
  } catch {
    // fall through to the package check
  }
  try {
    const store = deps.store === undefined ? supabaseWebhookStore() : deps.store;
    if (store && (await store.activePackageUserIds([user.id])).has(user.id)) {
      return { allowed: true, reason: "startup_package" };
    }
  } catch {
    // fail closed
  }
  return { allowed: false, reason: "none" };
}

/**
 * Batch form for the dispatcher: which of `userIds` may still receive
 * webhooks right now (plan re-check). Never throws — a DB error yields the
 * empty set (deliveries are parked as `plan_lapsed` only when the plan row
 * was readable; see dispatch.ts).
 */
export async function usersAllowedWebhooks(store: WebhookStore, userIds: readonly string[]): Promise<Set<string>> {
  const allowed = new Set<string>();
  const ids = Array.from(new Set(userIds));
  if (!ids.length) return allowed;
  const rows = await store.userPlans(ids);
  const pending: string[] = [];
  for (const r of rows) {
    if (webhookAccessForPlan(r.plan, { role: r.role }) !== "none") allowed.add(r.id);
    else pending.push(r.id);
  }
  if (pending.length) {
    try {
      const { getEntitlements } = await import("@/lib/entitlements");
      for (const id of pending) {
        const row = rows.find((r) => r.id === id);
        const features = await getEntitlements(row?.plan ?? null, id);
        if (features.includes("api.access")) allowed.add(id);
      }
    } catch {
      // entitlements unavailable → rely on the package check
    }
    const still = pending.filter((id) => !allowed.has(id));
    if (still.length) for (const id of await store.activePackageUserIds(still)) allowed.add(id);
  }
  return allowed;
}

// ── Enqueue ─────────────────────────────────────────────────────────────────

export interface EnqueueOptions {
  /** Recipients of USER-level endpoints. Defaults to the project's owner. */
  userIds?: readonly string[];
  /**
   * Include the project's PROJECT-level endpoints (default true). False for
   * events that belong to someone other than the project's team — an
   * evaluator's report must never reach the founder's integrations.
   */
  projectEndpoints?: boolean;
  /** Test seam. `null` = no store (returns 0). */
  store?: WebhookStore | null;
  now?: Date;
}

export interface EnqueueResult {
  queued: number;
  endpoints: string[];
  envelopeId: string | null;
}

/**
 * Queue one delivery per subscribed endpoint. Never throws; never blocks the
 * writer for more than the two reads + one insert it costs when a
 * subscription exists (zero subscriptions = two cheap indexed reads).
 */
export async function enqueueWebhook<E extends WebhookEvent>(
  event: E,
  projectId: string | null,
  payload: WebhookPayloads[E],
  opts: EnqueueOptions = {},
): Promise<EnqueueResult> {
  const empty: EnqueueResult = { queued: 0, endpoints: [], envelopeId: null };
  try {
    if (!isWebhookEvent(event)) return empty;
    const store = opts.store === undefined ? supabaseWebhookStore() : opts.store;
    if (!store) return empty;

    let userIds: string[] = Array.from(new Set(opts.userIds ?? []));
    if (!userIds.length && projectId) {
      const owners = await store.projectOwnerIds([projectId]);
      const owner = owners.get(projectId);
      if (owner) userIds = [owner];
    }
    const endpoints = await store.listActiveEndpointsFor(event, opts.projectEndpoints === false ? null : projectId, userIds);
    if (!endpoints.length) return empty;

    const envelope = buildEnvelope(event, payload, { now: opts.now });
    const nowIso = (opts.now ?? new Date()).toISOString();
    const rows = endpoints.map((e) => ({
      // One delivery id per endpoint (X-BlockID-Delivery); the envelope id is shared.
      id: randomUUID(),
      endpoint_id: e.id,
      event,
      payload: envelope as unknown as Record<string, unknown>,
      status: "queued" as const,
      attempts: 0,
      next_attempt_at: nowIso,
    }));
    const queued = await store.insertDeliveries(rows);
    return { queued, endpoints: endpoints.map((e) => e.id), envelopeId: envelope.id };
  } catch (err) {
    console.error("[blockid:webhooks] enqueue failed", { event, projectId, err: err instanceof Error ? err.message : String(err) });
    return empty;
  }
}
