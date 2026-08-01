// Colocated vitest for `web/src/lib/email-enhanced.ts` — the styled-HTML
// SVI report emailer with PDF/DOCX attachments. Silent regressions here
// leak founder-visible email defects:
//   * losing the `canSendEmail` short-circuit would ship marketing content
//     to founders who unsubscribed from svi_alerts (breaks the P7 opt-out
//     contract in email_preferences.ts)
//   * losing the `.slice(0, 500)` cap on reportSummary would spray a
//     multi-thousand-char narrative into the transactional email body
//   * losing the score → colour/tier ladder would render a red "Early
//     Stage" badge for an 85-score startup
//   * losing the vi locale branch would ship English disclaimers to a
//     Vietnamese founder — an AFSL disclaimer-locale mismatch that the
//     au-compliance skill treats as a legal risk
//   * losing the attachments builder would omit the PDF/DOCX filenames
//     from the HTML section AND from the SMTP attachments payload — the
//     founder sees a report link but no downloadable artefact
//   * losing the try/catch would let a supabase-transient failure crash
//     the sendEmail caller instead of returning {ok:false,error}
//
// Pins the observable contract:
//   - subject line format ("Your SVI Report: {name} — Score {n}") en / vi
//   - locale defaults to "en" when omitted; "vi" swaps LOCALE strings
//   - siteUrl() strips trailing slash; falls back when NEXT_PUBLIC_SITE_URL is unset
//   - scoreColor thresholds 80/60/40 → #10b981/#6c5ce7/#f59e0b/#ef4444
//   - scoreTier en: Strong/Promising/Developing/Early Stage
//   - scoreTier vi: Mạnh/Tiềm năng/Đang phát triển/Giai đoạn đầu
//   - ensureEmailPreferences is called with the recipient before send
//   - canSendEmail is called with category "svi_alerts"
//   - opt-out short-circuit: canSendEmail=false → {ok:false,error:"unsubscribed"},
//     sendEmail NOT called
//   - unsubscribe/preferences URLs fall back to `${siteUrl()}/unsubscribe`
//     and `${siteUrl()}/email-preferences` when the preference helpers
//     return null
//   - attachments: pdfBuffer only → 1 pdf attachment; docxBuffer only → 1
//     docx attachment; both → 2; neither → 0 attachments AND no
//     attachmentsList section in the HTML
//   - attachment filename shape "BlockID-SVI-{startupName}.pdf|.docx"
//   - docx contentType is the OOXML wordprocessingml MIME
//   - reportSummary >500 chars is sliced + "..." rendered
//   - reportSummary <=500 chars renders without "..."
//   - reportUrl becomes the CTA anchor href
//   - startupName appears in the subject, in the h2 heading, and in every
//     attachment filename
//   - sendEmail returning {ok:false, reason} passes reason through as
//     error; missing reason defaults to "unknown"
//   - sendEmail throwing → catch returns {ok:false, error: msg}; a
//     non-Error throw stringifies

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mocks — declared before the SUT import so the module graph resolves
// against the fakes.
const sendEmailMock = vi.fn();
const ensureEmailPreferencesMock = vi.fn();
const canSendEmailMock = vi.fn();
const getUnsubscribeUrlMock = vi.fn();
const getPreferencesUrlMock = vi.fn();

vi.mock("./email", () => ({
  sendEmail: (...args: unknown[]) => sendEmailMock(...args),
}));

vi.mock("./email-preferences", () => ({
  ensureEmailPreferences: (...args: unknown[]) =>
    ensureEmailPreferencesMock(...args),
  canSendEmail: (...args: unknown[]) => canSendEmailMock(...args),
  getUnsubscribeUrl: (...args: unknown[]) => getUnsubscribeUrlMock(...args),
  getPreferencesUrl: (...args: unknown[]) => getPreferencesUrlMock(...args),
}));

import { sendEnhancedReport } from "./email-enhanced";

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  unsubscribeUrl?: string;
  attachments?: Array<{
    filename: string;
    content: Buffer | Uint8Array;
    contentType?: string;
  }>;
};

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

