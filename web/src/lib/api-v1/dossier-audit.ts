// G14-S38 — dossier.viewed audit input for an API read (surface api),
// built from the loaded DossierView. Shared by the v1 dossier route and its
// test; pure.
import "server-only";
import type { DossierView } from "@/lib/evaluations/dossier";
import type { auditDossierView } from "@/lib/evaluations/dossier-audit";

type AuditInput = Parameters<typeof auditDossierView>[0];
const API_SURFACE: AuditInput["surface"] = "api";

export function auditInput(userId: string, dossier: DossierView): AuditInput {
  const h = dossier.header;
  const role = dossier.viewer.role;
  const out: AuditInput = { userId, role, evaluationId: h.evaluationId, projectId: h.projectId, consentTier: h.consentTier, surface: API_SURFACE, sviTotal: h.svi, snapshotId: h.snapshotId };
  return out;
}
