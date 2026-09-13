// GET /api/dividends/tax-statements/[id]/pdf?for=<recipient>
//
// A shareholder's annual (FY) tax statement as a one-page PDF (S28-A),
// rendered from the payload frozen on the `shareholder_tax_statements` row
// — never a recompute — so the bytes hash to `content_hash`.
//
//   - owner or any accepted member (viewer+) of the statement's project; a
//     statement of another project → 404 (never 403 — no id oracle);
//   - `?for=<name or email>` burns the S21-A "Prepared for …" watermark;
//   - a superseded version still renders (it is a record) with the
//     SUPERSEDED banner and X-BlockID-Statement-Superseded: 1.
//
// GET only — nothing mutates, so apiRoute() is not required (S20-A).

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { isUuid } from "@/lib/security/request-guards";
import { renderShareholderTaxStatementPdf } from "@/lib/pdf/shareholder-tax-statement-pdf";
import { watermarkLabel } from "@/lib/pdf/watermark";
import { getTaxStatementForProject, taxStatementVersion } from "@/lib/dividends/tax-statements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NOT_FOUND = () => NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isUuid(id)) return NOT_FOUND();

  const { scope, denied } = await projectScopeOrDeny("viewer");
  if (denied) return denied;
  if (!scope) return NOT_FOUND();

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const row = await getTaxStatementForProject(supabase, id, scope.projectId);
  if (!row) return NOT_FOUND();

  const recipient = new URL(req.url).searchParams.get("for");
  const watermark = watermarkLabel({ recipient });

  const buffer = await renderShareholderTaxStatementPdf({
    data: row.payload,
    contentHash: row.content_hash,
    watermark,
    version: taxStatementVersion(row),
    supersededAt: row.superseded_at,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="annual-tax-statement-${row.statement_no}.pdf"`,
    "Cache-Control": "private, no-store",
    "X-BlockID-Statement": row.statement_no,
  };
  if (watermark) headers["X-BlockID-Watermark"] = "1";
  if (row.superseded_at) headers["X-BlockID-Statement-Superseded"] = "1";
  return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
}
