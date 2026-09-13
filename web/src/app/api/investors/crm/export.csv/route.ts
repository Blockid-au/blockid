// GET /api/investors/crm/export.csv — the pipeline as a CSV (S28-B).
//
// Project OWNER only (admins / editors / viewers get 403) — the same rule
// as /api/audit-log/export: a bulk export of investor PII leaves the
// platform with the person who owns the relationship. Every cell is
// formula-guarded (lib/investors/crm `csvCell`, the audit export's rule)
// so the file is safe to open in Excel / Sheets. `?archived=1` includes
// archived contacts.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ownerOnlyDenied } from "@/lib/project-members/http";
import { contactsToCsv, type ContactRow } from "@/lib/investors/crm";
import { CONTACT_COLUMNS, resolveCrmScope } from "@/lib/investors/crm-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const access = await resolveCrmScope("admin");
  if (!access.ok) return access.response;
  const ownerDenied = ownerOnlyDenied(access.scope);
  if (ownerDenied) return ownerDenied;

  const sp = new URL(req.url).searchParams;
  const includeArchived = sp.get("archived") === "1" || sp.get("archived") === "true";
  let q = supabase.from("investor_contacts").select(CONTACT_COLUMNS).eq("project_id", access.projectId);
  if (!includeArchived) q = q.is("archived_at", null);
  const { data } = await q.order("created_at", { ascending: false }).limit(MAX_ROWS);
  const rows = ((data ?? []) as ContactRow[]).filter((r) => r.project_id === access.projectId);

  const csv = contactsToCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="investor-pipeline-${stamp}.csv"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
