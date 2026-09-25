// Colocated vitest for POST /api/intake.
//
// This route is the primary CTA's backend. Before 2026-09-08 it wrote nothing
// at all: a founder pasted an idea, saw a real SVI score, and the run ceased
// to exist on navigation. The persistence added here is deliberately
// SECONDARY to the analysis — the single most important property in this file
// is that a failing write can never turn a good analysis into an error.
//
// Regressions this suite catches:
//   - a persist failure (unconfigured DB, insert error, thrown client)
//     bubbling out and 500-ing a perfectly good analysis;
//   - dropping `analysisId` from the response, which silently removes the
//     caller's only way to link back to the saved run;
//   - forgetting to mint the anon cookie, which would orphan every anonymous
//     row;
//   - dropping the write rate limit, letting an anonymous loop fill the table;
//   - rate limiting the ANALYSIS instead of the write — a rate-limited write
//     must still return the analysis.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntakeResult } from "@/lib/intake/analyze-input";

const analyzeInputMock = vi.fn<() => Promise<IntakeResult>>();
vi.mock("@/lib/intake/analyze-input", () => ({
  analyzeInput: () => analyzeInputMock(),
}));

const getCurrentUserMock = vi.fn<() => Promise<{ id: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const ensureAnonKeyMock = vi.fn<() => Promise<{ key: string; issued: boolean }>>();
vi.mock("@/lib/analyses/anon-key", () => ({
  ensureAnonKey: () => ensureAnonKeyMock(),
}));

const saveAnalysisMock = vi.fn<(i: Record<string, unknown>) => Promise<string | null>>();
const checkWriteLimitMock = vi.fn<
  (a: string, ip: string) => { allowed: boolean; reason?: string }
>();
const countAnonRunsMock = vi.fn<(a: string) => Promise<number>>();
const checkAnonRunLimitMock = vi.fn<
  (ip: string) => { allowed: boolean; reason?: string }
>();
const countUserRunsMock = vi.fn<(u: string) => Promise<number>>();
vi.mock("@/lib/analyses/store", () => ({
  saveAnalysis: (i: Record<string, unknown>) => saveAnalysisMock(i),
  checkAnalysisWriteLimit: (a: string, ip: string) => checkWriteLimitMock(a, ip),
  countAnonRunsInWindow: (a: string) => countAnonRunsMock(a),
  countUserRuns: (u: string) => countUserRunsMock(u),
  checkAnonRunLimit: (ip: string) => checkAnonRunLimitMock(ip),
}));

// G16-A: funnel steps emitted from this route (the real first-analysis path).
const sviAnalyzeMock = vi.fn<(i: Record<string, unknown>) => void>();
const scoreComputedMock = vi.fn<(i: Record<string, unknown>) => void>();
vi.mock("@/lib/analytics/funnel", () => ({
  emitSviAnalyze: (i: Record<string, unknown>) => sviAnalyzeMock(i),
  emitScoreComputed: (i: Record<string, unknown>) => scoreComputedMock(i),
  emitFreeReportSubmitted: (i: Record<string, unknown>) => freeSubmittedMock(i),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/entitlements", () => ({ getEntitlements: vi.fn(async () => []) }));

const deriveMock = vi.fn<() => unknown>();
vi.mock("@/lib/analyses/payload", () => ({
  deriveCompactSvi: () => deriveMock(),
}));

// G28-C: the route starts the report through the dispatcher (a fresh row →
// the ReportV2 pipeline); the S32 runner is never imported here any more.
const startJobMock = vi.fn<(id: string, opts: { userId: string | null }) => void>();
vi.mock("@/lib/analyses/first-analysis/dispatch", () => ({
  startAnalysisReportJob: (id: string, opts: { userId: string | null }) => startJobMock(id, opts),
}));

// G25-C — the free-allowance gate (its own rules are pinned in
// lib/reports/free-report-gate.test.ts); here it is a controllable double so
// the suite checks what the ROUTE does with each verdict.
type GateResult = import("@/lib/reports/free-report-gate").FreeReportGateResult;
const GRANT = { id: "grant-1", email_hash: "h", email: "founder@example.com", project_id: null, analysis_id: null, ip_hash: null, submitted_at: "2026-09-21T00:00:00.000Z", delivered_at: null, delivery_status: "queued" as const, sequence_no: 1 as const, source: "guest" as const };
const gateState: { result: GateResult } = { result: { allow: true, path: "free", email: "founder@example.com", source: "guest", grant: GRANT, queued: false, remaining: 1 } };
const gateMock = vi.fn<(ctx: Record<string, unknown>) => Promise<GateResult>>();
vi.mock("@/lib/reports/free-report-gate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/reports/free-report-gate")>("@/lib/reports/free-report-gate");
  return { ...actual, runFreeReportGate: (ctx: Record<string, unknown>) => gateMock(ctx) };
});
const attachMock = vi.fn<(g: string, a: string) => Promise<boolean>>();
const releaseMock = vi.fn<(g: string) => Promise<void>>();
vi.mock("@/lib/reports/free-grants", () => ({
  attachAnalysis: (g: string, a: string) => attachMock(g, a),
  releaseGrant: (g: string) => releaseMock(g),
}));
const freeSubmittedMock = vi.fn<(i: Record<string, unknown>) => void>();
const canAffordMock = vi.fn<(u: string, f: string) => Promise<{ allowed: boolean; balance: number; cost: number; reason?: string }>>();
const spendCreditsMock = vi.fn<(u: string, f: string, m?: Record<string, unknown>) => Promise<{ ok: boolean; balance: number }>>();
const grantCreditsMock = vi.fn<(u: string, a: number, r: string, m?: Record<string, unknown>) => Promise<{ ok: boolean; balance: number }>>();
const cancelQueuedMock = vi.fn<(id: string) => Promise<boolean>>();
vi.mock("@/lib/analyses/first-analysis/store", () => ({ cancelQueuedFullReport: (id: string) => cancelQueuedMock(id) }));
vi.mock("@/lib/credits", async () => {
  const actual = await vi.importActual<typeof import("@/lib/credits")>("@/lib/credits");
  return {
    ...actual,
    canAfford: (u: string, f: string) => canAffordMock(u, f),
    spendCredits: (u: string, f: string, m?: Record<string, unknown>) => spendCreditsMock(u, f, m),
    grantCredits: (u: string, a: number, r: string, m?: Record<string, unknown>) => grantCreditsMock(u, a, r, m),
  };
});

import { POST, dynamic, runtime } from "./route";

const RESULT = {
  inputKind: "idea_text",
  confidence: 0.7,
  rawText: "a marketplace for surplus concrete",
  structured: {},
  signals: {},
  classifierMode: "regex",
} as unknown as IntakeResult;

function req(body: unknown, opts?: { ip?: string; badJson?: boolean }): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts?.ip) headers["x-forwarded-for"] = opts.ip;
  // G25-C: a guest always sends the address the report goes to.
  const withEmail = body && typeof body === "object" ? { email: "founder@example.com", ...(body as Record<string, unknown>) } : body;
  return new Request("http://x/api/intake", {
    method: "POST",
    headers,
    body: opts?.badJson ? "{bad" : JSON.stringify(withEmail),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  analyzeInputMock.mockReset().mockResolvedValue(RESULT);
  getCurrentUserMock.mockReset().mockResolvedValue(null);
  ensureAnonKeyMock
    .mockReset()
    .mockResolvedValue({ key: "anon-key-000000000000000", issued: true });
  saveAnalysisMock.mockReset().mockResolvedValue("row-1");
  checkWriteLimitMock.mockReset().mockReturnValue({ allowed: true });
  countAnonRunsMock.mockReset().mockResolvedValue(0);
  checkAnonRunLimitMock.mockReset().mockReturnValue({ allowed: true });
  deriveMock.mockReset().mockReturnValue({ totalSVI: 118 });
  startJobMock.mockReset();
  countUserRunsMock.mockReset().mockResolvedValue(1);
  sviAnalyzeMock.mockReset();
  scoreComputedMock.mockReset();
  freeSubmittedMock.mockReset();
  attachMock.mockReset().mockResolvedValue(true);
  releaseMock.mockReset().mockResolvedValue(undefined);
  gateState.result = { allow: true, path: "free", email: "founder@example.com", source: "guest", grant: GRANT, queued: false, remaining: 1 };
  gateMock.mockReset().mockImplementation(async () => gateState.result);
  canAffordMock.mockReset().mockResolvedValue({ allowed: true, balance: 40, cost: 3 });
  spendCreditsMock.mockReset().mockResolvedValue({ ok: true, balance: 37 });
  grantCreditsMock.mockReset().mockResolvedValue({ ok: true, balance: 40 });
  cancelQueuedMock.mockReset().mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

// G16-A — the funnel's `svi_analyze` / `svi_score_computed` steps are emitted
// HERE (POST /api/intake is the founder's first analysis since S32), with
// `first` decided server-side and the qa-live-* e-mail forwarded for the flag.
describe("POST /api/intake — funnel events (G16-A)", () => {
  it("anonymous first run: svi_analyze first=true keyed on the anon session + svi_score_computed", async () => {
    countAnonRunsMock.mockResolvedValue(0);
    await POST(req({ text: "an idea" }));
    expect(sviAnalyzeMock).toHaveBeenCalledTimes(1);
    expect(sviAnalyzeMock.mock.calls[0][0]).toEqual({
      userId: null,
      email: null,
      projectId: "row-1",
      analysisId: "row-1",
      first: true,
      score: 118,
      sessionId: "anon-key-000000000000000",
    });
    expect(scoreComputedMock).toHaveBeenCalledTimes(1);
    expect(scoreComputedMock.mock.calls[0][0]).toMatchObject({ userId: null, projectId: "row-1", score: 118, slug: "row-1", analysisId: "row-1" });
  });

  it("anonymous repeat run (prior runs > 0, still allowed) is first=false", async () => {
    countAnonRunsMock.mockResolvedValue(1);
    await POST(req({ text: "an idea", tier: "paid", url: "https://example.com" }));
    expect(sviAnalyzeMock.mock.calls[0]?.[0]).toMatchObject({ first: false });
  });

  it("signed-in: first when the just-saved row is the user's only one; repeat otherwise; QA e-mail forwarded", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "qa-live-20260919-0415@blockid.au" } as never);
    countUserRunsMock.mockResolvedValue(1);
    await POST(req({ text: "an idea" }));
    expect(countUserRunsMock).toHaveBeenCalledWith("u1");
    expect(sviAnalyzeMock.mock.calls[0][0]).toMatchObject({ userId: "u1", email: "qa-live-20260919-0415@blockid.au", first: true });
    countUserRunsMock.mockResolvedValue(2);
    await POST(req({ text: "another idea" }));
    expect(sviAnalyzeMock.mock.calls[1][0]).toMatchObject({ userId: "u1", first: false });
  });

  it("an unsaved row still counts as an analysis but never a score; a throwing emitter never breaks the response", async () => {
    saveAnalysisMock.mockResolvedValue(null);
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "a@b.co" } as never);
    countUserRunsMock.mockResolvedValue(0);
    let res = await POST(req({ text: "an idea" }));
    expect(res.status).toBe(200);
    expect(sviAnalyzeMock.mock.calls[0][0]).toMatchObject({ projectId: null, analysisId: null, first: true });
    expect(scoreComputedMock).not.toHaveBeenCalled();
    sviAnalyzeMock.mockImplementation(() => {
      throw new Error("boom");
    });
    res = await POST(req({ text: "an idea" }));
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
  });

  it("no score → svi_analyze without score and no svi_score_computed", async () => {
    deriveMock.mockReturnValue(null);
    await POST(req({ text: "an idea" }));
    expect(sviAnalyzeMock.mock.calls[0][0]).toMatchObject({ score: undefined });
    expect(scoreComputedMock).not.toHaveBeenCalled();
  });

  it("nothing is emitted when the gate declines or the pipeline fails", async () => {
    gateState.result = { allow: false, status: 200, reason: "free_allowance_used", used: 2 };
    await POST(req({ text: "an idea" }));
    gateState.result = { allow: true, path: "free", email: "founder@example.com", source: "guest", grant: GRANT, queued: false, remaining: 1 };
    analyzeInputMock.mockRejectedValue(new Error("model down"));
    countAnonRunsMock.mockResolvedValue(0);
    await POST(req({ text: "an idea" }));
    expect(sviAnalyzeMock).not.toHaveBeenCalled();
    expect(scoreComputedMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/intake — module invariants", () => {
  it("runs on node and is never cached", () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
  });
});

