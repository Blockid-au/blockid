// GET | PATCH /api/org/settings — the organisation's institutional settings
// (G21 P3-B; migration 0428 `org_settings`).
//
//   GET    → 200 { ok, org: { id, name }, settings: { retention_days,
//            audit_export_enabled, updated_at }, available }
//   PATCH  { retention_days: 30–3650 | null, audit_export_enabled?: bool }
//          → 200 { ok, settings } · 400 invalid · 503 before 0428
//
//   401 anonymous · 403 not the org owner / a solo evaluator (the page
//   shows the "for organisations" card). The actor lands on the audit row
//   (`org.settings.updated`, before → after) — never on the table.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { apiRoute } from "@/lib/audit/api-route";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { RETENTION_MAX_DAYS, RETENTION_MIN_DAYS, readOrgSettings, resolveOrgAdmin, writeOrgSettings, type OrgAdmin } from "@/lib/org/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_JSON_HEADERS });

export const settingsPatchSchema = z
  .object({
    retention_days: z.number().int().min(RETENTION_MIN_DAYS).max(RETENTION_MAX_DAYS).nullable().optional(),
    audit_export_enabled: z.boolean().optional(),
  })
  .strict();

function denyAdmin(admin: OrgAdmin): NextResponse {
  const message =
    admin.status === "not_owner"
      ? "Only the organisation owner can change these settings."
      : "Retention and audit export are organisation features — available to the owner of a Program / Fund organisation or a team with seats.";
  return json({ ok: false, error: "forbidden", message, status: admin.status }, 403);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "auth_required" }, 401);
  const admin = await resolveOrgAdmin({ id: user.id, plan: user.plan ?? null });
  if (admin.status !== "ok" || !admin.org) return denyAdmin(admin);
  const settings = await readOrgSettings(admin.org.id);
  return json({
    ok: true,
    org: { id: admin.org.id, name: admin.org.name, seats: admin.seats.length },
    available: settings.available,
    settings: { retention_days: settings.retentionDays, audit_export_enabled: settings.auditExportEnabled, updated_at: settings.updatedAt },
  });
}

async function patchHandler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "auth_required" }, 401);
  const admin = await resolveOrgAdmin({ id: user.id, plan: user.plan ?? null });
  if (admin.status !== "ok" || !admin.org) return denyAdmin(admin);

  const body = await readJsonBody(request, 4 * 1024);
  if (!body.ok) return body.response;
  const parsed = settingsPatchSchema.safeParse(body.body);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_body", message: `retention_days must be null (keep) or ${RETENTION_MIN_DAYS}–${RETENTION_MAX_DAYS}; audit_export_enabled true / false.`, issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  }
  const patch: Parameters<typeof writeOrgSettings>[1] = {};
  if ("retention_days" in parsed.data) patch.retentionDays = parsed.data.retention_days ?? null;
  if ("audit_export_enabled" in parsed.data) patch.auditExportEnabled = parsed.data.audit_export_enabled;
  const result = await writeOrgSettings(admin.org.id, patch, { id: user.id });
  if (!result.ok) {
    const status = result.error === "invalid" ? 400 : result.error === "unavailable" ? 503 : 500;
    return json({ ok: false, error: result.error, message: result.message }, status);
  }
  return json({ ok: true, settings: { retention_days: result.settings.retentionDays, audit_export_enabled: result.settings.auditExportEnabled, updated_at: result.settings.updatedAt } });
}

export const PATCH = apiRoute({ route: "api/org/settings/route.ts", method: "PATCH" }, patchHandler);
