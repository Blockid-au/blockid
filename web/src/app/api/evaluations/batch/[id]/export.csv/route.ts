// GET /api/evaluations/batch/[id]/export.csv — cohort table as CSV (T0272).
//
// Owner-only: a batch that is not the caller's answers 404 (not 403 — the id
// space must not be enumerable). UTF-8 BOM + CRLF + RFC 4180 quoting and a
// formula-injection guard so the file opens cleanly in Excel (see cohortCsv).
// 401 anonymous. No feature gate beyond ownership — only a Program user can
// have created a batch, and a downgraded one keeps the export of what they
// already paid for.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBatchForUser, loadCohortRows } from "@/lib/evaluations/batch";
import { cohortCsv, csvFilename } from "@/lib/evaluations/batch-shared";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

function siteBase(request: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");
  try {
    const u = new URL(request.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "https://blockid.au";
  }
}

export async function GET(request: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  const { id } = await params;
  const batch = await getBatchForUser(user.id, id);
  if (!batch) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const rows = await loadCohortRows(batch);
  const csv = cohortCsv(rows, siteBase(request));
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${csvFilename(batch)}"`,
      "cache-control": "private, no-store",
    },
  });
}
