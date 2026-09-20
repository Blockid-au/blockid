// GET /api/evaluations/batch/[id]/export.csv — cohort table as CSV (T0272).
//
// G21 P2-B: any seat on the batch (owner / reviewer / viewer —
// assertBatchRole) and the BlockID Cohort columns (confidence, verification,
// Δ, gaps, review status, reviewer, shortlist, overrides count). A non-member
// answers 404 (not 403 — the id space must not be enumerable). UTF-8 BOM + CRLF + RFC 4180 quoting and a
// formula-injection guard so the file opens cleanly in Excel (see cohortCsv).
// 401 anonymous. No feature gate beyond ownership — only a Program user can
// have created a batch, and a downgraded one keeps the export of what they
// already paid for.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { assertBatchRole } from "@/lib/evaluations/batch-members";
import { loadBlockIdCohortRows } from "@/lib/evaluations/cohort-rows-loader";
import { blockIdCohortCsv } from "@/lib/evaluations/cohort-rows";
import { csvFilename } from "@/lib/evaluations/batch-shared";

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
  const access = await assertBatchRole(id, user.id, "viewer");
  if (!access.ok) return NextResponse.json({ ok: false, error: access.error === "unavailable" ? "unavailable" : "not_found" }, { status: access.error === "unavailable" ? 503 : 404 });
  const batch = access.batch;

  const { rows } = await loadBlockIdCohortRows(batch, user.id);
  const csv = blockIdCohortCsv(rows, siteBase(request));
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${csvFilename(batch)}"`,
      "cache-control": "private, no-store",
    },
  });
}
