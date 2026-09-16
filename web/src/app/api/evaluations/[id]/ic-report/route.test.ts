// Route tests for /api/evaluations/[id]/ic-report (G13-W5-D3).
//   * 401 / 404 (never 403) for anonymous, strangers, lapsed seats and the
//     founder on both verbs;
//   * POST: kind clamped by plan (Scout memo → one_page), weights only on
//     Program (F3), the row is created from the dossier loader, rendered
//     once for the page count, 201 with ic_report_id + pdf_url; 400 on a
//     bad body; 503 while 0403 is missing;
//   * GET: list (own + same-org seats) · ?report= → application/pdf
//     attachment · unknown report → 404; POST is apiRoute-wrapped.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
const resolveAccessMock = vi.fn();
vi.mock("@/lib/evaluations/dossier", () => ({ resolveDossierAccess: (id: string, uid: string) => resolveAccessMock(id, uid), loadDossier: (id: string, uid: string) => loadDossierMock(id, uid) }));
const loadDossierMock = vi.fn();
const isEvaluatorMock = vi.fn(async () => true);
vi.mock("@/lib/evaluations", () => ({ isEvaluatorUser: () => isEvaluatorMock() }));
const createMock = vi.fn();
const listMock = vi.fn();
const getMock = vi.fn();
const pagesMock = vi.fn(async () => {});
vi.mock("@/lib/evaluations/ic-reports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/evaluations/ic-reports")>()),
  createIcReport: (i: unknown) => createMock(i),
  listIcReports: (...a: unknown[]) => listMock(...a),
  getIcReport: (...a: unknown[]) => getMock(...a),
  setIcReportPages: (...a: unknown[]) => pagesMock(...(a as [])),
}));
const renderMock = vi.fn(async () => ({ buffer: Buffer.from("%PDF-1.4 fake"), pages: 3 }));
vi.mock("@/lib/pdf/ic-memo-pdf", () => ({ renderIcMemoPdf: (p: unknown) => renderMock(p as never) }));
vi.mock("@/lib/investor/organisations", () => ({ resolveActingOrg: async () => ({ id: "org-1" }), listSeatUserIds: async () => ["u-eval", "u-b"] }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

import { isAuditedHandler } from "@/lib/audit/api-route";
import { GET, POST, icReportPdfUrl } from "./route";

const USER = { id: "u-eval", email: "scout@fund.vc", displayName: "Sam", plan: "investor_angel" };
const ACCESS = { evaluation: { id: "e-1" }, project: { id: "p-1" }, role: "assessor" as const, viaOrgId: null };
const VIEW = { header: { evaluationId: "e-1", projectId: "p-1", name: "Acme Robotics", snapshotId: "s-2" }, report: { radar: null }, valuation: { rangeBars: null }, assessment: { mine: null }, consensus: null };
const REPORT = { id: "ic-1", evaluationId: "e-1", projectId: "p-1", userId: "u-eval", kind: "one_page", sections: { summary: { startupName: "Acme Robotics" } }, weightsShown: false, generatedBy: "u-eval", pages: null, createdAt: "2026-09-16T00:00:00Z" };
const ctx = (id = "e-1") => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) => new Request("http://localhost/api/evaluations/e-1/ic-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const get = (qs = "") => new Request(`http://localhost/api/evaluations/e-1/ic-report${qs}`);

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  resolveAccessMock.mockReset().mockResolvedValue(ACCESS);
  isEvaluatorMock.mockReset().mockResolvedValue(true);
  loadDossierMock.mockReset().mockResolvedValue(VIEW);
  createMock.mockReset().mockResolvedValue({ ok: true, report: REPORT });
  listMock.mockReset().mockResolvedValue({ available: true, reports: [REPORT] });
  getMock.mockReset().mockResolvedValue(REPORT);
  renderMock.mockClear();
  pagesMock.mockClear();
});

