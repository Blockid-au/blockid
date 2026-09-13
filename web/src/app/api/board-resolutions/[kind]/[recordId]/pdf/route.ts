// GET /api/board-resolutions/[kind]/[recordId]/pdf?for=<recipient>
//
// The generated board resolution (S26-B) as an A4 PDF, rendered from the
// payload frozen on `board_resolutions.payload` — never a recompute.
//
//   editor+ on the record's project (a resolution is a working document
//   for the directors, not an investor deliverable); another project's
//   record → 404; not generated yet → 404 `not_issued` (POST the parent
//   route first — that is where the cost is shown and confirmed).
//   `?for=` burns the S21-A watermark (the copy sent to a director).
//
// GET only — nothing mutates.

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { isUuid } from "@/lib/security/request-guards";
import { renderBoardResolutionPdf } from "@/lib/pdf/board-resolution-pdf";
import { watermarkLabel } from "@/lib/pdf/watermark";
import { isResolutionKind } from "@/lib/board-resolutions/build";
import { getResolution } from "@/lib/board-resolutions/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NOT_FOUND = (error = "not_found") => NextResponse.json({ ok: false, error }, { status: 404 });

export function resolutionFilename(kind: string, recordId: string): string {
  return `board-resolution-${kind}-${recordId.slice(0, 8)}.pdf`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string; recordId: string }> }): Promise<Response> {
  const { kind, recordId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!isResolutionKind(kind)) return NextResponse.json({ ok: false, error: "bad_kind" }, { status: 400 });
  if (!isUuid(recordId)) return NOT_FOUND();

  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  if (!scope) return NOT_FOUND();

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "service_unavailable" }, { status: 503 });

  const row = await getResolution(supabase, kind, recordId, scope.projectId);
  if (!row) return NOT_FOUND("not_issued");

  const watermark = watermarkLabel({ recipient: new URL(req.url).searchParams.get("for") });
  const buffer = await renderBoardResolutionPdf({ data: row.payload, contentHash: row.content_hash, watermark });

  const headers: Record<string, string> = {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="${resolutionFilename(kind, recordId)}"`,
    "Cache-Control": "private, no-store",
    "X-BlockID-Content-Hash": row.content_hash,
  };
  if (watermark) headers["X-BlockID-Watermark"] = "1";
  return new NextResponse(new Uint8Array(buffer), { status: 200, headers });
}
