import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tradingAsLine } from "@/lib/site/legal-entity";

// Colocated vitest for the previously-untested server-only `email.ts` — the
// BlockID email wrapper that fronts every user-facing message: magic-link,
// welcome, SVI report (with PDF), payment receipts, nurture drips, milestone
// alerts, low-credit, unsubscribe farewell, reseller wholesale welcome, and
// dozens more. It brokers between two providers (Gmail SMTP via Nodemailer,
// Resend HTTP fallback) and stamps List-Unsubscribe / One-Click headers to
// keep the domain compliant with Gmail's bulk-sender guidelines + Spam Act
// 2003 s16 consent obligations.
//
// A silent regression here can:
//   (a) leak an unsubscribed founder back into a nurture cohort (Spam Act
//       s16 breach) — pinned by the `canSendEmail=false → unsubscribed`
//       short-circuit tests below;
//   (b) drop the `List-Unsubscribe` header (Gmail bulk-sender penalty) —
//       pinned by the SMTP-headers test;
//   (c) send transactional password-reset / magic-link through the marketing
//       gate (locking founders out) — pinned by the `sendMagicLink` +
//       `sendPasswordReset` tests that assert `canSendEmail` was NEVER
//       consulted;
//   (d) fail-open when both providers are unconfigured (silently believe
//       the send succeeded) — pinned by the `not_configured` return test.
//
// The mock harness mirrors `email-preferences.test.ts`:
//   - `vi.mock("server-only", () => ({}))` so the "server-only" guard doesn't
//     abort module load.
//   - `nodemailer.createTransport` returns a captured-args `sendMail` spy
//     whose next-call behaviour (resolve or reject) is set per test.
//   - `global.fetch` is spied for the Resend HTTP path.
//   - `./email-preferences` is fully stubbed so we can flip `canSendEmail`
//     between `true` and `false` per test.
//   - `./supabase`, `./auth`, all three `./reseller/*` helpers, and the two
//     PDF deps are stubbed with lightweight fakes so the module loads in
//     isolation.
//   - `vi.resetModules()` runs per-test so the module-load-time constants
//     (`FROM_DEFAULT`, `siteUrl`) re-evaluate against the fresh env each
//     time.

// ---------------------------------------------------------------------------
// Mock harness
// ---------------------------------------------------------------------------

interface SentMailArgs {
  from?: string;
  to?: string;
  subject?: string;
  html?: string;
  headers?: Record<string, string>;
  attachments?: Array<{ filename: string; content: Buffer | Uint8Array; contentType?: string }>;
}

const sendMailSpy: ReturnType<typeof vi.fn> = vi.fn();
const createTransportSpy = vi.fn(() => ({ sendMail: sendMailSpy }));

vi.mock("server-only", () => ({}));

vi.mock("nodemailer", () => ({
  default: { createTransport: createTransportSpy },
}));

const canSendEmailMock: ReturnType<typeof vi.fn> = vi.fn();
const ensureEmailPreferencesMock: ReturnType<typeof vi.fn> = vi.fn();

vi.mock("./email-preferences", () => ({
  canSendEmail: (email: string, cat: string) =>
    (canSendEmailMock as unknown as (e: string, c: string) => Promise<boolean>)(email, cat),
  ensureEmailPreferences: (email: string) =>
    (ensureEmailPreferencesMock as unknown as (e: string) => Promise<string>)(email),
  getUnsubscribeUrl: (tok: string) => `https://blockid.au/unsubscribe?token=${tok}`,
  getPreferencesUrl: (tok: string) => `https://blockid.au/unsubscribe?token=${tok}&manage=1`,
}));

vi.mock("./auth", () => ({ ADMIN_EMAIL: "admin@blockid.au" }));

vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => null,
}));

vi.mock("./reseller/email-footer", () => ({
  resellerFooterHtml: (name: string | null) =>
    name ? `<div class="reseller-footer">${name}</div>` : "",
}));

vi.mock("./reseller/email-attribution", () => ({
  resolveResellerDisplayNameByEmail: vi.fn().mockResolvedValue(null),
}));

vi.mock("./reseller/wholesale-welcome-email", () => ({
  buildWholesaleWelcomeEmail: vi.fn((args: { companyName: string; locale?: string }) => ({
    subject: `Wholesale Welcome ${args.companyName}`,
    html: `<div>Welcome ${args.companyName} (locale=${args.locale ?? "en"})</div>`,
  })),
}));

vi.mock("@react-pdf/renderer", () => ({
  renderToBuffer: vi.fn().mockResolvedValue(Buffer.from("pdf-bytes")),
  StyleSheet: { create: (s: unknown) => s },
  Document: (props: { children?: unknown }) => props.children ?? null,
  Page: (props: { children?: unknown }) => props.children ?? null,
  View: (props: { children?: unknown }) => props.children ?? null,
  Text: (props: { children?: unknown }) => props.children ?? null,
  Image: () => null,
  Font: { register: () => {} },
}));

vi.mock("@/lib/pdf/svi-report-pdf", () => ({
  SVIReportPDF: () => null,
}));

vi.mock("@/lib/pdf/score-pdf", () => ({
  ScorePDF: () => null,
}));

const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

const ENV_KEYS = [
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_FROM_EMAIL",
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "NEXT_PUBLIC_SITE_URL",
] as const;

function scrubEnv() {
  for (const k of ENV_KEYS) {
    delete process.env[k];
  }
}

beforeEach(() => {
  vi.resetModules();
  scrubEnv();
  sendMailSpy.mockReset();
  sendMailSpy.mockResolvedValue({ messageId: "smtp-msg-1" });
  createTransportSpy.mockClear();
  canSendEmailMock.mockReset();
  canSendEmailMock.mockResolvedValue(true);
  ensureEmailPreferencesMock.mockReset();
  ensureEmailPreferencesMock.mockResolvedValue("tok-abc");
  logSpy.mockClear();
  errorSpy.mockClear();
  warnSpy.mockClear();
  (global as unknown as { fetch: unknown }).fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ id: "re-1" }),
  });
});

afterEach(() => {
  scrubEnv();
});

function lastMail(): SentMailArgs {
  const calls = sendMailSpy.mock.calls as unknown as SentMailArgs[][];
  const call = calls[calls.length - 1];
  return call?.[0] ?? {};
}

// ---------------------------------------------------------------------------
// sendEmail — provider ladder
// ---------------------------------------------------------------------------

