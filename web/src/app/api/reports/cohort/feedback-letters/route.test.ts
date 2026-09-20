// Route tests for POST /api/reports/cohort/feedback-letters (G21 P2-C).
// Pins: 401 / 403 / 400 bad body / 404 no role; PREVIEW (no confirm) lists
// only the NON-SELECTED applicants and never calls send; CONFIRM sends
// through the batch module for the eligible projects (narrowed by
// project_ids); a viewer may preview but not confirm (403).

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
const getEntitlementsMock = vi.fn();
vi.mock("@/lib/entitlements", () => ({ getEntitlements: (p: string, id: string) => getEntitlementsMock(p, id), recordGateHit: async () => undefined }));
const loadBundleMock = vi.fn();
vi.mock("@/lib/evaluations/program-journey-data", async () => {
  const actual = await vi.importActual<typeof import("@/lib/evaluations/program-journey-data")>("@/lib/evaluations/program-journey-data");
  return { ...actual, loadCohortBundle: (u: string, b: string) => loadBundleMock(u, b) };
});
const previewMock = vi.fn();
const sendMock = vi.fn();
vi.mock("@/lib/evaluations/feedback-letter-batch", () => ({
  defaultFeedbackBatchDeps: async () => ({ fake: true }),
  previewFeedbackLetters: (c: unknown, d: unknown) => previewMock(c, d),
  sendFeedbackLetters: (c: unknown, d: unknown) => sendMock(c, d),
}));

import { POST } from "./route";
import { emptyEvidenceSummary, type JourneyStartup } from "@/lib/evaluations/program-journey";

const BATCH_ID = "11111111-1111-4111-8111-111111111111";
const P1 = "22222222-2222-4222-8222-222222222222";
const P2 = "33333333-3333-4333-8333-333333333333";
const USER = { id: "u-1", email: "prog@accel.au", plan: "investor_vc_small", displayName: "Plus Eight" };

function startup(over: Partial<JourneyStartup>): JourneyStartup {
  return { itemId: 1, evaluationId: "e-1", projectId: P1, projectSlug: "acme", name: "Acme", status: "done", svi: 70, confidence: 55, verification: 2, stage: 3, delta: null, topStrength: null, topGap: null, dimensionScores: null, decision: null, assessmentStatus: null, shortlisted: false, evidence: emptyEvidenceSummary(), scoreHistory: [], reportUrl: null, dossierUrl: "/workspace/evaluations/e-1", profileUrl: null, dossierProduced: false, feedbackLetterSent: false, ...over };
}

function bundle(role: "owner" | "reviewer" | "viewer") {
  return {
    batch: { id: BATCH_ID, userId: "u-1", name: "Cohort 4", rubricWeights: { ftv: 12.5, mpc: 12.5, ptd: 12.5, tre: 12.5, cgh: 12.5, iri: 12.5, lco: 12.5, svm: 12.5 }, status: "done", total: 3, doneCount: 3, failedCount: 0, createdAt: "2026-09-10T00:00:00Z", startedAt: null, finishedAt: null },
    role,
    rows: [],
    startups: [
      startup({ decision: "proceed", assessmentStatus: "submitted" }),
      startup({ itemId: 2, evaluationId: "e-2", projectId: P2, name: "Beta", decision: "pass", assessmentStatus: "submitted" }),
      startup({ itemId: 3, evaluationId: "e-3", projectId: "44444444-4444-4444-8444-444444444444", name: "Gamma", decision: "pass", assessmentStatus: "draft" }),
    ],
    snapshots: [],
    overridesCount: 0,
  };
}

function req(body: unknown): Request {
  return new Request("http://localhost/api/reports/cohort/feedback-letters", { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  getEntitlementsMock.mockReset().mockResolvedValue(["lp_report"]);
  loadBundleMock.mockReset().mockResolvedValue(bundle("owner"));
  previewMock.mockReset().mockResolvedValue([{ projectId: P2, evaluationId: "e-2", name: "Beta", reason: "eligible", k: 3, orgCount: 2, weakestDim: "TRE", subject: "s", excerpt: "x", founderEmail: "b@x.io" }]);
  sendMock.mockReset().mockResolvedValue([{ projectId: P2, name: "Beta", outcome: "sent", letterId: "L-1" }]);
});

describe("POST /api/reports/cohort/feedback-letters", () => {
  it("401 / 403 / 400 / 404", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    expect((await POST(req({ batch: BATCH_ID }))).status).toBe(401);
    getEntitlementsMock.mockResolvedValueOnce(["investor.dealflow"]);
    expect((await POST(req({ batch: BATCH_ID }))).status).toBe(403);
    expect((await POST(req("{not json"))).status).toBe(400);
    expect((await POST(req({ batch: "nope" }))).status).toBe(400);
    expect((await POST(req({ batch: BATCH_ID, extra: 1 }))).status).toBe(400);
    loadBundleMock.mockResolvedValueOnce(null);
    expect((await POST(req({ batch: BATCH_ID }))).status).toBe(404);
    expect(previewMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("preview: only the non-selected applicants (submitted pass, not shortlisted) — nothing sent", async () => {
    const res = await POST(req({ batch: BATCH_ID }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, mode: "preview", candidates: 1, eligible: 1 });
    expect(previewMock.mock.calls[0][0]).toEqual([{ projectId: P2, evaluationId: "e-2", name: "Beta" }]);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("confirm: sends for the eligible projects, narrowed by project_ids", async () => {
    const res = await POST(req({ batch: BATCH_ID, confirm: true, project_ids: [P2, P1] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, mode: "sent", candidates: 1, sent: 1 });
    expect(sendMock.mock.calls[0][0]).toEqual([{ projectId: P2, evaluationId: "e-2", name: "Beta" }]);
    expect(previewMock).not.toHaveBeenCalled();
  });

  it("a viewer may preview but never confirm", async () => {
    loadBundleMock.mockResolvedValue(bundle("viewer"));
    expect((await POST(req({ batch: BATCH_ID }))).status).toBe(200);
    const res = await POST(req({ batch: BATCH_ID, confirm: true }));
    expect(res.status).toBe(403);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
