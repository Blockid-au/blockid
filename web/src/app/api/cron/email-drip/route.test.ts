// Colocated vitest for /api/cron/email-drip — the onboarding + NPS drip worker.
//
// The route is the only mailer that fires the 5-touch CCSO onboarding sequence
// (D1 / D3 / D7 / D14 tips + D30 NPS) after a founder's first SVI report. Silent
// regressions this suite pins against:
//
//   (a) losing `export const dynamic = "force-dynamic"` — a static build would
//       freeze the "considered:0 sent:0" envelope at compile time and the two
//       DB writes (markSent / markFailed) would never fire in production;
//   (b) losing the CRON_SECRET auth gate — an unauth request would leak
//       queue depth + failure reasons and, worse, actually send email;
//   (c) breaking the POST↔GET parity — both verbs must delegate to the same
//       handle() so the server crontab can pick either shell (POST retryable,
//       GET as a health-check);
//   (d) regressing the BATCH_LIMIT=50 cap that protects the mail transport
//       from queue-of-doom incidents when a backfill lands a huge batch;
//   (e) branch drift on the send outcome — an `ok: true` result MUST call
//       markSent (not markFailed) and count toward `sent`; `ok: false` MUST
//       call markFailed with the reason and count toward `failed`; a thrown
//       exception MUST also call markFailed (drips never re-queue silently);
//   (f) the failures[] envelope truncation to 5 (unbounded failures would
//       balloon the JSONL log and OOM the crontab wrapper);
//   (g) the unsubscribe URL formatting — every send MUST carry an unsubscribe
//       link keyed on the recipient's URL-encoded email so CAN-SPAM / Spam Act
//       (Cth) compliance holds;
//   (h) skipping renderDripBody for the drip's own campaign — a drift where
//       every recipient gets the same body regardless of campaign would ship
//       a D14 pricing pitch to a D1 recipient.
//
// Mocks `@/lib/email` (sendEmail) and `@/lib/email-drip` (dueDrips, markSent,
// markFailed, renderDripBody). The renderer is stubbed to return a per-campaign
// tag so we can prove the route routes the campaign string through untouched.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const sendEmailMock = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (args: Parameters<typeof sendEmailMock>[0]) => sendEmailMock(args),
}));

const dueDripsMock = vi.fn();
const markSentMock = vi.fn();
const markFailedMock = vi.fn();
const renderDripBodyMock = vi.fn();
vi.mock("@/lib/email-drip", () => ({
  dueDrips: (...args: unknown[]) => dueDripsMock(...args),
  markSent: (...args: unknown[]) => markSentMock(...args),
  markFailed: (...args: unknown[]) => markFailedMock(...args),
  renderDripBody: (...args: unknown[]) => renderDripBodyMock(...args),
}));

import * as routeModule from "./route";
import { GET, POST } from "./route";

const SECRET = "cron-secret-drip-value";

type DripRow = {
  id: string;
  email: string;
  campaign: string;
  payload: Record<string, unknown> | null;
};

function drip(overrides: Partial<DripRow> = {}): DripRow {
  return {
    id: "drip-1",
    email: "founder@example.com",
    campaign: "onboarding_d1",
    payload: { weakestDim: "traction", weakestScore: 42, sector: "fintech" },
    ...overrides,
  };
}

function req(method: "GET" | "POST" = "POST", headers: Record<string, string> = {}) {
  return new Request("http://x/api/cron/email-drip", { method, headers });
}

beforeEach(() => {
  sendEmailMock.mockReset();
  dueDripsMock.mockReset();
  markSentMock.mockReset();
  markFailedMock.mockReset();
  renderDripBodyMock.mockReset();

  dueDripsMock.mockResolvedValue([]);
  markSentMock.mockResolvedValue(undefined);
  markFailedMock.mockResolvedValue(undefined);
  renderDripBodyMock.mockImplementation((campaign: string) => ({
    subject: `subj:${campaign}`,
    html: `<p>html:${campaign}</p>`,
    text: `text:${campaign}`,
  }));
  sendEmailMock.mockResolvedValue({ ok: true });

  process.env.CRON_SECRET = SECRET;
  process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
});

describe("/api/cron/email-drip — route module shape", () => {
  it("pins `export const dynamic = 'force-dynamic'` so the two DB writes always fire", () => {
    expect((routeModule as { dynamic?: string }).dynamic).toBe("force-dynamic");
  });

  it("pins `export const maxDuration = 60` so the crontab wrapper does not kill mid-batch", () => {
    expect((routeModule as { maxDuration?: number }).maxDuration).toBe(60);
  });
});