// 2026-09-19: a deck over 25 MB used to die at nginx (1 MB default, bare
// HTML 413) and /analyze showed "Something went wrong". The route now owns
// the cap and answers a typed 413 the UI names; nothing is analysed or saved.
describe("POST /api/intake — file size cap", () => {
  const CAP = 25 * 1024 * 1024;

  it("multipart file over 25 MB → 413 file_too_large, no analysis, no row", async () => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(1)], "deck.pdf", { type: "application/pdf" }));
    form.set("tier", "free");
    const request = new Request("http://x/api/intake", { method: "POST", body: form });
    // The route buffers the raw body and sizes THAT (formData() is unreliable
    // on huge bodies) — hand it an over-cap buffer.
    request.arrayBuffer = async () => new ArrayBuffer(CAP + 128 * 1024);
    const res = await POST(request);
    const body = await json(res);
    expect(res.status).toBe(413);
    expect(body).toMatchObject({ ok: false, error: "file_too_large", max_bytes: CAP });
    expect(analyzeInputMock).not.toHaveBeenCalled();
    expect(saveAnalysisMock).not.toHaveBeenCalled();
  });

  it("a declared Content-Length over the cap → 413 before any body parsing", async () => {
    const request = new Request("http://x/api/intake", {
      method: "POST",
      headers: { "content-type": "multipart/form-data; boundary=x", "content-length": String(CAP + 1024 * 1024) },
      body: "--x--",
    });
    const res = await POST(request);
    expect(res.status).toBe(413);
    expect(await json(res)).toMatchObject({ ok: false, error: "file_too_large" });
    expect(analyzeInputMock).not.toHaveBeenCalled();
  });

  it("base64 file whose decoded size exceeds 25 MB → 413", async () => {
    const base64 = "A".repeat(Math.ceil(((CAP + 1024) * 4) / 3));
    const res = await POST(req({ file: { filename: "deck.pdf", base64, mimeType: "application/pdf" } }));
    expect(res.status).toBe(413);
    expect(analyzeInputMock).not.toHaveBeenCalled();
  });

  it("a small multipart file is analysed normally", async () => {
    const form = new FormData();
    form.set("file", new File([new Uint8Array(64)], "deck.pdf", { type: "application/pdf" }));
    const res = await POST(new Request("http://x/api/intake", { method: "POST", body: form }));
    expect(res.status).toBe(200);
    expect(analyzeInputMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/intake — analysis + persistence", () => {
  it("returns the analysis and the new row id", async () => {
    const res = await POST(req({ text: "an idea" }));
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.analysisId).toBe("row-1");
    expect(body.inputKind).toBe("idea_text");
  });

  it("S32-B: starts the full first-analysis job on the saved row, bound to the caller", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    await POST(req({ text: "an idea" }));
    expect(startJobMock).toHaveBeenCalledWith("row-1", { userId: "u1" });
  });

  it("S32-B: does not start a job when the row was not saved, and a throwing starter never breaks the response", async () => {
    saveAnalysisMock.mockResolvedValue(null);
    await POST(req({ text: "an idea" }));
    expect(startJobMock).not.toHaveBeenCalled();
    saveAnalysisMock.mockResolvedValue("row-1");
    startJobMock.mockImplementation(() => {
      throw new Error("boom");
    });
    const res = await POST(req({ text: "an idea" }));
    expect(res.status).toBe(200);
    expect((await json(res)).analysisId).toBe("row-1");
  });

  it("mints the anon cookie so the row has an owner", async () => {
    await POST(req({ text: "an idea" }));
    expect(ensureAnonKeyMock).toHaveBeenCalledTimes(1);
    expect(saveAnalysisMock.mock.calls[0][0].anonKey).toBe("anon-key-000000000000000");
  });

  it("attaches the session user when there is one", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    await POST(req({ text: "an idea" }));
    expect(saveAnalysisMock.mock.calls[0][0].userId).toBe("u1");
  });

  it("writes user_id null for an anonymous run", async () => {
    await POST(req({ text: "an idea" }));
    expect(saveAnalysisMock.mock.calls[0][0].userId).toBeNull();
  });

  it("persists the derived SVI alongside the intake result", async () => {
    await POST(req({ text: "an idea" }));
    expect(saveAnalysisMock.mock.calls[0][0].svi).toEqual({ totalSVI: 118 });
  });

  it("records the submitted url on the row", async () => {
    await POST(req({ url: "https://example.com" }));
    expect(saveAnalysisMock.mock.calls[0][0].url).toBe("https://example.com");
  });
});

