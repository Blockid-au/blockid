// `dossier.viewed` audit event (BA spec §C.2 — sampled 100 %).
//
// Fire-and-forget on purpose: the HMAC-chained `audit_events` insert must
// never hold the page's first byte (§C.3 TTFB budget) and a missing
// AUDIT_HMAC_SECRET in a dev shell must never turn the dossier into a 500.
// `detail` carries ids + role + surface only — never note bodies.
//
// G14-S33: the same call also emits the `dossier_view` analytics event
// server-side (analytics_events + GA4 MP) so the weekly GA4 audit sees
// evaluator engagement from BOTH surfaces (page + API) even when the
// browser tag is blocked. Same fire-and-forget contract.

import "server-only";
import { appendAudit } from "@/lib/audit";
import { emitEventSafe } from "@/lib/analytics/server";

export interface DossierViewAudit {
  userId: string;
  evaluationId: string;
  projectId: string;
  role: "assessor" | "founder";
  consentTier: string;
  surface: "page" | "api";
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
    action: "dossier.viewed",
    resource_type: "evaluation",
    resource_id: input.evaluationId,
    detail: { project_id: input.projectId, role: input.role, consent_tier: input.consentTier, surface: input.surface },
  }).catch((err: unknown) => {
    if (process.env.NODE_ENV !== "test") console.warn("[blockid:dossier] audit write skipped:", err instanceof Error ? err.message : err);
  });
}
