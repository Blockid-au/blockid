// POST /api/dividends/tax-statements/data-room `{ fy }`
//
// "Save to data room" (S28-A): renders every CURRENT annual tax statement
// of the financial year (clean pages — the room serves investors through
// its own watermarking) and files them through the shared `saveDeliverable`
// helper into the `dataroom` bucket + `dataroom_files` rows, one row per
// statement (`template_slug = tax-statement-<no>`), so re-saving replaces
// rather than duplicates — the same shape as api/dividends/[recordId]/data-room.
//
//   editor+; bad FY → 400; no current statement for the FY → 409
//   (generate them first).
//
//   200 { ok, fy, statements: [{ statementNo, dataroomFileId, storagePath }] }
//   400 bad_fy  401  403/404 scope  409 no_statements  502/500/503 save-deliverable codes

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { readJsonBody } from "@/lib/security/request-guards";
import { renderShareholderTaxStatementPdf } from "@/lib/pdf/shareholder-tax-statement-pdf";
import { saveDeliverable } from "@/lib/dataroom/save-deliverable";
import { TAX_STATEMENT_VERSION, lastCompletedFy, parseFy } from "@/lib/dividends/fy-summary";
import { currentOnly, listTaxStatementsForFy, taxStatementVersion } from "@/lib/dividends/tax-statements";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function taxStatementTemplateSlug(statementNo: string): string {
  return `tax-statement-${statementNo.toLowerCase()}`;
}

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const read = await readJsonBody<Record<string, unknown> | null>(request, 2 * 1024);
  if (!read.ok) {
    if (read.status === 413) return read.response;
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const body: Record<string, unknown> = read.body && typeof read.body === "object" ? read.body : {};
  const parsed = parseFy(typeof body.fy === "string" ? body.fy : lastCompletedFy());
  if (!parsed) return NextResponse.json({ ok: false, error: "bad_fy" }, { status: 400 });
  const fy = parsed.label;

  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const rows = currentOnly(await listTaxStatementsForFy(supabase, scope.projectId, fy));
  if (rows.length === 0) return NextResponse.json({ ok: false, error: "no_statements", fy }, { status: 409 });

  // The data room belongs to the project OWNER — file under the owner's user
  // id so the room lists it whoever pressed the button.
  const base = { userId: scope.ownerUserId, email: scope.dataEmail, projectId: scope.projectId, mime: "application/pdf", template_version: TAX_STATEMENT_VERSION, svi_dimension: "cgh", folder: "dividends" } as const;

  const saved: Array<{ statementNo: string; dataroomFileId: string | null; storagePath: string }> = [];
  for (const s of rows) {
    const pdf = await renderShareholderTaxStatementPdf({ data: s.payload, contentHash: s.content_hash, watermark: null, version: taxStatementVersion(s) });
    const res = await saveDeliverable({ ...base, filename: `Annual tax statement ${fy} ${s.statement_no} — ${s.payload.shareholder.name}.pdf`, buffer: pdf, template_slug: taxStatementTemplateSlug(s.statement_no) });
    if (!res.ok) return NextResponse.json({ ok: false, error: res.error, statementNo: s.statement_no, saved }, { status: res.status });
    saved.push({ statementNo: s.statement_no, dataroomFileId: res.dataroomFileId, storagePath: res.storagePath });
  }

  return NextResponse.json({ ok: true, fy, statements: saved });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/dividends/tax-statements/data-room/route.ts", method: "POST" }, POST_handler);
