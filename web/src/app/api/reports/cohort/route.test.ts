// Route tests for GET /api/reports/cohort (G21 P2-C). Pins: 401 anonymous,
// 403 feature_locked for a Scout (gate hit recorded), 400 without / with a
// malformed ?batch and for a bad ?format, 404 when the caller has no role on
// the batch, and the three formats: HTML (text/html, noindex, no-store,
// the movement / human-review sections, the nonce), CSV (BOM + header +
// one row per startup, attachment) and PDF (%PDF, application/pdf).

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const getEntitlementsMock = vi.fn();
const recordGateHitMock = vi.fn();
vi.mock("@/lib/entitlements", () => ({
  getEntitlements: (plan: string, id: string) => getEntitlementsMock(plan, id),
  recordGateHit: (u: unknown, f: string, s: string, surface?: string) => recordGateHitMock(u, f, s, surface),
}));

const loadBundleMock = vi.fn();
vi.mock("@/lib/evaluations/program-journey-data", async () => {
  const actual = await vi.importActual<typeof import("@/lib/evaluations/program-journey-data")>("@/lib/evaluations/program-journey-data");
  return { ...actual, loadCohortBundle: (u: string, b: string) => loadBundleMock(u, b) };
});

import { GET, dynamic, parseFormat } from "./route";
import { emptyEvidenceSummary, summariseEvidence, type JourneyStartup } from "@/lib/evaluations/program-journey";

const USER = { id: "u-1", email: "prog@accel.au", plan: "investor_vc_small", displayName: "Plus Eight" };
const PROGRAM_FLAGS = ["investor.dealflow", "lp_export", "lp_report"];
const BATCH_ID = "11111111-1111-4111-8111-111111111111";
const BATCH = { id: BATCH_ID, userId: "u-1", name: "Cohort 4 intake", rubricWeights: { ftv: 12.5, mpc: 12.5, ptd: 12.5, tre: 12.5, cgh: 12.5, iri: 12.5, lco: 12.5, svm: 12.5 }, status: "done", total: 2, doneCount: 2, failedCount: 0, createdAt: "2026-09-10T00:00:00Z", startedAt: null, finishedAt: null };

function startup(over: Partial<JourneyStartup>): JourneyStartup {
  return {
    itemId: 1,
    evaluationId: "e-1",
    projectId: "p-1",
    projectSlug: "acme",
    name: "Acme Robotics",
    status: "done",
    svi: 71,
    confidence: 60,
    verification: 2,
    stage: 3,
    delta: 9,
    topStrength: "Founder & Team",
    topGap: "Traction & Revenue",
    dimensionScores: { ftv: 80, tre: 40 },
    decision: "proceed",
    assessmentStatus: "submitted",
    shortlisted: false,
    evidence: summariseEvidence([{ dimension: "ftv", evidence_type: "founder_linkedin", confidence_level: "public_url" }]),
    scoreHistory: [62, 71],
    reportUrl: "/tbr/tok-a",
    dossierUrl: "/workspace/evaluations/e-1",
    profileUrl: "/s/acme",
    dossierProduced: true,
    feedbackLetterSent: false,
    ...over,
  };
}

const BUNDLE = {
  batch: BATCH,
  role: "owner" as const,
  rows: [],
  startups: [startup({}), startup({ itemId: 2, evaluationId: "e-2", projectId: "p-2", name: "Beta Health", svi: 58, decision: "pass", evidence: emptyEvidenceSummary() })],
  snapshots: [],
  overridesCount: 1,
};

function req(query: string): Request {
  return new Request("http://localhost/api/reports/cohort" + query, { headers: { "x-nonce": "n0nce" } });
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  getEntitlementsMock.mockReset().mockResolvedValue(PROGRAM_FLAGS);
  recordGateHitMock.mockReset().mockResolvedValue(undefined);
  loadBundleMock.mockReset().mockResolvedValue(BUNDLE);
});

describe("GET /api/reports/cohort — gates", () => {
  it("is dynamic and parses formats", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(parseFormat(null)).toBe("html");
    expect(parseFormat("PDF")).toBe("pdf");
    expect(parseFormat("docx")).toBeNull();
  });

  it("401 anonymous", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(req(`?batch=${BATCH_ID}`));
    expect(res.status).toBe(401);
  });

  it("403 feature_locked for a Scout without lp_report / accelerator.cohort, gate hit recorded", async () => {
    getEntitlementsMock.mockResolvedValue(["investor.dealflow"]);
    const res = await GET(req(`?batch=${BATCH_ID}`));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, error: "feature_locked", feature: "lp_report" });
    expect(recordGateHitMock).toHaveBeenCalledWith(expect.objectContaining({ id: "u-1" }), "lp_report", "api", "api/reports/cohort");
    expect(loadBundleMock).not.toHaveBeenCalled();
  });

  it("a Programs plan with accelerator.cohort passes the gate", async () => {
    getEntitlementsMock.mockResolvedValue(["accelerator.cohort"]);
    const res = await GET(req(`?batch=${BATCH_ID}`));
    expect(res.status).toBe(200);
  });

  it("400 without ?batch, with a malformed id, or with a bad format", async () => {
    expect((await GET(req(""))).status).toBe(400);
    expect((await GET(req("?batch=nope"))).status).toBe(400);
    const bad = await GET(req(`?batch=${BATCH_ID}&format=docx`));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ error: "bad_format" });
  });

  it("404 when the caller has no role on the batch", async () => {
    loadBundleMock.mockResolvedValue(null);
    const res = await GET(req(`?batch=${BATCH_ID}`));
    expect(res.status).toBe(404);
    expect(loadBundleMock).toHaveBeenCalledWith("u-1", BATCH_ID);
  });
});

describe("GET /api/reports/cohort — formats", () => {
  it("html: text/html, noindex, no-store, the sections, the nonce, the program name and both startups", async () => {
    const res = await GET(req(`?batch=${BATCH_ID}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("x-robots-tag")).toContain("noindex");
    expect(res.headers.get("cache-control")).toContain("no-store");
    const html = await res.text();
    expect(html).toContain("Cohort 4 intake");
    expect(html).toContain("Prepared by Plus Eight");
    expect(html).toContain('data-section="movement"');
    expect(html).toContain('data-section="human-review"');
    expect(html).toContain("1 reviewer override recorded");
    expect(html).toContain('<script nonce="n0nce">');
    expect(html).toContain("Acme Robotics");
    expect(html).toContain("Beta Health");
    expect(html).toContain("Program owner");
  });

  it("csv: BOM, header, one row per startup, attachment filename", async () => {
    const res = await GET(req(`?batch=${BATCH_ID}&format=csv`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("blockid-cohort-report-cohort-4-intake.csv");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(Array.from(bytes.subarray(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const lines = bytes.subarray(3).toString("utf8").split(/\r?\n/).filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(lines[0].startsWith("Startup,Status,SVI,Evidence confidence %")).toBe(true);
    expect(lines[1].startsWith("Acme Robotics,done,71,60,2,MVP,9,proceed,submitted,no,")).toBe(true);
  });

  it("pdf: application/pdf bytes with the attachment header", async () => {
    const res = await GET(req(`?batch=${BATCH_ID}&format=pdf`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain(".pdf");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 4).toString("latin1")).toBe("%PDF");
    expect(Number(res.headers.get("content-length"))).toBe(bytes.length);
  }, 20_000);
});
