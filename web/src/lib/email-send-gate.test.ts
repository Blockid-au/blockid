// G34-BT2 — sendEmail wiring: every send is logged (EM02), C-class passes the
// commercial gate (EM03/04/05) and carries RFC 8058 headers (EM06), and a
// hard bounce stops even transactional mail (EM04).

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const sendMailSpy = vi.fn(async () => ({ messageId: "smtp-1" }));
vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn(() => ({ sendMail: sendMailSpy })) } }));

const gateMock = vi.fn();
const suppressionMock = vi.fn();
const recordMock = vi.fn(async (_row: unknown) => {});
vi.mock("./email-sends", async (orig) => {
  const real = await orig<typeof import("./email-sends")>();
  return {
    ...real,
    commercialSendGate: (e: string, f: string) => gateMock(e, f),
    getSuppression: (e: string) => suppressionMock(e),
    recordEmailSend: (row: unknown) => recordMock(row),
  };
});

vi.mock("./email-preferences", () => ({
  ensureEmailPreferences: vi.fn(async () => "tok-9"),
  canSendEmail: vi.fn(async () => true),
  getUnsubscribeUrl: (t: string) => `https://blockid.au/unsubscribe?token=${t}`,
  getPreferencesUrl: (t: string) => `https://blockid.au/unsubscribe?token=${t}&manage=1`,
}));
vi.mock("./supabase", () => ({ getSupabaseAdmin: () => null }));

import { sendEmail } from "./email";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.SMTP_USER = "u";
  process.env.SMTP_PASS = "p";
  delete process.env.RESEND_API_KEY;
  delete process.env.NEXT_PUBLIC_SITE_URL;
  gateMock.mockResolvedValue({ ok: true });
  suppressionMock.mockResolvedValue({ readable: true, reason: null });
});

describe("sendEmail — C-class gate", () => {
  it("skips a commercial send the gate refuses, logs it blocked, never touches the transport", async () => {
    gateMock.mockResolvedValueOnce({ ok: false, reason: "frequency_capped", detail: "cap_day" });
    const r = await sendEmail({ to: "a@b.co", subject: "s", html: "<p/>", emailClass: "C", flow: "lead-nurture", template: "lead_d4" });
    expect(r).toEqual({ ok: false, reason: "frequency_capped" });
    expect(gateMock).toHaveBeenCalledWith("a@b.co", "lead-nurture");
    expect(sendMailSpy).not.toHaveBeenCalled();
    expect(recordMock).toHaveBeenCalledWith(
      expect.objectContaining({ emailClass: "C", flow: "lead-nurture", template: "lead_d4", status: "blocked:frequency_capped:cap_day" }),
    );
  });

  it("maps no_consent and suppression outcomes", async () => {
    gateMock.mockResolvedValueOnce({ ok: false, reason: "no_consent" });
    expect(await sendEmail({ to: "a@b.co", subject: "s", html: "x", emailClass: "C", flow: "f" })).toEqual({ ok: false, reason: "no_consent" });
    gateMock.mockResolvedValueOnce({ ok: false, reason: "suppression_unreadable" });
    expect(await sendEmail({ to: "a@b.co", subject: "s", html: "x", emailClass: "C", flow: "f" })).toEqual({ ok: false, reason: "suppressed" });
    expect(sendMailSpy).not.toHaveBeenCalled();
  });

  it("a passing C-class send carries the one-click List-Unsubscribe pair even with no caller URL", async () => {
    const r = await sendEmail({ to: "a@b.co", subject: "s", html: "x", emailClass: "C", flow: "digest", category: "weekly_reports" });
    expect(r).toEqual({ ok: true, id: "smtp-1" });
    const mail = (sendMailSpy.mock.calls[0] as unknown[])[0] as { headers: Record<string, string> };
    expect(mail.headers).toEqual({
      "List-Unsubscribe": "<https://blockid.au/api/unsubscribe?token=tok-9&category=weekly_reports>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(recordMock).toHaveBeenCalledWith(expect.objectContaining({ status: "sent", providerMessageId: "smtp-1", emailClass: "C" }));
  });

  it("an address-keyed body link is replaced in the header by the token one-click URL for C-class", async () => {
    await sendEmail({ to: "a@b.co", subject: "s", html: "x", emailClass: "C", flow: "drip", unsubscribeUrl: "https://blockid.au/unsubscribe?email=a%40b.co" });
    const mail = (sendMailSpy.mock.calls[0] as unknown[])[0] as { headers: Record<string, string> };
    expect(mail.headers["List-Unsubscribe"]).toBe("<https://blockid.au/api/unsubscribe?token=tok-9>");
  });
});

describe("sendEmail — T-class", () => {
  it("is never gated or capped, and is logged as T", async () => {
    const r = await sendEmail({ to: "a@b.co", subject: "Your report", html: "x", flow: "report-delivery" });
    expect(r.ok).toBe(true);
    expect(gateMock).not.toHaveBeenCalled();
    expect(recordMock).toHaveBeenCalledWith(expect.objectContaining({ emailClass: "T", flow: "report-delivery", status: "sent" }));
    const mail = (sendMailSpy.mock.calls[0] as unknown[])[0] as { headers: Record<string, string> };
    expect(mail.headers).toEqual({});
  });

  it("is stopped by a hard bounce but not by a complaint", async () => {
    suppressionMock.mockResolvedValueOnce({ readable: true, reason: "hard_bounce" });
    expect(await sendEmail({ to: "a@b.co", subject: "s", html: "x" })).toEqual({ ok: false, reason: "suppressed" });
    expect(sendMailSpy).not.toHaveBeenCalled();
    suppressionMock.mockResolvedValueOnce({ readable: true, reason: "complaint" });
    expect((await sendEmail({ to: "a@b.co", subject: "s", html: "x" })).ok).toBe(true);
  });

  it("still sends when suppression is unreadable (fail-open for transactional)", async () => {
    suppressionMock.mockResolvedValueOnce({ readable: false, reason: null });
    expect((await sendEmail({ to: "a@b.co", subject: "s", html: "x" })).ok).toBe(true);
  });

  it("a token-less unsubscribe link is advertised without the One-Click POST it cannot honour", async () => {
    await sendEmail({ to: "a@b.co", subject: "s", html: "x", unsubscribeUrl: "https://blockid.au/unsubscribe?email=a%40b.co" });
    const mail = (sendMailSpy.mock.calls[0] as unknown[])[0] as { headers: Record<string, string> };
    expect(mail.headers).toEqual({ "List-Unsubscribe": "<https://blockid.au/unsubscribe?email=a%40b.co>" });
  });
});

describe("sendEmail — Resend fallback carries the same headers", () => {
  it("passes List-Unsubscribe headers to the Resend API", async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    process.env.RESEND_API_KEY = "re_test";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "re-1" }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const r = await sendEmail({ to: "a@b.co", subject: "s", html: "x", emailClass: "C", flow: "digest" });
    expect(r).toEqual({ ok: true, id: "re-1" });
    const body = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    expect(body.headers).toEqual({
      "List-Unsubscribe": "<https://blockid.au/api/unsubscribe?token=tok-9>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(recordMock).toHaveBeenCalledWith(expect.objectContaining({ status: "sent", providerMessageId: "re-1" }));
    fetchSpy.mockRestore();
  });
});
