// Route tests for PATCH | GET /api/accelerator/onboarding/metrics (G25).
// Pins: 401 anonymous; 404 without an organisation; 403 for an invited seat
// on PATCH (GET still reads); 400 bad JSON / unknown key / out-of-range;
// PATCH merges only the sent keys onto org_settings.onboarding_metrics,
// null clears, an audit row is appended with the changed keys (never the
// notes); 503 before migration 0438; GET reads the typed metrics back.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
const appendAuditMock = vi.fn();
vi.mock("@/lib/audit", () => ({ appendAudit: (p: unknown) => appendAuditMock(p) }));
const resolveOrgAdminMock = vi.fn();
vi.mock("@/lib/org/admin", () => ({ resolveOrgAdmin: (u: unknown) => resolveOrgAdminMock(u) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
vi.mock("server-only", () => ({}));

interface SettingsRow { org_id: string; onboarding_metrics: Record<string, unknown> }
let rows: SettingsRow[] = [];
let missingColumn = false;
const upsertMock = vi.fn();

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({
    from(table: string) {
      expect(table).toBe("org_settings");
      const filters: Array<[string, unknown]> = [];
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (k: string, v: unknown) => {
        filters.push([k, v]);
        return chain;
      };
      chain.maybeSingle = async () => {
        if (missingColumn) return { data: null, error: { code: "42703", message: "column org_settings.onboarding_metrics does not exist" } };
        const row = rows.find((r) => filters.every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v)) ?? null;
        return { data: row, error: null };
      };
      chain.upsert = async (patch: SettingsRow) => {
        upsertMock(patch);
        const existing = rows.find((r) => r.org_id === patch.org_id);
        if (existing) Object.assign(existing, patch);
        else rows.push({ ...patch });
        return { error: null };
      };
      return chain;
    },
  }),
}));

import { GET, PATCH } from "./route";

const ORG = { id: "22222222-2222-4222-8222-222222222222", slug: "accel", name: "Accel", kind: "accelerator", owner_user_id: "u-1", is_personal: false };
const USER = { id: "u-1", email: "prog@accel.au", plan: "accelerator_starter" };
const owner = { status: "ok", org: ORG, seats: ["u-1"], isOwner: true };
const seat = { status: "not_owner", org: ORG, seats: ["u-1", "u-2"], isOwner: false };
const req = (body: unknown) => new Request("http://localhost/api/accelerator/onboarding/metrics", { method: "PATCH", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  appendAuditMock.mockReset().mockResolvedValue({ id: 1n, curr_hash: "h" });
  resolveOrgAdminMock.mockReset().mockResolvedValue(owner);
  upsertMock.mockReset();
  missingColumn = false;
  rows = [{ org_id: ORG.id, onboarding_metrics: { review_minutes_before: 60, satisfaction: 4, updated_at: "2026-09-20T00:00:00.000Z" } }];
});

describe("auth ladder", () => {
  it("401 anonymous on both methods", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await PATCH(req({ satisfaction: 5 }))).status).toBe(401);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("404 without an organisation; 403 for an invited seat on PATCH while GET still reads", async () => {
    resolveOrgAdminMock.mockResolvedValue({ status: "no_org", org: null, seats: [], isOwner: false });
    expect((await GET()).status).toBe(404);
    expect((await PATCH(req({ satisfaction: 5 }))).status).toBe(404);
    resolveOrgAdminMock.mockResolvedValue(seat);
    const get = await GET();
    expect(get.status).toBe(200);
    expect(await get.json()).toMatchObject({ ok: true, can_edit: false, metrics: { review_minutes_before: 60, satisfaction: 4 } });
    const patch = await PATCH(req({ satisfaction: 5 }));
    expect(patch.status).toBe(403);
    expect(await patch.json()).toMatchObject({ error: "not_org_owner" });
    expect(upsertMock).not.toHaveBeenCalled();
  });
});

describe("PATCH", () => {
  it("400 on bad JSON, an unknown key and an out-of-range value — nothing written", async () => {
    expect((await PATCH(req("nope"))).status).toBe(400);
    expect((await PATCH(req({ nps: 9 }))).status).toBe(400);
    const range = await PATCH(req({ satisfaction: 9 }));
    expect(range.status).toBe(400);
    expect(await range.json()).toMatchObject({ error: "bad_body", issues: [{ path: "satisfaction" }] });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("merges only the sent keys, null clears, stamps updated_at inside the jsonb and audits the changed keys (never the notes)", async () => {
    const res = await PATCH(req({ review_minutes_after: 18, satisfaction: null, case_study_consent: true, notes: "sponsor asked for the radar" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, org_id: ORG.id, metrics: { review_minutes_before: 60, review_minutes_after: 18, case_study_consent: true, notes: "sponsor asked for the radar" } });
    expect(body.metrics.satisfaction).toBeUndefined();
    expect(typeof body.updated_at).toBe("string");
    const written = upsertMock.mock.calls[0]![0] as SettingsRow;
    expect(written.org_id).toBe(ORG.id);
    expect(written.onboarding_metrics.satisfaction).toBeUndefined();
    expect(written.onboarding_metrics.review_minutes_before).toBe(60);
    const audit = appendAuditMock.mock.calls[0]![0] as { action: string; resource_type: string; resource_id: string; detail: { keys: string[]; case_study_consent?: boolean } };
    expect(audit).toMatchObject({ action: "accelerator.onboarding_metrics_updated", resource_type: "investor_organisation", resource_id: ORG.id });
    expect(audit.detail.keys).toEqual(["review_minutes_after", "satisfaction", "case_study_consent"]);
    expect(audit.detail.case_study_consent).toBe(true);
    expect(JSON.stringify(audit)).not.toContain("sponsor asked");
  });

  it("503 unavailable before migration 0438 (42703) — nothing written", async () => {
    missingColumn = true;
    const res = await PATCH(req({ satisfaction: 5 }));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "unavailable" });
    expect(upsertMock).not.toHaveBeenCalled();
    const get = await GET();
    expect(await get.json()).toMatchObject({ ok: true, available: false, metrics: {} });
  });
});
