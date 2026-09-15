// Colocated vitest for GET /api/analyses/[id]/full-report (S32-B).
//
// Pins the tenancy boundary (owner / anon cookie → 200; anybody else and a
// malformed id → the same 404), the guest gate (no email on file → locked
// preview only, never the agent sections), the unlocked stream, the
// pre-0390 row being enqueued + started on first sight, and the honest
// pollAfterSec under capacity pressure.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn<() => Promise<{ id: string } | null>>();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const readAnonKeyMock = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/analyses/anon-key", () => ({ readAnonKey: () => readAnonKeyMock() }));

const getForViewerMock = vi.fn();
vi.mock("@/lib/analyses/store", () => ({
  getAnalysisForViewer: (id: string, v: unknown) => getForViewerMock(id, v),
}));

const loadRowMock = vi.fn();
const enqueueMock = vi.fn();
vi.mock("@/lib/analyses/first-analysis/store", () => ({
  loadFullReportRow: (id: string) => loadRowMock(id),
  enqueueFullReport: (id: string) => enqueueMock(id),
}));

const startMock = vi.fn();
vi.mock("@/lib/analyses/first-analysis/job", () => ({
  startFirstAnalysisJob: (id: string, o: unknown) => startMock(id, o),
}));

import { GET, dynamic } from "./route";
import { sampleReport, SAMPLE_ANALYSIS_ID } from "@/lib/analyses/first-analysis/fixtures";

const ID = SAMPLE_ANALYSIS_ID;

function req(id = ID) {
  return GET(new Request(`http://x/api/analyses/${id}/full-report`), { params: Promise.resolve({ id }) });
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    anon_key: "anon-1",
    user_id: null,
    full_report_status: "done",
    full_report_json: sampleReport(),
    full_report_error: null,
    full_report_attempts: 1,
    full_report_started_at: null,
    full_report_finished_at: "2026-09-15T00:10:00Z",
    full_report_email: null,
    full_report_emailed_at: null,
    ...overrides,
  };
}

describe("GET /api/analyses/[id]/full-report", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUserMock.mockResolvedValue(null);
    readAnonKeyMock.mockResolvedValue("anon-1");
    getForViewerMock.mockResolvedValue({ id: ID });
    loadRowMock.mockResolvedValue(row());
    enqueueMock.mockResolvedValue(true);
  });

  it("is force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("404s a malformed id without touching the store", async () => {
    const res = await req("not-a-uuid");
    expect(res.status).toBe(404);
    expect(getForViewerMock).not.toHaveBeenCalled();
  });

  it("404s when the viewer does not own the row (IDOR), indistinguishably from a miss", async () => {
    getForViewerMock.mockResolvedValue(null);
    const res = await req();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "Not found" });
    expect(loadRowMock).not.toHaveBeenCalled();
  });

  it("guest with no email on file: locked preview — echo, SVI, valuation, one CEO paragraph; no report", async () => {
    const res = await req();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.locked).toBe(true);
    expect(body.report).toBeNull();
    expect(body.preview.echo.rows).toHaveLength(10);
    expect(body.preview.svi.dimensions).toHaveLength(8);
    expect(body.preview.valuation.lowAud).toBeGreaterThan(0);
    expect(typeof body.preview.ceoParagraph).toBe("string");
    expect(JSON.stringify(body)).not.toContain('"cfo"');
    expect(body.pollAfterSec).toBe(0);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("guest who gave an email: unlocked, full report, masked destination", async () => {
    loadRowMock.mockResolvedValue(row({ full_report_email: "founder@example.com", full_report_emailed_at: "2026-09-15T00:11:00Z" }));
    const body = await (await req()).json();
    expect(body.locked).toBe(false);
    expect(Object.keys(body.report.agents)).toHaveLength(7);
    expect(body.emailTo).toBe("f******@example.com");
    expect(body.emailedAt).toBe("2026-09-15T00:11:00Z");
  });

  it("signed-in owner: unlocked; a running job reports the current agent and a 3 s poll", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    const r = sampleReport({ agents: false });
    r.progress.current = "cfo";
    loadRowMock.mockResolvedValue(row({ user_id: "u1", full_report_status: "running", full_report_json: r }));
    const body = await (await req()).json();
    expect(body.locked).toBe(false);
    expect(body.status).toBe("running");
    expect(body.report.progress.current).toBe("cfo");
    expect(body.pollAfterSec).toBe(3);
  });

  it("stretches the poll while the AI queue is saturated", async () => {
    const r = sampleReport({ agents: false });
    r.progress.current = "ceo";
    r.progress.queuedForSec = 12;
    loadRowMock.mockResolvedValue(row({ user_id: "u1", full_report_status: "running", full_report_json: r }));
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    const body = await (await req()).json();
    expect(body.pollAfterSec).toBe(12);
  });

  it("a pre-0390 row (status null) is enqueued and started on first sight", async () => {
    loadRowMock
      .mockResolvedValueOnce(row({ full_report_status: null, full_report_json: null }))
      .mockResolvedValueOnce(row({ full_report_status: "queued", full_report_json: null }));
    const body = await (await req()).json();
    expect(enqueueMock).toHaveBeenCalledWith(ID);
    expect(startMock).toHaveBeenCalledWith(ID, { userId: null });
    expect(body.status).toBe("queued");
    expect(body.preview).toBeNull();
    expect(body.pollAfterSec).toBe(4);
  });

  it("a failed job exposes its error and stops polling", async () => {
    loadRowMock.mockResolvedValue(row({ user_id: "u1", full_report_status: "failed", full_report_error: "1 section(s) not written: clo", full_report_attempts: 3 }));
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    const body = await (await req()).json();
    expect(body.status).toBe("failed");
    expect(body.error).toContain("clo");
    expect(body.attempts).toBe(3);
    expect(body.pollAfterSec).toBe(0);
  });
});