describe("sendEmail — SMTP provider ladder", () => {
  it("constructs the nodemailer transport with default host/port when only SMTP creds are set", async () => {
    process.env.SMTP_USER = "u@example.com";
    process.env.SMTP_PASS = "pw";
    const { sendEmail } = await import("./email");
    await sendEmail({ to: "a@b.co", subject: "s", html: "<p>hi</p>" });
    expect(createTransportSpy).toHaveBeenCalledWith({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: "u@example.com", pass: "pw" },
    });
  });

  it("respects SMTP_HOST + SMTP_PORT overrides so a custom relay wires through", async () => {
    process.env.SMTP_USER = "u@x";
    process.env.SMTP_PASS = "p";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "2525";
    const { sendEmail } = await import("./email");
    await sendEmail({ to: "a@b.co", subject: "s", html: "<p/>" });
    const arg = (createTransportSpy.mock.calls[0] as unknown as [{ host: string; port: number }])[0];
    expect(arg.host).toBe("smtp.example.com");
    expect(arg.port).toBe(2525);
  });

  it("returns {ok:true, id:messageId} on the SMTP happy path", async () => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    sendMailSpy.mockResolvedValueOnce({ messageId: "smtp-xyz" });
    const { sendEmail } = await import("./email");
    const res = await sendEmail({ to: "a@b.co", subject: "hi", html: "<p/>" });
    expect(res).toEqual({ ok: true, id: "smtp-xyz" });
  });

  it("passes {from, to, subject, html} to sendMail unchanged", async () => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    const { sendEmail } = await import("./email");
    await sendEmail({ to: "recipient@x.co", subject: "Subj", html: "<p>Body</p>" });
    const mail = lastMail();
    expect(mail.to).toBe("recipient@x.co");
    expect(mail.subject).toBe("Subj");
    expect(mail.html).toBe("<p>Body</p>");
    expect(mail.from).toBe("BlockID.au <info@blockid.au>");
  });

  it("uses SMTP_FROM_EMAIL when set instead of the default from address", async () => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    process.env.SMTP_FROM_EMAIL = "\"Custom From\" <custom@x.co>";
    const { sendEmail } = await import("./email");
    await sendEmail({ to: "a@b.co", subject: "s", html: "<p/>" });
    expect(lastMail().from).toBe("\"Custom From\" <custom@x.co>");
  });

  it("stamps List-Unsubscribe + One-Click headers when unsubscribeUrl is provided", async () => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    const { sendEmail } = await import("./email");
    await sendEmail({
      to: "a@b.co",
      subject: "s",
      html: "<p/>",
      unsubscribeUrl: "https://blockid.au/unsubscribe?token=xyz",
    });
    expect(lastMail().headers).toEqual({
      "List-Unsubscribe": "<https://blockid.au/unsubscribe?token=xyz>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("omits the List-Unsubscribe headers when no unsubscribeUrl is provided (transactional path)", async () => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    const { sendEmail } = await import("./email");
    await sendEmail({ to: "a@b.co", subject: "s", html: "<p/>" });
    const headers = lastMail().headers ?? {};
    expect(headers["List-Unsubscribe"]).toBeUndefined();
    expect(headers["List-Unsubscribe-Post"]).toBeUndefined();
  });

  it("passes attachments through with default application/pdf contentType", async () => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    const { sendEmail } = await import("./email");
    await sendEmail({
      to: "a@b.co",
      subject: "s",
      html: "<p/>",
      attachments: [{ filename: "r.pdf", content: Buffer.from("abc") }],
    });
    const atts = lastMail().attachments;
    expect(atts).toHaveLength(1);
    expect(atts![0].filename).toBe("r.pdf");
    expect(atts![0].contentType).toBe("application/pdf");
    expect(Buffer.isBuffer(atts![0].content)).toBe(true);
  });

  it("respects explicit contentType on attachments and preserves array order", async () => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    const { sendEmail } = await import("./email");
    await sendEmail({
      to: "a@b.co",
      subject: "s",
      html: "<p/>",
      attachments: [
        { filename: "a.png", content: Buffer.from("1"), contentType: "image/png" },
        { filename: "b.pdf", content: Buffer.from("2") },
      ],
    });
    const atts = lastMail().attachments!;
    expect(atts[0].filename).toBe("a.png");
    expect(atts[0].contentType).toBe("image/png");
    expect(atts[1].filename).toBe("b.pdf");
    expect(atts[1].contentType).toBe("application/pdf");
  });

  it("falls through to Resend when SMTP sendMail throws, if Resend is configured", async () => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    process.env.RESEND_API_KEY = "re-key";
    sendMailSpy.mockRejectedValueOnce(new Error("smtp down"));
    const { sendEmail } = await import("./email");
    const res = await sendEmail({ to: "a@b.co", subject: "s", html: "<p/>" });
    expect(res).toEqual({ ok: true, id: "re-1" });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns not_configured (not send_error) when SMTP throws and Resend is unavailable", async () => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    sendMailSpy.mockRejectedValueOnce(new Error("smtp down"));
    const { sendEmail } = await import("./email");
    const res = await sendEmail({ to: "a@b.co", subject: "s", html: "<p/>" });
    expect(res).toEqual({ ok: false, reason: "not_configured" });
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe("sendEmail — Resend provider fallback", () => {
  it("never constructs an SMTP transport when SMTP creds are missing", async () => {
    process.env.RESEND_API_KEY = "re-key";
    const { sendEmail } = await import("./email");
    await sendEmail({ to: "a@b.co", subject: "s", html: "<p/>" });
    expect(createTransportSpy).not.toHaveBeenCalled();
  });

  it("POSTs to https://api.resend.com/emails with Bearer auth + JSON content-type", async () => {
    process.env.RESEND_API_KEY = "re-key";
    const { sendEmail } = await import("./email");
    await sendEmail({ to: "a@b.co", subject: "s", html: "<p/>" });
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer re-key",
          "Content-Type": "application/json",
        },
      }),
    );
  });

  it("wraps `to` in an array in the JSON body (Resend expects an array)", async () => {
    process.env.RESEND_API_KEY = "re-key";
    const { sendEmail } = await import("./email");
    await sendEmail({ to: "recipient@x.co", subject: "Hey", html: "<p>b</p>" });
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      from: "BlockID.au <info@blockid.au>",
      to: ["recipient@x.co"],
      subject: "Hey",
      html: "<p>b</p>",
    });
  });

  it("uses RESEND_FROM_EMAIL when set to override the default `from` in the Resend body", async () => {
    process.env.RESEND_API_KEY = "re-key";
    process.env.RESEND_FROM_EMAIL = "hello@blockid.au";
    const { sendEmail } = await import("./email");
    await sendEmail({ to: "a@b.co", subject: "s", html: "<p/>" });
    const body = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.from).toBe("hello@blockid.au");
  });

  it("returns {ok:true, id:<resend-id>} on the Resend happy path", async () => {
    process.env.RESEND_API_KEY = "re-key";
    const { sendEmail } = await import("./email");
    const res = await sendEmail({ to: "a@b.co", subject: "s", html: "<p/>" });
    expect(res).toEqual({ ok: true, id: "re-1" });
  });

  it("defaults id to empty string when Resend omits it from the response", async () => {
    process.env.RESEND_API_KEY = "re-key";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });
    const { sendEmail } = await import("./email");
    const res = await sendEmail({ to: "a@b.co", subject: "s", html: "<p/>" });
    expect(res).toEqual({ ok: true, id: "" });
  });

  it("returns send_error with the Resend error message on non-2xx response", async () => {
    process.env.RESEND_API_KEY = "re-key";
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ message: "rate_limited" }),
    });
    const { sendEmail } = await import("./email");
    const res = await sendEmail({ to: "a@b.co", subject: "s", html: "<p/>" });
    expect(res.ok).toBe(false);
    expect((res as { reason: string }).reason).toBe("send_error");
    expect((res as { error?: unknown }).error).toBe("rate_limited");
    expect(errorSpy).toHaveBeenCalled();
  });

  it("returns send_error when fetch itself throws (network failure)", async () => {
    process.env.RESEND_API_KEY = "re-key";
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network"));
    const { sendEmail } = await import("./email");
    const res = await sendEmail({ to: "a@b.co", subject: "s", html: "<p/>" });
    expect(res.ok).toBe(false);
    expect((res as { reason: string }).reason).toBe("send_error");
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe("sendEmail — no provider configured", () => {
  it("returns {ok:false, reason:'not_configured'} + warns when neither SMTP nor Resend is set", async () => {
    const { sendEmail } = await import("./email");
    const res = await sendEmail({ to: "a@b.co", subject: "s", html: "<p/>" });
    expect(res).toEqual({ ok: false, reason: "not_configured" });
    expect(warnSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// siteUrl normalisation
// ---------------------------------------------------------------------------

describe("siteUrl normalisation (via sendScoreReady)", () => {
  it("strips a trailing slash off NEXT_PUBLIC_SITE_URL so URLs never double-slash", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au/";
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    const { sendScoreReady } = await import("./email");
    await sendScoreReady({ to: "a@b.co", slug: "abc", totalScore: 42 });
    const html = lastMail().html!;
    expect(html).toContain("https://blockid.au/s/abc");
    expect(html).not.toContain("blockid.au//s/abc");
  });

  it("falls back to http://localhost:3000 when NEXT_PUBLIC_SITE_URL is unset", async () => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    const { sendScoreReady } = await import("./email");
    await sendScoreReady({ to: "a@b.co", slug: "abc", totalScore: 42 });
    expect(lastMail().html).toContain("http://localhost:3000/s/abc");
  });
});

// ---------------------------------------------------------------------------
// Preference-gated senders
// ---------------------------------------------------------------------------

describe("sendScoreReady (svi_alerts gate)", () => {
  beforeEach(() => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
  });

  it("short-circuits with unsubscribed when canSendEmail returns false — no mail sent, no ensure called", async () => {
    canSendEmailMock.mockResolvedValueOnce(false);
    const { sendScoreReady } = await import("./email");
    const res = await sendScoreReady({ to: "a@b.co", slug: "s1", totalScore: 55 });
    expect(res).toEqual({ ok: false, reason: "unsubscribed" });
    expect(ensureEmailPreferencesMock).not.toHaveBeenCalled();
    expect(sendMailSpy).not.toHaveBeenCalled();
  });

  it("checks the svi_alerts category (the mail is score-related, not marketing)", async () => {
    const { sendScoreReady } = await import("./email");
    await sendScoreReady({ to: "a@b.co", slug: "s1", totalScore: 55 });
    expect(canSendEmailMock).toHaveBeenCalledWith("a@b.co", "svi_alerts");
  });

  it("sends with the score value + share URL in the HTML on the happy path", async () => {
    const { sendScoreReady } = await import("./email");
    await sendScoreReady({ to: "a@b.co", slug: "s1", totalScore: 88, companyName: "Acme" });
    const mail = lastMail();
    expect(mail.subject).toBe("Your Investor-Ready Score is ready");
    expect(mail.html).toContain("88");
    expect(mail.html).toContain("/s/s1");
    expect(mail.html).toContain("Acme");
  });

  it("escapes HTML in companyName to block <script> injection", async () => {
    const { sendScoreReady } = await import("./email");
    await sendScoreReady({
      to: "a@b.co",
      slug: "s1",
      totalScore: 88,
      companyName: "<script>alert(1)</script>",
    });
    const html = lastMail().html!;
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("forwards the unsubscribeUrl into the outgoing List-Unsubscribe header", async () => {
    const { sendScoreReady } = await import("./email");
    await sendScoreReady({ to: "a@b.co", slug: "s1", totalScore: 88 });
    expect(lastMail().headers!["List-Unsubscribe"]).toBe(
      "<https://blockid.au/unsubscribe?token=tok-abc>",
    );
  });
});

describe("sendSVIWelcome (transactional welcome — always sends)", () => {
  beforeEach(() => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
  });

  it("does NOT gate on canSendEmail (transactional welcome path)", async () => {
    const { sendSVIWelcome } = await import("./email");
    await sendSVIWelcome({ to: "a@b.co", name: "Ana", svi: 42, stage: 2 });
    expect(canSendEmailMock).not.toHaveBeenCalled();
    expect(sendMailSpy).toHaveBeenCalled();
  });

  it("uses Vietnamese subject when locale='vi'", async () => {
    const { sendSVIWelcome } = await import("./email");
    await sendSVIWelcome({ to: "a@b.co", svi: 42, stage: 2, locale: "vi" });
    expect(lastMail().subject).toContain("Chao Mung");
  });

  it("uses English subject when locale omitted", async () => {
    const { sendSVIWelcome } = await import("./email");
    await sendSVIWelcome({ to: "a@b.co", svi: 42, stage: 2 });
    expect(lastMail().subject).toBe("Welcome to BlockID — Your SVI Baseline is Ready");
  });

  it("renders the correct stage label from the stage index", async () => {
    const { sendSVIWelcome } = await import("./email");
    await sendSVIWelcome({ to: "a@b.co", svi: 42, stage: 4 });
    expect(lastMail().html).toContain("Revenue");
  });
});

// ---------------------------------------------------------------------------
// Spam Act 2003 s17/s18 footer — QA-3 P1-6 (2026-09-12)
// ---------------------------------------------------------------------------

describe("Spam Act footer (unsubFooter / complianceFooter)", () => {
  beforeEach(() => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
  });

  it("every marketing send carries the Auschain identity line, the reason, and both links", async () => {
    const { sendNurtureFreeDay2, sendNurtureReengageDay14, sendMilestoneEmail } = await import("./email");
    await sendNurtureFreeDay2({ to: "a@b.co", name: "Jo" });
    for (const fn of [
      () => sendNurtureReengageDay14({ to: "a@b.co" }),
      () => sendMilestoneEmail({ to: "a@b.co", badge: "b", badgeLabel: "First 50", message: "m" }),
    ]) {
      await fn();
    }
    const calls = sendMailSpy.mock.calls as unknown as SentMailArgs[][];
    expect(calls.length).toBe(3);
    for (const [mail] of calls) {
      expect(mail.html).toContain("Auschain PTY LTD &middot; ABN 79 659 615 111 &middot; Sydney NSW");
      expect(mail.html).toContain("You're receiving this because you have a BlockID account.");
      expect(mail.html).toContain("https://blockid.au/unsubscribe?token=tok-abc");
      expect(mail.html).toContain("https://blockid.au/unsubscribe?token=tok-abc&amp;manage=1".replace("&amp;", "&"));
      expect(mail.headers?.["List-Unsubscribe"]).toBe("<https://blockid.au/unsubscribe?token=tok-abc>");
    }
  });

  it("complianceFooter() gives outside senders the same identity + unsubscribe block (light theme) and the header URL", async () => {
    const { complianceFooter, SENDER_IDENTITY_LINE } = await import("./email");
    const f = await complianceFooter("guest@x.io");
    expect(SENDER_IDENTITY_LINE).toBe("Auschain PTY LTD · ABN 79 659 615 111 · Sydney NSW");
    expect(f.unsubscribeUrl).toBe("https://blockid.au/unsubscribe?token=tok-abc");
    expect(f.footerHtml).toContain("Auschain PTY LTD &middot; ABN 79 659 615 111 &middot; Sydney NSW");
    expect(f.footerHtml).toContain(f.unsubscribeUrl);
    expect(f.footerHtml).toContain("background:transparent");
    expect(f.footerText).toContain(SENDER_IDENTITY_LINE);
    expect(f.footerText).toContain(`Unsubscribe: ${f.unsubscribeUrl}`);
    expect(ensureEmailPreferencesMock).toHaveBeenCalledWith("guest@x.io");
  });
});

describe("sendSVIWeeklyReport (weekly_reports gate)", () => {
  beforeEach(() => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
  });

  it("short-circuits on unsubscribe from weekly_reports", async () => {
    canSendEmailMock.mockResolvedValueOnce(false);
    const { sendSVIWeeklyReport } = await import("./email");
    const res = await sendSVIWeeklyReport({
      to: "a@b.co",
      svi: 100,
      delta: 5,
      weekNum: 3,
    });
    expect(res).toEqual({ ok: false, reason: "unsubscribed" });
    expect(canSendEmailMock).toHaveBeenCalledWith("a@b.co", "weekly_reports");
  });

  it("formats delta with + sign on gain and renders week number in subject", async () => {
    const { sendSVIWeeklyReport } = await import("./email");
    await sendSVIWeeklyReport({ to: "a@b.co", svi: 100, delta: 12, weekNum: 3 });
    expect(lastMail().subject).toBe("Week 3 SVI Report — +12 points");
  });

  it("formats delta with negative sign on loss", async () => {
    const { sendSVIWeeklyReport } = await import("./email");
    await sendSVIWeeklyReport({ to: "a@b.co", svi: 90, delta: -8, weekNum: 4 });
    expect(lastMail().subject).toBe("Week 4 SVI Report — -8 points");
  });
});

// ---------------------------------------------------------------------------
// sendMagicLink — transactional, always sends
// ---------------------------------------------------------------------------

describe("sendMagicLink (transactional — never gated)", () => {
  beforeEach(() => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
  });

  it("never consults canSendEmail so an unsubscribed founder can still log in", async () => {
    const { sendMagicLink } = await import("./email");
    await sendMagicLink({ to: "a@b.co", token: "tok1", intent: "login", ttlMinutes: 15 });
    expect(canSendEmailMock).not.toHaveBeenCalled();
    expect(sendMailSpy).toHaveBeenCalled();
  });

  it("URL-encodes the token so a `+/=` token doesn't break the query string", async () => {
    const { sendMagicLink } = await import("./email");
    await sendMagicLink({
      to: "a@b.co",
      token: "a+b/c=d",
      intent: "login",
      ttlMinutes: 15,
    });
    expect(lastMail().html).toContain(
      "/auth/verify?token=a%2Bb%2Fc%3Dd",
    );
  });

  it("uses Vietnamese copy in the subject when locale='vi'", async () => {
    const { sendMagicLink } = await import("./email");
    await sendMagicLink({ to: "a@b.co", token: "t", intent: "login", ttlMinutes: 15, locale: "vi" });
    expect(lastMail().subject).toBe("Dang nhap BlockID");
  });

  it("uses English `Sign in to BlockID` subject when locale omitted", async () => {
    const { sendMagicLink } = await import("./email");
    await sendMagicLink({ to: "a@b.co", token: "t", intent: "login", ttlMinutes: 15 });
    expect(lastMail().subject).toBe("Sign in to BlockID");
  });

  it("swaps the subject when intent='save_founder_pack'", async () => {
    const { sendMagicLink } = await import("./email");
    await sendMagicLink({
      to: "a@b.co",
      token: "t",
      intent: "save_founder_pack",
      ttlMinutes: 15,
    });
    expect(lastMail().subject).toBe("Save your BlockID Founder Pack");
  });

  it("stamps List-Unsubscribe header so magic-link still complies with bulk-sender rules", async () => {
    const { sendMagicLink } = await import("./email");
    await sendMagicLink({ to: "a@b.co", token: "t", intent: "login", ttlMinutes: 15 });
    expect(lastMail().headers!["List-Unsubscribe"]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// sendPasswordReset — transactional, no unsubscribe check, no header
// ---------------------------------------------------------------------------

describe("sendPasswordReset (transactional — no unsub check)", () => {
  beforeEach(() => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
  });

  it("never calls canSendEmail so a fully-unsubscribed user still gets their reset", async () => {
    const { sendPasswordReset } = await import("./email");
    await sendPasswordReset({ to: "a@b.co", token: "tok_abc" });
    expect(canSendEmailMock).not.toHaveBeenCalled();
    expect(ensureEmailPreferencesMock).not.toHaveBeenCalled();
  });

  it("renders a single-use /auth/reset link carrying the token (never a password)", async () => {
    // Release QA-4 P2-d: the mail carries a link, the hash rotates on consume.
    const { sendPasswordReset } = await import("./email");
    await sendPasswordReset({ to: "a@b.co", token: "tok/with?chars", ttlMinutes: 30 });
    const html = lastMail().html;
    expect(html).toContain("/auth/reset?token=tok%2Fwith%3Fchars");
    expect(html).toContain("30 minutes");
    expect(html).not.toMatch(/temporary password|Your New Password/i);
  });

  it("does NOT stamp a List-Unsubscribe header (no unsubscribeUrl passed through)", async () => {
    const { sendPasswordReset } = await import("./email");
    await sendPasswordReset({ to: "a@b.co", token: "x" });
    const headers = lastMail().headers ?? {};
    expect(headers["List-Unsubscribe"]).toBeUndefined();
  });

  it("uses Vietnamese subject when locale='vi'", async () => {
    const { sendPasswordReset } = await import("./email");
    await sendPasswordReset({ to: "a@b.co", token: "x", locale: "vi" });
    expect(lastMail().subject).toBe("BlockID — Dat Lai Mat Khau Cua Ban");
  });
});

// ---------------------------------------------------------------------------
// PDF-attached senders
// ---------------------------------------------------------------------------

describe("sendSVIReport (PDF attachment)", () => {
  beforeEach(() => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
  });

  const analysis = {
    totalSVI: 72,
    stageLabel: "MVP",
    subs: [
      { label: "Team", value: 80 },
      { label: "Market", value: 65 },
      { label: "Product", value: 40 },
    ],
    evidenceGaps: [
      { label: "Pitch deck", action: "Upload one", impact: 10 },
    ],
    // Additional keys the type may require but the tested code path doesn't read.
  } as unknown as Parameters<
    typeof import("./email").sendSVIReport
  >[0]["analysis"];

  it("attaches a .pdf file with application/pdf contentType on the happy path", async () => {
    const { sendSVIReport } = await import("./email");
    await sendSVIReport({ to: "a@b.co", slug: "s1", analysis });
    const atts = lastMail().attachments!;
    expect(atts).toHaveLength(1);
    expect(atts[0].filename).toMatch(/\.pdf$/);
    expect(atts[0].contentType).toBe("application/pdf");
    expect(Buffer.isBuffer(atts[0].content)).toBe(true);
  });

  it("filename embeds the slug so investors can distinguish downloads", async () => {
    const { sendSVIReport } = await import("./email");
    await sendSVIReport({ to: "a@b.co", slug: "unique-slug-42", analysis });
    expect(lastMail().attachments![0].filename).toBe(
      "BlockID-SVI-Report-unique-slug-42.pdf",
    );
  });

  it("still sends the email (without attachment) if renderToBuffer throws", async () => {
    const pdfMod = await import("@react-pdf/renderer");
    (pdfMod.renderToBuffer as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("pdf boom"),
    );
    const { sendSVIReport } = await import("./email");
    const res = await sendSVIReport({ to: "a@b.co", slug: "s1", analysis });
    expect(res.ok).toBe(true);
    expect(lastMail().attachments).toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("short-circuits on svi_alerts unsubscribe (no PDF generated)", async () => {
    canSendEmailMock.mockResolvedValueOnce(false);
    const { sendSVIReport } = await import("./email");
    const pdfMod = await import("@react-pdf/renderer");
    (pdfMod.renderToBuffer as ReturnType<typeof vi.fn>).mockClear();
    const res = await sendSVIReport({ to: "a@b.co", slug: "s1", analysis });
    expect(res).toEqual({ ok: false, reason: "unsubscribed" });
    expect(pdfMod.renderToBuffer).not.toHaveBeenCalled();
  });
});

describe("sendWelcomeWithReport (welcome + PDF, transactional)", () => {
  beforeEach(() => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
  });

  const analysis = {
    totalSVI: 60,
    stageLabel: "Concept",
    subs: [],
    evidenceGaps: [],
  } as unknown as Parameters<
    typeof import("./email").sendWelcomeWithReport
  >[0]["analysis"];

  it("sends unconditionally (no canSendEmail gate) — new user needs their credentials", async () => {
    const { sendWelcomeWithReport } = await import("./email");
    await sendWelcomeWithReport({
      to: "a@b.co",
      slug: "s1",
      analysis,
      tempPassword: "Welcome1!",
    });
    expect(canSendEmailMock).not.toHaveBeenCalled();
    expect(sendMailSpy).toHaveBeenCalled();
  });

  it("renders the tempPassword in the HTML so the user can log in", async () => {
    const { sendWelcomeWithReport } = await import("./email");
    await sendWelcomeWithReport({
      to: "a@b.co",
      slug: "s1",
      analysis,
      tempPassword: "Welcome1!",
    });
    expect(lastMail().html).toContain("Welcome1!");
  });

  it("attaches the SVI report PDF alongside the welcome copy", async () => {
    const { sendWelcomeWithReport } = await import("./email");
    await sendWelcomeWithReport({
      to: "a@b.co",
      slug: "s1",
      analysis,
      tempPassword: "x",
    });
    expect(lastMail().attachments![0].contentType).toBe("application/pdf");
  });
});

// ---------------------------------------------------------------------------
// Nurture legacy aliases
// ---------------------------------------------------------------------------

describe("nurture legacy aliases delegate to the current impls", () => {
  beforeEach(() => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
  });

  it("sendNurtureFreeDay1 delegates to sendNurtureFreeDay2 (same subject line)", async () => {
    const { sendNurtureFreeDay1 } = await import("./email");
    await sendNurtureFreeDay1({ to: "a@b.co" });
    expect(lastMail().subject).toContain("Boost your SVI");
  });

  it("sendNurtureFreeDay3 delegates to sendNurtureFreeDay4 (equity checklist)", async () => {
    const { sendNurtureFreeDay3 } = await import("./email");
    await sendNurtureFreeDay3({ to: "a@b.co" });
    expect(lastMail().subject).toContain("equity");
  });

  it("sendNurtureFreeDay14 delegates to sendNurtureFreeDay7 (Starter-plan upsell, priced from plans-v2)", async () => {
    const { PLANS_V2, formatAud } = await import("./plans-v2");
    const { GENERATED_PLANS_BY_ID } = await import("@/config/pricing/plans.generated");
    const starter = PLANS_V2.find((p) => p.id === "founder_starter")!;
    const credits = GENERATED_PLANS_BY_ID["founder_starter"].usage_limits.monthly_credits;
    const { sendNurtureFreeDay14 } = await import("./email");
    await sendNurtureFreeDay14({ to: "a@b.co" });
    const mail = lastMail();
    expect(mail.subject).toContain(`${credits} credits a month for ${formatAud(starter.monthly_aud)}/mo`);
    expect(mail.subject).toContain(`${starter.trial_days}-day free trial`);
    expect(mail.html).toContain("/pricing#tier-starter");
    // The Founding 100 A$5 lifetime promo closed 2026-09-01 — never advertised.
    expect(mail.html).not.toMatch(/Founding|A\$5\b|lifetime|founding-50/);
    expect(mail.subject).not.toMatch(/Founding|A\$5\b/);
  });

  it("sendNurturePaidDay14 delegates to sendNurturePaidDay7 (Week 1 progress)", async () => {
    const { sendNurturePaidDay14 } = await import("./email");
    await sendNurturePaidDay14({ to: "a@b.co", svi: 120 });
    expect(lastMail().subject).toContain("Week 1 Progress");
  });

  it("sendNurturePaidDay30 also delegates to sendNurturePaidDay7", async () => {
    const { sendNurturePaidDay30 } = await import("./email");
    await sendNurturePaidDay30({ to: "a@b.co", svi: 130 });
    expect(lastMail().subject).toContain("Week 1 Progress");
  });
});

// ---------------------------------------------------------------------------
// Preference category routing (representative gated senders)
// ---------------------------------------------------------------------------

describe("gated senders — preference-category routing", () => {
  beforeEach(() => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
  });

  it("sendMilestoneEmail gates on svi_alerts", async () => {
    canSendEmailMock.mockResolvedValueOnce(false);
    const { sendMilestoneEmail } = await import("./email");
    const res = await sendMilestoneEmail({
      to: "a@b.co",
      badge: "first_analysis",
      badgeLabel: "First Analysis",
      message: "Nice",
    });
    expect(res).toEqual({ ok: false, reason: "unsubscribed" });
    expect(canSendEmailMock).toHaveBeenCalledWith("a@b.co", "svi_alerts");
  });

  it("sendLowCreditAlert gates on product_updates", async () => {
    canSendEmailMock.mockResolvedValueOnce(false);
    const { sendLowCreditAlert } = await import("./email");
    await sendLowCreditAlert({ to: "a@b.co", balance: 0.5 });
    expect(canSendEmailMock).toHaveBeenCalledWith("a@b.co", "product_updates");
  });

  it("sendPaymentLink gates on promotions (marketing offer)", async () => {
    canSendEmailMock.mockResolvedValueOnce(false);
    const { sendPaymentLink } = await import("./email");
    await sendPaymentLink({
      to: "a@b.co",
      name: "Ana",
      checkoutUrl: "https://x",
      finalPrice: 5,
      features: ["a"],
    });
    expect(canSendEmailMock).toHaveBeenCalledWith("a@b.co", "promotions");
  });

  it("sendGrowthReport gates on product_updates (internal admin digest)", async () => {
    canSendEmailMock.mockResolvedValueOnce(false);
    const { sendGrowthReport } = await import("./email");
    await sendGrowthReport({
      to: "a@b.co",
      date: "2026-01-01",
      metrics: {
        totalUsers: 0, newUsersWeek: 0, newUsersToday: 0,
        sviWeek: 0, sviToday: 0, leadsWeek: 0, leadsToday: 0,
        totalAccounts: 0, payingUsers: 0, evidenceWeek: 0,
        scoresViewedWeek: 0, avgSVI: 0, avgDelta: 0, uniqueEmails: 0,
        signupRate: 0, paymentRate: 0, planDist: {}, toolUsage: {},
        biggestDropOff: "", dropOffRate: 0,
      },
      recommendations: [],
    });
    expect(canSendEmailMock).toHaveBeenCalledWith("a@b.co", "product_updates");
  });

  it("sendReportDelivery gates on svi_alerts", async () => {
    canSendEmailMock.mockResolvedValueOnce(false);
    const { sendReportDelivery } = await import("./email");
    await sendReportDelivery({ to: "a@b.co", slug: "s1", tier: "standard", sviScore: 100 });
    expect(canSendEmailMock).toHaveBeenCalledWith("a@b.co", "svi_alerts");
  });

  it("sendNurtureFreeDay2 gates on promotions (marketing drip)", async () => {
    canSendEmailMock.mockResolvedValueOnce(false);
    const { sendNurtureFreeDay2 } = await import("./email");
    await sendNurtureFreeDay2({ to: "a@b.co" });
    expect(canSendEmailMock).toHaveBeenCalledWith("a@b.co", "promotions");
  });

  it("sendNurturePaidDay1 gates on product_updates (paying-user onboarding)", async () => {
    canSendEmailMock.mockResolvedValueOnce(false);
    const { sendNurturePaidDay1 } = await import("./email");
    await sendNurturePaidDay1({ to: "a@b.co" });
    expect(canSendEmailMock).toHaveBeenCalledWith("a@b.co", "product_updates");
  });

  it("sendD1Welcome gates on promotions (post-signup drip)", async () => {
    canSendEmailMock.mockResolvedValueOnce(false);
    const { sendD1Welcome } = await import("./email");
    await sendD1Welcome({ to: "a@b.co" });
    expect(canSendEmailMock).toHaveBeenCalledWith("a@b.co", "promotions");
  });

  it("sendSVIShare gates on svi_alerts", async () => {
    canSendEmailMock.mockResolvedValueOnce(false);
    const { sendSVIShare } = await import("./email");
    await sendSVIShare({ to: "a@b.co", slug: "s1", svi: 50 });
    expect(canSendEmailMock).toHaveBeenCalledWith("a@b.co", "svi_alerts");
  });

  it("sendVestingMilestone gates on svi_alerts", async () => {
    canSendEmailMock.mockResolvedValueOnce(false);
    const { sendVestingMilestone } = await import("./email");
    await sendVestingMilestone({
      to: "a@b.co",
      shareholderName: "Ana",
      percentVested: 25,
      sharesVested: 250,
      totalShares: 1000,
      milestoneType: "cliff_reached",
    });
    expect(canSendEmailMock).toHaveBeenCalledWith("a@b.co", "svi_alerts");
  });
});

// ---------------------------------------------------------------------------
// Ungated transactional senders (payment confirmation surface)
// ---------------------------------------------------------------------------

describe("ungated payment senders — always fire sendMail", () => {
  beforeEach(() => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
  });

  it("sendPaymentConfirmation sends unconditionally (no canSendEmail check)", async () => {
    const { sendPaymentConfirmation } = await import("./email");
    await sendPaymentConfirmation({ to: "a@b.co", planName: "Founder" });
    expect(canSendEmailMock).not.toHaveBeenCalled();
    expect(sendMailSpy).toHaveBeenCalled();
    expect(lastMail().html).toContain("Founder");
  });

  it("sendPaymentReceipt sends unconditionally + formats the amount as $X.XX <CCY>", async () => {
    const { sendPaymentReceipt } = await import("./email");
    await sendPaymentReceipt({ to: "a@b.co", amountCents: 4900 });
    expect(canSendEmailMock).not.toHaveBeenCalled();
    expect(lastMail().subject).toContain("$49.00 AUD");
  });

  it("sendPaymentReceipt uppercases a custom currency code", async () => {
    const { sendPaymentReceipt } = await import("./email");
    await sendPaymentReceipt({ to: "a@b.co", amountCents: 1000, currency: "usd" });
    expect(lastMail().subject).toContain("USD");
  });

  it("sendCancellationEmail sends unconditionally + renders the active_until date", async () => {
    const { sendCancellationEmail } = await import("./email");
    await sendCancellationEmail({ to: "a@b.co", activeUntil: "2026-12-31T00:00:00Z" });
    expect(canSendEmailMock).not.toHaveBeenCalled();
    expect(lastMail().html).toMatch(/December|31/);
  });

  it("sendAnalysisPurchaseConfirmation sends unconditionally", async () => {
    const { sendAnalysisPurchaseConfirmation } = await import("./email");
    await sendAnalysisPurchaseConfirmation({ to: "a@b.co" });
    expect(canSendEmailMock).not.toHaveBeenCalled();
    expect(lastMail().subject).toBe("Your SVI Analysis Credit Has Been Added");
  });

  it("sendCreditPurchaseConfirmation embeds the credit count in subject + body", async () => {
    const { sendCreditPurchaseConfirmation } = await import("./email");
    await sendCreditPurchaseConfirmation({ to: "a@b.co", credits: 25 });
    expect(canSendEmailMock).not.toHaveBeenCalled();
    expect(lastMail().subject).toBe("25 Credits Added to Your BlockID Account");
    expect(lastMail().html).toContain("+25");
  });

  it("sendSubscriptionCancelled sends unconditionally with COMEBACK30 code", async () => {
    const { sendSubscriptionCancelled } = await import("./email");
    await sendSubscriptionCancelled({ to: "a@b.co" });
    expect(canSendEmailMock).not.toHaveBeenCalled();
    expect(lastMail().html).toContain("COMEBACK30");
  });

  it("sendFarewellEmail (post-unsubscribe) sends unconditionally", async () => {
    const { sendFarewellEmail } = await import("./email");
    await sendFarewellEmail({ to: "a@b.co" });
    // Farewell is ironic-transactional — must not be gated
    expect(canSendEmailMock).not.toHaveBeenCalled();
    expect(sendMailSpy).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// sendWholesaleWelcome delegates to the reseller builder
// ---------------------------------------------------------------------------

describe("sendWholesaleWelcome — reseller delegation", () => {
  beforeEach(() => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
  });

  it("calls buildWholesaleWelcomeEmail with all args including locale + uses the returned subject", async () => {
    const { sendWholesaleWelcome } = await import("./email");
    const builderMod = await import("./reseller/wholesale-welcome-email");
    await sendWholesaleWelcome({
      to: "founder@x.co",
      founderName: "Ana",
      companyName: "Acme",
      resellerDisplayName: "Reseller X",
      magicLinkUrl: "https://x/verify?tok=y",
      ttlHours: 24,
      locale: "vi",
    });
    expect(builderMod.buildWholesaleWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        founderName: "Ana",
        companyName: "Acme",
        resellerDisplayName: "Reseller X",
        magicLinkUrl: "https://x/verify?tok=y",
        ttlHours: 24,
        locale: "vi",
        guideUrl: expect.stringMatching(/\/guide\/01-vision$/),
      }),
    );
    expect(lastMail().subject).toBe("Wholesale Welcome Acme");
    expect(lastMail().html).toContain("Welcome Acme");
  });

  it("passes explicit guideUrl through when caller supplies one", async () => {
    const { sendWholesaleWelcome } = await import("./email");
    const builderMod = await import("./reseller/wholesale-welcome-email");
    await sendWholesaleWelcome({
      to: "founder@x.co",
      companyName: "Acme",
      resellerDisplayName: "Reseller X",
      magicLinkUrl: "https://x/verify?tok=y",
      ttlHours: 24,
      guideUrl: "https://custom.example/guide/hello",
    });
    expect(builderMod.buildWholesaleWelcomeEmail).toHaveBeenCalledWith(
      expect.objectContaining({ guideUrl: "https://custom.example/guide/hello" }),
    );
  });
});

describe("sendGuestCheckoutRecovery — abandoned A$3 checkout, one email only", () => {
  // This is the only commercial message BlockID sends to someone who has no
  // account, so it is the one most exposed to Spam Act 2003 s16/s18: it needs
  // a working unsubscribe and truthful sender identification, and it must
  // never reach an address that has already opted out. It also must never
  // read as a cold approach — the founder's own input has to appear in it,
  // or it stops being a continuation of something they started.
  beforeEach(() => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
  });

  const args = {
    email: "founder@example.com",
    inputType: "website_url" as const,
    inputLabel: "https://example.com",
    resumeUrl: "https://blockid.au/api/guest-analysis/resume/deadbeef",
    guestAnalysisId: "e3a3e793-4cd5-47ff-86e4-20b5e8ed339c",
  };

  it("refuses to send to an address that has unsubscribed", async () => {
    canSendEmailMock.mockResolvedValueOnce(false);
    const { sendGuestCheckoutRecovery } = await import("./email");
    const res = await sendGuestCheckoutRecovery(args);
    expect(res).toEqual({ ok: false, reason: "unsubscribed" });
    expect(canSendEmailMock).toHaveBeenCalledWith(
      "founder@example.com",
      "promotions",
    );
    expect(sendMailSpy).not.toHaveBeenCalled();
  });

  it("carries the founder's own input and the resume link", async () => {
    canSendEmailMock.mockResolvedValue(true);
    const { sendGuestCheckoutRecovery } = await import("./email");
    await sendGuestCheckoutRecovery(args);
    const mail = lastMail();
    expect(mail.subject).toContain("example.com");
    expect(mail.html).toContain("https://example.com");
    expect(mail.html).toContain(args.resumeUrl);
    // Reassures them nothing was taken — they abandoned at the card form.
    expect(mail.html).toContain("Nothing was charged");
  });

  it("identifies the real billing entity and offers a working unsubscribe", async () => {
    canSendEmailMock.mockResolvedValue(true);
    const { sendGuestCheckoutRecovery } = await import("./email");
    await sendGuestCheckoutRecovery(args);
    const mail = lastMail();
    expect(mail.html).toContain(tradingAsLine());
    expect(mail.html).toContain("ABN 79 659 615 111");
    expect(mail.html).toContain("/unsubscribe?token=");
    expect(mail.headers?.["List-Unsubscribe"]).toBeTruthy();
    expect(mail.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
  });

  it("uses no urgency, no discount and no countdown", async () => {
    canSendEmailMock.mockResolvedValue(true);
    const { sendGuestCheckoutRecovery } = await import("./email");
    await sendGuestCheckoutRecovery(args);
    const html = lastMail().html ?? "";
    expect(html).not.toMatch(/expires? (in|soon)|hurry|last chance|only \d+ left|% off|discount|limited time/i);
    // And it says out loud that it is a one-off, not the start of a drip.
    expect(html).toContain("the only email we'll send");
  });

  it("names the uploaded deck when the input was a pitch file", async () => {
    canSendEmailMock.mockResolvedValue(true);
    const { sendGuestCheckoutRecovery } = await import("./email");
    await sendGuestCheckoutRecovery({
      ...args,
      inputType: "pitch_file",
      inputLabel: "seed-deck.pdf",
    });
    expect(lastMail().html).toContain("seed-deck.pdf");
    expect(lastMail().subject).toContain("seed-deck.pdf");
  });
});

describe("sendFreeSummary — the free tier's one email", () => {
  // The free rung of the funnel. It carries a commercial offer (the A$3
  // upgrade) to an address with no account, so Spam Act 2003 s16/s18 applies
  // in full: suppression honoured, unsubscribe working, sender identified.
  // It must also stay a single message — the whole design is that there is no
  // sequence behind it.
  beforeEach(() => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
  });

  const args = {
    email: "founder@example.com",
    pdf: Buffer.from("%PDF-1.3 fake"),
    svi: 142,
    stageLabel: "Traction",
    valuationLow: 850_000,
    valuationHigh: 2_100_000,
    startupName: "Northwind Freight",
    analysisUrl: "https://blockid.au/analyze/abc123",
    analysisId: "e3a3e793-4cd5-47ff-86e4-20b5e8ed339c",
  };

  it("refuses to send to an address that has unsubscribed", async () => {
    canSendEmailMock.mockResolvedValueOnce(false);
    const { sendFreeSummary } = await import("./email");
    const res = await sendFreeSummary(args);
    expect(res).toEqual({ ok: false, reason: "unsubscribed" });
    expect(canSendEmailMock).toHaveBeenCalledWith(
      "founder@example.com",
      "promotions",
    );
    expect(sendMailSpy).not.toHaveBeenCalled();
  });

  it("attaches the summary PDF", async () => {
    canSendEmailMock.mockResolvedValue(true);
    const { sendFreeSummary } = await import("./email");
    await sendFreeSummary(args);
    const mail = lastMail();
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments?.[0].filename).toBe("blockid-summary.pdf");
    expect(mail.attachments?.[0].contentType).toBe("application/pdf");
  });

  it("puts the score and the range in the subject and the body", async () => {
    canSendEmailMock.mockResolvedValue(true);
    const { sendFreeSummary } = await import("./email");
    await sendFreeSummary(args);
    const mail = lastMail();
    expect(mail.subject).toContain("142");
    expect(mail.subject).toContain("Northwind Freight");
    expect(mail.subject).toContain("5-page");
    expect(mail.html).toContain("142");
    expect(mail.html).toContain("Traction");
    expect(mail.html).toContain(args.analysisUrl);
  });

  it("lists all five pages, from the single definition", async () => {
    canSendEmailMock.mockResolvedValue(true);
    const { FREE_SUMMARY_PAGES } = await import("@/lib/analyses/free-summary");
    const { sendFreeSummary } = await import("./email");
    await sendFreeSummary(args);
    const html = lastMail().html ?? "";
    for (const page of FREE_SUMMARY_PAGES) {
      expect(html).toContain(page.title);
    }
  });

  it("identifies the real billing entity and offers a working unsubscribe", async () => {
    canSendEmailMock.mockResolvedValue(true);
    const { sendFreeSummary } = await import("./email");
    await sendFreeSummary(args);
    const mail = lastMail();
    expect(mail.html).toContain(tradingAsLine());
    expect(mail.html).toContain("ACN 659 615 111");
    expect(mail.html).toContain("ABN 79 659 615 111");
    expect(mail.html).toContain("Sydney NSW");
    expect(mail.html).toContain("/unsubscribe?token=");
    expect(mail.headers?.["List-Unsubscribe"]).toBeTruthy();
    expect(mail.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
  });

  it("makes the A$3 upgrade an offer, not a nag", async () => {
    canSendEmailMock.mockResolvedValue(true);
    const { sendFreeSummary } = await import("./email");
    await sendFreeSummary(args);
    const html = lastMail().html ?? "";
    expect(html).toContain("A$3.00 inc. GST");
    expect(html).toContain("/one-click-report");
    expect(html).not.toMatch(
      /expires? (in|soon)|hurry|last chance|only \d+ left|% off|discount|limited time|act now/i,
    );
    expect(html).toContain("the only email we send about this run");
  });

  it("carries the AFSL disclaimer", async () => {
    canSendEmailMock.mockResolvedValue(true);
    const { sendFreeSummary } = await import("./email");
    await sendFreeSummary(args);
    expect(lastMail().html).toContain("does not hold an AFSL");
  });

  it("works without a startup name", async () => {
    canSendEmailMock.mockResolvedValue(true);
    const { sendFreeSummary } = await import("./email");
    await sendFreeSummary({ ...args, startupName: null });
    expect(lastMail().subject).toContain("your startup");
  });
});

describe("sendFirstAnalysisReportEmail — the first analysis PDF (S32-B)", () => {
  beforeEach(() => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
    process.env.OAUTH_TOKEN_ENCRYPTION_KEY = "0123456789abcdef0123456789abcdef";
  });

  async function args(overrides: Record<string, unknown> = {}) {
    const { sampleReport } = await import("@/lib/analyses/first-analysis/fixtures");
    return {
      to: "founder@example.com",
      analysisId: "0d4f7c1e-9b2a-4c3d-8e5f-6a7b8c9d0e1f",
      company: "Kelpie",
      report: sampleReport(),
      pdf: Buffer.from("%PDF-1.3 fake"),
      pages: 17,
      ...overrides,
    };
  }

  it("refuses an unsubscribed address before touching the transport", async () => {
    canSendEmailMock.mockResolvedValueOnce(false);
    const { sendFirstAnalysisReportEmail } = await import("./email");
    expect(await sendFirstAnalysisReportEmail(await args())).toEqual({ ok: false, reason: "unsubscribed" });
    expect(sendMailSpy).not.toHaveBeenCalled();
  });

  it("subject names the company; body carries score, range, CEO line, both links and the Spam Act footer", async () => {
    canSendEmailMock.mockResolvedValue(true);
    const { sendFirstAnalysisReportEmail } = await import("./email");
    const a = await args();
    const res = await sendFirstAnalysisReportEmail(a);
    expect(res.ok).toBe(true);
    const mail = lastMail();
    expect(mail.subject).toBe("Your BlockID first analysis — Kelpie");
    expect(mail.html).toContain(String(Math.round(a.report.svi.total)));
    expect(mail.html).toContain("From the CEO section");
    expect(mail.html).toContain("https://blockid.au/analyze/0d4f7c1e-9b2a-4c3d-8e5f-6a7b8c9d0e1f");
    expect(mail.html).toMatch(/\/api\/analyses\/0d4f7c1e-9b2a-4c3d-8e5f-6a7b8c9d0e1f\/report\.pdf\?token=/);
    expect(mail.html).toContain("Auschain PTY LTD");
    expect(mail.html).toContain("/unsubscribe?token=");
    expect(mail.headers?.["List-Unsubscribe"]).toBeTruthy();
    expect(mail.attachments).toHaveLength(1);
    expect(mail.attachments?.[0].filename).toBe("blockid-first-analysis.pdf");
    expect(mail.html).not.toMatch(/hurry|last chance|% off|discount|limited time|act now/i);
  });

  it("a partial report goes out as '(part 1)' naming the voices still being written; the completion as '(complete)'", async () => {
    canSendEmailMock.mockResolvedValue(true);
    const { sendFirstAnalysisReportEmail } = await import("./email");
    const a = await args();
    delete a.report.agents.clo;
    delete a.report.agents.chro;
    delete a.report.agents.cpo;
    a.report.sections = { clo: { status: "failed", attempts: 1 }, chro: { status: "failed", attempts: 1 }, cpo: { status: "unavailable", attempts: 3 } };
    expect((await sendFirstAnalysisReportEmail({ ...a, part: "partial" })).ok).toBe(true);
    let mail = lastMail();
    expect(mail.subject).toBe("Your BlockID first analysis — Kelpie (part 1)");
    expect(mail.html).toContain("2 sections are still being written (CLO, CHRO)");
    expect(mail.html).toContain("4 of the seven C-level voices");
    expect(mail.attachments?.[0].filename).toBe("blockid-first-analysis-part-1.pdf");

    expect((await sendFirstAnalysisReportEmail({ ...(await args()), part: "complete" })).ok).toBe(true);
    mail = lastMail();
    expect(mail.subject).toBe("Your BlockID first analysis — Kelpie (complete)");
    expect(mail.html).toContain("This replaces part 1");
    expect(mail.attachments?.[0].filename).toBe("blockid-first-analysis.pdf");
  });

  it("drops the attachment above 8 MB and relies on the signed link", async () => {
    canSendEmailMock.mockResolvedValue(true);
    const { sendFirstAnalysisReportEmail, FIRST_ANALYSIS_ATTACHMENT_MAX_BYTES } = await import("./email");
    const big = Buffer.alloc(FIRST_ANALYSIS_ATTACHMENT_MAX_BYTES + 1, 0x20);
    await sendFirstAnalysisReportEmail(await args({ pdf: big }));
    const mail = lastMail();
    expect(mail.attachments ?? []).toHaveLength(0);
    expect(mail.html).toMatch(/report\.pdf\?token=/);
    expect(mail.html).not.toContain("also attached");
  });
});

// ---------------------------------------------------------------------------
// S26 review — withFromName: the founder's display name on the PLATFORM
// sender. Header-injection guard: CR/LF, quotes and angle brackets can never
// reach the From header, and the address never changes.
// ---------------------------------------------------------------------------

describe("withFromName (S26-A founder display name on the platform sender)", () => {
  it("wraps the name on the configured address; quotes / angle brackets / CRLF are stripped; 80-char cap", async () => {
    const { withFromName } = await import("./email");
    expect(withFromName("info@blockid.au", "Jane Chen")).toBe('"Jane Chen via BlockID.au" <info@blockid.au>');
    expect(withFromName('"BlockID" <info@blockid.au>', "Jane Chen")).toBe('"Jane Chen via BlockID.au" <info@blockid.au>');
    const injected = withFromName("info@blockid.au", 'Jane"\r\nBcc: victim@example.com\r\n<evil@example.com>');
    expect(injected).not.toMatch(/[\r\n]/);
    expect(injected).not.toContain("evil@example.com>");
    expect(injected.endsWith("<info@blockid.au>")).toBe(true);
    expect(withFromName("info@blockid.au", "x".repeat(200)).length).toBeLessThan(120);
  });

  it("an empty / whitespace / null name leaves the configured sender untouched", async () => {
    const { withFromName } = await import("./email");
    expect(withFromName('"BlockID" <info@blockid.au>', null)).toBe('"BlockID" <info@blockid.au>');
    expect(withFromName("info@blockid.au", "  \r\n ")).toBe("info@blockid.au");
  });
});

// ---------------------------------------------------------------------------
// G18-A pricing truth (2026-09-20). A sweep found the nurture / credit e-mails
// still quoting the closed Founding 100 A$5 lifetime promo, a "standard plan
// A$49/mo", a 50-pack at A$15 and "10 credits for A$5". Every figure below is
// read from the same constants the checkout books against, and the closed
// promo must never appear in a subject or body again.
// ---------------------------------------------------------------------------

describe("G18-A pricing truth — nurture and credit e-mails quote the ladder", () => {
  beforeEach(() => {
    process.env.SMTP_USER = "u";
    process.env.SMTP_PASS = "p";
    process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
  });

  const CLOSED_PROMO = /Founding|A\$5\b|lifetime|founding-50|A\$49\b|A\$99\b|A\$499\b|A\$15\b|Save 70%/;

  async function ladder() {
    const { PLANS_V2, formatAud } = await import("./plans-v2");
    const { GENERATED_PLANS_BY_ID } = await import("@/config/pricing/plans.generated");
    const { CREDIT_PACKS } = await import("./credit-packs");
    const { SVI_ANALYSIS_CREDITS, FREE_SIGNUP_CREDITS } = await import("./credits-public");
    const starter = PLANS_V2.find((p) => p.id === "founder_starter")!;
    const credits = GENERATED_PLANS_BY_ID["founder_starter"].usage_limits.monthly_credits;
    const pack = (n: number) => CREDIT_PACKS.find((p) => p.credits === n)!;
    return { starter, credits, formatAud, pack, SVI_ANALYSIS_CREDITS, FREE_SIGNUP_CREDITS };
  }

  it("sendD9LastCall (lead-nurture cron) sells Starter at its plans-v2 price + trial, never the closed promo", async () => {
    const { starter, credits, formatAud } = await ladder();
    const { sendD9LastCall } = await import("./email");
    await sendD9LastCall({ to: "a@b.co", name: "Ana" });
    const mail = lastMail();
    const price = `${formatAud(starter.monthly_aud)}/mo`;
    expect(mail.subject).toBe(`Last call: ${starter.name} plan, ${price}, ${starter.trial_days}-day free trial`);
    expect(mail.html).toContain(`What ${price} gets you`);
    expect(mail.html).toContain(`${credits} AI credits every month`);
    expect(mail.html).toContain("https://blockid.au/pricing#tier-starter");
    expect(mail.html).not.toMatch(CLOSED_PROMO);
    expect(mail.subject).not.toMatch(CLOSED_PROMO);
  });

  it("sendCreditLowAlert (lib/credits.ts low-balance hook) prices the 10-pack from CREDIT_PACKS", async () => {
    const { pack, formatAud, SVI_ANALYSIS_CREDITS } = await ladder();
    const { sendCreditLowAlert } = await import("./email");
    await sendCreditLowAlert({ to: "a@b.co", currentBalance: 0.5 });
    const html = lastMail().html ?? "";
    const ten = pack(10);
    expect(html).toContain(`Buy ${ten.credits} credits for ${formatAud(ten.price)}`);
    expect(html).toContain(`That's ${Math.floor(ten.credits / SVI_ANALYSIS_CREDITS)} standard SVI analyses`);
    expect(html).toContain(`costs ${SVI_ANALYSIS_CREDITS.toFixed(2)} credits`);
    expect(html).not.toMatch(CLOSED_PROMO);
  });

  it("sendLowCreditAlert lists the 10 / 25 / 50 packs with their real price and savings badge", async () => {
    const { pack, formatAud } = await ladder();
    const { sendLowCreditAlert } = await import("./email");
    await sendLowCreditAlert({ to: "a@b.co", balance: 0.5 });
    const html = lastMail().html ?? "";
    for (const n of [10, 25, 50]) {
      const p = pack(n);
      expect(html).toContain(`${p.credits} Credits`);
      expect(html).toContain(`${formatAud(p.price)} <span`);
      expect(html).toContain(p.savings!);
    }
    expect(html).not.toMatch(CLOSED_PROMO);
  });

  it("sendUnlockDeeperAnalysis prices one analysis off the smallest pack and lists the 10 / 50 packs", async () => {
    const { pack, formatAud, SVI_ANALYSIS_CREDITS } = await ladder();
    const { CREDIT_PACKS } = await import("./credit-packs");
    const { sendUnlockDeeperAnalysis } = await import("./email");
    await sendUnlockDeeperAnalysis({ to: "a@b.co", name: "Ana", stageLabel: "Seed" });
    const mail = lastMail();
    const perCredit = CREDIT_PACKS[0].price / CREDIT_PACKS[0].credits;
    const fromLabel = `A$${(perCredit * SVI_ANALYSIS_CREDITS).toFixed(2)}`;
    expect(mail.html).toContain(`from ${fromLabel}`);
    expect(mail.html).toContain(`${formatAud(pack(50).price)} <span`);
    expect(mail.html).toContain(pack(50).savings!);
    expect(mail.html).not.toMatch(CLOSED_PROMO);
  });

  it("sendD1Welcome quotes the real free grant and per-analysis cost", async () => {
    const { SVI_ANALYSIS_CREDITS, FREE_SIGNUP_CREDITS } = await ladder();
    const { sendD1Welcome } = await import("./email");
    await sendD1Welcome({ to: "a@b.co" });
    expect(lastMail().html).toContain(`uses ${SVI_ANALYSIS_CREDITS} of your ${FREE_SIGNUP_CREDITS} free credits`);
  });

  it("sendPaymentLink (unwired since the promo closed) no longer brands itself Founding 100", async () => {
    const { sendPaymentLink } = await import("./email");
    await sendPaymentLink({ to: "a@b.co", name: "Ana", checkoutUrl: "https://x", finalPrice: 29, features: ["a"] });
    const mail = lastMail();
    expect(mail.subject).toBe("Complete Your BlockID Payment");
    expect(mail.html).not.toMatch(/Founding/);
  });
});
