// GET /api/dividends/statements/[id]/pdf?for=<recipient>
//
// The issued distribution statement as a one-page PDF (S25-B), rendered from
// the payload frozen on the register row — never a recompute — so the bytes
// a shareholder holds still hash to `content_hash`.
//
//   - owner or any accepted member (viewer+) of the statement's project; a
//     statement of another project → 404 (never 403 — no id oracle);
//   - `?for=<name or email>` burns the S21-A "Prepared for …" watermark
//     (e.g. the copy emailed to the shareholder's accountant). Absent →
//     clean page;
//   - a voided statement still renders (it is a record) with the VOID
//     banner and X-BlockID-Statement-Voided: 1.
//
// GET only — nothing mutates, so apiRoute() is not required (S20-A).

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { isUuid } from "@/lib/security/request-guards";
import { renderDividendStatementPdf } from "@/lib/pdf/dividend-statement-pdf";
import { watermarkLabel } from "@/lib/pdf/watermark";
import { getStatementForProject } from "@/lib/dividends/server";

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

  const row = await getStatementForProject(supabase, id, scope.projectId);
  if (!row) return NOT_FOUND();

  const recipient = new URL(req.url).searchParams.get("for");
  const watermark = watermarkLabel({ recipient });

  const buffer = await renderDividendStatementPdf({
    data: row.payload,
    contentHash: row.content_hash,
    watermark,
    voidedAt: row.voided_at,
    voidReason: row.void_reason,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="dividend-statement-${row.statement_no}.pdf"`,
    "Cache-Control": "private, no-store",
    "X-BlockID-Statement": row.statement_no,
  };
  if (watermark) headers["X-BlockID-Watermark"] = "1";
  if (row.voided_at) headers["X-BlockID-Statement-Voided"] = "1";
  return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
}
