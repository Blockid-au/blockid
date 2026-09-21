// G21 P3-B — the institutional admin routes: audit-export.csv (401 / 403
// individual · not_owner · export off / 400 window / 200 streamed CSV with
// the header + guarded cells + the export audit row) and settings
// (GET defaults, PATCH validation, 503 before 0428, apiRoute-wrapped).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
const userMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => userMock() }));
const adminMock = vi.fn();
const settingsMock = vi.fn();
const writeMock = vi.fn();
vi.mock("@/lib/org/admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/org/admin")>()),
  resolveOrgAdmin: (...a: unknown[]) => adminMock(...(a as [])),
  readOrgSettings: (...a: unknown[]) => settingsMock(...(a as [])),
  writeOrgSettings: (...a: unknown[]) => writeMock(...(a as [])),
}));
const pageMock = vi.fn();
const auditMock = vi.fn(async () => ({ id: 1n, curr_hash: "h" }));
vi.mock("@/lib/audit", () => ({ appendAudit: (...a: unknown[]) => auditMock(...(a as [])) }));
vi.mock("@/lib/org/audit-export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/org/audit-export")>();
  return {
    ...actual,
    streamOrgAuditCsv: (seats: string[], window: unknown, opts: Record<string, unknown>) => actual.streamOrgAuditCsv(seats, window as never, { ...opts, page: (...a: unknown[]) => pageMock(...(a as [])) }),
  };
});
vi.mock("@/lib/audit/api-route", () => ({ apiRoute: (_meta: unknown, handler: (r: Request) => Promise<Response>) => handler }));

import { GET as exportCsv } from "./audit-export.csv/route";
import { GET as getSettings, PATCH as patchSettings } from "./settings/route";

const USER = { id: "owner-1", email: "owner@x.au", plan: "investor_vc_small" };
const OK_ADMIN = { status: "ok", org: { id: "org-1", name: "Acme Ventures", owner_user_id: "owner-1", is_personal: true }, seats: ["owner-1", "seat-2"], isOwner: true };

beforeEach(() => {
  userMock.mockReset().mockResolvedValue(USER);
  adminMock.mockReset().mockResolvedValue(OK_ADMIN);
  settingsMock.mockReset().mockResolvedValue({ orgId: "org-1", retentionDays: null, auditExportEnabled: true, updatedAt: null, available: true });
  writeMock.mockReset().mockResolvedValue({ ok: true, settings: { orgId: "org-1", retentionDays: 90, auditExportEnabled: true, updatedAt: "2026-09-21T00:00:00.000Z", available: true } });
  pageMock.mockReset().mockResolvedValue([]);
  auditMock.mockClear();
});

describe("GET /api/org/audit-export.csv", () => {
  it("401 anonymous · 403 individual / not_owner / export switched off · 400 bad window", async () => {
    userMock.mockResolvedValueOnce(null);
    expect((await exportCsv(new Request("http://localhost/api/org/audit-export.csv"))).status).toBe(401);
    adminMock.mockResolvedValueOnce({ ...OK_ADMIN, status: "individual" });
    const solo = await exportCsv(new Request("http://localhost/api/org/audit-export.csv"));
    expect(solo.status).toBe(403);
    expect((await solo.json()).message).toMatch(/organisation feature/);
    adminMock.mockResolvedValueOnce({ ...OK_ADMIN, status: "not_owner", isOwner: false });
    expect((await exportCsv(new Request("http://localhost/api/org/audit-export.csv"))).status).toBe(403);
    settingsMock.mockResolvedValueOnce({ orgId: "org-1", retentionDays: null, auditExportEnabled: false, updatedAt: null, available: true });
    const off = await exportCsv(new Request("http://localhost/api/org/audit-export.csv"));
    expect(off.status).toBe(403);
    expect((await off.json()).error).toBe("export_disabled");
    expect((await exportCsv(new Request("http://localhost/api/org/audit-export.csv?from=2026-09-01&to=2026-01-01"))).status).toBe(400);
    expect(pageMock).not.toHaveBeenCalled();
  });

  it("200 streams the CSV for the org's seats inside the window, guards formula cells and records org.audit.exported", async () => {
    pageMock.mockResolvedValueOnce([{ id: 9, ts: "2026-09-12T00:00:00.000Z", user_id: "seat-2", actor: "user", action: "=cmd()", resource_type: "batch", resource_id: "b1", detail: { method: "POST", route: "/api/x", status: 201 } }]);
    const res = await exportCsv(new Request("http://localhost/api/org/audit-export.csv?from=2026-09-01&to=2026-09-20"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain('filename="org-audit-2026-09-20.csv"');
    const text = await res.text();
    const lines = text.trimEnd().split("\r\n");
    expect(lines[0]).toMatch(/^id,ts,actor_user_id/);
    expect(lines[1]).toContain("'=cmd()");
    expect(pageMock.mock.calls[0]![0]).toMatchObject({ seats: ["owner-1", "seat-2"], window: { from: "2026-09-01T00:00:00.000Z", to: "2026-09-20T00:00:00.000Z" } });
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: "org.audit.exported", resource_id: "org-1", detail: expect.objectContaining({ rows: 1, seats: 2 }) }));
  });
});

describe("/api/org/settings", () => {
  it("GET → the org + defaults; 403 for a solo evaluator", async () => {
    const res = await getSettings();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, org: { id: "org-1", name: "Acme Ventures", seats: 2 }, available: true, settings: { retention_days: null, audit_export_enabled: true } });
    adminMock.mockResolvedValueOnce({ ...OK_ADMIN, status: "individual" });
    expect((await getSettings()).status).toBe(403);
  });

  it("PATCH validates (400), writes through writeOrgSettings with the actor, 503 when unavailable", async () => {
    const bad = await patchSettings(new Request("http://localhost/api/org/settings", { method: "PATCH", body: JSON.stringify({ retention_days: 5 }) }));
    expect(bad.status).toBe(400);
    expect(writeMock).not.toHaveBeenCalled();
    const unknown = await patchSettings(new Request("http://localhost/api/org/settings", { method: "PATCH", body: JSON.stringify({ nope: 1 }) }));
    expect(unknown.status).toBe(400);

    const ok = await patchSettings(new Request("http://localhost/api/org/settings", { method: "PATCH", body: JSON.stringify({ retention_days: 90, audit_export_enabled: true }) }));
    expect(ok.status).toBe(200);
    expect(writeMock).toHaveBeenCalledWith("org-1", { retentionDays: 90, auditExportEnabled: true }, { id: "owner-1" });
    expect(await ok.json()).toMatchObject({ ok: true, settings: { retention_days: 90 } });

    const keep = await patchSettings(new Request("http://localhost/api/org/settings", { method: "PATCH", body: JSON.stringify({ retention_days: null }) }));
    expect(keep.status).toBe(200);
    expect(writeMock).toHaveBeenLastCalledWith("org-1", { retentionDays: null }, { id: "owner-1" });

    writeMock.mockResolvedValueOnce({ ok: false, error: "unavailable", message: "not yet" });
    expect((await patchSettings(new Request("http://localhost/api/org/settings", { method: "PATCH", body: JSON.stringify({ retention_days: 90 }) }))).status).toBe(503);
    userMock.mockResolvedValueOnce(null);
    expect((await patchSettings(new Request("http://localhost/api/org/settings", { method: "PATCH", body: "{}" }))).status).toBe(401);
  });
});