describe("access", () => {
  it("401 anonymous; 404 stranger / lapsed seat / founder on both verbs; POST is audited", async () => {
    expect(isAuditedHandler(POST)).toBe(true);
    getCurrentUserMock.mockResolvedValue(null);
    expect((await POST(post({}), ctx())).status).toBe(401);
    expect((await GET(get(), ctx())).status).toBe(401);
    getCurrentUserMock.mockResolvedValue(USER);
    resolveAccessMock.mockResolvedValue(null);
    expect((await POST(post({}), ctx())).status).toBe(404);
    expect((await GET(get(), ctx())).status).toBe(404);
    resolveAccessMock.mockResolvedValue({ ...ACCESS, role: "founder" });
    expect((await POST(post({}), ctx())).status).toBe(404);
    expect((await GET(get(), ctx())).status).toBe(404);
    resolveAccessMock.mockResolvedValue(ACCESS);
    isEvaluatorMock.mockResolvedValue(false);
    expect((await POST(post({}), ctx())).status).toBe(404);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("POST", () => {
  it("Scout: memo request is clamped to one_page, weights off; row created from the dossier; rendered once; 201 with pdf_url", async () => {
    const res = await POST(post({ kind: "memo" }), ctx());
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual({ ok: true, ic_report_id: "ic-1", kind: "one_page", pages: 3, weights_shown: false, pdf_url: "/api/evaluations/e-1/ic-report?report=ic-1" });
    expect(loadDossierMock).toHaveBeenCalledWith("e-1", "u-eval");
    expect(createMock).toHaveBeenCalledWith({ view: VIEW, userId: "u-eval", kind: "one_page", weightsShown: false });
    expect(renderMock).toHaveBeenCalledTimes(1);
    expect(renderMock.mock.calls[0][0]).toMatchObject({ kind: "one_page", weightsShown: false, generatedBy: "Sam" });
    expect(pagesMock).toHaveBeenCalledWith("ic-1", 3);
  });

  it("Program: memo with weights (F3); an empty object defaults to memo (an empty body is 400 like every JSON route)", async () => {
    getCurrentUserMock.mockResolvedValue({ ...USER, plan: "investor_vc_small" });
    createMock.mockResolvedValue({ ok: true, report: { ...REPORT, kind: "memo", weightsShown: true } });
    expect((await POST(new Request("http://localhost/x", { method: "POST" }), ctx())).status).toBe(400);
    const res = await POST(post({}), ctx());
    expect(res.status).toBe(201);
    expect((await res.json())).toMatchObject({ kind: "memo", weights_shown: true });
    expect(createMock.mock.calls[0][0]).toMatchObject({ kind: "memo", weightsShown: true });
  });

  it("400 on an unknown kind / extra key; 503 while 0403 is missing; a render failure still returns the row (pages null)", async () => {
    expect((await POST(post({ kind: "poster" }), ctx())).status).toBe(400);
    expect((await POST(post({ kind: "memo", extra: 1 }), ctx())).status).toBe(400);
    createMock.mockResolvedValue({ ok: false, error: "unavailable", message: "pending" });
    expect((await POST(post({}), ctx())).status).toBe(503);
    createMock.mockResolvedValue({ ok: true, report: REPORT });
    renderMock.mockRejectedValueOnce(new Error("font"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(post({}), ctx());
    expect(res.status).toBe(201);
    expect((await res.json()).pages).toBeNull();
  });
});

describe("GET", () => {
  it("lists the exports visible to the seat (own + same-org) with pdf urls", async () => {
    const res = await GET(get(), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.available).toBe(true);
    expect(body.reports[0]).toEqual({ id: "ic-1", kind: "one_page", pages: null, weights_shown: false, generated_by: "u-eval", created_at: "2026-09-16T00:00:00Z", pdf_url: icReportPdfUrl("e-1", "ic-1") });
    expect(listMock).toHaveBeenCalledWith("e-1", ["u-eval", "u-b"]);
  });

  it("?report= streams the PDF as an attachment re-rendered from the stored sections; unknown / malformed id → 404", async () => {
    const res = await GET(get("?report=0f6e5c1a-1111-4111-8111-aaaaaaaaaaaa"), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="one-pager-acme-robotics-2026-09-16.pdf"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await res.arrayBuffer()).toString("latin1").startsWith("%PDF")).toBe(true);
    expect(renderMock.mock.calls[0][0]).toMatchObject({ kind: "one_page", sections: REPORT.sections, generatedAt: "2026-09-16T00:00:00Z" });
    expect(getMock).toHaveBeenCalledWith("0f6e5c1a-1111-4111-8111-aaaaaaaaaaaa", "e-1", ["u-eval", "u-b"]);
    getMock.mockResolvedValue(null);
    expect((await GET(get("?report=0f6e5c1a-1111-4111-8111-aaaaaaaaaaaa"), ctx())).status).toBe(404);
    expect((await GET(get("?report=../etc"), ctx())).status).toBe(404);
  });
});
