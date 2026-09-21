// email-report (S-R4 → G27) — the report e-mail is the 1-page investment
// view rendered from ReportV2 (spec § 6).
//
//   - renderReportEmailHtml: intro, the four dashboard tiles, the verdict
//     block (band letter · label · wording · conviction · verbatim sub-line),
//     Conditions (B / C) or the band-D evidence CTAs with absolute links,
//     the 5 key points, the top 3 improvements, the CTA + share link, CID
//     <img> tags only for inlined PNGs; every label from tbr-v3-strings
//     (EN / VI), never-say safe, no raw citation marker;
//   - reportEmailSummary: the plain-text twin carries the same sections;
//   - weakestChapter picks the lowest scored chapter;
//   - reportFromLegacyArgs lifts the legacy dimResults / criterionResults;
//   - sendReportEmail: no real send — `@/lib/email` is mocked; pins the
//     unchanged subject line, the unsubscribe plumbing, the PDF + CID
//     attachments, the text part, the pipeline document taking precedence,
//     and the idempotency stamp.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { demoReportV2, investmentBandFixture, type InvestmentBandFixture } from "@/lib/report-v2/fixtures";
import { EMAIL_THEME } from "@/lib/email/theme";
import { TBR_V3_STRINGS } from "@/lib/i18n/tbr-v3-strings";
import { alignReportWithAssessmentCard } from "@/lib/svi/assessment-card";
import { buildInvestmentView } from "@/lib/report-v2/investment-view";

vi.mock("server-only", () => ({}));

const mail = vi.hoisted(() => ({ send: vi.fn(), footer: vi.fn() }));
vi.mock("@/lib/email", () => ({
  sendEmail: (...a: unknown[]) => mail.send(...a),
  complianceFooter: (...a: unknown[]) => mail.footer(...a),
}));

