// /api/intake/templates/[id] — one of my intake templates (G21 P2-A).
//
//   GET    → { ok, template }
//   PATCH  { name, description?, questions?, rubric_weights?, consent_text? }  (full replace, versionless)
//          → { ok, template }
//   DELETE → { ok }  (program_intakes.template_id / evaluation_batches.template_id → NULL by FK)
//   404 for an id that is not mine (id space must not be enumerable).

import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/audit/api-route";
import { PRIVATE_JSON_HEADERS, isUuid, readJsonBody } from "@/lib/security/request-guards";
import { gateIntakeRequest as gate } from "@/lib/intake/access";
import { deleteTemplate, getTemplate, updateTemplate, type TemplateInput } from "@/lib/intake/templates";
import { templateErrorStatus } from "../route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const { user, response } = await gate();
  if (!user) return response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const template = await getTemplate(user.id, id);
  if (!template) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true, template }, { headers: PRIVATE_JSON_HEADERS });
}

async function PATCH_handler(request: Request, { params }: Ctx) {
  const { user, response } = await gate();
  if (!user) return response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });

  const read = await readJsonBody<TemplateInput>(request, 32 * 1024);
  if (!read.ok) return read.response;
  const body = read.body;
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });

  const result = await updateTemplate(user.id, id, body);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error, message: result.message }, { status: templateErrorStatus(result.error) });
  return NextResponse.json({ ok: true, template: result.template }, { headers: PRIVATE_JSON_HEADERS });
}

async function DELETE_handler(_request: Request, { params }: Ctx) {
  const { user, response } = await gate();
  if (!user) return response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  const result = await deleteTemplate(user.id, id);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error, message: result.message }, { status: templateErrorStatus(result.error) });
  return NextResponse.json({ ok: true }, { headers: PRIVATE_JSON_HEADERS });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PATCH = apiRoute({ route: "api/intake/templates/[id]/route.ts", method: "PATCH" }, PATCH_handler);
export const DELETE = apiRoute({ route: "api/intake/templates/[id]/route.ts", method: "DELETE" }, DELETE_handler);
