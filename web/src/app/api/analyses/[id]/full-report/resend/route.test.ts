// Colocated vitest for POST /api/analyses/[id]/full-report/resend (S32-B).
// Pins: tenancy 404; not_ready before the job lands; no_email for a guest
// with nothing on file (the endpoint never accepts a new address); 3/day
// rate limit per analysis; force delivery outcome mapping.

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
// G28-C: the button resends whatever document the row holds (dispatch.ts);
// the mock keeps the (row, report, opts) positions the assertions read.
const deliverMock = vi.fn();
vi.mock("@/lib/analyses/first-analysis/dispatch", () => ({
  deliverAnalysisReport: (row: { full_report_json: unknown }, opts: unknown) => deliverMock(row, row.full_report_json, opts),
}));
const rateMock = vi.fn();
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...a: unknown[]) => rateMock(...a) }));

import { POST, RESEND_LIMIT_PER_DAY } from "./route";
import { sampleReport, SAMPLE_ANALYSIS_ID } from "@/lib/analyses/first-analysis/fixtures";

const ID = SAMPLE_ANALYSIS_ID;

function post(id = ID) {
  return POST(new Request(`http://x/api/analyses/${id}/full-report/resend`, { method: "POST" }), { params: Promise.resolve({ id }) });
}

describe("POST /api/analyses/[id]/full-report/resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(null);
    readAnonKeyMock.mockResolvedValue("anon-1");
    getForViewerMock.mockResolvedValue({ id: ID });
    loadRowMock.mockResolvedValue({ id: ID, user_id: null, full_report_status: "done", full_report_json: sampleReport(), full_report_email: "f@example.com" });
    rateMock.mockReturnValue({ allowed: true, remaining: 2, resetIn: 1000 });
    deliverMock.mockResolvedValue("sent");
  });

  it("404s a foreign or malformed id", async () => {
    expect((await post("nope")).status).toBe(404);
    getForViewerMock.mockResolvedValue(null);
    expect((await post()).status).toBe(404);
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it("not_ready before the job lands", async () => {
    loadRowMock.mockResolvedValue({ id: ID, user_id: null, full_report_status: "running", full_report_json: null, full_report_email: "f@example.com" });
    const body = await (await post()).json();
    expect(body).toMatchObject({ ok: false, outcome: "not_ready" });
  });

  it("no_email for a guest with nothing on file — never accepts a new address", async () => {
    loadRowMock.mockResolvedValue({ id: ID, user_id: null, full_report_status: "done", full_report_json: sampleReport(), full_report_email: null });
    const body = await (await post()).json();
    expect(body.outcome).toBe("no_email");
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it("rate-limits to three a day per analysis", async () => {
    rateMock.mockReturnValue({ allowed: false, remaining: 0, resetIn: 3_600_000 });
    const body = await (await post()).json();
    expect(body).toMatchObject({ ok: false, outcome: "rate_limited", retryAfterSec: 3600 });
    expect(rateMock).toHaveBeenCalledWith(`first-analysis-resend:${ID}`, RESEND_LIMIT_PER_DAY, 24 * 60 * 60 * 1000);
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it("forces a delivery and maps the outcome", async () => {
    const body = await (await post()).json();
    expect(body).toMatchObject({ ok: true, outcome: "sent", remaining: 2 });
    expect(deliverMock.mock.calls[0][2]).toEqual({ force: true });
    deliverMock.mockResolvedValue("unsubscribed");
    expect((await (await post()).json()).outcome).toBe("unsubscribed");
    deliverMock.mockResolvedValue("send_failed");
    expect((await (await post()).json()).outcome).toBe("send_failed");
  });
});
