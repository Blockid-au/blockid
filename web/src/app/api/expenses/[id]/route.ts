/**
 * PATCH /api/expenses/[id] — manual re-categorisation (S28-C).
 *
 * `{ category: <chart key>, learn?: boolean }` (learn defaults to true).
 * Editor+ on the active project; the row must belong to that project
 * (404 otherwise — never another project's line). Records
 * `category_source = 'manual'`, confidence 1, clears `needs_review`, resets
 * the GST treatment to the category default, and — unless `learn: false` —
 * upserts the merchant into `expense_rules` (0378) so the next import
 * applies it before the keyword table and the model, then re-categorises
 * every other non-manual line of the same merchant in the project.
 *
 * 200 { ok, transaction, learnedRule, siblingsUpdated }
 * 400 bad category  401  403/404 scope / row  503
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { isUuid, readJsonBody } from "@/lib/security/request-guards";
import { apiRoute } from "@/lib/audit/api-route";
import { gstDefaultFor, isExpenseCategory } from "@/lib/expenses/categories";
import { applyRuleToSiblings, getTransactionForProject, learnRule, transactionSummary, type BankTransactionRow } from "@/lib/expenses/server";

export const dynamic = "force-dynamic";

const BODY_MAX_BYTES = 2 * 1024;

async function PATCH_handler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const read = await readJsonBody<Record<string, unknown> | null>(request, BODY_MAX_BYTES);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const body: Record<string, unknown> = read.body && typeof read.body === "object" ? read.body : {};
  const category = body.category;
  if (!isExpenseCategory(category)) {
    return NextResponse.json({ ok: false, error: "bad_category", message: "category must be one of the chart keys" }, { status: 400 });
  }
  const learn = body.learn !== false;

  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const row = await getTransactionForProject(supabase, scope.projectId, id);
  if (!row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const patch = {
    category,
    category_source: "manual" as const,
    confidence: 1,
    needs_review: false,
    gst_treatment: gstDefaultFor(category),
  };
  const { data: updated, error } = await supabase
    .from("bank_transactions")
    .update(patch)
    .eq("id", row.id)
    .eq("project_id", scope.projectId)
    .select("*")
    .single();
  if (error) {
    console.error("[expenses:patch]", error);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }

  let learnedRule: string | null = null;
  let siblingsUpdated = 0;
  if (learn) {
    learnedRule = await learnRule(supabase, scope.projectId, row.description, category);
    if (learnedRule) siblingsUpdated = await applyRuleToSiblings(supabase, scope.projectId, learnedRule, category, row.id);
  }

  const merged: BankTransactionRow = { ...row, ...(updated as Partial<BankTransactionRow> | null), ...patch };
  return NextResponse.json({ ok: true, transaction: transactionSummary(merged), learnedRule, siblingsUpdated });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PATCH = apiRoute({ route: "api/expenses/[id]/route.ts", method: "PATCH" }, PATCH_handler);
