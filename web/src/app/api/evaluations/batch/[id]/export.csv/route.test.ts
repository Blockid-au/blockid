// Route tests for GET /api/evaluations/batch/[id]/export.csv (T0272; G21
// P2-B). Pins: 401 anonymous, 404 / 503 from assertBatchRole (viewer — any
// seat may export, never 403), and the CSV response built from
// loadBlockIdCohortRows + the REAL blockIdCohortCsv: text/csv, attachment
// filename from the batch, UTF-8 BOM first, CRLF rows, quoted /
// formula-guarded cells, site-absolute report links, and the new P2-B
// columns (Program score (with overrides), Shortlisted, Overrides).

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const assertBatchRoleMock = vi.fn();
vi.mock("@/lib/evaluations/batch-members", () => ({
  assertBatchRole: (id: string, uid: string, role: string) => assertBatchRoleMock(id, uid, role),
}));

const loadRowsMock = vi.fn();
vi.mock("@/lib/evaluations/cohort-rows-loader", () => ({
  loadBlockIdCohortRows: (batch: unknown, viewerId: string) => loadRowsMock(batch, viewerId),
}));

import { equalWeights } from "@/lib/evaluations/batch-shared";
import { buildCohortRows, type CohortItemInput } from "@/lib/evaluations/cohort-rows";
import type { OverrideRow } from "@/lib/evaluations/overrides-shared";
import { GET, dynamic } from "./route";

const USER = { id: "u-1", email: "prog@accel.au", plan: "investor_vc_small" };
const BATCH = { id: "b-1", userId: "u-1", name: "Cohort 4", rubricWeights: equalWeights(), status: "done" as const, total: 2, doneCount: 2, failedCount: 0, createdAt: "2026-09-10T00:00:00Z", startedAt: null, finishedAt: null };

const ITEM_1: CohortItemInput = {
  itemId: 1,
  evaluationId: "e-1",
  projectId: "p-1",
  projectSlug: "acme",
  startup: "Acme, Inc",
  label: null,
  industry: "DeepTech",
  state: "NSW",
  status: "done",
  svi: 71,
  weighted: 64.5,
  stage: 3,
  delta: 4,
  topStrength: "Founder & Team",
  topGap: "Traction & Revenue",
  dimensionScores: { ftv: 80, tre: 40 },
  reportUrl: "/tbr/tok",
  pdfUrl: "/api/svi/report/pdf?token=tok",
  error: null,
  scoredAt: "2026-09-11T00:00:00Z",
  decision: "proceed",
  conviction: 4,
  thesisFitPct: 71,
  assessmentStatus: "submitted",
  snapshotId: "snap-1",
  shortlisted: true,
  reviewStatus: "reviewed",
  reviewerId: "u-2",
  reviewerName: "=owner()",
};

const ITEM_2: CohortItemInput = {
  itemId: 2,
  evaluationId: "e-2",
  projectId: "p-2",
  projectSlug: "beta",
  startup: "Beta",
  label: null,
  industry: null,
  state: null,
  status: "failed",
  svi: null,
  weighted: null,
  stage: 1,
  delta: null,
  topStrength: null,
  topGap: null,
  dimensionScores: null,
  reportUrl: null,
  pdfUrl: null,
  error: "owner_not_found",
  scoredAt: "2026-09-11T00:00:00Z",
  decision: null,
  conviction: null,
  thesisFitPct: null,
  assessmentStatus: null,
  snapshotId: null,
  shortlisted: false,
  reviewStatus: "unreviewed",
  reviewerId: null,
  reviewerName: null,
};

const OVERRIDE_1: OverrideRow = {
  id: "ov-1",
  batchId: "b-1",
  itemId: 1,
  projectId: "p-1",
  dimension: "tre",
  fromValue: 40,
  toValue: 62,
  reasonCode: "sector_context",
  note: null,
  reviewerId: "u-2",
  reviewerName: "=owner()",
  createdAt: "2026-09-11T01:00:00Z",
};

const ROWS = buildCohortRows([ITEM_1, ITEM_2], {}, {}, [OVERRIDE_1], equalWeights());

function req(id = "b-1"): [Request, { params: Promise<{ id: string }> }] {
  return [new Request(`http://localhost/api/evaluations/batch/${id}/export.csv`), { params: Promise.resolve({ id }) }];
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.SITE_URL;
  getCurrentUserMock.mockResolvedValue(USER);
  assertBatchRoleMock.mockResolvedValue({ ok: true, batch: BATCH, role: "viewer", isCreator: false });
  loadRowsMock.mockResolvedValue({ rows: ROWS, baseRows: [], overridesAvailable: true });
});

describe("GET /api/evaluations/batch/[id]/export.csv", () => {
  it("exports dynamic = force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("401s anonymous callers", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET(...req());
    expect(res.status).toBe(401);
    expect(assertBatchRoleMock).not.toHaveBeenCalled();
  });

  it("404s a batch the caller cannot see (assertBatchRole not_found, minRole 'viewer')", async () => {
    assertBatchRoleMock.mockResolvedValue({ ok: false, error: "not_found" });
    const res = await GET(...req("b-other"));
    expect(res.status).toBe(404);
    expect(assertBatchRoleMock).toHaveBeenCalledWith("b-other", "u-1", "viewer");
    expect(loadRowsMock).not.toHaveBeenCalled();
  });

  it("503s when assertBatchRole reports unavailable", async () => {
    assertBatchRoleMock.mockResolvedValue({ ok: false, error: "unavailable" });
    const res = await GET(...req());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("unavailable");
  });

  it("streams an Excel-safe CSV with BOM, CRLF, quoting, a formula-guarded cell and absolute report links", async () => {
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
    expect(lines[0].startsWith("Company,Stage,Sector,SVI,Program score,Program score (with overrides),Evidence confidence,Verification,Delta since last,")).toBe(true);
    // Shortlisted / Overrides sit right after Assessment status in the header.
    expect(lines[0]).toContain(",Assessment status,Shortlisted,Overrides,");

    // Row 1: comma-quoted company, formula-guarded reviewer name, absolute report link, shortlisted, 1 override.
    expect(lines[1]).toContain('"Acme, Inc",');
    expect(lines[1]).toContain("'=owner(),");
    expect(lines[1]).toContain("http://localhost/tbr/tok");
    expect(lines[1]).toContain(",yes,1,");

    // Row 2: no reviewer, not shortlisted, no overrides.
    expect(lines[2]).toContain(",no,0,");

    expect(loadRowsMock).toHaveBeenCalledWith(BATCH, "u-1");
  });

  it("matches the real blockIdCohortCsv output byte-for-byte (route only wires the loader + the real CSV builder)", async () => {
    const { blockIdCohortCsv } = await import("@/lib/evaluations/cohort-rows");
    const res = await GET(...req());
    const bytes = new Uint8Array(await res.arrayBuffer());
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(text).toBe(blockIdCohortCsv(ROWS, "http://localhost"));
  });
});
