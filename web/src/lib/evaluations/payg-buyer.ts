// payg-buyer — an EVALUATOR as the buyer of a Pricing v5 PAYG report (G35,
// docs/pricing-v5-plan.md §6.4.1 "evaluator deal-flow").
//
// POST /api/reports/checkout books a report order against a project the
// buyer can see (`assertProjectScope`). An evaluator usually cannot: the
// startup in their deal flow belongs to its founder (or was entered by the
// evaluator but is reached through the `evaluations` row). With
// `evaluationId` in the body the route authorises the buyer here instead:
//
//   - the `evaluations` row is the caller's (`evaluator_user_id`),
//   - it is about `businessId` (the order's project),
//   - the caller still holds evaluator access to that project.
//
// The order is owned by the evaluator (`report_orders.user_id`), so every
// owner-scoped read (GET /api/reports/[orderId], the order page, history)
// grants them the report; the generator keys the data on the project
// owner (`metadata.buyer_role = "evaluator"`, report-generator.ts).
//
// Quota rule (plan §6.4.6): an included report never costs money. While the
// evaluator's plan / trial still has a Full report included, a card
// Snapshot / Full is refused (409 `quota_available`) — Verified (the human
// review, never included) and D28 upgrades stay buyable.

import "server-only";
import { canAccessProjectAsEvaluator, getEvaluationForUser } from "@/lib/evaluations";
import { previewReportCharge } from "@/lib/evaluations/report-quota";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Order + session metadata keys stamped on an evaluator's PAYG order. */
export const EVALUATOR_BUYER_ROLE = "evaluator" as const;

export function isEvaluationIdShape(raw: unknown): raw is string {
  return typeof raw === "string" && UUID_RE.test(raw);
}

export type EvaluatorBuyerResult =
  | { ok: true; evaluationId: string }
  | { ok: false; status: 400 | 403 | 404; code: string; reason: string };

export interface EvaluatorBuyerDeps {
  getEvaluation?: typeof getEvaluationForUser;
  canAccess?: typeof canAccessProjectAsEvaluator;
}

/**
 * Is `userId` an evaluator of `businessId` through `evaluationId`? 404 (not
 * 403) on a row that is not theirs — same non-enumeration posture as the
 * order delivery route.
 */
export async function authoriseEvaluatorBuyer(
  userId: string,
  evaluationId: unknown,
  businessId: string,
  deps: EvaluatorBuyerDeps = {},
): Promise<EvaluatorBuyerResult> {
  if (!isEvaluationIdShape(evaluationId)) {
    return { ok: false, status: 400, code: "invalid_evaluation", reason: "evaluationId must be a uuid" };
  }
  const evaluation = await (deps.getEvaluation ?? getEvaluationForUser)(userId, evaluationId);
  if (!evaluation || evaluation.projectId !== businessId) {
    return { ok: false, status: 404, code: "evaluation_not_found", reason: "That startup is not in your deal flow." };
  }
  const access = await (deps.canAccess ?? canAccessProjectAsEvaluator)(userId, businessId);
  if (!access.allowed || access.via !== "evaluator") {
    return { ok: false, status: 403, code: "forbidden", reason: "You no longer have evaluator access to this startup." };
  }
  return { ok: true, evaluationId: evaluation.id };
}

/**
 * True while the evaluator's plan (or trial) still includes a Full report —
 * a card Snapshot / Full is then refused. Fails closed for money: a read
 * error counts as covered (the buyer is told to run it from the quota),
 * never a card charge for a report the plan might include.
 */
export async function evaluatorQuotaCoversFull(
  user: { id: string; plan?: string | null },
  deps: { preview?: typeof previewReportCharge } = {},
): Promise<boolean> {
  try {
    const cost = await (deps.preview ?? previewReportCharge)(user, "full", { payg: true });
    return cost.via === "quota";
  } catch {
    return true;
  }
}

export const QUOTA_AVAILABLE_MESSAGE =
  "This report is included in your plan — run it from your deal flow with “Run report”. Nothing needs to be paid by card.";
