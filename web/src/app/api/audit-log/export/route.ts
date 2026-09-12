// GET /api/audit-log/export?project=&actor=&action= — CSV of the current
// project's audit log. S20-A: project OWNER only (admins/members get 403);
// cells are formula-guarded (csvCellGuarded) so the file is safe to open in
// Excel / Sheets. Same scope + filter rules as /workspace/audit-log.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import {
  auditEventsToCsv,
  buildAuditQuery,
  listAuditEvents,
  resolveAuditViewerScope,
} from "@/lib/audit/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const { scope, denied } = await projectScopeOrDeny();
  if (denied) return denied;

  const viewer = resolveAuditViewerScope(user, scope);
  if (!viewer.canExport) {
    return NextResponse.json(
      { ok: false, error: "Forbidden — only the project owner can export the audit log", code: "forbidden" },
      { status: 403 },
    );
  }

  const sp = new URL(request.url).searchParams;
  const q = buildAuditQuery(
    viewer,
    { project: sp.get("project"), actor: sp.get("actor"), action: sp.get("action") },
    { limit: MAX_ROWS, offset: 0 },
  );
  const rows = await listAuditEvents(q);
  const csv = auditEventsToCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="audit-log-${stamp}.csv"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
