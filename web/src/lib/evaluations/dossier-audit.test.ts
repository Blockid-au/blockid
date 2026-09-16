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
