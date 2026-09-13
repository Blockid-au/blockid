/**
 * GET /api/expenses — the project's bank lines for the review table (S28-C).
 *
 * `?limit=<1..2000>` (default 500), `?from`/`?to` (YYYY-MM-DD). Viewer+ on
 * the active project. Rows come back needs-review first, then newest first,
 * with the AI queue size and the price of running the model on it (shown
 * BEFORE any run — the panel's "Categorise N rows with AI (cost: X)" button).
 *
 * 200 { ok, role, transactions[], total, queue, cost, listedCost, included, categories[] }
 * 401  403/404  503
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { creditChargeNote } from "@/lib/projects";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { FEATURE_COSTS } from "@/lib/credits";
import { CATEGORIES } from "@/lib/expenses/categories";
import { EXPENSE_CATEGORISE_FEATURE, categoriseCost } from "@/lib/expenses/cost";
import { categoriseIncluded } from "@/lib/expenses/gate";
import { countAiQueue, loadTransactions, transactionSummary } from "@/lib/expenses/server";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? "500");
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(2000, Math.floor(limitRaw))) : 500;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
    return NextResponse.json({ ok: false, error: "from / to must be YYYY-MM-DD" }, { status: 400 });
  }

  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const [rows, queue, gate] = await Promise.all([
    loadTransactions(supabase, scope.projectId, { from, to, limit }),
    countAiQueue(supabase, scope.projectId),
    categoriseIncluded({ id: user.id, plan: user.plan }),
  ]);
  const transactions = rows.map(transactionSummary).sort((a, b) => {
    if (a.needsReview !== b.needsReview) return a.needsReview ? -1 : 1;
    return b.occurredOn.localeCompare(a.occurredOn);
  });
  const listedCost = FEATURE_COSTS[EXPENSE_CATEGORISE_FEATURE] ?? 1;
  return NextResponse.json({
    ok: true,
    role: scope.role,
    transactions,
    total: transactions.length,
    queue,
    cost: categoriseCost(queue, listedCost, gate.included),
    listedCost,
    included: gate.included,
    creditNote: creditChargeNote(scope),
    categories: CATEGORIES.map((c) => ({ key: c.key, label: c.label, description: c.description, kind: c.kind })),
  });
}
