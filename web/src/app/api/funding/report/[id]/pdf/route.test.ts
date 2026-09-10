// Colocated vitest for GET /api/funding/report/[id]/pdf (T0244).
//
// Pins: the JSON route's access rules (404 for malformed id / missing row /
// no claim; owner, token and Stripe session all pass), 409 while the report
// is not ready, and a real `application/pdf` attachment for a ready report
// (renderer mocked to a tiny PDF so the test stays fast; the renderer itself
// is covered in lib/pdf/funding-report-pdf.test.tsx).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const getProjectByIdMock = vi.hoisted(() => vi.fn(async () => ({ id: "proj-1", userId: "user-1", name: "Acme Agtech" })));
vi.mock("@/lib/projects", () => ({ getProjectById: (id: string) => getProjectByIdMock(id) }));

const getFundingReportMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funding/reports", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/funding/reports")>();
  return { ...orig, getFundingReport: (id: string) => getFundingReportMock(id) };
});

const renderMock = vi.hoisted(() => vi.fn(async () => Buffer.from("%PDF-1.4 fake")));
vi.mock("@/lib/pdf/funding-report-pdf", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/pdf/funding-report-pdf")>();
  return { ...orig, renderFundingReportPdf: (input: unknown) => renderMock(input as never) };
});

import { GET } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const ROW = {
  id: ID,
  user_id: "user-1",
  guest_email: "g@example.com",
  project_id: "proj-1",
  intake: { description: "Soil sensors for grain farmers", state: "NSW", stage: "mvp" },
  grant_matches: [],
  program_matches: [],
  timeline: [],
  narrative_md: "# Plan",
  credits_cost: 0,
  paid_via: "plan",
  stripe_session_id: "cs_live_1",
  status: "ready",
  access_token: "tok_secret",
  meta: { today: "2026-09-10", summary: { grant_count: 0, program_count: 0 } },
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
};

function get(id: string, qs = ""): Promise<Response> {
  return GET(new Request(`http://x/api/funding/report/${id}/pdf${qs}`), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(null);
  getFundingReportMock.mockReset().mockResolvedValue(ROW);
  getProjectByIdMock.mockClear();
  renderMock.mockClear();
});

describe("GET /api/funding/report/[id]/pdf", () => {
  it("404s on a malformed id, a missing row and a viewer with no claim", async () => {
    expect((await get("nope")).status).toBe(404);
    expect(getFundingReportMock).not.toHaveBeenCalled();
    getFundingReportMock.mockResolvedValueOnce(null);
    expect((await get(ID, "?t=tok_secret")).status).toBe(404);
    expect((await get(ID)).status).toBe(404);
    expect((await get(ID, "?t=wrong")).status).toBe(404);
    expect(renderMock).not.toHaveBeenCalled();
  });

  it("returns an application/pdf attachment for the token holder and the Stripe session", async () => {
    for (const qs of ["?t=tok_secret", "?s=cs_live_1"]) {
      const res = await get(ID, qs);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/pdf");
      expect(res.headers.get("content-disposition")).toBe(`attachment; filename="money-finder-report-11111111.pdf"`);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(Buffer.from(await res.arrayBuffer()).toString("latin1")).toBe("%PDF-1.4 fake");
    }
    // Guests never trigger the project lookup (no startup name on the cover).
    expect(getProjectByIdMock).not.toHaveBeenCalled();
  });

  it("passes the startup name to the renderer for the signed-in owner", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "user-1" });
    const res = await get(ID);
    expect(res.status).toBe(200);
    expect(getProjectByIdMock).toHaveBeenCalledWith("proj-1");
    expect(renderMock).toHaveBeenCalledWith(expect.objectContaining({ startupName: "Acme Agtech", verifiedAt: null }));
  });

  it("409s while the report is not ready", async () => {
    getFundingReportMock.mockResolvedValueOnce({ ...ROW, status: "generating" });
    const res = await get(ID, "?t=tok_secret");
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, error: "not_ready", status: "generating" });
    expect(renderMock).not.toHaveBeenCalled();
  });

  it("500s when the renderer throws", async () => {
    renderMock.mockRejectedValueOnce(new Error("boom"));
    const res = await get(ID, "?t=tok_secret");
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("pdf_render_failed");
  });
});
