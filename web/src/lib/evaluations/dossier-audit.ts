// `dossier.viewed` audit event (BA spec §C.2 — sampled 100 %).
//
// Fire-and-forget on purpose: the HMAC-chained `audit_events` insert must
// never hold the page's first byte (§C.3 TTFB budget) and a missing
// AUDIT_HMAC_SECRET in a dev shell must never turn the dossier into a 500.
// `detail` carries ids + role + surface + the SVI on screen — never note
// bodies. The SVI is what the next view's "Δ since last view" header field
// (S-R4) compares against, so the previous view never needs a snapshot
// lookup.

import "server-only";
import { appendAudit } from "@/lib/audit";
import { getSupabaseAdmin } from "@/lib/supabase";

export const DOSSIER_VIEW_ACTION = "dossier.viewed";

export interface DossierViewAudit {
  userId: string;
  evaluationId: string;
  projectId: string;
  role: "assessor" | "founder";
  consentTier: string;
  surface: "page" | "api";
  /** S-R4: SVI + snapshot on screen at this view (for the next view's Δ). */
  sviTotal?: number | null;
  snapshotId?: string | null;
}

export function auditDossierView(input: DossierViewAudit): void {
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
