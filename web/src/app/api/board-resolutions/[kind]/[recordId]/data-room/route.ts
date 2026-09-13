// POST /api/board-resolutions/[kind]/[recordId]/data-room
//
// "Save to data room" (S26-B): renders the generated resolution (clean page
// — the room serves investors through its own watermarking) and files it
// through the shared `saveDeliverable` helper into the `dataroom` bucket +
// `dataroom_files` rows (`template_slug = board-resolution-<kind>-<recordId>`),
// so re-saving replaces rather than duplicates. Same shape as
// api/dividends/[recordId]/data-room.
//
//   editor+ on the record's project; not generated yet → 409 not_issued.
//
//   200 { ok, dataroomFileId, storagePath, downloadUrl }
//   401  403/404 scope  409 not_issued  502/500/503 save-deliverable codes

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { isUuid } from "@/lib/security/request-guards";
import { renderBoardResolutionPdf } from "@/lib/pdf/board-resolution-pdf";
import { saveDeliverable } from "@/lib/dataroom/save-deliverable";
import { isResolutionKind, RESOLUTION_VERSION } from "@/lib/board-resolutions/build";
import { getResolution } from "@/lib/board-resolutions/server";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function resolutionTemplateSlug(kind: string, recordId: string): string {
  return `board-resolution-${kind}-${recordId.toLowerCase()}`;
}

async function POST_handler(_request: Request, { params }: { params: Promise<{ kind: string; recordId: string }> }) {
  const { kind, recordId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isResolutionKind(kind)) return NextResponse.json({ ok: false, error: "bad_kind" }, { status: 400 });
  if (!isUuid(recordId)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const row = await getResolution(supabase, kind, recordId, scope.projectId);
  if (!row) return NextResponse.json({ ok: false, error: "not_issued" }, { status: 409 });

  const pdf = await renderBoardResolutionPdf({ data: row.payload, contentHash: row.content_hash, watermark: null });
  // The data room belongs to the project OWNER — file under the owner's user
  // id so the room lists it whoever pressed the button.
  const saved = await saveDeliverable({
    userId: scope.ownerUserId,
    email: scope.dataEmail,
    projectId: scope.projectId,
    mime: "application/pdf",
    template_version: RESOLUTION_VERSION,
    svi_dimension: "cgh",
    folder: "governance",
    filename: `${row.payload.title}.pdf`,
    buffer: pdf,
    template_slug: resolutionTemplateSlug(kind, recordId),
  });
  if (!saved.ok) return NextResponse.json({ ok: false, error: saved.error }, { status: saved.status });

  return NextResponse.json({ ok: true, dataroomFileId: saved.dataroomFileId, storagePath: saved.storagePath, downloadUrl: saved.downloadUrl });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/board-resolutions/[kind]/[recordId]/data-room/route.ts", method: "POST" }, POST_handler);
