// Colocated vitest for POST /api/analyses/[id]/free-summary.
//
// Four properties this route MUST hold, each of which is a real incident if
// it breaks:
//
//   1. ONCE. The claim is a conditional UPDATE in the store; the route's job
//      is to answer `already_sent` on a lost race and render NOTHING and send
//      NOTHING. A second click must not cost a PDF render or a second email.
//
//   2. NEVER TO AN UNSUBSCRIBED ADDRESS. Checked before the claim, so an
//      opted-out address does not consume the analysis's single send either.
//
//   3. TENANCY. Someone who does not own the run gets 404 — never 403, never
//      an email. Without this, a guessed uuid mails you somebody else's
//      analysis.
//
//   4. A FAILED SEND RELEASES THE CLAIM. Otherwise one SMTP hiccup silently
//      burns the founder's only free summary with no way to retry.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn<() => Promise<{ id: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const readAnonKeyMock = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/analyses/anon-key", () => ({
  readAnonKey: () => readAnonKeyMock(),
}));

const getMock = vi.fn<
  (
    id: string,
    v: { userId?: string | null; anonKey?: string | null },
  ) => Promise<Record<string, unknown> | null>
>();
const claimMock = vi.fn<
  (
    id: string,
    email: string,
  ) => Promise<{ outcome: "claimed" | "already_claimed" | "unavailable" }>
>();
const markSentMock = vi.fn<(id: string) => Promise<void>>();
const releaseMock = vi.fn<(id: string, reason: string) => Promise<void>>();
vi.mock("@/lib/analyses/store", () => ({
  getAnalysisForViewer: (id: string, v: Parameters<typeof getMock>[1]) =>
    getMock(id, v),
  claimSummarySend: (id: string, email: string) => claimMock(id, email),
  markSummarySent: (id: string) => markSentMock(id),
  releaseSummaryClaim: (id: string, reason: string) => releaseMock(id, reason),
}));

const canSendEmailMock = vi.fn<() => Promise<boolean>>();
vi.mock("@/lib/email-preferences", () => ({
  canSendEmail: () => canSendEmailMock(),
}));

const sendMock = vi.fn<
  (args: Record<string, unknown>) => Promise<
    { ok: true; id: string } | { ok: false; reason: string }
  >
>();
vi.mock("@/lib/email", () => ({
  sendFreeSummary: (args: Record<string, unknown>) => sendMock(args),
}));

const rateLimitMock = vi.fn<() => { allowed: boolean }>();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => rateLimitMock(),
}));

const renderMock = vi.fn<() => Promise<Buffer>>();
vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: () => renderMock(),
}));
vi.mock("@/lib/pdf/svi-summary-pdf", () => ({
  SVISummaryPDF: () => null,
}));

import { extractSignals } from "@/lib/svi-analysis";

import { POST, dynamic, maxDuration, runtime } from "./route";

const ID = "aaaaaaaa-1111-1111-1111-111111111111";

const SIGNALS = extractSignals({
  rawText:
    "Northwind Freight is an Australian logistics SaaS with two co-founders, " +
    "a live product, 40 paying customers and A$18k MRR.",
});

function analysisRow() {
  return {
    id: ID,
    intake: { signals: SIGNALS, rawText: "Northwind Freight logistics SaaS" },
  };
}

function req(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://blockid.au/api/analyses/x/free-summary", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(null);
  readAnonKeyMock.mockReset().mockResolvedValue("k".repeat(24));
  getMock.mockReset().mockResolvedValue(analysisRow());
  claimMock.mockReset().mockResolvedValue({ outcome: "claimed" });
  markSentMock.mockReset().mockResolvedValue(undefined);
  releaseMock.mockReset().mockResolvedValue(undefined);
  canSendEmailMock.mockReset().mockResolvedValue(true);
  sendMock.mockReset().mockResolvedValue({ ok: true, id: "msg-1" });
  rateLimitMock.mockReset().mockReturnValue({ allowed: true });
  renderMock.mockReset().mockResolvedValue(Buffer.from("%PDF-1.3 fake"));
});

describe("module invariants", () => {
  it("runs on node, is never cached, and has a bounded duration", () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBeGreaterThan(0);
  });
});

describe("the happy path", () => {
  it("sends the summary and stamps the row", async () => {
    const res = await POST(req({ email: "Founder@Example.com" }), ctx(ID));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.outcome).toBe("sent");
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(markSentMock).toHaveBeenCalledWith(ID);
    expect(releaseMock).not.toHaveBeenCalled();
  });

  it("lowercases the address before it reaches the claim or the sender", async () => {
    await POST(req({ email: "  Founder@Example.COM " }), ctx(ID));
    expect(claimMock).toHaveBeenCalledWith(ID, "founder@example.com");
    expect(sendMock.mock.calls[0][0].email).toBe("founder@example.com");
  });

  it("masks the address in the response rather than echoing it", async () => {
    const body = await json(
      await POST(req({ email: "founder@example.com" }), ctx(ID)),
    );
    expect(body.maskedEmail).not.toContain("founder@");
    expect(String(body.maskedEmail)).toContain("@example.com");
  });

  it("passes the run's real score and range to the sender", async () => {
    await POST(req({ email: "founder@example.com" }), ctx(ID));
    const args = sendMock.mock.calls[0][0];
    expect(typeof args.svi).toBe("number");
    expect(args.svi).toBeGreaterThan(0);
    expect(args.valuationLow).toBeLessThan(args.valuationHigh as number);
    expect(String(args.analysisUrl)).toContain(ID);
  });
});

