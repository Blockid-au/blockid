// POST /api/valuation/certificate/[id]/data-room
//
// "Add certificate to data room" (S22-A): renders the issued certificate
// (clean pages — a data-room copy is served to investors through the room's
// own watermarking) and files it through the shared `saveDeliverable`
// helper into the `dataroom` bucket + `dataroom_files` row, one row per
// certificate (`template_slug = valuation-certificate-<no>`), so re-saving
// replaces the file rather than duplicating it.
//
//   editor+ on the certificate's project; a revoked certificate → 409
//   (a revoked record does not belong in a live data room).
//
//   200 { ok, dataroomFileId, storagePath, downloadUrl }
//   401  403/404 scope  409 revoked  502/500/503 save-deliverable codes

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { isUuid } from "@/lib/security/request-guards";
import { renderValuationCertificatePdf } from "@/lib/pdf/valuation-certificate-pdf";
import { saveDeliverable } from "@/lib/dataroom/save-deliverable";
import { getCertificateForProject } from "@/lib/valuation-certificate/server";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function certificateTemplateSlug(certificateNo: string): string {
  return `valuation-certificate-${certificateNo.toLowerCase()}`;
}

async function POST_handler(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const row = await getCertificateForProject(supabase, id, scope.projectId);
  if (!row) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  if (row.revoked_at) return NextResponse.json({ ok: false, error: "revoked" }, { status: 409 });

  const buffer = await renderValuationCertificatePdf({ data: row.payload, contentHash: row.content_hash, watermark: null });

  // The data room belongs to the project OWNER — file it under the owner's
  // user id so the room lists it whoever pressed the button.
  const saved = await saveDeliverable({
    userId: scope.ownerUserId,
    email: scope.dataEmail,
    projectId: scope.projectId,
    filename: `Valuation certificate ${row.certificate_no}.pdf`,
    buffer,
    mime: "application/pdf",
    template_slug: certificateTemplateSlug(row.certificate_no),
    template_version: row.payload.version,
    svi_dimension: "iri",
    folder: "valuation",
  });
  if (!saved.ok) return NextResponse.json({ ok: false, error: saved.error }, { status: saved.status });

  return NextResponse.json({
    ok: true,
    certificateNo: row.certificate_no,
    dataroomFileId: saved.dataroomFileId,
    storagePath: saved.storagePath,
    downloadUrl: saved.downloadUrl,
  });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/valuation/certificate/[id]/data-room/route.ts", method: "POST" }, POST_handler);