describe("POST /api/cron/email-drip — auth gate", () => {
  it("returns 401 when no Authorization header is sent", async () => {
    const res = await POST(req("POST"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "Unauthorized" });
    expect(dueDripsMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the bearer token is wrong", async () => {
    const res = await POST(req("POST", { authorization: "Bearer nope" }));
    expect(res.status).toBe(401);
    expect(dueDripsMock).not.toHaveBeenCalled();
  });

  it("fails closed with 401 when CRON_SECRET env var is unset", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(401);
    expect(dueDripsMock).not.toHaveBeenCalled();
  });

  it("fails closed with 401 when CRON_SECRET is an empty string (bare 'Bearer ' header)", async () => {
    process.env.CRON_SECRET = "";
    const res = await POST(req("POST", { authorization: "Bearer " }));
    expect(res.status).toBe(401);
    expect(dueDripsMock).not.toHaveBeenCalled();
  });

  it("is case-sensitive — 'bearer' with a lowercase b is not accepted", async () => {
    const res = await POST(req("POST", { authorization: `bearer ${SECRET}` }));
    expect(res.status).toBe(401);
    expect(dueDripsMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/cron/email-drip — empty queue", () => {
  it("returns 200 with considered:0 / sent:0 / failed:0 / cap:50 when nothing is due", async () => {
    dueDripsMock.mockResolvedValueOnce([]);
    const res = await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      considered: 0,
      sent: 0,
      failed: 0,
      cap: 50,
      failures: [],
    });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(markSentMock).not.toHaveBeenCalled();
    expect(markFailedMock).not.toHaveBeenCalled();
  });

  it("passes BATCH_LIMIT=50 as the second argument to dueDrips(now, limit)", async () => {
    await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    expect(dueDripsMock).toHaveBeenCalledTimes(1);
    const [nowArg, limitArg] = dueDripsMock.mock.calls[0];
    expect(nowArg).toBeInstanceOf(Date);
    expect(limitArg).toBe(50);
  });
});

describe("POST /api/cron/email-drip — happy path", () => {
  it("marks the drip sent and increments the sent counter when sendEmail returns ok:true", async () => {
    dueDripsMock.mockResolvedValueOnce([drip({ id: "d-ok" })]);
    const res = await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, considered: 1, sent: 1, failed: 0, failures: [] });
    expect(markSentMock).toHaveBeenCalledWith("d-ok");
    expect(markFailedMock).not.toHaveBeenCalled();
  });

  it("routes each drip's campaign through renderDripBody untouched (no drift across campaigns)", async () => {
    dueDripsMock.mockResolvedValueOnce([
      drip({ id: "a", campaign: "onboarding_d1", email: "a@x.io" }),
      drip({ id: "b", campaign: "onboarding_d14", email: "b@x.io" }),
      drip({ id: "c", campaign: "nps_d30", email: "c@x.io", payload: { npsToken: "tok" } }),
    ]);
    await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    expect(renderDripBodyMock.mock.calls.map((c) => c[0])).toEqual([
      "onboarding_d1",
      "onboarding_d14",
      "nps_d30",
    ]);
    expect(renderDripBodyMock.mock.calls[0][1]).toBe("a@x.io");
    expect(renderDripBodyMock.mock.calls[2][2]).toEqual({ npsToken: "tok" });
  });

  it("attaches a per-recipient unsubscribe URL with URL-encoded email", async () => {
    dueDripsMock.mockResolvedValueOnce([drip({ email: "founder+tag@example.com" })]);
    await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const args = sendEmailMock.mock.calls[0][0];
    expect(args.unsubscribeUrl).toBe(
      "https://blockid.au/unsubscribe?email=founder%2Btag%40example.com",
    );
    expect(args.to).toBe("founder+tag@example.com");
    expect(args.subject).toBe("subj:onboarding_d1");
    expect(args.html).toBe("<p>html:onboarding_d1</p>");
  });

  it("normalises a trailing slash on NEXT_PUBLIC_SITE_URL before building the unsubscribe URL", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au/";
    dueDripsMock.mockResolvedValueOnce([drip()]);
    await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    const args = sendEmailMock.mock.calls[0][0];
    expect(args.unsubscribeUrl).toBe(
      "https://blockid.au/unsubscribe?email=founder%40example.com",
    );
  });

  it("defaults site origin to https://blockid.au when NEXT_PUBLIC_SITE_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    dueDripsMock.mockResolvedValueOnce([drip()]);
    await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    const args = sendEmailMock.mock.calls[0][0];
    expect(args.unsubscribeUrl).toBe(
      "https://blockid.au/unsubscribe?email=founder%40example.com",
    );
  });

  it("passes an empty payload through as {} when the drip row payload is null", async () => {
    dueDripsMock.mockResolvedValueOnce([drip({ payload: null })]);
    await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    expect(renderDripBodyMock).toHaveBeenCalledWith("onboarding_d1", "founder@example.com", {});
  });
});

