// email-report (S-R4) — the report email renders from ReportV2.
//
//   - renderReportEmailHtml: cover numbers (SVI, band, Δ, percentile), the
//     three questions, the weakest chapter (score / verdict / gap / next
//     action), the CTA + share link, CID <img> tags only for inlined PNGs;
//   - weakestChapter picks the lowest scored chapter;
//   - reportFromLegacyArgs lifts the legacy dimResults / criterionResults;
//   - sendReportEmail: no real send — `@/lib/email` is mocked; pins the
//     unchanged subject line, the unsubscribe plumbing, the PDF + CID
//     attachments, the pipeline document taking precedence, and the
//     idempotency stamp.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";
import { demoReportV2 } from "@/lib/report-v2/fixtures";

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

import { bandLabelForEmail, inlineVisuals, renderReportEmailHtml, reportFromLegacyArgs, sendReportEmail, weakestChapter } from "./email-report";

beforeEach(() => {
  mail.send.mockReset().mockResolvedValue({ ok: true, id: "msg-1" });
  mail.footer.mockReset().mockResolvedValue({ unsubscribeUrl: "https://blockid.au/u/abc", footerHtml: "<p>FOOTER</p>" });
  db.sb = fakeSupabase({
    app_users: [{ id: "u-1", email: "jo@acme.io", startup_name: "Acme Robotics" }],
    svi_accounts: [{ id: "acct-1", startup_name: "Acme Robotics" }],
    svi_snapshots: [{ id: "s-1", report_share_token: "tok-abc", report_email_sent_at: null, account_id: "acct-1", project_id: "p-1", created_at: "2026-09-12T00:00:00Z", svi_total: 74 }],
  });
});

describe("renderReportEmailHtml", () => {
  it("carries the cover numbers, the three questions, the weakest chapter and the CTA", () => {
    const report = demoReportV2();
    const html = renderReportEmailHtml({
      report,
      dashboardUrl: "https://blockid.au/workspace/reports/business?pid=p-1",
      shareUrl: "https://blockid.au/tbr/tok-abc",
      images: { ring: "ring@x", radar: null, weakest: "weak@x" },
      footerHtml: "<p>FOOTER</p>",
    });
    expect(html).toContain("Sample SME Compliance SaaS (demo)");
    expect(html).toContain(`>${Math.round(report.cover.svi.total)}<`);
    expect(html).toContain(bandLabelForEmail(report.cover.svi.band).label);
    expect(html).toContain("+3 vs last snapshot");
    for (const q of Object.values(report.cover.threeQuestions)) expect(html).toContain(q.replace(/&/g, "&amp;").replace(/'/g, "&#39;"));
    const weakest = weakestChapter(report)!;
    expect(html).toContain(`Weakest chapter — ${weakest.title.replace(/&/g, "&amp;")}`);
    expect(html).toContain(`>${weakest.score}<`);
    expect(html).toContain(weakest.nextAction.title.replace(/'/g, "&#39;"));
    expect(html).toContain('href="https://blockid.au/workspace/reports/business?pid=p-1"');
    expect(html).toContain("Open Business Report");
    expect(html).toContain("https://blockid.au/tbr/tok-abc");
    expect(html).toContain('src="cid:ring@x"');
    expect(html).toContain('src="cid:weak@x"');
    expect(html).not.toContain("cid:null");
    expect(html).toContain("The PDF is attached");
    expect(html).toContain("<p>FOOTER</p>");
  });

  it("omits images and the PDF line when neither is available", () => {
    const html = renderReportEmailHtml({ report: demoReportV2(), dashboardUrl: "https://x", shareUrl: null, pdfAttached: false });
    expect(html).not.toContain("cid:");
    expect(html).not.toContain("The PDF is attached");
    expect(html).not.toContain("Public share link");
  });
});

describe("weakestChapter / reportFromLegacyArgs / bandLabelForEmail", () => {
  it("picks the lowest scored chapter and ignores pending ones", () => {
    const report = demoReportV2();
    expect(weakestChapter(report)?.dim).toBe("svm"); // 65 in the demo
    report.dimensions = report.dimensions.map((d) => ({ ...d, band: "pending" as const }));
    expect(weakestChapter(report)).toBeNull();
  });

  it("legacy args lift to a valid adapter document", () => {
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
  });

  it("subject-line vocabulary is unchanged", () => {
    expect(bandLabelForEmail("strong").label).toBe("Investor-Ready");
    expect(bandLabelForEmail("developing").label).toBe("Developing");
    expect(bandLabelForEmail("early").label).toBe("Early-Stage");
  });
});

describe("inlineVisuals", () => {
  it("rasterises ring, radar and the weakest primary as CID attachments", async () => {
    const { images, attachments } = await inlineVisuals(demoReportV2());
    expect(attachments.map((a) => a.filename).sort()).toEqual(["radar.png", "ring.png", "weakest.png"]);
    expect(attachments.every((a) => a.contentType === "image/png" && a.cid.endsWith("@blockid.au"))).toBe(true);
    expect(images.ring).toBe(attachments.find((a) => a.filename === "ring.png")!.cid);
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

  it("renders the pipeline's ReportV2 (precedence) with the unchanged subject, unsubscribe URL, PDF + inline PNGs, then stamps the snapshot", async () => {
    const report = demoReportV2();
    const res = await sendReportEmail({ ...legacyArgs, reportV2: report, snapshotId: "s-1" });
    expect(res).toMatchObject({ ok: true, sentTo: "jo@acme.io", shareToken: "tok-abc", pdfAttached: true, reportSource: "pipeline", inlineImages: 3 });
    expect(mail.send).toHaveBeenCalledTimes(1);
    const call = mail.send.mock.calls[0][0] as { to: string; subject: string; html: string; unsubscribeUrl: string; attachments: Array<{ filename: string; cid?: string }> };
    expect(call.to).toBe("jo@acme.io");
    expect(call.subject).toBe(`Your Trusted Business Report is ready — SVI ${Math.round(report.cover.svi.total)}/100 (${bandLabelForEmail(report.cover.svi.band).label})`);
    expect(call.unsubscribeUrl).toBe("https://blockid.au/u/abc");
    expect(call.html).toContain("Sample SME Compliance SaaS (demo)");
    expect(call.html).toContain("https://blockid.au/tbr/tok-abc");
    expect(call.attachments.map((a) => a.filename).sort()).toEqual(["BlockID-Business-Report.pdf", "radar.png", "ring.png", "weakest.png"]);
    expect(call.attachments.filter((a) => a.cid)).toHaveLength(3);
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
