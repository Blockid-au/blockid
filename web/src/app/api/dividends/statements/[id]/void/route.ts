// POST /api/dividends/statements/[id]/void `{ reason }`
//
// Marks an issued distribution statement void (S25-B). Owner or admin of
// the statement's project only (`getProjectScope("admin")` — an editor gets
// 403). The row is never deleted: the PDF keeps rendering with the VOID
// banner and the register lists it struck out. Voiding frees the
// (record, shareholder) slot so "Issue statements" re-issues a corrected one
// with a new number. One-way; a second call is 409.
//
//   200 { ok, statement }   400 reason required / too long
//   401 unauthorized  403 role  404 not this project's statement
//   409 already_voided  503 service_unavailable

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { isUuid, readJsonBody } from "@/lib/security/request-guards";
import { statementSummary, voidStatement } from "@/lib/dividends/server";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

export const REASON_MAX_LEN = 500;

async function POST_handler(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const read = await readJsonBody<Record<string, unknown> | null>(request, 4 * 1024);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "Invalid JSON body", field: "reason" }, { status: 400 });
  }
  const body = read.body && typeof read.body === "object" ? read.body : {};
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) return NextResponse.json({ ok: false, error: "reason is required", field: "reason" }, { status: 400 });
  if (reason.length > REASON_MAX_LEN) {
    return NextResponse.json({ ok: false, error: `reason must be at most ${REASON_MAX_LEN} characters`, field: "reason" }, { status: 400 });
  }

  const { scope, denied } = await projectScopeOrDeny("admin");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const res = await voidStatement(supabase, id, scope.projectId, reason);
  if (!res.ok) {
    if (res.error === "not_found") return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    if (res.error === "already_voided") return NextResponse.json({ ok: false, error: "already_voided" }, { status: 409 });
    return NextResponse.json({ ok: false, error: "void_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, statement: statementSummary(res.row) });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/dividends/statements/[id]/void/route.ts", method: "POST" }, POST_handler);