beforeEach(() => {
  sendEmailMock.mockReset();
  ensureEmailPreferencesMock.mockReset();
  canSendEmailMock.mockReset();
  getUnsubscribeUrlMock.mockReset();
  getPreferencesUrlMock.mockReset();

  // Sensible defaults — happy path.
  ensureEmailPreferencesMock.mockResolvedValue("tok-xyz");
  canSendEmailMock.mockResolvedValue(true);
  getUnsubscribeUrlMock.mockResolvedValue(
    "https://blockid.au/unsubscribe?token=tok-xyz",
  );
  getPreferencesUrlMock.mockResolvedValue(
    "https://blockid.au/email-preferences?token=tok-xyz",
  );
  sendEmailMock.mockResolvedValue({ ok: true, id: "smtp-abc" });

  // Silence console noise from the SUT's error paths — the observable
  // contract lives in the return value, not the log line.
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_SITE_URL === undefined) {
    delete process.env.NEXT_PUBLIC_SITE_URL;
  } else {
    process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
  }
});

function baseOpts(overrides: Partial<Parameters<typeof sendEnhancedReport>[0]> = {}) {
  return {
    to: "founder@example.com",
    startupName: "Acme AI",
    sviScore: 72,
    stageLabel: "Seed",
    reportSummary: "Short executive summary of the analysis.",
    reportUrl: "https://blockid.au/rnd/report/abc123",
    ...overrides,
  };
}

function lastSend(): SendArgs {
  const call = sendEmailMock.mock.calls.at(-1);
  if (!call) throw new Error("sendEmail was not called");
  return call[0] as SendArgs;
}

