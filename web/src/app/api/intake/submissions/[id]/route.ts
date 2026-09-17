// PATCH /api/intake/submissions/[id] — triage one application in my inbox
// (G14 S35). { status: "received" | "scored" | "reviewed" | "rejected" }.
// 404 for a submission that is not in one of my intakes.

import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/audit/api-route";
import { PRIVATE_JSON_HEADERS, isUuid, readJsonBody } from "@/lib/security/request-guards";
import { gateIntakeRequest as gate } from "@/lib/intake/access";
import { SUBMISSION_STATUSES, setSubmissionStatus, type SubmissionStatus } from "@/lib/intake/program-intakes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function PATCH_handler(request: Request, { params }: Ctx) {
  const { user, response } = await gate();
  if (!user) return response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const read = await readJsonBody<{ status?: unknown }>(request, 2 * 1024);
  if (!read.ok) return read.response;
  const status = read.body?.status;
  if (!(SUBMISSION_STATUSES as readonly unknown[]).includes(status)) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }

  const result = await setSubmissionStatus(user.id, id, status as SubmissionStatus);
  if (!result.ok) {
    const code = result.error === "not_found" || result.error === "not_migrated" ? 404 : result.error === "service_unavailable" ? 503 : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status: code });
  }
  return NextResponse.json({ ok: true, status }, { headers: PRIVATE_JSON_HEADERS });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PATCH = apiRoute({ route: "api/intake/submissions/[id]/route.ts", method: "PATCH" }, PATCH_handler);
