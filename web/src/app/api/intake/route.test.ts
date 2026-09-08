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
vi.mock("@/lib/analyses/store", () => ({
  saveAnalysis: (i: Record<string, unknown>) => saveAnalysisMock(i),
  checkAnalysisWriteLimit: (a: string, ip: string) => checkWriteLimitMock(a, ip),
}));

const deriveMock = vi.fn<() => unknown>();
vi.mock("@/lib/analyses/payload", () => ({
  deriveCompactSvi: () => deriveMock(),
}));

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
  return new Request("http://x/api/intake", {
    method: "POST",
    headers,
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
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
  deriveMock.mockReset().mockReturnValue({ totalSVI: 118 });
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("POST /api/intake — module invariants", () => {
  it("runs on node and is never cached", () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
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
    await POST(req({ text: "an idea" }, { ip: "9.9.9.9, 10.0.0.1" }));
    expect(checkWriteLimitMock).toHaveBeenCalledWith(
      "anon-key-000000000000000",
      "9.9.9.9",
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
