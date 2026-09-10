// Route tests for GET /api/evaluations/batch/[id]/export.csv (T0272). Pins:
// 401 anonymous, 404 when the batch is not the caller's (owner-only, never
// 403), and the CSV response: text/csv, attachment filename from the batch,
// UTF-8 BOM first, CRLF rows, quoted / formula-guarded cells, site-absolute
// report links.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const getBatchMock = vi.fn();
const loadRowsMock = vi.fn();
vi.mock("@/lib/evaluations/batch", () => ({
  getBatchForUser: (u: string, id: string) => getBatchMock(u, id),
  loadCohortRows: (b: unknown) => loadRowsMock(b),
}));

import { GET, dynamic } from "./route";

const USER = { id: "u-1", email: "prog@accel.au", plan: "investor_vc_small" };
const BATCH = { id: "b-1", userId: "u-1", name: "Cohort 4", rubricWeights: {}, status: "done", total: 2, doneCount: 2, failedCount: 0, createdAt: "2026-09-10T00:00:00Z", startedAt: null, finishedAt: null };
const ROWS = [
  { itemId: 1, evaluationId: "e-1", projectId: "p-1", projectSlug: "acme", startup: "Acme, Inc", label: "=cmd", industry: "DeepTech", state: "NSW", status: "done", svi: 71, weighted: 64.5, stage: 3, delta: 4, topStrength: "Founder & Team", topGap: "Traction & Revenue", dimensionScores: { ftv: 80, tre: 40 }, reportUrl: "/tbr/tok", pdfUrl: "/api/svi/report/pdf?token=tok", error: null, scoredAt: "2026-09-11T00:00:00Z" },
  { itemId: 2, evaluationId: "e-2", projectId: "p-2", projectSlug: "beta", startup: "Beta", label: null, industry: null, state: null, status: "failed", svi: null, weighted: null, stage: 1, delta: null, topStrength: null, topGap: null, dimensionScores: null, reportUrl: null, pdfUrl: null, error: "owner_not_found", scoredAt: "2026-09-11T00:00:00Z" },
];

function req(id = "b-1"): [Request, { params: Promise<{ id: string }> }] {
  return [new Request(`http://localhost/api/evaluations/batch/${id}/export.csv`), { params: Promise.resolve({ id }) }];
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.SITE_URL;
  getCurrentUserMock.mockResolvedValue(USER);
  getBatchMock.mockResolvedValue(BATCH);
  loadRowsMock.mockResolvedValue(ROWS);
});

describe("GET /api/evaluations/batch/[id]/export.csv", () => {
  it("exports dynamic = force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("401s anonymous callers", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(...req());
    expect(res.status).toBe(401);
    expect(getBatchMock).not.toHaveBeenCalled();
  });

  it("404s a batch that is not the caller's (owner-only)", async () => {
    getBatchMock.mockResolvedValue(null);
    const res = await GET(...req("b-other"));
    expect(res.status).toBe(404);
    expect(getBatchMock).toHaveBeenCalledWith("u-1", "b-other");
    expect(loadRowsMock).not.toHaveBeenCalled();
  });

  it("streams an Excel-safe CSV with BOM, CRLF, quoting and absolute report links", async () => {
    const res = await GET(...req());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="cohort-cohort-4-2026-09-10.csv"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    // Response.text() strips a BOM per the Fetch spec — check the raw bytes.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const lines = text.slice(1).split("\r\n");
    expect(lines[0].startsWith("Startup,Label,Industry,State,Status,SVI,Weighted score,Stage,Delta since last,Top strength,Top gap,Founder & Team,")).toBe(true);
    expect(lines[1]).toBe('"Acme, Inc",\'=cmd,DeepTech,NSW,done,71,64.5,MVP,4,Founder & Team,Traction & Revenue,80,,,40,,,,,http://localhost/tbr/tok,2026-09-11T00:00:00Z,');
    expect(lines[2]).toBe("Beta,,,,failed,,,Idea,,,,,,,,,,,,,2026-09-11T00:00:00Z,owner_not_found");
    expect(lines[3]).toBe("");
    expect(loadRowsMock).toHaveBeenCalledWith(BATCH);
  });
});
