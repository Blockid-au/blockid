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
  isNeverStarted: (r: { full_report_status: string | null; full_report_attempts: number | null }) => r.full_report_status === "queued" && (r.full_report_attempts ?? 0) === 0,
}));

// G28-C: the route re-kicks through the dispatcher (shape decides v2 / S32).
const startMock = vi.fn();
vi.mock("@/lib/analyses/first-analysis/dispatch", () => ({
  startAnalysisReportJob: (id: string, o: unknown) => startMock(id, o),
}));
// G25-C — the daily free cap: a never-started row is held while it is reached.
const capMock = vi.fn<() => Promise<boolean>>();
const grantMock = vi.fn<() => Promise<{ id: string } | null>>();
vi.mock("@/lib/reports/free-grants", () => ({ freeReportsCapReached: () => capMock(), grantForAnalysis: () => grantMock() }));

import { GET, HELD_POLL_SEC, dynamic } from "./route";
import { sampleReport, SAMPLE_ANALYSIS_ID } from "@/lib/analyses/first-analysis/fixtures";
import { mintDownloadToken } from "@/lib/analyses/first-analysis/download-token";
import { V2_RUNNING_POLL_SEC } from "@/lib/analyses/first-analysis/view";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import type { FullReportV2Envelope } from "@/lib/analyses/first-analysis/types";

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
    capMock.mockResolvedValue(false);
    grantMock.mockResolvedValue({ id: "grant-1" });
  });

  // G25-C — FREE_REPORTS_DAILY_CAP: the poll must not start a run the intake route deferred.
  it("a never-started queued row is kicked when the cap allows, held (heldForCap, slow poll) when it does not", async () => {
    loadRowMock.mockResolvedValue(row({ full_report_status: "queued", full_report_attempts: 0, full_report_json: null, full_report_email: "founder@example.com" }));
    let body = await (await req()).json();
    expect(startMock).toHaveBeenCalledWith(ID, { userId: null, json: null });
    expect(body.heldForCap).toBe(false);
    expect(body.pollAfterSec).toBe(4);
    startMock.mockClear();
    capMock.mockResolvedValue(true);
    body = await (await req()).json();
    expect(startMock).not.toHaveBeenCalled();
    expect(body.heldForCap).toBe(true);
    expect(body.pollAfterSec).toBe(HELD_POLL_SEC);
    expect(body.status).toBe("queued");
  });

  it("the cap never holds an entitled row (no grant)", async () => {
    capMock.mockResolvedValue(true);
    grantMock.mockResolvedValue(null);
    loadRowMock.mockResolvedValue(row({ user_id: "u1", full_report_status: "queued", full_report_attempts: 0, full_report_json: null }));
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    const body = await (await req()).json();
    expect(startMock).toHaveBeenCalledWith(ID, { userId: "u1", json: null });
    expect(body.heldForCap).toBe(false);
  });

  it("the cap never holds a row that already ran (queued with attempts) and a cap read that throws never holds", async () => {
    capMock.mockResolvedValue(true);
    loadRowMock.mockResolvedValue(row({ full_report_status: "queued", full_report_attempts: 1, full_report_json: null }));
    let body = await (await req()).json();
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(body.heldForCap).toBe(false);
    startMock.mockClear();
    capMock.mockRejectedValue(new Error("db"));
    loadRowMock.mockResolvedValue(row({ full_report_status: "queued", full_report_attempts: 0, full_report_json: null }));
    body = await (await req()).json();
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(body.heldForCap).toBe(false);
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
    // 10 intake rows + the founder-execution echo row (G14-S37).
    expect(body.preview.echo.rows).toHaveLength(11);
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
    expect(startMock).toHaveBeenCalledWith(ID, { userId: null, json: null });
    expect(body.status).toBe("queued");
    expect(body.preview).toBeNull();
    expect(body.pollAfterSec).toBe(4);
  });

  // G28-C — the ReportV2 envelope: the v3 document rides on `reportV2`, the
  // S32 fields stay null, and the e-mail's signed token opens it cookie-less.
  describe("ReportV2 envelope (G28-C)", () => {
    const envelope = (): FullReportV2Envelope => ({
      version: "tbr-v2",
      analysisId: ID,
      company: "Acme",
      generatedAt: "2026-09-21T00:00:00Z",
      completedAt: "2026-09-21T00:05:00Z",
      report: demoReportV2(),
      reportId: "rpt-1",
      progress: { phase: "done", pct: 100, at: "2026-09-21T00:05:00Z", chaptersDone: 8 },
    });

    it("a done v2 row → kind v2, reportV2 = the document, report/preview null, no poll", async () => {
      loadRowMock.mockResolvedValue(row({ full_report_json: envelope(), full_report_email: "founder@example.com", full_report_emailed_at: "2026-09-21T00:06:00Z" }));
      const body = await (await req()).json();
      expect(body.kind).toBe("v2");
      expect(body.locked).toBe(false);
      expect(body.reportV2.cover.startupName).toBe(demoReportV2().cover.startupName);
      expect(body.reportV2.dimensions).toHaveLength(8);
      expect(body.report).toBeNull();
      expect(body.preview).toBeNull();
      expect(body.emailTo).toBe("f******@example.com");
      expect(body.pollAfterSec).toBe(0);
    });

    it("a running v2 row → progressV2 (phase, pct) and a steady 5 s poll; a never-started row reads kind v2", async () => {
      const e = envelope();
      e.report = null;
      e.progress = { phase: "analyze", pct: 35, at: "2026-09-21T00:01:00Z", chaptersDone: 2 };
      loadRowMock.mockResolvedValue(row({ full_report_status: "running", full_report_json: e, full_report_email: "founder@example.com" }));
      let body = await (await req()).json();
      expect(body.kind).toBe("v2");
      expect(body.reportV2).toBeNull();
      expect(body.progressV2).toEqual({ phase: "analyze", pct: 35, at: "2026-09-21T00:01:00Z", chaptersDone: 2 });
      expect(body.pollAfterSec).toBe(V2_RUNNING_POLL_SEC);
      loadRowMock.mockResolvedValue(row({ full_report_status: "queued", full_report_attempts: 0, full_report_json: null, full_report_email: "founder@example.com" }));
      body = await (await req()).json();
      expect(body.kind).toBe("v2");
      expect(body.progressV2).toBeNull();
    });

    it("the signed ?token= (the e-mail's page link) opens the row with no cookie and no session; a bad token falls to tenancy (404)", async () => {
      getForViewerMock.mockResolvedValue(null);
      readAnonKeyMock.mockResolvedValue(null);
      loadRowMock.mockResolvedValue(row({ full_report_json: envelope(), full_report_email: "founder@example.com" }));
      const prev = process.env.REPORT_LINK_SECRET;
      process.env.REPORT_LINK_SECRET = "unit-test-secret-of-sufficient-length";
      try {
        const token = mintDownloadToken(ID)!;
        const withToken = await GET(new Request(`http://x/api/analyses/${ID}/full-report?token=${encodeURIComponent(token)}`), { params: Promise.resolve({ id: ID }) });
        expect(withToken.status).toBe(200);
        expect((await withToken.json()).reportV2.dimensions).toHaveLength(8);
        const bad = await GET(new Request(`http://x/api/analyses/${ID}/full-report?token=1.nope`), { params: Promise.resolve({ id: ID }) });
        expect(bad.status).toBe(404);
      } finally {
        if (prev === undefined) delete process.env.REPORT_LINK_SECRET;
        else process.env.REPORT_LINK_SECRET = prev;
      }
    });
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
  // S32-E: `report.agents` came back as strings in one shape and objects in
  // another — the payload now carries one object per voice, always.
  describe("payload shape", () => {
    it("every voice is an object {role, title, body, nextSteps, provider, model, status} — written or not", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "u1" });
      const r = sampleReport();
      delete r.agents.clo;
      delete r.agents.chro;
      r.sections = { clo: { status: "failed", attempts: 1, provider: "groq", model: "allam-2-7b", error: "ungrounded" }, chro: { status: "unavailable", attempts: 3 } };
      loadRowMock.mockResolvedValue(row({ user_id: "u1", full_report_status: "done_partial", full_report_error: "2 section(s) not written: clo, chro", full_report_json: r }));
      const body = await (await req()).json();
      expect(body.status).toBe("done_partial");
      expect(body.error).toContain("clo");
      expect(Object.keys(body.report.agents)).toEqual(["ceo", "cfo", "cmo", "cto", "cpo", "clo", "chro"]);
      for (const role of Object.keys(body.report.agents)) {
        const a = body.report.agents[role];
        expect(typeof a).toBe("object");
        expect(a).toMatchObject({ role, nextSteps: expect.any(Array), status: expect.any(String), wordCount: expect.any(Number) });
        expect(a).toHaveProperty("title");
        expect(a).toHaveProperty("body");
        expect(a).toHaveProperty("provider");
        expect(a).toHaveProperty("model");
      }
      expect(body.report.agents.ceo).toMatchObject({ status: "done", provider: "test", model: "stub", wordCount: expect.any(Number) });
      expect(typeof body.report.agents.ceo.body).toBe("string");
      expect(body.report.agents.clo).toMatchObject({ status: "failed", title: null, body: null, nextSteps: [], provider: "groq", model: "allam-2-7b", attempts: 1, error: "ungrounded" });
      expect(body.report.agents.chro).toMatchObject({ status: "unavailable", body: null, attempts: 3 });
      // A partial keeps polling on the cron cadence so the backfilled sections appear.
      expect(body.pollAfterSec).toBe(20);
    });

    it("a bare-string section from an older writer is normalised to the same object", async () => {
      getCurrentUserMock.mockResolvedValue({ id: "u1" });
      const r = sampleReport() as unknown as { agents: Record<string, unknown> };
      r.agents.cfo = "Only a body paragraph.\n\nAnd another.";
      loadRowMock.mockResolvedValue(row({ user_id: "u1", full_report_json: r }));
      const body = await (await req()).json();
      expect(body.report.agents.cfo).toMatchObject({ role: "cfo", status: "done", title: "Finances & valuation", body: "Only a body paragraph.\n\nAnd another.", nextSteps: [], wordCount: 6 });
    });
  });
});
