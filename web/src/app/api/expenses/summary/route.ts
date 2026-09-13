/**
 * GET /api/expenses/summary?from=YYYY-MM-DD&to=YYYY-MM-DD — monthly P&L by
 * category, burn rate, top merchants and a GST estimate from the project's
 * categorised bank lines (S28-C). Viewer+ on the active project; the
 * summary is read for the PROJECT (owner's data), never the caller's own.
 * Without `from`/`to` the whole history is summarised.
 *
 * 200 { ok, role, summary, disclaimer }   400 bad date   401   403/404   503
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { loadSummary } from "@/lib/expenses/server";

export const dynamic = "force-dynamic";

export const DISCLAIMER =
  "General information from your bank lines, not tax or financial advice. GST figures are estimates from category defaults — prepare your BAS from tax invoices or with your accountant.";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dateParam(v: string | null): { ok: true; value: string | null } | { ok: false } {
  if (v === null || v === "") return { ok: true, value: null };
  if (!DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) return { ok: false };
  return { ok: true, value: v };
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const from = dateParam(url.searchParams.get("from"));
  const to = dateParam(url.searchParams.get("to"));
  if (!from.ok || !to.ok) return NextResponse.json({ ok: false, error: "from / to must be YYYY-MM-DD" }, { status: 400 });
  if (from.value && to.value && from.value > to.value) return NextResponse.json({ ok: false, error: "from must not be after to" }, { status: 400 });

  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "project_required" }, { status: 404 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const summary = await loadSummary(supabase, scope.projectId, { from: from.value, to: to.value });
  return NextResponse.json({ ok: true, role: scope.role, summary, disclaimer: DISCLAIMER });
}
