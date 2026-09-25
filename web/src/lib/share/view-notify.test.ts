// 2026-09-25 incident — every new origin e-mailed ~12 share owners "Your
// score was just viewed" because the deploy link-check HEADs every /s/* link
// on the candidate over 127.0.0.1. Pins: the request gate (HEAD / prefetch /
// loopback / automation UA), the recipient guard (typo + reserved domains)
// and the per-share 24 h dedupe that no longer depends on the viewer IP.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const sendMailSpy = vi.fn(async (_m: { to?: string; subject?: string }) => ({ messageId: "smtp-1" }));
vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn(() => ({ sendMail: sendMailSpy })) } }));

// In-memory `email_sends`: sendEmail logs into it, the dedupe reads it back.
interface SendRow { flow: string | null; template: string | null; status: string; created_at: string }
const sendLog: SendRow[] = [];
let logReadError = false;

vi.mock("@/lib/email-sends", async (orig) => {
  const real = await orig<typeof import("@/lib/email-sends")>();
  return {
    ...real,
    getSuppression: async () => ({ readable: true, reason: null }),
    recordEmailSend: async (r: { flow?: string | null; template?: string | null; status: string }) => {
      sendLog.push({ flow: r.flow ?? "unspecified", template: r.template ?? null, status: r.status, created_at: new Date().toISOString() });
    },
  };
});

const canSendEmailMock = vi.fn(async (_e: string, _c: string) => true);
vi.mock("@/lib/email-preferences", () => ({
  ensureEmailPreferences: vi.fn(async () => "tok-1"),
  canSendEmail: (e: string, c: string) => canSendEmailMock(e, c),
  getUnsubscribeUrl: (t: string) => `https://blockid.au/unsubscribe?token=${t}`,
  getPreferencesUrl: (t: string) => `https://blockid.au/unsubscribe?token=${t}&manage=1`,
}));

function fakeSupabase() {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let since = "";
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          filters[k] = v;
          return q;
        },
        gte: (_k: string, v: string) => {
          since = v;
          return q;
        },
        then: (resolve: (r: { count: number | null; error: unknown }) => unknown) => {
          if (table !== "email_sends" || logReadError) return resolve({ count: null, error: { message: "unreadable" } });
          const count = sendLog.filter(
            (r) => r.flow === filters.flow && r.template === filters.template && r.status === filters.status && r.created_at >= since,
          ).length;
          return resolve({ count, error: null });
        },
      };
      return q;
    },
  };
}
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => fakeSupabase(), isSupabaseConfigured: () => true }));

import {
  automatedShareViewReason,
  claimScoreViewNotification,
  isInternalIp,
  isNotifiableRecipient,
  resetScoreViewClaims,
  scoreViewedTemplate,
  SCORE_VIEWED_DEDUPE_MS,
} from "./view-notify";
import { sendScoreViewed } from "@/lib/email";

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const HEADLESS_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.6668.29 Safari/537.36";

/** A public visitor through Cloudflare → nginx → origin. */
function browserHeaders(extra: Record<string, string> = {}): Headers {
  return new Headers({
    "user-agent": CHROME_UA,
    "cf-connecting-ip": "203.0.113.7",
    "x-forwarded-for": "203.0.113.7, 172.70.1.1",
    "x-blockid-method": "GET",
    ...extra,
  });
}

/** What every share-page caller does: gate the request, then ask sendScoreViewed. */
async function simulateShareView(h: Headers, owner = "founder@startup.com.au", slug = "WJM57gf49KKf") {
  if (automatedShareViewReason(h)) return null;
  return sendScoreViewed({ to: owner, slug, companyName: "Acme" });
}

function scoreViewedMails(): number {
  return sendMailSpy.mock.calls.filter(([m]) => m?.subject === "Your score was just viewed").length;
}

