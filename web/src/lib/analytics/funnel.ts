// G16-A — server-side funnel emit helpers (docs/plans/first-dollar-2026-09-19.md § 3 A.1).
//
// One thin wrapper per funnel step so every emit point stamps the same
// things the same way:
//   * `qa: true` for live-QA accounts (isQaEmail) — the daily funnel and the
//     traction snapshot drop those rows;
//   * a DETERMINISTIC event_id for the once-per-user steps (`sign_up`, the
//     first `svi_analyze`) so a retried request or a double-mounted page
//     cannot double-count — analytics_events.event_id is a UNIQUE uuid and
//     the sink upserts with ignoreDuplicates;
//   * never throws, never awaits the network: trackEvent() swallows and the
//     emitter batches. Callers `void` these.
//
// Server-only by construction (node:crypto). The event names / param shapes
// live in ./events.ts; this file only decides ids, qa flags and defaults.

import { createHash } from "node:crypto";
import { qaFlag, trackEvent, type ReportViewTier, type SignUpMethod, type UserSegment } from "./events";

/**
 * uuid-shaped SHA-1 of `blockid:funnel:<step>:<key>` (v5-style: version
 * nibble 5, RFC 4122 variant). Same (step, key) → same id, always.
 */
export function funnelEventId(step: string, key: string): string {
  const hex = createHash("sha1").update(`blockid:funnel:${step}:${key}`).digest("hex").slice(0, 32);
  const v = `5${hex.slice(13, 16)}`;
  const variant = ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${v}-${variant}-${hex.slice(20, 32)}`;
}

export interface SignUpInput {
  userId: string;
  email: string | null | undefined;
  method: SignUpMethod;
  segment?: UserSegment;
  /** account_type / persona when the sign-up form knew it (evaluator ladder, wizard). */
  persona?: string | null;
  jurisdiction?: string | null;
}

/** `sign_up` — exactly once per account (event_id = hash of the user id). */
export function emitSignUp(input: SignUpInput): void {
  void trackEvent(
    "sign_up",
    {
      segment: input.segment ?? "unknown",
      method: input.method,
      ...(input.persona ? { persona: input.persona } : {}),
      ...(input.jurisdiction ? { jurisdiction: input.jurisdiction } : {}),
      ...qaFlag(input.email),
    },
    { userId: input.userId, eventId: funnelEventId("sign_up", input.userId) },
  );
}

export interface SviAnalyzeInput {
  userId: string | null;
  email?: string | null;
  /** Project / analysis scope; falls back to the analysis id or "anon". */
  projectId?: string | null;
  analysisId?: string | null;
  /** The caller's first saved run (signed-in: first for the user; anonymous: first for the anon key). */
  first: boolean;
  score?: number | null;
  percentile?: number | null;
  /** blockid_anon key for anonymous runs — lets the funnel stitch a later sign-up. */
  sessionId?: string | null;
}

/**
 * `svi_analyze` — a first run for a signed-in user is keyed on the user id
 * (idempotent); anonymous first runs are keyed on the anon session; repeats
 * get a random id (each run counts).
 */
export function emitSviAnalyze(input: SviAnalyzeInput): void {
  const projectId = input.projectId ?? input.analysisId ?? "anon";
  const key = input.userId ?? input.sessionId ?? null;
  const eventId = input.first && key ? funnelEventId("svi_analyze_first", key) : undefined;
  void trackEvent(
    "svi_analyze",
    {
      project_id: projectId,
      first: input.first,
      ...(typeof input.score === "number" && Number.isFinite(input.score) ? { score: input.score } : {}),
      ...(typeof input.percentile === "number" && Number.isFinite(input.percentile) ? { percentile: input.percentile } : {}),
      ...(input.analysisId ? { analysis_id: input.analysisId } : {}),
      ...qaFlag(input.email),
    },
    { userId: input.userId, sessionId: input.sessionId ?? null, eventId },
  );
}

export interface ScoreComputedInput {
  userId: string | null;
  email?: string | null;
  projectId: string;
  score: number;
  slug: string;
  analysisId?: string | null;
  sessionId?: string | null;
}

/** `svi_score_computed` — once per analysis row (event_id = hash of the slug / analysis id). */
export function emitScoreComputed(input: ScoreComputedInput): void {
  void trackEvent(
    "svi_score_computed",
    {
      project_id: input.projectId,
      score: input.score,
      slug: input.slug,
      ...(input.userId ? { user_id: input.userId } : {}),
      ...(input.analysisId ? { analysis_id: input.analysisId } : {}),
      ...qaFlag(input.email),
    },
    {
      userId: input.userId,
      sessionId: input.sessionId ?? null,
      eventId: funnelEventId("svi_score_computed", input.analysisId ?? input.slug),
    },
  );
}

export interface ReportViewInput {
  userId: string | null;
  email?: string | null;
  projectId: string;
  tier: ReportViewTier;
  pagesEst?: number | null;
  sessionId?: string | null;
}

/** `report_view` — one per render; the reducer counts distinct users per day so reloads do not inflate. */
export function emitReportView(input: ReportViewInput): void {
  void trackEvent(
    "report_view",
    {
      tier: input.tier,
      project_id: input.projectId,
      ...(typeof input.pagesEst === "number" && Number.isFinite(input.pagesEst) ? { pages_est: input.pagesEst } : {}),
      ...qaFlag(input.email),
    },
    { userId: input.userId, sessionId: input.sessionId ?? null },
  );
}

export interface CheckoutInput {
  userId: string;
  email?: string | null;
  sku: string;
  amountCents: number;
  projectId?: string | null;
  orderId?: string | null;
  /** Stripe Checkout Session id — keys the event so an idempotent Stripe retry does not double-count. */
  stripeSessionId?: string | null;
}

/** `checkout` — the A$3 Stripe session was created (server truth; lane B's client `checkout` is the click). */
export function emitCheckout(input: CheckoutInput): void {
  void trackEvent(
    "checkout",
    {
      sku: input.sku,
      amount_cents: input.amountCents,
      ...(input.projectId ? { project_id: input.projectId } : {}),
      ...(input.orderId ? { order_id: input.orderId } : {}),
      ...qaFlag(input.email),
    },
    {
      userId: input.userId,
      eventId: input.stripeSessionId ? funnelEventId("checkout", input.stripeSessionId) : undefined,
    },
  );
}

// ── G25-C free allowance ───────────────────────────────────────────────

export interface FreeReportEventInput {
  grantId: string;
  sequenceNo: 1 | 2;
  source: "guest" | "account";
  analysisId?: string | null;
  userId?: string | null;
  email?: string | null;
  sessionId?: string | null;
}

/** `free_report_submitted` — once per grant (event_id = hash of the grant id). `queued` = the platform cap deferred the run to the cron. */
export function emitFreeReportSubmitted(input: FreeReportEventInput & { queued: boolean }): void {
  void trackEvent(
    "free_report_submitted",
    {
      grant_id: input.grantId,
      sequence_no: input.sequenceNo,
      source: input.source,
      queued: input.queued,
      ...(input.analysisId ? { analysis_id: input.analysisId } : {}),
      ...qaFlag(input.email),
    },
    {
      userId: input.userId ?? null,
      sessionId: input.sessionId ?? null,
      eventId: funnelEventId("free_report_submitted", input.grantId),
    },
  );
}

/** `free_report_delivered` — once per grant, when the PDF e-mail was accepted by the provider. */
export function emitFreeReportDelivered(input: FreeReportEventInput): void {
  void trackEvent(
    "free_report_delivered",
    {
      grant_id: input.grantId,
      sequence_no: input.sequenceNo,
      source: input.source,
      ...(input.analysisId ? { analysis_id: input.analysisId } : {}),
      ...qaFlag(input.email),
    },
    {
      userId: input.userId ?? null,
      sessionId: input.sessionId ?? null,
      eventId: funnelEventId("free_report_delivered", input.grantId),
    },
  );
}

// ── report tier resolution ─────────────────────────────────────────────

/** Minimal query surface so the page test can stub Supabase. */
export interface ReportTierClient {
  from: (table: string) => {
    select: (cols: string, opts?: { count?: "exact"; head?: boolean }) => {
      eq: (col: string, v: unknown) => {
        in: (col: string, v: readonly string[]) => PromiseLike<{ count?: number | null; error: { message?: string } | null }>;
      };
    };
  };
}

const PAID_ORDER_STATUSES = ["PAID", "GENERATING", "READY"] as const;

/** Narrow a supabase-js client to the slice above (avoids TS2589 on the full generic type). */
export function asReportTierClient(client: unknown): ReportTierClient | null {
  return client ? (client as ReportTierClient) : null;
}

/**
 * free | paid | plan for the workspace TBR page: a paying plan wins, then a
 * PAID/GENERATING/READY report_orders row for this user, else free. Any
 * query failure → "free" (never throws: it only labels an analytics row).
 */
export async function resolveReportTier(
  client: ReportTierClient | null,
  userId: string,
  plan: string | null | undefined,
): Promise<ReportViewTier> {
  const p = (plan ?? "").trim().toLowerCase();
  if (p && p !== "free") return "plan";
  if (!client) return "free";
  try {
    const { count, error } = await client
      .from("report_orders")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", PAID_ORDER_STATUSES);
    if (error) return "free";
    return (count ?? 0) > 0 ? "paid" : "free";
  } catch {
    return "free";
  }
}
