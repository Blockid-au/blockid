// GET /api/intake/links/[id]/export.csv — one intake's scored inbox as CSV
// (G14 S35). `[id]` = "all" exports every intake of mine. Same conventions
// as the cohort export: UTF-8 BOM + CRLF + RFC 4180 + formula guard
// (lib/intake/inbox-csv.ts). 401 anonymous, 402 without intake.manage /
// evaluator persona, 404 for an intake that is not mine.

import { NextResponse } from "next/server";
import { isUuid } from "@/lib/security/request-guards";
import { gateIntakeRequest as gate } from "@/lib/intake/access";
import { inboxCsv, inboxCsvFilename } from "@/lib/intake/inbox-csv";
import { getMyIntake, listInboxRows } from "@/lib/intake/program-intakes";

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
  const { user, response } = await gate();
  if (!user) return response;
  const { id } = await params;

  let intakeId: string | null = null;
  let intake = null;
  if (id !== "all") {
    if (!isUuid(id)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    intake = await getMyIntake(user.id, id);
    if (!intake) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    intakeId = intake.id;
  }

  const rows = await listInboxRows(user.id, { intakeId });
  const csv = inboxCsv(rows, siteBase(request));
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${inboxCsvFilename(intake)}"`,
      "cache-control": "private, no-store",
    },
  });
}