beforeEach(() => {
  vi.clearAllMocks();
  sendLog.length = 0;
  logReadError = false;
  resetScoreViewClaims();
  canSendEmailMock.mockResolvedValue(true);
  process.env.SMTP_USER = "u";
  process.env.SMTP_PASS = "p";
  delete process.env.RESEND_API_KEY;
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("automatedShareViewReason — which requests are not human views", () => {
  it("a genuine browser GET through the edge is a view", () => {
    expect(automatedShareViewReason(browserHeaders())).toBeNull();
    // nginx-only (no Cloudflare): the last X-Forwarded-For hop is the client.
    expect(
      automatedShareViewReason(new Headers({ "user-agent": CHROME_UA, "x-forwarded-for": "198.51.100.4" })),
    ).toBeNull();
  });

  it("HEAD (deploy link-check probes /s/* with HEAD) is not a view", () => {
    expect(automatedShareViewReason(browserHeaders({ "x-blockid-method": "HEAD" }))).toBe("head");
  });

  it("prefetch requests are not views", () => {
    expect(automatedShareViewReason(browserHeaders({ "next-router-prefetch": "1", rsc: "1" }))).toBe("prefetch");
    expect(automatedShareViewReason(browserHeaders({ purpose: "prefetch" }))).toBe("prefetch");
    expect(automatedShareViewReason(browserHeaders({ "sec-purpose": "prefetch;prerender" }))).toBe("prefetch");
    expect(automatedShareViewReason(browserHeaders({ "next-router-segment-prefetch": "/_tree" }))).toBe("prefetch");
  });

  it("loopback / no forwarded client IP (deploy smoke, link-check, warm-up on 127.0.0.1) is not a view", () => {
    expect(automatedShareViewReason(new Headers({ "user-agent": CHROME_UA }))).toBe("no_client_ip");
    expect(automatedShareViewReason(new Headers({ "user-agent": CHROME_UA, "x-forwarded-for": "127.0.0.1" }))).toBe("internal_ip");
    expect(automatedShareViewReason(new Headers({ "user-agent": CHROME_UA, "x-forwarded-for": "::ffff:127.0.0.1" }))).toBe("internal_ip");
    expect(automatedShareViewReason(new Headers({ "user-agent": CHROME_UA, "x-forwarded-for": "::1" }))).toBe("internal_ip");
    expect(automatedShareViewReason(new Headers({ "user-agent": CHROME_UA, "x-real-ip": "10.0.0.5" }))).toBe("internal_ip");
  });

  it("headless / automation / non-browser user agents are not views", () => {
    for (const ua of [
      HEADLESS_UA,
      "BlockID-LinkCheck/1.0",
      "curl/8.5.0",
      "node",
      "undici",
      "python-requests/2.32.3",
      "Go-http-client/1.1",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Playwright/1.48",
      "facebookexternalhit/1.1",
      "",
    ]) {
      expect(automatedShareViewReason(browserHeaders({ "user-agent": ua })), ua).toBe("automation_ua");
    }
  });

  it("isInternalIp covers loopback, RFC 1918, link-local and ULA", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.1.1", "::1", "fd00::1", "fe80::1", "garbage"]) {
      expect(isInternalIp(ip), ip).toBe(true);
    }
    for (const ip of ["203.0.113.7", "172.32.0.1", "8.8.8.8", "2001:db8::1"]) expect(isInternalIp(ip), ip).toBe(false);
  });
});

describe("isNotifiableRecipient — never e-mail typo or reserved domains", () => {
  it("rejects the incident's addresses", () => {
    expect(isNotifiableRecipient("hoangmanhcuong2307@gmail.con")).toBe(false);
    expect(isNotifiableRecipient("burst-test@example.com")).toBe(false);
    expect(isNotifiableRecipient("burst-test2@example.com")).toBe(false);
  });

  it("rejects reserved / typo / disposable / malformed addresses", () => {
    for (const e of ["a@example.org", "a@sub.example.net", "a@foo.test", "a@x.invalid", "a@localhost", "a@gmial.com", "a@gmail.co", "a@hotmail.cmo", "a@mailinator.com", "not-an-email", "a@b", null]) {
      expect(isNotifiableRecipient(e), String(e)).toBe(false);
    }
  });

  it("accepts real-looking addresses", () => {
    for (const e of ["founder@startup.com.au", "Opal.Kate6681@Gmail.com", "admin@blockid.au", "hello@zenyatech.com.au"]) {
      expect(isNotifiableRecipient(e), e).toBe(true);
    }
  });
});

