// /api/intake/templates — program intake templates (G21 P2-A, migration 0422).
//
//   GET   → { ok, templates: IntakeTemplate[] }                (mine, newest first)
//   POST  { name, description?, questions?, rubric_weights?, consent_text? }
//         → 201 { ok, template }
//         → 400 invalid_input · 402 feature_locked · 503 not_migrated / DB
//
// Gate: `intake.manage` OR the evaluator persona (lib/intake/access.ts) —
// the same gate as the intake links a template is attached to. Rules live
// in lib/intake/templates{,-shared}.ts.

import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { apiRoute } from "@/lib/audit/api-route";
import { gateIntakeRequest as gate } from "@/lib/intake/access";
import { createTemplate, listTemplates, type TemplateInput } from "@/lib/intake/templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BODY_MAX_BYTES = 32 * 1024;
const CREATE_RATE_MAX = 30;
const CREATE_RATE_WINDOW_MS = 60 * 60 * 1000;

export function templateErrorStatus(error: string): number {
  return error === "invalid_input" ? 400 : error === "not_found" ? 404 : error === "not_migrated" || error === "service_unavailable" ? 503 : 500;
}

export async function GET() {
  const { user, response } = await gate();
  if (!user) return response;
  const templates = await listTemplates(user.id);
  return NextResponse.json({ ok: true, templates }, { headers: PRIVATE_JSON_HEADERS });
}

async function POST_handler(request: Request) {
  const { user, response } = await gate();
  if (!user) return response;

  const limited = enforceRateLimit("intake-template-create", user.id, request, CREATE_RATE_MAX, CREATE_RATE_WINDOW_MS);
  if (limited) return limited;

  const read = await readJsonBody<TemplateInput>(request, BODY_MAX_BYTES);
  if (!read.ok) return read.response;
  const body = read.body;
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const result = await createTemplate(user.id, body);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error, message: result.message }, { status: templateErrorStatus(result.error) });
  return NextResponse.json({ ok: true, template: result.template }, { status: 201, headers: PRIVATE_JSON_HEADERS });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/intake/templates/route.ts", method: "POST" }, POST_handler);