const db = vi.hoisted(() => ({ sb: null as ReturnType<typeof fakeSupabase> | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));

vi.mock("@/lib/pdf/tbr-pdf", () => ({
  renderTbrPdf: async () => ({ buffer: Buffer.from("%PDF-1.7 fake"), pages: 10, level: 0, overBudget: false }),
}));

import { absoluteHref, bandLabelForEmail, inlineVisuals, renderReportEmailHtml, reportEmailContext, reportEmailSummary, reportFromLegacyArgs, sendReportEmail, weakestChapter } from "./email-report";

const DASHBOARD = "https://blockid.au/workspace/reports/business?pid=p-1";
const SHARE = "https://blockid.au/tbr/tok-abc";
const EN = TBR_V3_STRINGS.en;
const VI = TBR_V3_STRINGS.vi;

/** The never-say list (docs/design/messaging.md § 11) + a benchmark figure without its n. */
const NEVER_SAY = /AI decides|predicts|Australian average|median \d+(?![^.]*n = )/;

/** Text content of the HTML body (tags stripped, entities decoded). */
function textOf(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

beforeEach(() => {
  mail.send.mockReset().mockResolvedValue({ ok: true, id: "msg-1" });
  mail.footer.mockReset().mockResolvedValue({ unsubscribeUrl: "https://blockid.au/u/abc", footerHtml: "<p>FOOTER</p>" });
  db.sb = fakeSupabase({
    app_users: [{ id: "u-1", email: "jo@acme.io", startup_name: "Acme Robotics" }],
    svi_accounts: [{ id: "acct-1", startup_name: "Acme Robotics" }],
    svi_snapshots: [{ id: "s-1", report_share_token: "tok-abc", report_email_sent_at: null, account_id: "acct-1", project_id: "p-1", created_at: "2026-09-12T00:00:00Z", svi_total: 74 }],
  });
});

describe("renderReportEmailHtml — the 1-page investment view", () => {
  it("carries the intro, the four tiles, the verdict block, conditions, 5 key points, 3 improvements, the CTA + share link and the PDF line", () => {
    const report = demoReportV2();
    const html = renderReportEmailHtml({ report, dashboardUrl: DASHBOARD, shareUrl: SHARE, images: { chart: "chart@x", weakest: "weak@x" }, footerHtml: "<p>FOOTER</p>" });
    const text = textOf(html);
    const { view, dash } = reportEmailContext(report);

    expect(html).toContain("Sample SME Compliance SaaS (demo)");
    expect(text).toContain(EN.emailIntro(report.cover.startupName));
    // The four tiles: label · value · sub (· note).
    expect(dash.tiles).toHaveLength(4);
    for (const tile of dash.tiles) {
      expect(text).toContain(tile.label);
      expect(text).toContain(tile.value);
      expect(text).toContain(tile.sub);
      if (tile.note) expect(text).toContain(tile.note);
    }
    expect(text).toContain(`${view.evidenceConfidence} %`);
    // Verdict block.
    expect(html).toContain(`>${view.band}<span`);
    expect(text).toContain(view.bandLabel);
    expect(text).toContain(view.bandWording);
    expect(text).toContain(view.convictionLine);
    expect(text).toContain(EN.subline);
    // The demo is band B → Conditions list with the same rows as the view.
    expect(view.band).toBe("B");
    expect(view.conditions.length).toBeGreaterThan(0);
    expect(text).toContain(EN.conditions);
    for (const cond of view.conditions) expect(text).toContain(cond.text);
    expect(text).not.toContain(EN.evidenceCtas);
    // Key points: five, in order.
    expect(view.keyPoints).toHaveLength(5);
    expect((html.match(/<li style="margin:0 0 5px 0;">/g) ?? []).length).toBe(5);
    for (const kp of view.keyPoints) expect(text).toContain(textOf(esc(kp)));
    // Improvements: exactly 3 rows, action · +lift SVI · window.
    expect(text).toContain(EN.emailImprovements);
    const rows = view.improvementPlan.slice(0, 3);
    expect(rows).toHaveLength(3);
    expect((html.match(/<td style="padding:8px;border-bottom:1px solid #e5e7eb;line-height:1.45;">/g) ?? []).length).toBe(3);
    for (const step of rows) {
      expect(text).toContain(EN.lift(step.expectedLift));
      expect(text).toContain(EN.window[step.window]);
    }
    expect(text).toContain(EN.planNote);
    // CTA + share link + images + PDF + footer.
    expect(html).toContain(`href="${esc(DASHBOARD)}"`);
    expect(text).toContain(EN.emailOpenFull);
    expect(html).toContain(SHARE);
    expect(html).toContain('src="cid:chart@x"');
    expect(html).toContain('src="cid:weak@x"');
    expect(html).not.toContain("cid:null");
    expect(html).toContain("The PDF is attached");
    expect(html).toContain("<p>FOOTER</p>");
  });

  it("omits images, the share line and the PDF line when none is available", () => {
    const html = renderReportEmailHtml({ report: demoReportV2(), dashboardUrl: "https://x", shareUrl: null, pdfAttached: false });
    expect(html).not.toContain("cid:");
    expect(html).not.toContain("The PDF is attached");
    expect(html).not.toContain("/tbr/");
  });

  it("uses inline styles only, the light palette and tabular numbers", () => {
    const html = renderReportEmailHtml({ report: demoReportV2(), dashboardUrl: DASHBOARD, shareUrl: SHARE });
    expect(html).not.toMatch(/<style|<link|class="/);
    for (const hex of [EMAIL_THEME.inkMuted, EMAIL_THEME.navy, EMAIL_THEME.action, EMAIL_THEME.sunken]) expect(html).toContain(hex);
    expect(html).toContain("font-variant-numeric:tabular-nums");
    // No dark ground anywhere.
    expect(html).not.toMatch(/background:#0[0-9a-f]{5};/i);
  });

  it.each(["A", "B", "C", "D"] as const satisfies readonly InvestmentBandFixture[])("band %s fixture renders; D shows the evidence CTAs, A no conditions", (band) => {
    const f = investmentBandFixture(band);
    const html = renderReportEmailHtml({ report: f.report, dashboardUrl: DASHBOARD, shareUrl: SHARE, assessment: f.assessment });
    const text = textOf(html);
    const aligned = alignReportWithAssessmentCard(f.report, f.assessment);
    const view = buildInvestmentView(aligned.report, aligned.card, "en");
    expect(view.band).toBe(band);
    expect(html).toContain(`>${band}<span`);
    expect(text).toContain(EN.bandLabel[band]);
    expect(text).toContain(EN.subline);
    expect(view.keyPoints).toHaveLength(5);
    expect((html.match(/<li style="margin:0 0 5px 0;">/g) ?? []).length).toBe(5);
    expect((html.match(/<td style="padding:8px;border-bottom:1px solid #e5e7eb;line-height:1.45;">/g) ?? []).length).toBe(3);
    if (band === "A") {
      expect(view.conditions).toEqual([]);
      expect(text).not.toContain(EN.conditions);
      expect(text).not.toContain(EN.evidenceCtas);
    } else if (band === "D") {
      expect(view.evidenceCtas.length).toBeGreaterThan(0);
      expect(text).toContain(EN.evidenceCtas);
      expect(text).not.toContain(`${EN.conditions} 1.`);
      for (const cta of view.evidenceCtas) {
        expect(text).toContain(cta.label);
        expect(html).toContain(`href="${esc(absoluteHref(cta.href, "https://blockid.au"))}"`);
      }
    } else {
      expect(view.conditions.length).toBeGreaterThan(0);
      expect(text).toContain(EN.conditions);
      for (const cond of view.conditions) expect(text).toContain(cond.text);
    }
    // Every link is absolute.
    for (const href of hrefs(html)) expect(href, `absolute link: ${href}`).toMatch(/^https?:\/\//);
    // No raw citation marker, never-say safe.
    expect(text).not.toContain("[ev:");
    expect(text).not.toMatch(/\[unevidenced\]/i);
    expect(text).not.toMatch(NEVER_SAY);
  });

  it("VI locale renders the VI strings with diacritics", () => {
    const report = { ...demoReportV2(), locale: "vi" as const };
    const html = renderReportEmailHtml({ report, dashboardUrl: DASHBOARD, shareUrl: SHARE });
    const text = textOf(html);
    expect(text).toContain(VI.emailIntro(report.cover.startupName));
    expect(text).toContain(VI.subline);
    expect(text).toContain(VI.emailImprovements);
    expect(text).toContain(VI.emailOpenFull);
    expect(text).toContain(VI.sec.keyPoints);
    expect(text).toMatch(/[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ]/i);
    expect(text).not.toContain(EN.subline);
    expect(text).not.toMatch(NEVER_SAY);
  });
});

describe("reportEmailSummary — the plain-text twin", () => {
  it("carries tiles, verdict, conditions, key points, improvements and links", () => {
    const report = demoReportV2();
    const { view, dash } = reportEmailContext(report);
    const text = reportEmailSummary(report, "en", { dashboardUrl: DASHBOARD, shareUrl: SHARE });
    for (const tile of dash.tiles) expect(text).toContain(`${tile.label}: ${tile.value}`);
    expect(text).toContain(`${EN.sec.investmentView}: ${view.band} — ${view.bandLabel}`);
    expect(text).toContain(EN.subline);
    expect(text).toContain(EN.conditions);
    for (const cond of view.conditions) expect(text).toContain(cond.text);
    expect(text).toContain(EN.sec.keyPoints);
    expect(text).toContain("5. ");
    expect(text).toContain(EN.emailImprovements);
    expect(text).toContain(EN.lift(view.improvementPlan[0].expectedLift));
    expect(text).toContain(`${EN.emailOpenFull} ${DASHBOARD}`);
    expect(text).toContain(SHARE);
    expect(text).not.toContain("[ev:");
    expect(text).not.toMatch(NEVER_SAY);
  });

  it("band D lists the evidence CTAs as absolute links; the locale argument switches the strings", () => {
    const f = investmentBandFixture("D");
    const text = reportEmailSummary(f.report, "en", { assessment: f.assessment, baseUrl: "https://blockid.au" });
    expect(text).toContain(EN.evidenceCtas);
    expect(text).toMatch(/: https:\/\/blockid\.au\//);
    const vi = reportEmailSummary(f.report, "vi", { assessment: f.assessment });
    expect(vi).toContain(VI.evidenceCtas);
    expect(vi).toContain(VI.subline);
  });
});

describe("weakestChapter / reportFromLegacyArgs / bandLabelForEmail / absoluteHref", () => {
  it("picks the lowest scored chapter and ignores pending ones", () => {
    const report = demoReportV2();
    expect(weakestChapter(report)?.dim).toBe("svm"); // 65 in the demo
    report.dimensions = report.dimensions.map((d) => ({ ...d, band: "pending" as const }));
    expect(weakestChapter(report)).toBeNull();
  });

  it("legacy args lift to a valid adapter document that renders", () => {
    const r = reportFromLegacyArgs(
      {
        userId: "u-1",
        projectId: "p-1",
        dimResults: { tre: { score: 61, insights: ["x"] }, mpc: { score: 70 } },
        criterionResults: [{ key: "idea", title: "Idea", primary_dimension: "mpc", weight: 10, score: 74, verdict: "v", strengths: [], gaps: [], next_action: "" }],
        industry: "SaaS",
        stage: "Seed",
      },
      { startupName: "Acme", snapshotId: "s-1" },
    );
    expect(r.source).toBe("adapter");
    expect(r.cover.startupName).toBe("Acme");
    expect(r.dimensions).toHaveLength(8);
    expect(r.cover.dims.tre.score).toBe(61);
    const html = renderReportEmailHtml({ report: r, dashboardUrl: DASHBOARD, shareUrl: null });
    expect(textOf(html)).toContain(EN.subline);
  });

  it("subject-line vocabulary is unchanged", () => {
    expect(bandLabelForEmail("strong").label).toBe("Investor-Ready");
    expect(bandLabelForEmail("developing").label).toBe("Developing");
    expect(bandLabelForEmail("early").label).toBe("Early-Stage");
  });

  it("absoluteHref prefixes internal paths and leaves absolute URLs alone", () => {
    expect(absoluteHref("/workspace/evidence", "https://blockid.au/")).toBe("https://blockid.au/workspace/evidence");
    expect(absoluteHref("workspace/evidence", "https://blockid.au")).toBe("https://blockid.au/workspace/evidence");
    expect(absoluteHref("https://example.com/x", "https://blockid.au")).toBe("https://example.com/x");
  });
});

describe("inlineVisuals", () => {
  it("rasterises the dashboard chart and the weakest primary as CID attachments", async () => {
    const { images, attachments } = await inlineVisuals(demoReportV2());
    expect(attachments.map((a) => a.filename).sort()).toEqual(["chart.png", "weakest.png"]);
    expect(attachments.every((a) => a.contentType === "image/png" && a.cid.endsWith("@blockid.au"))).toBe(true);
    expect(images.chart).toBe(attachments.find((a) => a.filename === "chart.png")!.cid);
    expect(images.weakest).toBe(attachments.find((a) => a.filename === "weakest.png")!.cid);
  }, 30_000);
});

describe("sendReportEmail", () => {
  const legacyArgs = {
    userId: "u-1",
    projectId: "p-1",
    dimResults: { tre: { score: 61 }, mpc: { score: 70 } },
    criterionResults: [],
    industry: "SaaS",
    stage: "Seed",
    baseUrl: "https://blockid.au",
  };

  it("renders the pipeline's ReportV2 (precedence) with the unchanged subject, unsubscribe URL, PDF + inline PNGs + text twin, then stamps the snapshot", async () => {
    const report = demoReportV2();
    const res = await sendReportEmail({ ...legacyArgs, reportV2: report, snapshotId: "s-1" });
    expect(res).toMatchObject({ ok: true, sentTo: "jo@acme.io", shareToken: "tok-abc", pdfAttached: true, reportSource: "pipeline", inlineImages: 2 });
    expect(mail.send).toHaveBeenCalledTimes(1);
    const call = mail.send.mock.calls[0][0] as { to: string; subject: string; html: string; text: string; unsubscribeUrl: string; attachments: Array<{ filename: string; cid?: string }> };
    expect(call.to).toBe("jo@acme.io");
    expect(call.subject).toBe(`Your Trusted Business Report is ready — SVI ${Math.round(report.cover.svi.total)}/100 (${bandLabelForEmail(report.cover.svi.band).label})`);
    expect(call.unsubscribeUrl).toBe("https://blockid.au/u/abc");
    expect(call.html).toContain("Sample SME Compliance SaaS (demo)");
    expect(call.html).toContain(SHARE);
    expect(call.html).toContain(EN.subline);
    expect(call.text).toContain(EN.subline);
    expect(call.text).toContain(SHARE);
    expect(call.attachments.map((a) => a.filename).sort()).toEqual(["BlockID-Business-Report.pdf", "chart.png", "weakest.png"]);
    expect(call.attachments.filter((a) => a.cid)).toHaveLength(2);
    expect(db.sb!.find("svi_snapshots", "update").some((c) => (c.args[0] as { report_email_sent_at?: string }).report_email_sent_at)).toBe(true);
  }, 30_000);

  it("falls back to the adapter over the legacy args when nothing is stored", async () => {
    const res = await sendReportEmail(legacyArgs);
    expect(res.ok).toBe(true);
    // the fake DB returns the snapshot row for readSnapshotReportV2 with no report_v2 → adapter path.
    expect(["adapter", "legacy"]).toContain(res.reportSource);
    const call = mail.send.mock.calls[0][0] as { html: string; subject: string };
    expect(call.html).toContain("Acme Robotics");
    expect(call.subject).toMatch(/^Your Trusted Business Report is ready — SVI \d+\/100/);
  }, 30_000);

  it("is idempotent on report_email_sent_at and honest without a recipient", async () => {
    db.sb = fakeSupabase({
      app_users: [{ id: "u-1", email: "jo@acme.io" }],
      svi_accounts: [{ id: "acct-1", startup_name: "Acme" }],
      svi_snapshots: [{ id: "s-1", report_share_token: "tok", report_email_sent_at: "2026-09-12T00:00:00Z" }],
    });
    expect(await sendReportEmail(legacyArgs)).toMatchObject({ ok: true, reason: "already_sent" });
    expect(mail.send).not.toHaveBeenCalled();
    db.sb = fakeSupabase({ app_users: [{ id: "u-1", email: "" }] });
    expect(await sendReportEmail(legacyArgs)).toMatchObject({ ok: false, reason: "no_email" });
    db.sb = null;
    expect(await sendReportEmail(legacyArgs)).toMatchObject({ ok: false, reason: "supabase_unavailable" });
  });
});
