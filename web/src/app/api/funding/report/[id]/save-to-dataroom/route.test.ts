// Colocated vitest for POST /api/funding/report/[id]/save-to-dataroom (T0244).
//
// Pins: 401 signed-out, 404 malformed / missing, 403 for a non-owner (a
// token holder is not enough — the data room belongs to an account), 409
// when the report has no project or is not ready, and the happy path that
// renders the PDF and hands it to `saveDeliverable` with the funding slug.

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

const saveDeliverableMock = vi.hoisted(() =>
  vi.fn(async () => ({ ok: true as const, dataroomFileId: "df-1", storagePath: "startup-proj-1/funding/x.pdf", downloadUrl: "https://signed" })),
);
vi.mock("@/lib/dataroom/save-deliverable", () => ({ saveDeliverable: (input: unknown) => saveDeliverableMock(input as never) }));

import { POST } from "./route";

const ID = "11111111-1111-4111-8111-111111111111";
const ROW = {
  id: ID,
  user_id: "user-1",
  guest_email: null,
  project_id: "proj-1",
  intake: { description: "Soil sensors for grain farmers", state: "NSW", stage: "mvp" },
  grant_matches: [],
  program_matches: [],
  timeline: [],
  narrative_md: "# Plan",
  credits_cost: 0,
  paid_via: "plan",
  stripe_session_id: null,
  status: "ready",
  access_token: "tok_secret",
  meta: { today: "2026-09-10" },
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
};

function post(id: string): Promise<Response> {
  return POST(new Request(`http://x/api/funding/report/${id}/save-to-dataroom`, { method: "POST" }), { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue({ id: "user-1", email: "f@acme.io" });
  getFundingReportMock.mockReset().mockResolvedValue(ROW);
  getProjectByIdMock.mockClear();
  renderMock.mockClear();
  saveDeliverableMock.mockClear();
});

describe("POST /api/funding/report/[id]/save-to-dataroom", () => {
  it("401 / 404 / 403 guards", async () => {
    expect((await post("nope")).status).toBe(404);
    getCurrentUserMock.mockResolvedValueOnce(null);
    expect((await post(ID)).status).toBe(401);
    getFundingReportMock.mockResolvedValueOnce(null);
    expect((await post(ID)).status).toBe(404);
    getFundingReportMock.mockResolvedValueOnce({ ...ROW, user_id: "someone-else" });
    expect((await post(ID)).status).toBe(403);
    getFundingReportMock.mockResolvedValueOnce({ ...ROW, user_id: null });
    expect((await post(ID)).status).toBe(403);
    expect(saveDeliverableMock).not.toHaveBeenCalled();
  });

  it("409 with a message when the report has no project", async () => {
    getFundingReportMock.mockResolvedValueOnce({ ...ROW, project_id: null });
    const res = await post(ID);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("no_project");
    expect(body.message).toMatch(/not attached to a startup/);
    expect(renderMock).not.toHaveBeenCalled();
    expect(saveDeliverableMock).not.toHaveBeenCalled();
  });

  it("409 not_ready while generating; 403 when the project is not the user's", async () => {
    getFundingReportMock.mockResolvedValueOnce({ ...ROW, status: "generating" });
    expect((await post(ID)).status).toBe(409);
    getProjectByIdMock.mockResolvedValueOnce({ id: "proj-1", userId: "other", name: "X" } as never);
    expect((await post(ID)).status).toBe(403);
    expect(saveDeliverableMock).not.toHaveBeenCalled();
  });

  it("renders the PDF and files it through saveDeliverable", async () => {
    const res = await post(ID);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      dataroomFileId: "df-1",
      storagePath: "startup-proj-1/funding/x.pdf",
      downloadUrl: "https://signed",
      template_slug: "funding_money_finder_report",
    });
    expect(renderMock).toHaveBeenCalledWith(expect.objectContaining({ startupName: "Acme Agtech" }));
    expect(saveDeliverableMock).toHaveBeenCalledTimes(1);
    const arg = saveDeliverableMock.mock.calls[0][0] as unknown as Record<string, unknown>;
    expect(arg).toMatchObject({
      userId: "user-1",
      email: "f@acme.io",
      projectId: "proj-1",
      filename: "money-finder-report-11111111.pdf",
      mime: "application/pdf",
      template_slug: "funding_money_finder_report",
      template_version: "v1",
      svi_dimension: "funding",
      folder: "funding",
    });
    expect(Buffer.isBuffer(arg.buffer)).toBe(true);
  });

  it("maps saveDeliverable failures to their HTTP status", async () => {
    saveDeliverableMock.mockResolvedValueOnce({ ok: false, error: "storage_upload_failed", status: 502 } as never);
    const res = await post(ID);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("storage_upload_failed");
  });
});
