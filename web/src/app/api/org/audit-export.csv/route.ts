// GET /api/org/audit-export.csv?from=&to= — the organisation's audit rows
// as a streamed CSV (G21 P3-B institutional admin). Rows = every
// `audit_events` entry written by the org's seats (owner + members) inside
// the window (default: the last 90 days; capped at 366). Cells are
// formula-guarded (`'` before `= + - @`), the export itself is recorded as
// `org.audit.exported`.
//
//   401 anonymous · 403 not the org owner / a solo evaluator (the pages show
//   the "for organisations" card) / audit export switched off in
//   org_settings · 400 bad window · 200 text/csv (streamed).
//
// Read-only → not wrapped by apiRoute() (mutation methods only).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { readOrgSettings, resolveOrgAdmin } from "@/lib/org/admin";
import { parseExportWindow, recordAuditExport, streamOrgAuditCsv } from "@/lib/org/audit-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const deny = (status: number, error: string, message: string) => NextResponse.json({ ok: false, error, message }, { status, headers: { "cache-control": "no-store" } });

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return deny(401, "auth_required", "Sign in to export the organisation audit log.");

  const admin = await resolveOrgAdmin({ id: user.id, plan: user.plan ?? null });
  if (admin.status !== "ok" || !admin.org) {
    const message =
      admin.status === "not_owner"
        ? "Only the organisation owner can export its audit log."
        : "Audit export is an organisation feature — available to the owner of a Program / Fund organisation or a team with seats.";
    return deny(403, "forbidden", message);
  }
  const settings = await readOrgSettings(admin.org.id);
  if (!settings.auditExportEnabled) return deny(403, "export_disabled", "Audit export is switched off for this organisation (Settings → Retention).");

  const sp = new URL(request.url).searchParams;
  const window = parseExportWindow(sp.get("from"), sp.get("to"));
  if (!window.ok) return deny(400, "invalid_window", window.message);

  const orgId = admin.org.id;
  const seats = admin.seats;
  const stream = streamOrgAuditCsv(seats, window.window, { onDone: (rows) => recordAuditExport({ id: user.id }, orgId, window.window, rows, seats.length) });
  const stamp = window.window.to.slice(0, 10);
  return new NextResponse(stream, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="org-audit-${stamp}.csv"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex",
    },
  });
}
