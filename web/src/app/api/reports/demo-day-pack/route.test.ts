// Route tests for GET /api/reports/demo-day-pack (G21 P2-C). Pins: 401 /
// 403 / 400 / 404 as the Cohort Report route, and a 200 application/pdf
// whose page count = 1 cover + one page per SELECTED startup (shortlisted
// or submitted proceed) — the non-selected startup never gets a page.

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

import { GET } from "./route";
import { pdfPageCount } from "@/lib/pdf/page-count";
import { emptyEvidenceSummary, type JourneyStartup } from "@/lib/evaluations/program-journey";

const BATCH_ID = "11111111-1111-4111-8111-111111111111";
const USER = { id: "u-1", email: "prog@accel.au", plan: "investor_vc_small", displayName: "Plus Eight" };

function startup(over: Partial<JourneyStartup>): JourneyStartup {
  return { itemId: 1, evaluationId: "e-1", projectId: "p-1", projectSlug: "acme", name: "Acme", status: "done", svi: 70, confidence: 55, verification: 2, stage: 3, delta: null, topStrength: "Founder & Team", topGap: "Traction & Revenue", dimensionScores: { ftv: 80, tre: 40 }, decision: null, assessmentStatus: null, shortlisted: false, evidence: emptyEvidenceSummary(), scoreHistory: [70], reportUrl: null, dossierUrl: "/workspace/evaluations/e-1", profileUrl: "/s/acme", dossierProduced: false, feedbackLetterSent: false, ...over };
}

const BUNDLE = {
  batch: { id: BATCH_ID, userId: "u-1", name: "Cohort 4", rubricWeights: { ftv: 12.5, mpc: 12.5, ptd: 12.5, tre: 12.5, cgh: 12.5, iri: 12.5, lco: 12.5, svm: 12.5 }, status: "done", total: 3, doneCount: 3, failedCount: 0, createdAt: "2026-09-10T00:00:00Z", startedAt: null, finishedAt: null },
  role: "owner" as const,
  rows: [],
  startups: [startup({ decision: "proceed", assessmentStatus: "submitted" }), startup({ itemId: 2, evaluationId: "e-2", name: "Beta", shortlisted: true }), startup({ itemId: 3, evaluationId: "e-3", name: "Gamma", decision: "pass", assessmentStatus: "submitted" })],
  snapshots: [],
  overridesCount: 0,
};

const req = (q: string) => new Request("http://localhost/api/reports/demo-day-pack" + q);

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  getEntitlementsMock.mockReset().mockResolvedValue(["lp_report"]);
  loadBundleMock.mockReset().mockResolvedValue(BUNDLE);
});

describe("GET /api/reports/demo-day-pack", () => {
  it("401 / 403 / 400 / 404", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    expect((await GET(req(`?batch=${BATCH_ID}`))).status).toBe(401);
    getEntitlementsMock.mockResolvedValueOnce(["investor.dealflow"]);
    expect((await GET(req(`?batch=${BATCH_ID}`))).status).toBe(403);
    expect((await GET(req("?batch=x"))).status).toBe(400);
    loadBundleMock.mockResolvedValueOnce(null);
    expect((await GET(req(`?batch=${BATCH_ID}`))).status).toBe(404);
  });

  it("200 application/pdf: cover + one page per selected startup (2 of 3)", async () => {
    const res = await GET(req(`?batch=${BATCH_ID}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("blockid-demo-day-pack-cohort-4.pdf");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(pdfPageCount(bytes)).toBe(3);
  }, 20_000);
});
