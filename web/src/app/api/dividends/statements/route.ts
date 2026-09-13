// GET /api/dividends/statements — the /workspace/dividends statements panel's
// one read (S25-B): every dividend record of the active project (newest
// first) with the statements issued for each, the caller's role, the listed
// cost and whether statements are included for the caller.
//
// viewer+; no project → empty list. GET only — nothing mutates.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { FEATURE_COSTS } from "@/lib/credits";
import { statementsIncluded } from "@/lib/dividends/gate";
import { listDividendRecordsForScope, listStatementsForProject, recordSummary, statementSummary } from "@/lib/dividends/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  const cost = FEATURE_COSTS.dividend_statements ?? 2;
  if (!scope) return NextResponse.json({ ok: true, records: [], role: null, cost, included: false });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const recordScope = { projectId: scope.projectId, ownerUserId: scope.ownerUserId, projectName: scope.project.name };
  const [records, statements, gate] = await Promise.all([
    listDividendRecordsForScope(supabase, recordScope),
    listStatementsForProject(supabase, scope.projectId),
    statementsIncluded({ id: user.id, plan: user.plan }),
  ]);
  const byRecord = new Map<string, ReturnType<typeof statementSummary>[]>();
  for (const s of statements) {
    const list = byRecord.get(s.dividend_record_id) ?? [];
    list.push(statementSummary(s));
    byRecord.set(s.dividend_record_id, list);
  }
  return NextResponse.json({
    ok: true,
    role: scope.role,
    cost,
    included: gate.included,
    includedVia: gate.via,
    records: records.map((r) => ({ ...recordSummary(r), statements: (byRecord.get(r.id) ?? []).sort((a, b) => a.issuedAt.localeCompare(b.issuedAt)) })),
  });
}
