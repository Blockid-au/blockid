// GET /api/valuation/certificate/[id]/pdf?for=<investor>&annex=ess|none
//
// The issued certificate as a PDF (S22-A), rendered from the payload frozen
// on the register row — never a recompute — so the bytes an investor holds
// still hash to what the verify page shows.
//
//   - owner or any accepted member (viewer+) of the certificate's project;
//     a certificate of another project → 404 (never 403 — the id must not
//     become an oracle);
//   - `?for=<name or email>` burns the S21-A "Prepared for <investor> ·
//     <date> · BlockID.au" watermark on every page — the copy a founder
//     hands to a named investor. Absent → clean pages;
//   - a revoked certificate still renders (it is a record), with the
//     REVOKED banner on every page and X-BlockID-Certificate-Revoked: 1;
//   - `?annex=ess` (S27-A) prints Annex A (ESS start-up concession) — by
//     default it prints whenever the payload was issued with it; `none`
//     suppresses it. `X-BlockID-Annex: ess` when printed. 0 credits.
//
// GET only — nothing mutates, so apiRoute() is not required (S20-A).

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { isUuid } from "@/lib/security/request-guards";
import { essAnnexFor, renderValuationCertificatePdf } from "@/lib/pdf/valuation-certificate-pdf";
import { watermarkLabel } from "@/lib/pdf/watermark";
import { getCertificateForProject } from "@/lib/valuation-certificate/server";

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

  const row = await getCertificateForProject(supabase, id, scope.projectId);
  if (!row) return NOT_FOUND();

  const query = new URL(req.url).searchParams;
  const watermark = watermarkLabel({ recipient: query.get("for") });
  const annexParam = query.get("annex");
  const annex = annexParam === "ess" || annexParam === "none" ? annexParam : "auto";
  const essPrinted = essAnnexFor(row.payload, annex) !== null;

  const buffer = await renderValuationCertificatePdf({
    data: row.payload,
    contentHash: row.content_hash,
    watermark,
    revokedAt: row.revoked_at,
    annex,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="blockid-valuation-certificate-${row.certificate_no}.pdf"`,
    "Cache-Control": "private, no-store",
    "X-BlockID-Certificate": row.certificate_no,
  };
  if (watermark) headers["X-BlockID-Watermark"] = "1";
  if (row.revoked_at) headers["X-BlockID-Certificate-Revoked"] = "1";
  if (essPrinted) headers["X-BlockID-Annex"] = "ess";
  return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
}
