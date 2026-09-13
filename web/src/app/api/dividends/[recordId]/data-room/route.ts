// POST /api/dividends/[recordId]/data-room
//
// "Save to data room" (S25-B): renders the dividend register and every LIVE
// distribution statement of the record (clean pages — the room serves
// investors through its own watermarking) and files them through the shared
// `saveDeliverable` helper into the `dataroom` bucket + `dataroom_files`
// rows, one row per document (`template_slug = dividend-register-<recordId>`
// / `dividend-statement-<no>`), so re-saving replaces rather than duplicates.
//
//   editor+ on the record's project; no live statements → 409 (issue them
//   first — an empty register is not a deliverable).
//
//   200 { ok, register: { dataroomFileId, storagePath }, statements: [...] }
//   401  403/404 scope  409 no_statements  502/500/503 save-deliverable codes

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { isUuid } from "@/lib/security/request-guards";
import { renderDividendRegisterPdf } from "@/lib/pdf/dividend-register-pdf";
import { renderDividendStatementPdf } from "@/lib/pdf/dividend-statement-pdf";
import { saveDeliverable } from "@/lib/dataroom/save-deliverable";
import { getDividendRecordForScope, listStatementsForRecord, loadCompanyForScope, registerForRecord } from "@/lib/dividends/server";
import { STATEMENT_VERSION } from "@/lib/dividends/statement";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function registerTemplateSlug(recordId: string): string {
  return `dividend-register-${recordId.toLowerCase()}`;
}
export function statementTemplateSlug(statementNo: string): string {
  return `dividend-statement-${statementNo.toLowerCase()}`;
}

async function POST_handler(_request: Request, { params }: { params: Promise<{ recordId: string }> }) {
  const { recordId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isUuid(recordId)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const recordScope = { projectId: scope.projectId, ownerUserId: scope.ownerUserId, projectName: scope.project.name };
  const record = await getDividendRecordForScope(supabase, recordId, recordScope);
  if (!record) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const [company, statements] = await Promise.all([loadCompanyForScope(supabase, recordScope), listStatementsForRecord(supabase, record.id, scope.projectId)]);
  const live = statements.filter((s) => !s.voided_at);
  if (live.length === 0) return NextResponse.json({ ok: false, error: "no_statements" }, { status: 409 });

  // The data room belongs to the project OWNER — file under the owner's user
  // id so the room lists it whoever pressed the button.
  const base = { userId: scope.ownerUserId, email: scope.dataEmail, projectId: scope.projectId, mime: "application/pdf", template_version: STATEMENT_VERSION, svi_dimension: "cgh", folder: "dividends" } as const;

  const registerPdf = await renderDividendRegisterPdf({ data: registerForRecord(company, record, statements), watermark: null });
  const savedRegister = await saveDeliverable({ ...base, filename: `Dividend register ${record.period}.pdf`, buffer: registerPdf, template_slug: registerTemplateSlug(record.id) });
  if (!savedRegister.ok) return NextResponse.json({ ok: false, error: savedRegister.error }, { status: savedRegister.status });

  const saved: Array<{ statementNo: string; dataroomFileId: string | null; storagePath: string }> = [];
  for (const s of live) {
    const pdf = await renderDividendStatementPdf({ data: s.payload, contentHash: s.content_hash, watermark: null });
    const res = await saveDeliverable({ ...base, filename: `Dividend statement ${s.statement_no} — ${s.payload.shareholder.name}.pdf`, buffer: pdf, template_slug: statementTemplateSlug(s.statement_no) });
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error, statementNo: s.statement_no, saved }, { status: res.status });
    saved.push({ statementNo: s.statement_no, dataroomFileId: res.dataroomFileId, storagePath: res.storagePath });
  }

  return NextResponse.json({
    ok: true,
    register: { dataroomFileId: savedRegister.dataroomFileId, storagePath: savedRegister.storagePath, downloadUrl: savedRegister.downloadUrl },
    statements: saved,
  });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/dividends/[recordId]/data-room/route.ts", method: "POST" }, POST_handler);
