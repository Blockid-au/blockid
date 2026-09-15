// Colocated vitest for GET /api/analyses/[id]/report.pdf (S32-B).
// Pins: signed token works with no cookie and only for its own id; an
// expired / forged token falls back to tenancy and 404s; owner / anon
// cookie works; 409 before the job lands; PDF headers.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn<() => Promise<{ id: string } | null>>();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));
const readAnonKeyMock = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/analyses/anon-key", () => ({ readAnonKey: () => readAnonKeyMock() }));
const getForViewerMock = vi.fn();
vi.mock("@/lib/analyses/store", () => ({ getAnalysisForViewer: (id: string, v: unknown) => getForViewerMock(id, v) }));
const loadRowMock = vi.fn();
vi.mock("@/lib/analyses/first-analysis/store", () => ({ loadFullReportRow: (id: string) => loadRowMock(id) }));
vi.mock("@/lib/analyses/first-analysis/job", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analyses/first-analysis/job")>()),
  resolveReportVariant: vi.fn().mockResolvedValue("free"),
}));
const renderMock = vi.fn();
vi.mock("@/lib/pdf/first-analysis-report-pdf", () => ({
  renderFirstAnalysisReportPdf: (a: unknown) => renderMock(a),
}));

import { GET } from "./route";
import { mintDownloadToken } from "@/lib/analyses/first-analysis/download-token";
import { sampleReport, SAMPLE_ANALYSIS_ID } from "@/lib/analyses/first-analysis/fixtures";

const ID = SAMPLE_ANALYSIS_ID;
const SECRET = "0123456789abcdef0123456789abcdef";

function get(id = ID, query = "") {
  return GET(new Request(`http://x/api/analyses/${id}/report.pdf${query}`), { params: Promise.resolve({ id }) });
}

describe("GET /api/analyses/[id]/report.pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = SECRET;
    getCurrentUserMock.mockResolvedValue(null);
    readAnonKeyMock.mockResolvedValue(null);
    getForViewerMock.mockResolvedValue(null);
    loadRowMock.mockResolvedValue({ id: ID, user_id: null, full_report_status: "done", full_report_json: sampleReport() });
    renderMock.mockResolvedValue({ buffer: Buffer.from("%PDF-1.4 stub"), pages: 17 });
  });

  it("serves the PDF for a valid signed token with no cookie or session", async () => {
    const token = mintDownloadToken(ID)!;
    const res = await get(ID, `?token=${encodeURIComponent(token)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("blockid-first-analysis-kelpie.pdf");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await res.arrayBuffer()).toString("latin1")).toBe("%PDF-1.4 stub");
    expect(getForViewerMock).not.toHaveBeenCalled();
  });

  it("rejects a token minted for another analysis, an expired one and a forged one — all 404", async () => {
    const other = mintDownloadToken("11111111-2222-4333-8444-555555555555")!;
    expect((await get(ID, `?token=${encodeURIComponent(other)}`)).status).toBe(404);
    const expired = mintDownloadToken(ID, { now: Date.now() - 40 * 24 * 3600 * 1000 })!;
    expect((await get(ID, `?token=${encodeURIComponent(expired)}`)).status).toBe(404);
    expect((await get(ID, "?token=123.forged")).status).toBe(404);
    expect(renderMock).not.toHaveBeenCalled();
  });

  it("falls back to the tenancy boundary: owner cookie works, stranger 404s", async () => {
    expect((await get()).status).toBe(404);
    getForViewerMock.mockResolvedValue({ id: ID });
    readAnonKeyMock.mockResolvedValue("anon-1");
    expect((await get()).status).toBe(200);
  });

  it("409s when the report is not ready yet", async () => {
    getForViewerMock.mockResolvedValue({ id: ID });
    loadRowMock.mockResolvedValue({ id: ID, user_id: null, full_report_status: "running", full_report_json: null });
    const res = await get();
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ ok: false, status: "running" });
  });

  it("S32-E: a partial report (done_partial) downloads, rendered as part 1", async () => {
    getForViewerMock.mockResolvedValue({ id: ID });
    const report = sampleReport();
    delete report.agents.clo;
    delete report.agents.chro;
    delete report.agents.cpo;
    report.sections = { clo: { status: "failed", attempts: 1 }, chro: { status: "failed", attempts: 1 }, cpo: { status: "failed", attempts: 1 } };
    report.partialAt = "2026-09-15T00:05:00.000Z";
    loadRowMock.mockResolvedValue({ id: ID, user_id: null, full_report_status: "done_partial", full_report_json: report });
    const res = await get();
    expect(res.status).toBe(200);
    expect(renderMock).toHaveBeenCalledWith(expect.objectContaining({ part: "partial", variant: "free" }));
  });

  it("404s a malformed id", async () => {
    expect((await get("nope")).status).toBe(404);
  });
});