describe("POST /api/intake — the write can never cost the founder the analysis", () => {
  it("returns the analysis with analysisId null when the insert fails", async () => {
    saveAnalysisMock.mockResolvedValue(null);
    const res = await POST(req({ text: "an idea" }));
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.analysisId).toBeNull();
    expect(body.inputKind).toBe("idea_text");
  });

  it("returns the analysis when saveAnalysis THROWS", async () => {
    saveAnalysisMock.mockRejectedValue(new Error("db exploded"));
    const res = await POST(req({ text: "an idea" }));
    expect(res.status).toBe(200);
    expect((await json(res)).analysisId).toBeNull();
  });

  it("returns the analysis when the cookie store is unavailable", async () => {
    ensureAnonKeyMock.mockRejectedValue(new Error("no request scope"));
    const res = await POST(req({ text: "an idea" }));
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
  });

  it("returns the analysis when the session lookup throws", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("session table down"));
    const res = await POST(req({ text: "an idea" }));
    expect(res.status).toBe(200);
    expect((await json(res)).analysisId).toBe("row-1");
  });
});

describe("POST /api/intake — write rate limit", () => {
  it("checks the limit against the anon key and the client IP", async () => {
    // Review v3.26.0 P3: the LAST hop (our proxy's peer), never the client-forgeable first entry.
    await POST(req({ text: "an idea" }, { ip: "9.9.9.9, 10.0.0.1" }));
    expect(checkWriteLimitMock).toHaveBeenCalledWith(
      "anon-key-000000000000000",
      "10.0.0.1",
    );
  });

  it("skips the write when rate-limited but STILL returns the analysis", async () => {
    checkWriteLimitMock.mockReturnValue({ allowed: false, reason: "anon" });
    const res = await POST(req({ text: "an idea" }));
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.analysisId).toBeNull();
    expect(saveAnalysisMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/intake — failure paths", () => {
  it("400s on an unparseable body and writes nothing", async () => {
    const res = await POST(req(null, { badJson: true }));
    expect(res.status).toBe(400);
    expect(saveAnalysisMock).not.toHaveBeenCalled();
  });

  it("500s when the analysis itself fails, and writes nothing", async () => {
    analyzeInputMock.mockRejectedValue(new Error("classifier down"));
    const res = await POST(req({ text: "an idea" }));
    expect(res.status).toBe(500);
    expect(saveAnalysisMock).not.toHaveBeenCalled();
  });
});

// ── Signup gate ──────────────────────────────────────────────────────────
//
// The gate's entire value is that it SPENDS NOTHING. Every assertion below
// that checks `analyzeInputMock` was not called is checking a real A$0.40-1.20
// of model spend that did not happen. If the gate ever moves below
// `analyzeInput`, or the client-side check becomes the only one, that money
// starts flowing again for visitors who have never paid us anything.
//
// The other half is the wall's shape: run 1 unwalled, the A$3 guest path
// untouched, and a signed-in caller never gated at all.
//
// G25-C (2026-09-21): the signup gate is replaced by the free-allowance gate
// — the address is required before every guest run, two reports per
// address are free, the third answers the A$3 quote. See the suite below.

describe("POST /api/intake — free-allowance gate (G25-C): what the route does with each verdict", () => {
  it("free path: runs, stamps the guest address on the row, attaches the grant, starts the job, answers freeReport", async () => {
    const res = await POST(req({ text: "an idea" }, { ip: "9.9.9.9" }));
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.freeReport).toEqual({ sequenceNo: 1, remaining: 1, queued: false, emailTo: "f******@example.com" });
    expect(analyzeInputMock).toHaveBeenCalledTimes(1);
    expect(saveAnalysisMock.mock.calls[0][0]).toMatchObject({ fullReportEmail: "founder@example.com", userId: null });
    expect(attachMock).toHaveBeenCalledWith("grant-1", "row-1");
    expect(releaseMock).not.toHaveBeenCalled();
    expect(startJobMock).toHaveBeenCalledWith("row-1", { userId: null });
    expect(freeSubmittedMock.mock.calls[0][0]).toMatchObject({ grantId: "grant-1", sequenceNo: 1, source: "guest", queued: false, analysisId: "row-1", email: "founder@example.com" });
  });

  it("hands the gate the body address, the honeypot and the client IP; tier=paid is NOT a bypass (review 2026-09-21)", async () => {
    await POST(req({ url: "https://example.com", tier: "paid", company_website: "" }, { ip: "9.9.9.9" }));
    expect(gateMock.mock.calls[0][0]).toEqual({ user: null, bodyEmail: "founder@example.com", honeypot: "", clientIp: "9.9.9.9" });
    // the same free path as any run: grant attached, job started
    expect(attachMock).toHaveBeenCalledWith("grant-1", "row-1");
    expect(startJobMock).toHaveBeenCalledTimes(1);
    gateMock.mockClear();
    gateState.result = { allow: false, status: 200, reason: "free_allowance_used", used: 2 };
    const body = await json(await POST(req({ url: "https://example.com", tier: "paid" })));
    expect(body.reason).toBe("free_allowance_used");
    expect(analyzeInputMock).toHaveBeenCalledTimes(1);
  });

  it("the anonymous run ceiling fires BEFORE the ledger is touched (a 429 never burns a free report)", async () => {
    checkAnonRunLimitMock.mockReturnValue({ allowed: false, reason: "hour" });
    const res = await POST(req({ text: "an idea" }, { ip: "9.9.9.9" }));
    expect(res.status).toBe(429);
    expect(gateMock).not.toHaveBeenCalled();
    expect(attachMock).not.toHaveBeenCalled();
    expect(releaseMock).not.toHaveBeenCalled();
  });

  it("a signed-in caller is handed to the gate with id, address and plan (the account's allowance)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "member@example.com", plan: "founder_free" } as never);
    gateState.result = { allow: true, path: "free", email: "member@example.com", source: "account", grant: { ...GRANT, source: "account" }, queued: false, remaining: 1 };
    await POST(req({ text: "an idea" }));
    expect(gateMock.mock.calls[0][0]).toMatchObject({ user: { id: "u1", email: "member@example.com", plan: "founder_free" } });
    // the account address is resolved at delivery — nothing stamped on the row
    expect(saveAnalysisMock.mock.calls[0][0]).toMatchObject({ fullReportEmail: null, userId: "u1" });
  });

  it("no address → 400 email_required, nothing analysed, nothing saved", async () => {
    gateState.result = { allow: false, status: 400, reason: "email_required" };
    const res = await POST(req({ text: "an idea" }));
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ ok: false, reason: "email_required", analysisId: null });
    expect(analyzeInputMock).not.toHaveBeenCalled();
    expect(saveAnalysisMock).not.toHaveBeenCalled();
  });

  it("disposable → 400 email_disposable; honeypot → 400 with the generic email_invalid (a bot learns nothing)", async () => {
    gateState.result = { allow: false, status: 400, reason: "email_disposable" };
    expect(await json(await POST(req({ text: "an idea" })))).toMatchObject({ reason: "email_disposable" });
    gateState.result = { allow: false, status: 400, reason: "honeypot" };
    const res = await POST(req({ text: "an idea" }));
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ reason: "email_invalid" });
  });

  it("third run → 200 free_allowance_used with the A$3 quote and the pay href; nothing runs", async () => {
    gateState.result = { allow: false, status: 200, reason: "free_allowance_used", used: 2 };
    const res = await POST(req({ text: "an idea" }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      ok: false,
      reason: "free_allowance_used",
      used: 2,
      price: { sku: "sku_trust_report_5aud", amount_cents: 300, label: "A$3 inc. GST" },
      next: "pay",
      payHref: "/workspace/reports/business",
      analysisId: null,
    });
    expect(analyzeInputMock).not.toHaveBeenCalled();
    expect(saveAnalysisMock).not.toHaveBeenCalled();
    expect(sviAnalyzeMock).not.toHaveBeenCalled();
  });

  it("IP guard → 429 free_ip_limit, nothing runs", async () => {
    gateState.result = { allow: false, status: 429, reason: "free_ip_limit" };
    const res = await POST(req({ text: "an idea" }));
    expect(res.status).toBe(429);
    expect(await json(res)).toMatchObject({ ok: false, reason: "free_ip_limit" });
    expect(analyzeInputMock).not.toHaveBeenCalled();
  });

  it("platform cap (queued) → the run is saved and recorded but NOT started; the response says queued", async () => {
    gateState.result = { allow: true, path: "free", email: "founder@example.com", source: "guest", grant: GRANT, queued: true, remaining: 1 };
    const body = await json(await POST(req({ text: "an idea" })));
    expect(body.ok).toBe(true);
    expect(body.freeReport).toMatchObject({ queued: true });
    expect(saveAnalysisMock).toHaveBeenCalledTimes(1);
    expect(attachMock).toHaveBeenCalledWith("grant-1", "row-1");
    expect(startJobMock).not.toHaveBeenCalled();
    expect(freeSubmittedMock.mock.calls[0][0]).toMatchObject({ queued: true });
  });

  it("an entitled member runs as before, no grant, no freeReport block", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1", email: "member@example.com", plan: "founder_starter" } as never);
    gateState.result = { allow: true, path: "entitled", email: "member@example.com", source: "account", grant: null, queued: false, remaining: 2 };
    const body = await json(await POST(req({ text: "an idea" })));
    expect(body.ok).toBe(true);
    expect(body.freeReport).toBeNull();
    expect(startJobMock).toHaveBeenCalledWith("row-1", { userId: "u1" });
    expect(freeSubmittedMock).not.toHaveBeenCalled();
  });

  it("a run that never saved gives its reservation back; a failed pipeline too", async () => {
    saveAnalysisMock.mockResolvedValue(null);
    await POST(req({ text: "an idea" }));
    expect(releaseMock).toHaveBeenCalledWith("grant-1");
    expect(attachMock).not.toHaveBeenCalled();
    releaseMock.mockClear();
    analyzeInputMock.mockRejectedValue(new Error("model down"));
    const res = await POST(req({ text: "an idea" }));
    expect(res.status).toBe(500);
    expect(releaseMock).toHaveBeenCalledWith("grant-1");
  });

  it("a ledger write that throws never breaks a good analysis", async () => {
    attachMock.mockRejectedValue(new Error("db"));
    const res = await POST(req({ text: "an idea" }));
    expect(res.status).toBe(200);
    expect((await json(res)).ok).toBe(true);
  });
});