describe("once, and only once", () => {
  it("answers already_sent on a lost claim and sends nothing", async () => {
    claimMock.mockResolvedValue({ outcome: "already_claimed" });
    const body = await json(
      await POST(req({ email: "founder@example.com" }), ctx(ID)),
    );
    expect(body.outcome).toBe("already_sent");
    // The whole point: no render, no mail, no second stamp.
    expect(renderMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
    expect(markSentMock).not.toHaveBeenCalled();
  });

  it("refuses to send when the claim could not be taken at all", async () => {
    // No claim means no duplicate protection. Not sending is the safe answer.
    claimMock.mockResolvedValue({ outcome: "unavailable" });
    const body = await json(
      await POST(req({ email: "founder@example.com" }), ctx(ID)),
    );
    expect(body.outcome).toBe("send_failed");
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("suppression", () => {
  it("never sends to an address that unsubscribed", async () => {
    canSendEmailMock.mockResolvedValue(false);
    const body = await json(
      await POST(req({ email: "founder@example.com" }), ctx(ID)),
    );
    expect(body.outcome).toBe("unsubscribed");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not burn the analysis's single send on a suppressed address", async () => {
    // Checked BEFORE the claim, so the founder can come back with another
    // address and still get their summary.
    canSendEmailMock.mockResolvedValue(false);
    await POST(req({ email: "founder@example.com" }), ctx(ID));
    expect(claimMock).not.toHaveBeenCalled();
  });
});

describe("tenancy", () => {
  it("404s a run the caller does not own, and sends nothing", async () => {
    getMock.mockResolvedValue(null);
    const res = await POST(req({ email: "founder@example.com" }), ctx(ID));
    expect(res.status).toBe(404);
    expect((await json(res)).outcome).toBe("not_found");
    expect(sendMock).not.toHaveBeenCalled();
    expect(claimMock).not.toHaveBeenCalled();
  });

  it("passes both identities to the store", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    readAnonKeyMock.mockResolvedValue("k".repeat(24));
    await POST(req({ email: "founder@example.com" }), ctx(ID));
    expect(getMock).toHaveBeenCalledWith(ID, {
      userId: "u1",
      anonKey: "k".repeat(24),
    });
  });

  it("404s a malformed id without touching anything", async () => {
    const res = await POST(req({ email: "founder@example.com" }), ctx("nope"));
    expect(res.status).toBe(404);
    expect(getMock).not.toHaveBeenCalled();
  });
});

describe("a failed send is retryable", () => {
  it("releases the claim when the provider refuses", async () => {
    sendMock.mockResolvedValue({ ok: false, reason: "send_error" });
    const body = await json(
      await POST(req({ email: "founder@example.com" }), ctx(ID)),
    );
    expect(body.outcome).toBe("send_failed");
    expect(releaseMock).toHaveBeenCalledWith(ID, "send_error");
    expect(markSentMock).not.toHaveBeenCalled();
  });

  it("releases the claim when the render throws", async () => {
    renderMock.mockRejectedValue(new Error("pdf blew up"));
    const body = await json(
      await POST(req({ email: "founder@example.com" }), ctx(ID)),
    );
    expect(body.outcome).toBe("send_failed");
    expect(releaseMock).toHaveBeenCalledWith(ID, "pdf blew up");
  });

  it("releases the claim when the stored run has nothing to score", async () => {
    getMock.mockResolvedValue({ id: ID, intake: {} });
    const body = await json(
      await POST(req({ email: "founder@example.com" }), ctx(ID)),
    );
    expect(body.outcome).toBe("send_failed");
    expect(releaseMock).toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("reports unsubscribed rather than failed when the sender's own check trips", async () => {
    sendMock.mockResolvedValue({ ok: false, reason: "unsubscribed" });
    const body = await json(
      await POST(req({ email: "founder@example.com" }), ctx(ID)),
    );
    expect(body.outcome).toBe("unsubscribed");
  });
});

describe("input handling", () => {
  it.each([
    [{ email: "nope" }, "no at sign"],
    [{ email: "" }, "empty"],
    [{}, "missing"],
    [{ email: 42 }, "not a string"],
  ])("rejects %j (%s) before doing any work", async (body) => {
    const res = await POST(req(body), ctx(ID));
    expect((await json(res)).outcome).toBe("invalid_email");
    expect(getMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const bad = new Request("https://blockid.au/x", {
      method: "POST",
      body: "not json",
    });
    expect((await json(await POST(bad, ctx(ID)))).outcome).toBe(
      "invalid_email",
    );
  });

  it("rate limits per IP and sends nothing when it trips", async () => {
    rateLimitMock.mockReturnValue({ allowed: false });
    const body = await json(
      await POST(
        req({ email: "founder@example.com" }, { "x-forwarded-for": "1.2.3.4" }),
        ctx(ID),
      ),
    );
    expect(body.outcome).toBe("rate_limited");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("does not rate limit when the client IP is unknown", async () => {
    await POST(req({ email: "founder@example.com" }), ctx(ID));
    expect(rateLimitMock).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalled();
  });
});
