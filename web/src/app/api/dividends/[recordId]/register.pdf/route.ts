// GET /api/dividends/[recordId]/register.pdf?for=<recipient>
//
// The dividend register (S25-B): every statement issued for the record —
// live and voided — with totals and the reconciliation against the declared
// total, as a one-page landscape PDF. Built from the frozen statement
// payloads, so it agrees with the statements to the cent.
//
//   viewer+ on the record's project; another project's record → 404.
//   `?for=` burns the S21-A watermark (the copy sent to the accountant).
//
// GET only — nothing mutates.

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { isUuid } from "@/lib/security/request-guards";
import { renderDividendRegisterPdf } from "@/lib/pdf/dividend-register-pdf";
import { watermarkLabel } from "@/lib/pdf/watermark";
import { getDividendRecordForScope, listStatementsForRecord, loadCompanyForScope, registerForRecord } from "@/lib/dividends/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NOT_FOUND = () => NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

export async function GET(req: NextRequest, { params }: { params: Promise<{ recordId: string }> }): Promise<Response> {
  const { recordId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isUuid(recordId)) return NOT_FOUND();

  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  if (!scope) return NOT_FOUND();

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const recordScope = { projectId: scope.projectId, ownerUserId: scope.ownerUserId, projectName: scope.project.name };
  const record = await getDividendRecordForScope(supabase, recordId, recordScope);
  if (!record) return NOT_FOUND();

  const [company, statements] = await Promise.all([loadCompanyForScope(supabase, recordScope), listStatementsForRecord(supabase, record.id, scope.projectId)]);
  const register = registerForRecord(company, record, statements);
  const watermark = watermarkLabel({ recipient: new URL(req.url).searchParams.get("for") });
  const buffer = await renderDividendRegisterPdf({ data: register, watermark });

  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="dividend-register-${record.period}.pdf"`,
    "Cache-Control": "private, no-store",
    "X-BlockID-Register-Statements": String(register.totals.statementsIssued),
  };
  if (watermark) headers["X-BlockID-Watermark"] = "1";
  return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
}
