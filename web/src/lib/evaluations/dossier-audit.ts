// `dossier.viewed` audit event (BA spec §C.2 — sampled 100 %).
//
// Fire-and-forget on purpose: the HMAC-chained `audit_events` insert must
// never hold the page's first byte (§C.3 TTFB budget) and a missing
// AUDIT_HMAC_SECRET in a dev shell must never turn the dossier into a 500.
// `detail` carries ids + role + surface + the SVI on screen — never note
// bodies. The SVI is what the next view's "Δ since last view" header field
// (S-R4) compares against, so the previous view never needs a snapshot
// lookup.
//
// G14-S33: the same call also emits the `dossier_view` analytics event
// server-side (analytics_events + GA4 MP) so the weekly GA4 audit sees
// evaluator engagement from BOTH surfaces (page + API) even when the
// browser tag is blocked. Same fire-and-forget contract.

import "server-only";
import { appendAudit } from "@/lib/audit";
import { emitEventSafe } from "@/lib/analytics/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const DOSSIER_VIEW_ACTION = "dossier.viewed";

export interface DossierViewAudit {
  userId: string;
  evaluationId: string;
  projectId: string;
  role: "assessor" | "founder";
  consentTier: string;
  surface: "page" | "api";
  /** G22-A: the BlockID Cohort the viewer reached the dossier through (audit detail `via_batch_id`). */
  viaBatchId?: string | null;
  /** S-R4: SVI + snapshot on screen at this view (for the next view's Δ). */
  sviTotal?: number | null;
  snapshotId?: string | null;
}

export function auditDossierView(input: DossierViewAudit): void {
  emitEventSafe({
    name: "dossier_view",
    params: {
      evaluation_id: input.evaluationId,
      consent_tier: input.consentTier,
      role: input.role,
      surface: input.surface,
      user_id: input.userId,
    },
    userId: input.userId,
    source: "server",
    consentGranted: true,
  });
  void appendAudit({
    user_id: input.userId,
    actor: "user",
    action: DOSSIER_VIEW_ACTION,
    resource_type: "evaluation",
    resource_id: input.evaluationId,
    detail: {
      project_id: input.projectId,
      role: input.role,
      consent_tier: input.consentTier,
      surface: input.surface,
      ...(typeof input.sviTotal === "number" ? { svi_total: input.sviTotal } : {}),
      ...(input.snapshotId ? { snapshot_id: input.snapshotId } : {}),
      ...(input.viaBatchId ? { via_batch_id: input.viaBatchId } : {}),
    },
  }).catch((err: unknown) => {
    if (process.env.NODE_ENV !== "test") console.warn("[blockid:dossier] audit write skipped:", err instanceof Error ? err.message : err);
  });
}

export interface LastDossierView {
  viewedAt: string;
  sviTotal: number | null;
  snapshotId: string | null;
}

/**
 * The viewer's most recent `dossier.viewed` row for this evaluation (the
 * CURRENT view is appended after the loader runs, so this is the previous
 * one). Walks the (user_id, id DESC) index from 0338. Null when there is
 * no earlier view, no DB, or the table is unavailable.
 */
export async function readLastDossierView(userId: string, evaluationId: string): Promise<LastDossierView | null> {
  const db = getSupabaseAdmin();
  if (!db || !userId || !evaluationId) return null;
  try {
    const { data, error } = await db
      .from("audit_events")
      .select("ts, detail")
      .eq("user_id", userId)
      .eq("action", DOSSIER_VIEW_ACTION)
      .eq("resource_id", evaluationId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as { ts?: unknown; detail?: Record<string, unknown> | null };
    const detail = row.detail && typeof row.detail === "object" ? row.detail : {};
    const svi = typeof detail.svi_total === "number" && Number.isFinite(detail.svi_total) ? detail.svi_total : null;
    return {
      viewedAt: typeof row.ts === "string" ? row.ts : new Date(0).toISOString(),
      sviTotal: svi,
      snapshotId: typeof detail.snapshot_id === "string" ? detail.snapshot_id : null,
    };
  } catch {
    return null;
  }
}

// ─── Block 6 audit trail (S-D3, §A.3 block 6 / §C.2) ────────────────────────

export interface DossierAuditEntry {
  id: string;
  action: string;
  ts: string;
  resourceType: string;
  /** Short, id-only summary rendered next to the action (never note bodies). */
  summary: string;
}

/** Actions block 6 lists for this evaluation — everything the viewer did on it. */
export const DOSSIER_TRAIL_ACTIONS = [
  DOSSIER_VIEW_ACTION,
  "assessment.saved",
  "assessment.submitted",
  "assessment.shared",
  "assessment.share_revoked",
  "assessment.bulk_set",
  "ic_report.exported",
  "dossier.watchlisted",
  "portfolio.marked_invested",
  "intro.requested",
  "consent.requested",
] as const;

const DETAIL_KEYS = ["version", "decision", "conviction", "fields", "kind", "pages", "tier", "channel", "ticker", "status"] as const;

/** Pure: the one-line summary from an audit `detail` (ids / enums only). */
export function summariseAuditDetail(detail: Record<string, unknown> | null | undefined): string {
  if (!detail || typeof detail !== "object") return "";
  const bits: string[] = [];
  for (const k of DETAIL_KEYS) {
    const v = detail[k];
    if (v == null || v === "") continue;
    if (Array.isArray(v)) {
      if (v.length) bits.push(`${k} ${v.map(String).join(", ")}`);
    } else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") bits.push(`${k} ${String(v)}`);
  }
  return bits.join(" · ");
}

/**
 * The viewer's newest audit rows on one evaluation (resource_id = the
 * evaluation, or detail.evaluation_id = it for assessment / IC-report rows).
 * Empty when the table is unavailable. Never returns other users' rows.
 */
export async function readAuditTrail(userId: string, evaluationId: string, limit = 25): Promise<DossierAuditEntry[]> {
  const db = getSupabaseAdmin();
  if (!db || !userId || !evaluationId) return [];
  try {
    const { data, error } = await db
      .from("audit_events")
      .select("id, action, ts, resource_type, resource_id, detail")
      .eq("user_id", userId)
      .in("action", [...DOSSIER_TRAIL_ACTIONS])
      .or(`resource_id.eq.${evaluationId},detail.cs.${JSON.stringify({ evaluation_id: evaluationId })}`)
      .order("id", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      action: String(r.action ?? ""),
      ts: typeof r.ts === "string" ? r.ts : "",
      resourceType: String(r.resource_type ?? ""),
      summary: summariseAuditDetail(r.detail as Record<string, unknown> | null),
    }));
  } catch {
    return [];
  }
}
