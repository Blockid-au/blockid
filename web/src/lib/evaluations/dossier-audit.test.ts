// G14-S33 — auditDossierView: one audit row (§C.2) AND one server-side
// `dossier_view` analytics event per view, both fire-and-forget; neither
// sink can throw into the caller.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendAudit: vi.fn<(p: Record<string, unknown>) => Promise<unknown>>(),
  emitEventSafe: vi.fn<(i: Record<string, unknown>) => void>(),
}));
vi.mock("@/lib/audit", () => ({ appendAudit: (p: Record<string, unknown>) => mocks.appendAudit(p) }));
vi.mock("@/lib/analytics/server", () => ({ emitEventSafe: (i: Record<string, unknown>) => mocks.emitEventSafe(i) }));

import { auditDossierView } from "./dossier-audit";

const VIEW = { userId: "u-eval", evaluationId: "ev-1", projectId: "p-1", role: "assessor" as const, consentTier: "reports_shared", surface: "page" as const };

beforeEach(() => {
  mocks.appendAudit.mockReset().mockResolvedValue(undefined);
  mocks.emitEventSafe.mockReset();
});

describe("auditDossierView", () => {
  it("writes the dossier.viewed audit row and emits dossier_view with ids + role + surface (never note bodies)", () => {
    expect(auditDossierView(VIEW)).toBeUndefined();
    expect(mocks.appendAudit).toHaveBeenCalledTimes(1);
    expect(mocks.appendAudit.mock.calls[0][0]).toMatchObject({ action: "dossier.viewed", resource_type: "evaluation", resource_id: "ev-1", user_id: "u-eval" });
    expect(mocks.emitEventSafe).toHaveBeenCalledTimes(1);
    expect(mocks.emitEventSafe.mock.calls[0][0]).toEqual({
      name: "dossier_view",
      params: { evaluation_id: "ev-1", consent_tier: "reports_shared", role: "assessor", surface: "page", user_id: "u-eval" },
      userId: "u-eval",
      source: "server",
      consentGranted: true,
    });
  });

  it("the API surface and the founder role are carried verbatim", () => {
    auditDossierView({ ...VIEW, role: "founder", surface: "api" });
    expect(mocks.emitEventSafe.mock.calls[0][0]).toMatchObject({ params: { role: "founder", surface: "api" } });
  });

  it("a rejected audit write is swallowed (fire-and-forget) — the analytics emit still happens", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mocks.appendAudit.mockRejectedValue(new Error("no AUDIT_HMAC_SECRET"));
    expect(() => auditDossierView(VIEW)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.emitEventSafe).toHaveBeenCalledTimes(1);
  });
});

// ─── S-D3 block 6 audit trail ────────────────────────────────────────────────

const trail = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, error: null as null | { code: string }, configured: true, calls: [] as Array<{ method: string; args: unknown[] }> }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => {
    if (!trail.configured) return null;
    const b: Record<string, unknown> = {};
    const rec = (method: string) => (...args: unknown[]) => { trail.calls.push({ method, args }); return b; };
    Object.assign(b, {
      select: rec("select"), eq: rec("eq"), in: rec("in"), or: rec("or"), order: rec("order"), limit: rec("limit"),
      maybeSingle: () => Promise.resolve({ data: trail.rows[0] ?? null, error: trail.error }),
      then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => Promise.resolve({ data: trail.error ? null : trail.rows, error: trail.error }).then(ok, err),
    });
    return { from: () => b };
  },
}));

import { DOSSIER_TRAIL_ACTIONS, readAuditTrail, summariseAuditDetail } from "./dossier-audit";

describe("summariseAuditDetail", () => {
  it("prints ids / enums / counts only — never note bodies or unknown keys", () => {
    expect(summariseAuditDetail(null)).toBe("");
    expect(summariseAuditDetail({ version: 2, decision: "proceed", conviction: 4, fields: ["risks", "shared_notes"], private_notes: "SECRET", shared_notes: "also secret", changed: ["x"] })).toBe("version 2 · decision proceed · conviction 4 · fields risks, shared_notes");
    expect(summariseAuditDetail({ kind: "memo", pages: 3, tier: "full_mentor", channel: "crm", ticker: "ACME-AU", status: "draft", fields: [] })).toBe("kind memo · pages 3 · tier full_mentor · channel crm · ticker ACME-AU · status draft");
  });
});

describe("readAuditTrail", () => {
  beforeEach(() => {
    trail.rows = [];
    trail.error = null;
    trail.configured = true;
    trail.calls = [];
  });

  it("reads the viewer's rows on this evaluation (resource_id OR detail.evaluation_id), newest first, restricted to the block-6 action list", async () => {
    trail.rows = [
      { id: 9, action: "assessment.submitted", ts: "2026-09-16T02:00:00Z", resource_type: "evaluation_assessment", resource_id: "a-1", detail: { evaluation_id: "e-1", version: 2, decision: "track", private_notes: "SECRET" } },
      { id: 8, action: "dossier.viewed", ts: "2026-09-16T01:00:00Z", resource_type: "evaluation", resource_id: "e-1", detail: { svi_total: 62 } },
    ];
    const out = await readAuditTrail("u-eval", "e-1");
    expect(out).toEqual([
      { id: "9", action: "assessment.submitted", ts: "2026-09-16T02:00:00Z", resourceType: "evaluation_assessment", summary: "version 2 · decision track" },
      { id: "8", action: "dossier.viewed", ts: "2026-09-16T01:00:00Z", resourceType: "evaluation", summary: "" },
    ]);
    expect(JSON.stringify(out)).not.toContain("SECRET");
    expect(trail.calls.find((c) => c.method === "eq")?.args).toEqual(["user_id", "u-eval"]);
    expect(trail.calls.find((c) => c.method === "in")?.args).toEqual(["action", [...DOSSIER_TRAIL_ACTIONS]]);
    expect(trail.calls.find((c) => c.method === "or")?.args[0]).toBe('resource_id.eq.e-1,detail.cs.{"evaluation_id":"e-1"}');
    expect(trail.calls.find((c) => c.method === "limit")?.args).toEqual([25]);
    expect(DOSSIER_TRAIL_ACTIONS).toContain("ic_report.exported");
    expect(DOSSIER_TRAIL_ACTIONS).toContain("assessment.bulk_set");
  });

  it("empty on a missing client / table error / blank ids", async () => {
    trail.error = { code: "42P01" };
    expect(await readAuditTrail("u", "e")).toEqual([]);
    trail.error = null;
    trail.configured = false;
    expect(await readAuditTrail("u", "e")).toEqual([]);
    trail.configured = true;
    expect(await readAuditTrail("", "e")).toEqual([]);
  });
});