describe("claimScoreViewNotification — per share, per 24 h, regardless of IP", () => {
  it("claims once, then refuses in-process for 24 h", async () => {
    const t = scoreViewedTemplate("abc");
    const now = Date.now();
    expect(await claimScoreViewNotification(t, now)).toBe(true);
    expect(await claimScoreViewNotification(t, now + 60_000)).toBe(false);
    expect(await claimScoreViewNotification(scoreViewedTemplate("other"), now)).toBe(true);
  });

  it("refuses when another origin already sent one in the last 24 h (email_sends)", async () => {
    const t = scoreViewedTemplate("abc");
    sendLog.push({ flow: "score-viewed", template: t, status: "sent", created_at: new Date().toISOString() });
    expect(await claimScoreViewNotification(t)).toBe(false);
  });

  it("allows again after 24 h", async () => {
    const t = scoreViewedTemplate("abc");
    const now = Date.now();
    expect(await claimScoreViewNotification(t, now)).toBe(true);
    expect(await claimScoreViewNotification(t, now + SCORE_VIEWED_DEDUPE_MS + 1)).toBe(true);
  });

  it("fails closed when the send log is unreadable", async () => {
    logReadError = true;
    expect(await claimScoreViewNotification(scoreViewedTemplate("abc"))).toBe(false);
  });

  it("keys identified viewers separately without writing the link token", () => {
    const t = scoreViewedTemplate("abc", "secret-token-123");
    expect(t).toMatch(/^score-viewed:abc:[0-9a-f]{16}$/);
    expect(t).not.toContain("secret-token-123");
    expect(t).not.toBe(scoreViewedTemplate("abc", "another-token"));
  });
});

describe("share view → owner e-mail (end to end through sendScoreViewed)", () => {
  it("prefetch → no e-mail", async () => {
    await simulateShareView(browserHeaders({ "next-router-prefetch": "1" }));
    expect(scoreViewedMails()).toBe(0);
  });

  it("loopback / no X-Forwarded-For (deploy link-check HEAD) → no e-mail", async () => {
    await simulateShareView(new Headers({ "user-agent": "BlockID-LinkCheck/1.0", "x-blockid-method": "HEAD" }));
    await simulateShareView(new Headers({ "user-agent": CHROME_UA }));
    await simulateShareView(new Headers({ "user-agent": CHROME_UA, "x-forwarded-for": "127.0.0.1" }));
    expect(scoreViewedMails()).toBe(0);
  });

  it("HeadlessChrome UA → no e-mail", async () => {
    await simulateShareView(browserHeaders({ "user-agent": HEADLESS_UA }));
    expect(scoreViewedMails()).toBe(0);
  });

  it("genuine browser view → exactly one e-mail, logged under the score-viewed flow", async () => {
    const r = await simulateShareView(browserHeaders());
    expect(r).toMatchObject({ ok: true });
    expect(scoreViewedMails()).toBe(1);
    expect(sendMailSpy.mock.calls[0][0].to).toBe("founder@startup.com.au");
    expect(sendLog).toEqual([expect.objectContaining({ flow: "score-viewed", template: "score-viewed:WJM57gf49KKf", status: "sent" })]);
  });

  it("second view the same day, from a different IP → no second e-mail", async () => {
    await simulateShareView(browserHeaders());
    const r = await simulateShareView(browserHeaders({ "cf-connecting-ip": "198.51.100.99", "x-forwarded-for": "198.51.100.99" }));
    expect(r).toEqual({ ok: false, reason: "frequency_capped" });
    expect(scoreViewedMails()).toBe(1);
  });

  it("a fresh origin (empty in-process memo) still honours the send log", async () => {
    await simulateShareView(browserHeaders());
    resetScoreViewClaims(); // new process after a deploy
    await simulateShareView(browserHeaders());
    expect(scoreViewedMails()).toBe(1);
  });

  it("typo / example.com owners → no e-mail even for a genuine view", async () => {
    expect(await simulateShareView(browserHeaders(), "hoangmanhcuong2307@gmail.con", "G5upsFMCJVgo")).toEqual({ ok: false, reason: "suppressed" });
    expect(await simulateShareView(browserHeaders(), "burst-test@example.com", "LnaJndy9YXaH")).toEqual({ ok: false, reason: "suppressed" });
    expect(scoreViewedMails()).toBe(0);
    expect(canSendEmailMock).not.toHaveBeenCalled();
  });
});
