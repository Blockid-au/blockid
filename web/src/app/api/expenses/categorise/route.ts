/**
 * POST /api/expenses/categorise — run the model on the AI queue (S28-C).
 *
 * `{ confirm?: boolean }`. Editor+ on the active project. Same rails as
 * dividend statements (S25-B): auth → rate-limit → scope → queue →
 * (preview | spend → run).
 *
 * Cost: `FEATURE_COSTS.expense_categorise` (1 credit) per started block of
 * 100 queued rows, min 1 — charged to the CALLER (creditNote) unless
 * Growth+ / an active Startup Package (`categoriseIncluded`) → 0.
 * `confirm !== true` answers 200 `{ preview: true, queue, units, cost,
 * balance, included }` and runs nothing — the button shows that first.
 *
 * The spend runs BEFORE the model; a total model failure (every batch
 * unparseable → nothing accepted) refunds. S29-hardening: a PARTIAL
 * failure (some batches) leaves those rows queued and refunds their credit
 * blocks pro rata (`refunded`, `failedRows`). A partial result keeps the
 * charge: accepted rows are written, unsure rows are `other` + review at
 * no further cost.
 *
 * 200 preview | 200 { ok, categorised, accepted, needsReview, batches, failedBatches, failedRows, cost, creditsCharged, refunded, balance, queueAfter }
 * 401  402 insufficient_credits | credit_spend_failed  403/404 scope  409 nothing_to_categorise  429  503
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { readJsonBody } from "@/lib/security/request-guards";
import { FEATURE_COSTS, getBalance, grantCredits, spendCreditsUnits } from "@/lib/credits";
import { getSupabaseAdmin } from "@/lib/supabase";
import { creditChargeNote } from "@/lib/projects";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { apiRoute } from "@/lib/audit/api-route";
import { categoriseIncluded } from "@/lib/expenses/gate";
import { EXPENSE_CATEGORISE_FEATURE, categoriseCost, categoriseRefund, categoriseUnits } from "@/lib/expenses/cost";
import { defaultAi } from "@/lib/expenses/categorise";
import { countAiQueue, loadAiQueue, runAiOnQueue } from "@/lib/expenses/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RATE_LIMIT_PER_HOUR = 20;
const BODY_MAX_BYTES = 2 * 1024;
/** Rows one run takes (≈ 25 model calls of 40); the rest waits for the next press. */
export const MAX_ROWS_PER_RUN = 1000;

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const limited = enforceRateLimit("expenses-categorise", user.id, request, RATE_LIMIT_PER_HOUR, 60 * 60 * 1000);
  if (limited) return limited;

  const read = await readJsonBody<Record<string, unknown> | null>(request, BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const body: Record<string, unknown> = read.body && typeof read.body === "object" ? read.body : {};
  const confirmed = body.confirm === true;

  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });
  const creditNote = creditChargeNote(scope);

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const queue = await loadAiQueue(supabase, scope.projectId, MAX_ROWS_PER_RUN);
  const queueTotal = await countAiQueue(supabase, scope.projectId);
  if (queue.length === 0) {
    return NextResponse.json({ ok: false, error: "nothing_to_categorise", message: "Every imported line already has a category." }, { status: 409 });
  }

  const gate = await categoriseIncluded({ id: user.id, plan: user.plan });
  const listedCost = FEATURE_COSTS[EXPENSE_CATEGORISE_FEATURE] ?? 1;
  const units = gate.included ? 0 : categoriseUnits(queue.length);
  const cost = categoriseCost(queue.length, listedCost, gate.included);
  let balance: number | null = null;
  if (cost > 0) {
    balance = await getBalance(user.id);
    if (balance < cost) {
      return NextResponse.json(
        { ok: false, error: "insufficient_credits", creditsRequired: cost, balance, reason: "insufficient_credits", creditNote },
        { status: 402 },
      );
    }
  }
  if (!confirmed) {
    return NextResponse.json({
      ok: true,
      preview: true,
      queue: queue.length,
      queueTotal,
      units,
      cost,
      listedCost,
      included: gate.included,
      includedVia: gate.via,
      balance,
      creditNote,
    });
  }

  let creditsCharged = 0;
  if (cost > 0) {
    const spent = await spendCreditsUnits(user.id, EXPENSE_CATEGORISE_FEATURE, units, { project_id: scope.projectId, rows: queue.length });
    if (!spent.ok) {
      return NextResponse.json({ ok: false, error: "credit_spend_failed", creditsRequired: cost, balance: spent.balance, creditNote }, { status: 402 });
    }
    creditsCharged = spent.cost;
    balance = spent.balance;
  }

  const result = await runAiOnQueue(supabase, scope.projectId, queue, defaultAi);
  if (result.batches > 0 && result.failedBatches === result.batches) {
    // TOTAL failure: the model never answered — nothing was written (the
    // rows stay in the queue) → refund.
    if (creditsCharged > 0) {
      const refund = await grantCredits(user.id, creditsCharged, "refund", { feature: EXPENSE_CATEGORISE_FEATURE, project_id: scope.projectId, reason: "ai_unavailable" });
      if (refund.ok) balance = refund.balance;
      else console.error("[expenses:categorise] refund after model failure did not land", { user: user.id, project: scope.projectId });
    }
    return NextResponse.json({ ok: false, error: "ai_unavailable", message: "The model did not answer — nothing was charged. Try again in a few minutes.", retryCost: cost }, { status: 503 });
  }

  // S29-hardening (S28 review #6): PARTIAL failure — the rows of the failed
  // batches were never categorised (they stay queued); refund their credit
  // blocks pro rata, capped at what was charged.
  let refunded = 0;
  if (result.failedRows > 0 && creditsCharged > 0) {
    const refund = categoriseRefund(result.failedRows, units, creditsCharged);
    if (refund.credits > 0) {
      const granted = await grantCredits(user.id, refund.credits, "refund", {
        feature: EXPENSE_CATEGORISE_FEATURE, project_id: scope.projectId, reason: "ai_partial", failed_rows: result.failedRows, failed_batches: result.failedBatches, units: refund.units,
      });
      if (granted.ok) {
        refunded = refund.credits;
        balance = granted.balance;
      } else {
        console.error("[expenses:categorise] pro-rata refund after partial model failure did not land", { user: user.id, project: scope.projectId, refund });
      }
    }
  }

  const queueAfter = await countAiQueue(supabase, scope.projectId);
  return NextResponse.json({
    ok: true,
    categorised: result.categorised,
    accepted: result.accepted,
    needsReview: result.needsReview,
    batches: result.batches,
    failedBatches: result.failedBatches,
    failedRows: result.failedRows,
    cost,
    included: gate.included,
    creditsCharged,
    refunded,
    balance,
    creditNote,
    queueAfter,
  });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/expenses/categorise/route.ts", method: "POST" }, POST_handler);