describe("sendEnhancedReport — auth & short-circuit", () => {
  it("checks svi_alerts opt-out via canSendEmail before sending", async () => {
    await sendEnhancedReport(baseOpts());
    expect(canSendEmailMock).toHaveBeenCalledWith(
      "founder@example.com",
      "svi_alerts",
    );
  });

  it("ensures email preferences exist for the recipient", async () => {
    await sendEnhancedReport(baseOpts());
    expect(ensureEmailPreferencesMock).toHaveBeenCalledWith(
      "founder@example.com",
    );
  });

  it("short-circuits with {ok:false,error:'unsubscribed'} when canSendEmail returns false", async () => {
    canSendEmailMock.mockResolvedValueOnce(false);
    const result = await sendEnhancedReport(baseOpts());
    expect(result).toEqual({ ok: false, error: "unsubscribed" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("sendEnhancedReport — locale + subject", () => {
  it("defaults to en locale when locale is omitted", async () => {
    await sendEnhancedReport(baseOpts({ startupName: "Acme AI", sviScore: 72 }));
    const args = lastSend();
    expect(args.subject).toBe("Your SVI Report: Acme AI — Score 72");
    expect(args.html).toContain("Startup Viability Index Report");
    expect(args.html).toContain("Executive Summary");
    expect(args.html).toContain("Auschain PTY LTD (ACN 659 615 111)");
  });

  it("uses vi locale strings when locale='vi'", async () => {
    await sendEnhancedReport(
      baseOpts({ locale: "vi", startupName: "Acme AI", sviScore: 72 }),
    );
    const args = lastSend();
    expect(args.subject).toBe("Báo cáo SVI của bạn: Acme AI — Score 72");
    expect(args.html).toContain("Báo cáo Chỉ số Khả thi Khởi nghiệp");
    expect(args.html).toContain("Tóm tắt điều hành");
    expect(args.html).toContain(
      "Vui lòng tham khảo ý kiến của cố vấn tài chính",
    );
    expect(args.html).not.toContain("Startup Viability Index Report");
  });
});

describe("sendEnhancedReport — score → colour + tier ladder", () => {
  it("renders green + Strong for score >= 80", async () => {
    await sendEnhancedReport(baseOpts({ sviScore: 85 }));
    const html = lastSend().html;
    expect(html).toContain("#10b981");
    expect(html).toContain(">Strong<");
  });

  it("renders purple + Promising for 60..79", async () => {
    await sendEnhancedReport(baseOpts({ sviScore: 60 }));
    const html = lastSend().html;
    expect(html).toContain("#6c5ce7");
    expect(html).toContain(">Promising<");
  });

  it("renders amber + Developing for 40..59", async () => {
    await sendEnhancedReport(baseOpts({ sviScore: 42 }));
    const html = lastSend().html;
    expect(html).toContain("#f59e0b");
    expect(html).toContain(">Developing<");
  });

  it("renders red + Early Stage for score < 40", async () => {
    await sendEnhancedReport(baseOpts({ sviScore: 12 }));
    const html = lastSend().html;
    expect(html).toContain("#ef4444");
    expect(html).toContain(">Early Stage<");
  });

  it("renders vi tier labels aligned to the same ladder", async () => {
    await sendEnhancedReport(baseOpts({ sviScore: 82, locale: "vi" }));
    expect(lastSend().html).toContain(">Mạnh<");
    await sendEnhancedReport(baseOpts({ sviScore: 65, locale: "vi" }));
    expect(lastSend().html).toContain(">Tiềm năng<");
    await sendEnhancedReport(baseOpts({ sviScore: 45, locale: "vi" }));
    expect(lastSend().html).toContain(">Đang phát triển<");
    await sendEnhancedReport(baseOpts({ sviScore: 10, locale: "vi" }));
    expect(lastSend().html).toContain(">Giai đoạn đầu<");
  });
});

describe("sendEnhancedReport — summary truncation", () => {
  it("appends '...' when reportSummary exceeds 500 chars", async () => {
    const summary = "x".repeat(600);
    await sendEnhancedReport(baseOpts({ reportSummary: summary }));
    const html = lastSend().html;
    expect(html).toContain("x".repeat(500) + "...");
    // The 501st character must not leak through.
    expect(html).not.toContain("x".repeat(501));
  });

  it("does not append '...' when summary is <= 500 chars", async () => {
    const summary = "y".repeat(500);
    await sendEnhancedReport(baseOpts({ reportSummary: summary }));
    const html = lastSend().html;
    expect(html).toContain(summary);
    // Adjacent to the closing </p> tag so the "..." check is robust
    // against other legitimate uses of "..." elsewhere in the template.
    expect(html).not.toContain(summary + "...");
  });
});

describe("sendEnhancedReport — attachments", () => {
  it("emits zero attachments and no attachments section when no buffers are provided", async () => {
    await sendEnhancedReport(baseOpts());
    const args = lastSend();
    expect(args.attachments).toEqual([]);
    expect(args.html).not.toContain("Attached Documents");
  });

  it("emits a single PDF attachment with correct filename + contentType when only pdfBuffer is set", async () => {
    const pdf = Buffer.from("%PDF-1.4 mock");
    await sendEnhancedReport(baseOpts({ pdfBuffer: pdf }));
    const args = lastSend();
    expect(args.attachments).toEqual([
      {
        filename: "BlockID-SVI-Acme AI.pdf",
        content: pdf,
        contentType: "application/pdf",
      },
    ]);
    expect(args.html).toContain("Attached Documents");
    expect(args.html).toContain("BlockID-SVI-Acme AI.pdf");
    expect(args.html).not.toContain("BlockID-SVI-Acme AI.docx");
  });

  it("emits a single DOCX attachment with OOXML mime when only docxBuffer is set", async () => {
    const docx = Buffer.from("PK\x03\x04 mock");
    await sendEnhancedReport(baseOpts({ docxBuffer: docx }));
    const args = lastSend();
    expect(args.attachments).toEqual([
      {
        filename: "BlockID-SVI-Acme AI.docx",
        content: docx,
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      },
    ]);
    expect(args.html).toContain("BlockID-SVI-Acme AI.docx");
  });

  it("emits BOTH pdf + docx (pdf first) when both buffers are set", async () => {
    const pdf = Buffer.from("pdf");
    const docx = Buffer.from("docx");
    await sendEnhancedReport(baseOpts({ pdfBuffer: pdf, docxBuffer: docx }));
    const args = lastSend();
    expect(args.attachments).toHaveLength(2);
    expect(args.attachments?.[0].filename).toBe("BlockID-SVI-Acme AI.pdf");
    expect(args.attachments?.[1].filename).toBe("BlockID-SVI-Acme AI.docx");
    expect(args.html).toContain("BlockID-SVI-Acme AI.pdf");
    expect(args.html).toContain("BlockID-SVI-Acme AI.docx");
  });

  it("renders vi attachments label when locale='vi'", async () => {
    await sendEnhancedReport(
      baseOpts({ locale: "vi", pdfBuffer: Buffer.from("pdf") }),
    );
    const html = lastSend().html;
    expect(html).toContain("Tài liệu đính kèm");
    expect(html).not.toContain("Attached Documents");
  });
});

describe("sendEnhancedReport — URLs + CTA", () => {
  it("threads reportUrl into the CTA anchor href", async () => {
    await sendEnhancedReport(
      baseOpts({ reportUrl: "https://blockid.au/rnd/report/xyz" }),
    );
    expect(lastSend().html).toContain(
      'href="https://blockid.au/rnd/report/xyz"',
    );
  });

  it("uses the preference-helper URLs when they resolve", async () => {
    getUnsubscribeUrlMock.mockResolvedValueOnce(
      "https://blockid.au/unsubscribe?token=abc",
    );
    getPreferencesUrlMock.mockResolvedValueOnce(
      "https://blockid.au/email-preferences?token=abc",
    );
    await sendEnhancedReport(baseOpts());
    const args = lastSend();
    expect(args.unsubscribeUrl).toBe(
      "https://blockid.au/unsubscribe?token=abc",
    );
    expect(args.html).toContain("https://blockid.au/unsubscribe?token=abc");
    expect(args.html).toContain(
      "https://blockid.au/email-preferences?token=abc",
    );
  });

  it("falls back to `${siteUrl}/unsubscribe` and `/email-preferences` when helpers return null", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    getUnsubscribeUrlMock.mockResolvedValueOnce(null);
    getPreferencesUrlMock.mockResolvedValueOnce(null);
    await sendEnhancedReport(baseOpts());
    const args = lastSend();
    expect(args.unsubscribeUrl).toBe("https://blockid.au/unsubscribe");
    expect(args.html).toContain("https://blockid.au/unsubscribe");
    expect(args.html).toContain("https://blockid.au/email-preferences");
  });

  it("strips trailing slash from NEXT_PUBLIC_SITE_URL for fallback URLs", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.blockid.au/";
    getUnsubscribeUrlMock.mockResolvedValueOnce(null);
    getPreferencesUrlMock.mockResolvedValueOnce(null);
    await sendEnhancedReport(baseOpts());
    const args = lastSend();
    expect(args.unsubscribeUrl).toBe("https://staging.blockid.au/unsubscribe");
    // Guard against the `//unsubscribe` regression from a missed slash strip.
    expect(args.unsubscribeUrl).not.toContain("//unsubscribe");
    expect(args.html).toContain("https://staging.blockid.au/email-preferences");
  });
});

describe("sendEnhancedReport — startupName threading + payload shape", () => {
  it("routes to the founder email verbatim", async () => {
    await sendEnhancedReport(baseOpts({ to: "cofounder@startup.io" }));
    expect(lastSend().to).toBe("cofounder@startup.io");
  });

  it("threads startupName into subject, heading, and attachment filenames", async () => {
    await sendEnhancedReport(
      baseOpts({
        startupName: "Zeta Corp",
        pdfBuffer: Buffer.from("pdf"),
        docxBuffer: Buffer.from("docx"),
      }),
    );
    const args = lastSend();
    expect(args.subject).toContain("Zeta Corp");
    expect(args.html).toContain(">Zeta Corp</h2>");
    expect(args.attachments?.map((a) => a.filename)).toEqual([
      "BlockID-SVI-Zeta Corp.pdf",
      "BlockID-SVI-Zeta Corp.docx",
    ]);
  });

  it("threads stageLabel into the stage line", async () => {
    await sendEnhancedReport(baseOpts({ stageLabel: "Series A" }));
    expect(lastSend().html).toContain("<strong>Series A</strong>");
  });
});

describe("sendEnhancedReport — send-result passthrough", () => {
  it("returns {ok:true} when the underlying send succeeds", async () => {
    sendEmailMock.mockResolvedValueOnce({ ok: true, id: "smtp-999" });
    const result = await sendEnhancedReport(baseOpts());
    expect(result).toEqual({ ok: true });
  });

  it("passes the underlying reason through as error on failure", async () => {
    sendEmailMock.mockResolvedValueOnce({ ok: false, reason: "smtp-timeout" });
    const result = await sendEnhancedReport(baseOpts());
    expect(result).toEqual({ ok: false, error: "smtp-timeout" });
  });

  it("defaults error to 'unknown' when the failure has no reason", async () => {
    sendEmailMock.mockResolvedValueOnce({ ok: false });
    const result = await sendEnhancedReport(baseOpts());
    expect(result).toEqual({ ok: false, error: "unknown" });
  });

  it("catches thrown Error and returns {ok:false,error:message}", async () => {
    sendEmailMock.mockRejectedValueOnce(new Error("boom"));
    const result = await sendEnhancedReport(baseOpts());
    expect(result).toEqual({ ok: false, error: "boom" });
  });

  it("stringifies non-Error throws (e.g. string) rather than crashing the caller", async () => {
    sendEmailMock.mockRejectedValueOnce("nope");
    const result = await sendEnhancedReport(baseOpts());
    expect(result).toEqual({ ok: false, error: "nope" });
  });

  it("catches ensureEmailPreferences failures and returns {ok:false,error:message}", async () => {
    ensureEmailPreferencesMock.mockRejectedValueOnce(
      new Error("supabase-transient"),
    );
    const result = await sendEnhancedReport(baseOpts());
    expect(result).toEqual({ ok: false, error: "supabase-transient" });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
