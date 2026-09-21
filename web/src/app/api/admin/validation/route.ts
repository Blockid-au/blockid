// /api/admin/validation — G22-D validation tracker (admin only).
//
//   GET                       → { ok, ...ValidationDashboard } (ledger, ladder,
//                               objections, auto rows, North Star, window, warnings)
//   POST   { entry fields }   → 201 { ok, entry }
//   PATCH  { id, ...fields }  → 200 { ok, entry }; optional `If-Match: UPDATED_AT`
//                               (the row the client rendered) → 409 { error: "stale", entry }
//                               when the stored row moved on (G23-C; the client re-reads)
//   DELETE { id }             → 200 { ok, entry }
//   400 invalid (zod, strict) · 401 anon · 403 non-admin · 404 unknown id ·
//   409 ledger full / stale If-Match · 429 (60 writes / h per admin)
//
// The ledger is `content/reports/validation-tracker.json` on the live
// checkout (lib/validation/ledger.ts). Every mutation is audited twice: the
// apiRoute row (`validation.entry_created` / `_updated` / `_deleted` via
// auditAction, with the entry id + level as the note) and the response
// itself. Auto rows are read-only — there is no endpoint to write them.

import { NextResponse } from "next/server";
import { apiRoute, auditAction, auditNote } from "@/lib/audit/api-route";
import { asInstitutionalClient } from "@/lib/funnel/institutional";
import { gateAdmin } from "@/lib/pilots/admin-gate";
import { checkRateLimit } from "@/lib/rate-limit";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { getSupabaseAdmin } from "@/lib/supabase";
import { readValidationDashboard } from "@/lib/validation/auto";
import { createEntry, deleteEntry, patchEntry, resolveValidationRoot } from "@/lib/validation/ledger";
import { parseEntryInput, parseEntryPatch } from "@/lib/validation/model";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Writes per admin per hour. */
export const VALIDATION_WRITES_PER_HOUR = 60;
const BODY_MAX_BYTES = 16 * 1024;

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_JSON_HEADERS });

export async function GET() {
  const g = await gateAdmin();
  if (g.response) return g.response;
  const root = await resolveValidationRoot();
  const dashboard = await readValidationDashboard(asInstitutionalClient(getSupabaseAdmin()), root);
  return json({ ok: true, ...dashboard });
}

async function gateWrite(): Promise<{ response: NextResponse } | { response: null; root: string; userId: string }> {
  const g = await gateAdmin();
  if (g.response) return { response: g.response };
  const rl = checkRateLimit(`admin:validation:${g.user.id}`, VALIDATION_WRITES_PER_HOUR, 60 * 60 * 1000);
  if (!rl.allowed) {
    return { response: NextResponse.json({ ok: false, error: "rate_limited", message: "Too many tracker edits in the last hour — try again later." }, { status: 429, headers: { ...PRIVATE_JSON_HEADERS, "Retry-After": String(Math.ceil(rl.resetIn / 1000)) } }) };
  }
  return { response: null, root: await resolveValidationRoot(), userId: g.user.id };
}

/** G23-C: the `If-Match` header = the entry's `updated_at` the client rendered (ISO timestamp; anything else is ignored = unconditional). */
function readIfMatch(request: Request): string | undefined {
  const raw = request.headers.get("if-match")?.trim().replace(/^W\//, "").replace(/^"(.*)"$/, "$1");
  return raw && /^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/.test(raw) ? raw : undefined;
}

function idOf(body: unknown): string | null {
  const id = (body as { id?: unknown } | null)?.id;
  return typeof id === "string" && /^[0-9a-f-]{8,64}$/i.test(id) ? id : null;
}

async function POST_handler(request: Request) {
  const g = await gateWrite();
  if (g.response) return g.response;
  const parsed = await readJsonBody<unknown>(request, BODY_MAX_BYTES);
  if (!parsed.ok) return parsed.response;
  const input = parseEntryInput(parsed.body);
  if (!input.ok) return json({ ok: false, error: "invalid_input", message: input.message, issues: input.issues }, 400);
  const r = await createEntry(g.root, input.value);
  if (!r.ok) return json({ ok: false, error: r.error, message: r.message }, 409);
  auditAction("validation.entry_created");
  auditNote(r.value.id, { level: r.value.level, outcome: r.value.outcome });
  return json({ ok: true, entry: r.value }, 201);
}

async function PATCH_handler(request: Request) {
  const g = await gateWrite();
  if (g.response) return g.response;
  const parsed = await readJsonBody<unknown>(request, BODY_MAX_BYTES);
  if (!parsed.ok) return parsed.response;
  const id = idOf(parsed.body);
  if (!id) return json({ ok: false, error: "invalid_input", field: "id", message: "id: entry id required" }, 400);
  const { id: _id, ...rest } = parsed.body as Record<string, unknown>;
  void _id;
  const patch = parseEntryPatch(rest);
  if (!patch.ok) return json({ ok: false, error: "invalid_input", message: patch.message, issues: patch.issues }, 400);
  const ifMatch = readIfMatch(request);
  const r = await patchEntry(g.root, id, patch.value, new Date(), ifMatch);
  if (!r.ok) {
    if (r.error === "stale") return json({ ok: false, error: "stale", message: r.message, entry: r.current }, 409);
    return json({ ok: false, error: r.error, message: r.message }, 404);
  }
  auditAction("validation.entry_updated");
  auditNote(r.value.id, { level: r.value.level, outcome: r.value.outcome, fields: Object.keys(patch.value) });
  return json({ ok: true, entry: r.value });
}

async function DELETE_handler(request: Request) {
  const g = await gateWrite();
  if (g.response) return g.response;
  const parsed = await readJsonBody<unknown>(request, BODY_MAX_BYTES);
  if (!parsed.ok) return parsed.response;
  const id = idOf(parsed.body);
  if (!id) return json({ ok: false, error: "invalid_input", field: "id", message: "id: entry id required" }, 400);
  const r = await deleteEntry(g.root, id);
  if (!r.ok) return json({ ok: false, error: r.error, message: r.message }, 404);
  auditAction("validation.entry_deleted");
  auditNote(r.value.id, { level: r.value.level, outcome: r.value.outcome });
  return json({ ok: true, entry: r.value });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/admin/validation/route.ts", method: "POST" }, POST_handler);
export const PATCH = apiRoute({ route: "api/admin/validation/route.ts", method: "PATCH" }, PATCH_handler);
export const DELETE = apiRoute({ route: "api/admin/validation/route.ts", method: "DELETE" }, DELETE_handler);
