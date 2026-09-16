// PATCH /api/intake/links/[id] — close / reopen one of my intake links (G14 S35).
//   { status: "open" | "closed" } → { ok, intake }
//   404 for an id that is not mine (id space must not be enumerable).

import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/audit/api-route";
import { PRIVATE_JSON_HEADERS, isUuid, readJsonBody } from "@/lib/security/request-guards";
import { INTAKE_STATUSES, setIntakeStatus, type IntakeStatus } from "@/lib/intake/program-intakes";
import { gateIntakeRequest as gate } from "@/lib/intake/access";

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
  if (!(INTAKE_STATUSES as readonly unknown[]).includes(status)) {
    return NextResponse.json({ ok: false, error: "invalid_status" }, { status: 400 });
  }

  const result = await setIntakeStatus(user.id, id, status as IntakeStatus);
  if (!result.ok) {
    const code = result.error === "not_found" || result.error === "not_migrated" ? 404 : result.error === "service_unavailable" ? 503 : 500;
    return NextResponse.json({ ok: false, error: result.error }, { status: code });
  }
  return NextResponse.json({ ok: true, intake: result.intake }, { headers: PRIVATE_JSON_HEADERS });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PATCH = apiRoute({ route: "api/intake/links/[id]/route.ts", method: "PATCH" }, PATCH_handler);