describe("POST /api/cron/email-drip — send failure branches", () => {
  it("marks the drip failed with the transport reason when sendEmail returns ok:false", async () => {
    sendEmailMock.mockResolvedValueOnce({ ok: false, reason: "smtp 421" });
    dueDripsMock.mockResolvedValueOnce([drip({ id: "d-fail", campaign: "onboarding_d3" })]);
    const res = await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, considered: 1, sent: 0, failed: 1 });
    expect(markSentMock).not.toHaveBeenCalled();
    expect(markFailedMock).toHaveBeenCalledWith("d-fail", "send failed: smtp 421");
    expect(body.failures).toEqual(["onboarding_d3:smtp 421"]);
  });

  it("marks the drip failed with the caught exception message when sendEmail throws", async () => {
    sendEmailMock.mockRejectedValueOnce(new Error("network reset"));
    dueDripsMock.mockResolvedValueOnce([drip({ id: "d-boom", campaign: "onboarding_d7" })]);
    const res = await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body).toMatchObject({ considered: 1, sent: 0, failed: 1 });
    expect(markFailedMock).toHaveBeenCalledWith("d-boom", "network reset");
    expect(body.failures).toEqual(["onboarding_d7:network reset"]);
  });

  it("stringifies non-Error throws before persisting to markFailed", async () => {
    sendEmailMock.mockImplementationOnce(() => {
      throw "raw-string-thrown";
    });
    dueDripsMock.mockResolvedValueOnce([drip({ id: "d-str" })]);
    const res = await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(markFailedMock).toHaveBeenCalledWith("d-str", "raw-string-thrown");
    expect(body.failed).toBe(1);
  });

  it("continues the batch after a single failure — subsequent drips still send", async () => {
    sendEmailMock
      .mockResolvedValueOnce({ ok: false, reason: "bounce" })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    dueDripsMock.mockResolvedValueOnce([
      drip({ id: "d-1", campaign: "onboarding_d1" }),
      drip({ id: "d-2", campaign: "onboarding_d3" }),
      drip({ id: "d-3", campaign: "onboarding_d7" }),
    ]);
    const res = await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body).toMatchObject({ considered: 3, sent: 2, failed: 1 });
    expect(markSentMock.mock.calls.map((c) => c[0])).toEqual(["d-2", "d-3"]);
    expect(markFailedMock).toHaveBeenCalledWith("d-1", "send failed: bounce");
  });

  it("caps the failures[] envelope at 5 entries even when every drip in a batch fails", async () => {
    sendEmailMock.mockResolvedValue({ ok: false, reason: "denied" });
    dueDripsMock.mockResolvedValueOnce(
      Array.from({ length: 8 }, (_, i) => drip({ id: `d-${i}`, campaign: "onboarding_d1" })),
    );
    const res = await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body).toMatchObject({ considered: 8, sent: 0, failed: 8 });
    expect(body.failures).toHaveLength(5);
    expect(body.failures.every((f: string) => f === "onboarding_d1:denied")).toBe(true);
  });
});

describe("POST /api/cron/email-drip — envelope contract", () => {
  it("envelope carries exactly {ok,considered,sent,failed,cap,failures} — no drift", async () => {
    dueDripsMock.mockResolvedValueOnce([drip()]);
    const res = await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ["cap", "considered", "failed", "failures", "ok", "sent"].sort(),
    );
  });

  it("Content-Type is application/json", async () => {
    const res = await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    expect(res.headers.get("content-type") ?? "").toMatch(/application\/json/);
  });
});

describe("GET /api/cron/email-drip — parity with POST", () => {
  it("GET is the same handle() — 401 without auth", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(401);
    expect(dueDripsMock).not.toHaveBeenCalled();
  });

  it("GET returns the same 200 envelope shape as POST when authorised", async () => {
    const g = await GET(req("GET", { authorization: `Bearer ${SECRET}` }));
    const p = await POST(req("POST", { authorization: `Bearer ${SECRET}` }));
    expect(g.status).toBe(200);
    expect(p.status).toBe(200);
    const gBody = await g.json();
    const pBody = await p.json();
    expect(Object.keys(gBody).sort()).toEqual(Object.keys(pBody).sort());
    expect(gBody.cap).toBe(pBody.cap);
    expect(gBody.cap).toBe(50);
  });
});
