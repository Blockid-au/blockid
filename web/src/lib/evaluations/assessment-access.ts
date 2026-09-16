// Access resolution shared by the assessment routes (G13-W4-D2, S-D2).
//
// One lookup (`resolveDossierAccess`) decides who the caller is on this
// evaluation; an assessor must additionally still be an evaluator persona
// (same gate as the dossier page). Every "no" is null so the routes answer
// 404 uniformly — never 403 (§A.1: the id must not confirm a row exists).

import "server-only";
import { isEvaluatorUser } from "@/lib/evaluations";
import { resolveDossierAccess } from "@/lib/evaluations/dossier";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** Two 20 kB notes + JSON structure (§C.6 note limits). */
export const ASSESSMENT_BODY_MAX_BYTES = 64 * 1024;
/** §C.6: 60 writes / min / user. */
export const ASSESSMENT_WRITES_PER_MINUTE = 60;

export type AssessmentAccess = NonNullable<Awaited<ReturnType<typeof resolveDossierAccess>>>;

export async function resolveAssessmentAccess(
  evaluationId: string,
  user: { id: string; plan: string | null; accountType?: string | null },
): Promise<AssessmentAccess | null> {
  if (!ID_RE.test(evaluationId)) return null;
  const access = await resolveDossierAccess(evaluationId, user.id);
  if (!access) return null;
  if (access.role === "assessor" && !(await isEvaluatorUser(user))) return null;
  return access;
}