// ── Anonymous run ceiling ────────────────────────────────────────────────
//
// The gate is keyed to a cookie; cookies can be cleared. Without this ceiling
// one person could loop "run #1" forever by clearing site data between runs,
// and every loop would be real model spend.

describe("POST /api/intake — anonymous run ceiling", () => {
  it("checks the client IP on the anonymous path", async () => {
    await POST(req({ text: "an idea" }, { ip: "9.9.9.9, 10.0.0.1" }));
    expect(checkAnonRunLimitMock).toHaveBeenCalledWith("10.0.0.1"); // last hop, not the forgeable first
  });

  it("429s WITHOUT invoking the pipeline once the ceiling is hit", async () => {
    checkAnonRunLimitMock.mockReturnValue({ allowed: false, reason: "hour" });
    const res = await POST(req({ text: "an idea" }, { ip: "9.9.9.9" }));
    expect(res.status).toBe(429);
    expect(analyzeInputMock).not.toHaveBeenCalled();
  });

  it("exempts a signed-in caller entirely", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    checkAnonRunLimitMock.mockReturnValue({ allowed: false, reason: "day" });
    const res = await POST(req({ text: "an idea" }, { ip: "9.9.9.9" }));
    expect(res.status).toBe(200);
    expect(checkAnonRunLimitMock).not.toHaveBeenCalled();
  });
});

