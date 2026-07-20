// GET  /api/esop/grants     — list grants for the active project.
// POST /api/esop/grants     — create a new option grant.
//
// Scoped to (user_id, project_id) via the session cookie + `blockid_project`.
// General information only. Not legal or tax advice.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getProjectIdFromRequest } from "@/lib/projects";
import { createGrant, listGrants } from "@/lib/esop-grants";
import { DIV83A_DISCLAIMER } from "@/lib/div83a-checker";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const projectId = await getProjectIdFromRequest();
  const grants = await listGrants(user.id, projectId);

  return NextResponse.json({
    ok: true,
    grants,
    disclaimer: DIV83A_DISCLAIMER,
  });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Authentication required" },
      { status: 401 },
    );
  }

  const body: unknown = await request.json().catch(() => ({}));
  const b = (body ?? {}) as Record<string, unknown>;

  const granteeName = typeof b.granteeName === "string" ? b.granteeName.trim() : "";
  const granteeEmail = typeof b.granteeEmail === "string" ? b.granteeEmail.trim() : "";
  const grantDate = typeof b.grantDate === "string" ? b.grantDate : "";
  const sharesUnderOption = Number(b.sharesUnderOption);
  const strikePriceAud = Number(b.strikePriceAud ?? 0);
  const vestingYears = Number(b.vestingYears ?? 4);
  const cliffMonths = Number(b.cliffMonths ?? 12);
  const notes = typeof b.notes === "string" ? b.notes : null;

  if (!granteeName) {
    return NextResponse.json(
      { ok: false, error: "granteeName is required" },
      { status: 400 },
    );
  }
  if (!grantDate || !/^\d{4}-\d{2}-\d{2}$/.test(grantDate)) {
    return NextResponse.json(
      { ok: false, error: "grantDate must be YYYY-MM-DD" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(sharesUnderOption) || sharesUnderOption <= 0) {
    return NextResponse.json(
      { ok: false, error: "sharesUnderOption must be > 0" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(strikePriceAud) || strikePriceAud < 0) {
    return NextResponse.json(
      { ok: false, error: "strikePriceAud must be ≥ 0" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(vestingYears) || vestingYears < 1 || vestingYears > 6) {
    return NextResponse.json(
      { ok: false, error: "vestingYears must be 1..6" },
      { status: 400 },
    );
  }
  if (!Number.isFinite(cliffMonths) || cliffMonths < 0 || cliffMonths > 24) {
    return NextResponse.json(
      { ok: false, error: "cliffMonths must be 0..24" },
      { status: 400 },
    );
  }

  const projectId = await getProjectIdFromRequest();

  const grant = await createGrant({
    userId: user.id,
    projectId,
    granteeName,
    granteeEmail: granteeEmail || null,
    grantDate,
    sharesUnderOption,
    strikePriceAud,
    vestingYears,
    cliffMonths,
    notes,
  });

  if (!grant) {
    return NextResponse.json(
      { ok: false, error: "Failed to create grant" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true, grant, disclaimer: DIV83A_DISCLAIMER },
    { status: 201 },
  );
}
