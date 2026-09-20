// G21 P1-A — who may read a project's claims, and how much.
//
//   owner      the project owner or an accepted member (assertProjectAccess,
//              viewer+): every claim, every record, every field.
//   evaluator  an entitled evaluator (isEvaluatorUser) with an `evaluations`
//              row for this project: records filtered by visibility /
//              consent_scope (records.ts) AND projected by the evaluation's
//              consent tier the way the dossier projects evidence —
//              attributed_only → statuses + counts only (no records),
//              reports_shared → records without source links,
//              full_mentor → records with links.
//   null       anyone else → the route answers 404 (existence never confirmed).
//
// One helper so the route test can mock a single seam.

import "server-only";
import { isEvaluatorUser } from "@/lib/evaluations";
import { TIER_RANK, type MentorAccessTier } from "@/lib/mentor/access-tiers";
import { assertProjectAccess, ProjectAccessError, type ProjectRole } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { EvidenceViewer } from "./records";
import type { Claim, EvidenceRecord } from "./types";

export type ClaimsViewer =
  | { kind: "owner"; role: ProjectRole; viewer: EvidenceViewer; consentTier: null }
  | { kind: "evaluator"; evaluationId: string; viewer: EvidenceViewer; consentTier: MentorAccessTier };

interface ViewerUser {
  id: string;
  plan: string | null;
  accountType?: string | null;
}

export async function resolveClaimsViewer(user: ViewerUser, projectId: string): Promise<ClaimsViewer | null> {
  try {
    const access = await assertProjectAccess(user.id, projectId, "viewer");
    return { kind: "owner", role: access.role, viewer: { scope: "owner", userId: user.id }, consentTier: null };
  } catch (err) {
    if (!(err instanceof ProjectAccessError)) throw err;
    if (err.code === "service_unavailable") throw err;
  }
  if (!(await isEvaluatorUser(user))) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("evaluations")
    .select("id, consent_tier")
    .eq("evaluator_user_id", user.id)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const tier = (data.consent_tier as MentorAccessTier | null) ?? "attributed_only";
  return { kind: "evaluator", evaluationId: String(data.id), viewer: { scope: "evaluators", userId: user.id }, consentTier: tier };
}

/** The wire shape of GET /api/projects/[id]/claims — a claim with its (already scoped) records. */
export interface ClaimWithRecords extends Claim {
  records: Array<Omit<EvidenceRecord, "consent_scope">>;
  /** Present for an attributed_only evaluator instead of `records`. */
  records_count?: number;
}

/** Pure: apply the consent tier to records already filtered by visibility. */
export function projectClaimsByTier(claims: readonly Claim[], recordsByClaim: ReadonlyMap<string, EvidenceRecord[]>, tier: MentorAccessTier | null): ClaimWithRecords[] {
  const rank = tier ? TIER_RANK[tier] : Number.POSITIVE_INFINITY;
  return claims.map((c) => {
    const recs = recordsByClaim.get(c.id) ?? [];
    if (tier && rank < TIER_RANK.reports_shared) {
      return { ...c, records: [], records_count: recs.length };
    }
    const withLinks = !tier || rank >= TIER_RANK.full_mentor;
    return {
      ...c,
      records: recs.map((r) => {
        const { consent_scope: _scope, ...rest } = r;
        void _scope;
        return withLinks ? rest : { ...rest, source_uri: r.visibility === "public" ? r.source_uri : null };
      }),
    };
  });
}
