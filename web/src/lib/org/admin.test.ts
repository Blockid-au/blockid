// G21 P3-B — institutional admin standing (pure rules + the resolver over
// mocked org helpers) and org_settings validation / write with the actor on
// the audit row, never on the table.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const orgMock = vi.fn();
const seatsMock = vi.fn();
vi.mock("@/lib/investor/organisations", () => ({ resolveActingOrg: (id: string) => orgMock(id), listSeatUserIds: (id: string) => seatsMock(id) }));
const canMock = vi.fn(async () => false);
vi.mock("@/lib/entitlements", () => ({ can: (...a: unknown[]) => canMock(...(a as [])) }));
const auditMock = vi.fn(async () => ({ id: 1n, curr_hash: "h" }));
vi.mock("@/lib/audit", () => ({ appendAudit: (...a: unknown[]) => auditMock(...(a as [])) }));
const db = vi.hoisted(() => ({ settings: null as Record<string, unknown> | null, memberRole: null as string | null, missing: false, upserts: [] as Array<Record<string, unknown>> }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "investor_organisation_members") {
        const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: db.memberRole ? { role: db.memberRole } : null, error: null }) };
        return q;
      }
      if (table === "org_settings") {
        const err = db.missing ? { code: "42P01", message: "relation org_settings does not exist" } : null;
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({ data: err ? null : db.settings, error: err }),
          upsert: (row: Record<string, unknown>) => {
            db.upserts.push(row);
            db.settings = { ...(db.settings ?? {}), ...row, updated_at: "2026-09-21T00:00:00.000Z" };
            return { select: () => ({ maybeSingle: async () => ({ data: db.settings, error: null }) }) };
          },
        };
        return q;
      }
      throw new Error(`unexpected ${table}`);
    },
  }),
}));

import { isInstitutionalOrg, isOrgOwner, readOrgSettings, resolveOrgAdmin, validateSettingsPatch, writeOrgSettings } from "./admin";

const ORG = { id: "org-1", slug: "acme", name: "Acme Ventures", kind: "vc" as const, owner_user_id: "owner-1", is_personal: true };

beforeEach(() => {
  orgMock.mockReset().mockResolvedValue(ORG);
  seatsMock.mockReset().mockResolvedValue(["owner-1", "seat-2"]);
  canMock.mockReset().mockResolvedValue(false);
  auditMock.mockClear();
  db.settings = null;
  db.memberRole = null;
  db.missing = false;
  db.upserts = [];
});

describe("pure rules", () => {
  it("owner = owner_user_id or an explicit owner / institutional_admin seat", () => {
    expect(isOrgOwner(ORG, "owner-1", null)).toBe(true);
    expect(isOrgOwner(ORG, "seat-2", null)).toBe(false);
    expect(isOrgOwner(ORG, "seat-2", "owner")).toBe(true);
    expect(isOrgOwner(ORG, "seat-2", "institutional_admin")).toBe(true);
    expect(isOrgOwner(ORG, "seat-2", "investor_analyst")).toBe(false);
  });
  it("an organisation = non-personal, or ≥ 2 seats, or an owner with api.access", () => {
    expect(isInstitutionalOrg({ is_personal: true }, 1, false)).toBe(false);
    expect(isInstitutionalOrg({ is_personal: true }, 2, false)).toBe(true);
    expect(isInstitutionalOrg({ is_personal: true }, 1, true)).toBe(true);
    expect(isInstitutionalOrg({ is_personal: false }, 1, false)).toBe(true);
  });
  it("validateSettingsPatch: 30–3650 or null; booleans only; nothing → refused", () => {
    expect(validateSettingsPatch({ retentionDays: 90 })).toEqual({ ok: true, patch: { retentionDays: 90 } });
    expect(validateSettingsPatch({ retentionDays: null })).toEqual({ ok: true, patch: { retentionDays: null } });
    expect(validateSettingsPatch({ retentionDays: 29 }).ok).toBe(false);
    expect(validateSettingsPatch({ retentionDays: 3651 }).ok).toBe(false);
    expect(validateSettingsPatch({ retentionDays: 90.5 }).ok).toBe(false);
    expect(validateSettingsPatch({ auditExportEnabled: "yes" as unknown as boolean }).ok).toBe(false);
    expect(validateSettingsPatch({}).ok).toBe(false);
  });
});

describe("resolveOrgAdmin", () => {
  it("owner of a team → ok with every seat (owner included once)", async () => {
    const r = await resolveOrgAdmin({ id: "owner-1", plan: "investor_angel" });
    expect(r).toMatchObject({ status: "ok", isOwner: true, seats: ["owner-1", "seat-2"] });
  });
  it("solo personal org on a plan without api.access → individual; with api.access → ok", async () => {
    seatsMock.mockResolvedValue(["owner-1"]);
    expect((await resolveOrgAdmin({ id: "owner-1", plan: "investor_angel" })).status).toBe("individual");
    canMock.mockResolvedValue(true);
    expect((await resolveOrgAdmin({ id: "owner-1", plan: "investor_vc_small" })).status).toBe("ok");
  });
  it("an invited seat → not_owner; no org → no_org", async () => {
    expect((await resolveOrgAdmin({ id: "seat-2", plan: null })).status).toBe("not_owner");
    orgMock.mockResolvedValue(null);
    expect((await resolveOrgAdmin({ id: "x", plan: null })).status).toBe("no_org");
  });
});

describe("org_settings", () => {
  it("reads defaults before a row exists and reports available:false before 0428", async () => {
    expect(await readOrgSettings("org-1")).toEqual({ orgId: "org-1", retentionDays: null, auditExportEnabled: true, updatedAt: null, available: true });
    db.missing = true;
    expect((await readOrgSettings("org-1")).available).toBe(false);
  });
  it("write upserts without any actor column and puts the actor + before/after on the audit row", async () => {
    const r = await writeOrgSettings("org-1", { retentionDays: 180 }, { id: "owner-1" });
    expect(r).toMatchObject({ ok: true, settings: { retentionDays: 180, auditExportEnabled: true } });
    expect(db.upserts).toEqual([{ org_id: "org-1", retention_days: 180 }]);
    expect(Object.keys(db.upserts[0]!)).not.toContain("updated_by");
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ user_id: "owner-1", action: "org.settings.updated", resource_id: "org-1", detail: { before: { retention_days: null, audit_export_enabled: true }, after: { retention_days: 180, audit_export_enabled: true } } }));
  });
  it("refuses an invalid patch (400 material) and a missing table (unavailable)", async () => {
    expect(await writeOrgSettings("org-1", { retentionDays: 5 }, { id: "owner-1" })).toMatchObject({ ok: false, error: "invalid" });
    db.missing = true;
    expect(await writeOrgSettings("org-1", { retentionDays: 90 }, { id: "owner-1" })).toMatchObject({ ok: false, error: "unavailable" });
    expect(auditMock).not.toHaveBeenCalled();
  });
});
