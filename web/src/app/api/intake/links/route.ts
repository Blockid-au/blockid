// /api/intake/links — program intake links (G14 S35). (/api/intake itself is
// the analyze wrapper — unrelated.)
//
//   GET   → { ok, intakes: IntakeWithCounts[] }            (mine, newest first)
//   POST  { name, blurb?, opens_at?, closes_at?, max_submissions?, auto_report? }
//         → 201 { ok, intake: { …, publicUrl } }
//         → 400 invalid_input · 402 feature_locked · 404 not_migrated
//
// Gate: `intake.manage` OR the evaluator persona (lib/intake/access.ts).
// Every rule lives in lib/intake/program-intakes.ts.

import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { apiRoute } from "@/lib/audit/api-route";
import { gateIntakeRequest as gate } from "@/lib/intake/access";
import { createIntake, listMyIntakes, type CreateIntakeInput } from "@/lib/intake/program-intakes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BODY_MAX_BYTES = 8 * 1024;
const CREATE_RATE_MAX = 20;
const CREATE_RATE_WINDOW_MS = 60 * 60 * 1000;

export async function GET() {
  const { user, response } = await gate();
  if (!user) return response;
  const intakes = await listMyIntakes(user.id);
  return NextResponse.json({ ok: true, intakes }, { headers: PRIVATE_JSON_HEADERS });
}

async function POST_handler(request: Request) {
  const { user, response } = await gate();
  if (!user) return response;

  const limited = enforceRateLimit("intake-create", user.id, request, CREATE_RATE_MAX, CREATE_RATE_WINDOW_MS);
  if (limited) return limited;

  const read = await readJsonBody<CreateIntakeInput>(request, BODY_MAX_BYTES);
  if (!read.ok) return read.response;
  const body = read.body;
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const result = await createIntake(user.id, body);
  if (!result.ok) {
    const status = result.error === "invalid_input" ? 400 : result.error === "not_migrated" ? 404 : result.error === "service_unavailable" ? 503 : 500;
    return NextResponse.json({ ok: false, error: result.error, message: result.message }, { status });
  }
  return NextResponse.json({ ok: true, intake: result.intake }, { status: 201, headers: PRIVATE_JSON_HEADERS });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/intake/links/route.ts", method: "POST" }, POST_handler);