// ── 2026-09-25: signed-in founder past the free allowance pays with credits ──
//
// Live bug: a signed-in founder who uploaded a deck after the two free reports
// was answered with the A$3 quote whose only CTA linked to the workspace
// report page — the upload was dropped and the OLD report was shown. The
// quote now carries the credit price of THIS input, and the same request
// re-sent with payWith=credits charges and runs it.

describe("POST /api/intake — credits after the free allowance", () => {
  const SIGNED_IN = { id: "u1", email: "founder@example.com", plan: "growth", role: "user" } as never;

  it("signed-in third run → the quote includes the credit price and balance; nothing is charged or run", async () => {
    getCurrentUserMock.mockResolvedValue(SIGNED_IN);
    gateState.result = { allow: false, status: 200, reason: "free_allowance_used", used: 2 };
    const res = await POST(req({ text: "an idea" }));
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({
      ok: false,
      reason: "free_allowance_used",
      credits: { feature: "trust_report", cost: 3, balance: 40, canAfford: true },
    });
    expect(canAffordMock).toHaveBeenCalledWith("u1", "trust_report");
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(analyzeInputMock).not.toHaveBeenCalled();
  });

  it("payWith=credits → charges trust_report once, runs, saves, starts the job, no free grant", async () => {
    getCurrentUserMock.mockResolvedValue(SIGNED_IN);
    gateState.result = { allow: false, status: 200, reason: "free_allowance_used", used: 2 };
    const res = await POST(req({ text: "an idea", payWith: "credits" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toMatchObject({ ok: true, analysisId: "row-1", freeReport: null, creditsCharged: 3 });
    expect(spendCreditsMock).toHaveBeenCalledTimes(1);
    expect(spendCreditsMock.mock.calls[0].slice(0, 2)).toEqual(["u1", "trust_report"]);
    // AF04: the debit is tagged with the saved row so a terminal failure can refund it.
    expect(spendCreditsMock.mock.calls[0][2]).toMatchObject({ channel: "analyze_intake", analysis_id: "row-1" });
    expect(analyzeInputMock).toHaveBeenCalledTimes(1);
    expect(startJobMock).toHaveBeenCalledWith("row-1", { userId: "u1" });
    expect(attachMock).not.toHaveBeenCalled();
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("payWith=credits with a short balance → 402 insufficient_credits, nothing charged or run", async () => {
    getCurrentUserMock.mockResolvedValue(SIGNED_IN);
    gateState.result = { allow: false, status: 200, reason: "free_allowance_used", used: 2 };
    canAffordMock.mockResolvedValue({ allowed: false, balance: 1, cost: 3, reason: "insufficient" });
    const res = await POST(req({ text: "an idea", payWith: "credits" }));
    expect(res.status).toBe(402);
    expect(await json(res)).toMatchObject({ ok: false, reason: "insufficient_credits", credits: { cost: 3, balance: 1, canAfford: false } });
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(analyzeInputMock).not.toHaveBeenCalled();
  });

  it("a debit that fails at spend time (race) → 402, the report job never starts, nothing charged", async () => {
    getCurrentUserMock.mockResolvedValue(SIGNED_IN);
    gateState.result = { allow: false, status: 200, reason: "free_allowance_used", used: 2 };
    spendCreditsMock.mockResolvedValue({ ok: false, balance: 2 });
    const res = await POST(req({ text: "an idea", payWith: "credits" }));
    expect(res.status).toBe(402);
    expect(await json(res)).toMatchObject({ reason: "insufficient_credits", credits: { balance: 2, canAfford: false } });
    expect(startJobMock).not.toHaveBeenCalled();
    // The saved row leaves the queue so the cron never writes it for free.
    expect(cancelQueuedMock).toHaveBeenCalledWith("row-1");
  });

  it("the analysis throws → nothing is charged (the debit only follows a saved run)", async () => {
    getCurrentUserMock.mockResolvedValue(SIGNED_IN);
    gateState.result = { allow: false, status: 200, reason: "free_allowance_used", used: 2 };
    analyzeInputMock.mockRejectedValue(new Error("boom"));
    const res = await POST(req({ text: "an idea", payWith: "credits" }));
    expect(res.status).toBe(500);
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("AF04: the row is not saved → nothing is charged, no job, no creditsCharged", async () => {
    getCurrentUserMock.mockResolvedValue(SIGNED_IN);
    gateState.result = { allow: false, status: 200, reason: "free_allowance_used", used: 2 };
    saveAnalysisMock.mockResolvedValue(null);
    const res = await POST(req({ text: "an idea", payWith: "credits" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toMatchObject({ ok: true, analysisId: null });
    expect(body).not.toHaveProperty("creditsCharged");
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(startJobMock).not.toHaveBeenCalled();
  });

  it("a guest can never pay with credits: payWith is ignored and the plain quote is returned", async () => {
    gateState.result = { allow: false, status: 200, reason: "free_allowance_used", used: 2 };
    const res = await POST(req({ text: "an idea", payWith: "credits" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toMatchObject({ ok: false, reason: "free_allowance_used" });
    expect(body).not.toHaveProperty("credits");
    expect(canAffordMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(analyzeInputMock).not.toHaveBeenCalled();
  });

  it("multipart uploads carry payWith too (the deck path the founder actually used)", async () => {
    getCurrentUserMock.mockResolvedValue(SIGNED_IN);
    gateState.result = { allow: false, status: 200, reason: "free_allowance_used", used: 2 };
    const form = new FormData();
    form.set("file", new File([Buffer.from("%PDF-1.4 deck")], "deck.pdf", { type: "application/pdf" }));
    form.set("tier", "free");
    form.set("payWith", "credits");
    const res = await POST(new Request("http://x/api/intake", { method: "POST", body: form }));
    expect(res.status).toBe(200);
    expect(spendCreditsMock).toHaveBeenCalledTimes(1);
    expect(analyzeInputMock).toHaveBeenCalledTimes(1);
  });

  it("the gate is told the caller's role (admin runs are staff QA)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "a1", email: "admin@blockid.au", plan: "growth", role: "admin" } as never);
    await POST(req({ text: "an idea" }));
    expect(gateMock.mock.calls[0][0]).toMatchObject({ user: { id: "a1", role: "admin" } });
  });
});
