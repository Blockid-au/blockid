// G19-S45 (D4) — the thin order wrapper: a v2 order renders the ReportV2
// document (8 chapters, no locked chapter, no rail); a pre-v2 order keeps
// the executive summary + the legacy markdown collapsed; exports point at
// the order-scoped route (v2 twins server-side, no second charge).
// renderToStaticMarkup on the pure ready / pending / blocked pieces.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));

import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { reportOrderPath } from "@/lib/paywall/report-delivery";
import { TBR_V2_SECTION_IDS } from "@/components/tbr/v2/report";
import { TBR_UNLOCK_RAIL_TESTID } from "@/components/tbr/v2/unlock-rail";
import { ReportOrderBlocked, ReportOrderPending, ReportOrderReady, reportOrderExportHref } from "./ReportOrderView";
import type { OrderMeta, ReportPayload } from "./use-report-order";

const ORDER_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const order: OrderMeta = { orderId: ORDER_ID, status: "READY", paidAt: "2026-09-20T00:01:00.000Z", generatedAt: "2026-09-20T00:05:00.000Z", expiresAt: "2026-12-19T00:01:00.000Z", amountAud: 300, creditsUsed: 0 };
const legacy: ReportPayload = {
  reportId: "r-1",
  title: "SVI Enhanced Report: Acme Pty Ltd",
  tier: "standard",
  executiveSummary: "Acme scores 142 on the Startup Value Index.",
  markdown: "# Acme\n\n## Market Opportunity\n\nTAM is A$4.2b in Australia.\n",
  totalWords: 5200,
  sectionsCount: 2,
  qualityScore: 88.5,
  reportV2: null,
};

describe("<ReportOrderReady> (G19-S45 D4)", () => {
  it("a v2 order renders <TbrReportV2> with all 8 chapters unlocked — no rail, no locked preview, no markdown wall", () => {
    const html = renderToStaticMarkup(<ReportOrderReady order={order} report={{ ...legacy, reportV2: demoReportV2() }} />);
    expect(html).toContain('data-report-order-source="report_v2"');
    for (const dim of ["tre", "mpc", "ftv", "ptd", "cgh", "iri", "lco", "svm"]) expect(html).toContain(`id="${TBR_V2_SECTION_IDS.dim(dim)}"`);
    expect((html.match(/data-tbr-primary="/g) ?? []).length).toBe(8);
    expect(html).not.toContain(`data-testid="${TBR_UNLOCK_RAIL_TESTID}"`);
    expect(html).not.toContain("data-tbr-locked=");
    expect(html).not.toContain('data-testid="report-order-legacy"');
    expect(html).not.toContain("TAM is A$4.2b");
    // Exports are order-scoped (the route renders the v2 twins) and the workspace link goes to the ReportV2 page.
    expect(html).toContain(`href="${reportOrderExportHref(ORDER_ID, "pdf")}"`);
    expect(html).toContain(`href="${reportOrderExportHref(ORDER_ID, "docx")}"`);
    expect(html).toContain(`href="${reportOrderPath(ORDER_ID)}"`);
    expect(html).toContain("Paid A$3.00");
  });

  it("a legacy order (no report_json) keeps the executive summary and the markdown collapsed under 'Legacy text version'", () => {
    const html = renderToStaticMarkup(<ReportOrderReady order={order} report={legacy} />);
    expect(html).toContain('data-report-order-source="legacy_markdown"');
    expect(html).toContain('data-testid="report-order-legacy"');
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("Legacy text version (5,200 words)");
    expect(html).toContain("TAM is A$4.2b");
    expect(html).toContain("Acme scores 142");
    expect(html).not.toContain("data-tbr-primary=");
    expect(html).toContain(`href="${reportOrderExportHref(ORDER_ID, "pdf")}"`);
  });

  it("credits path shows the credits redeemed", () => {
    const html = renderToStaticMarkup(<ReportOrderReady order={{ ...order, amountAud: 0, creditsUsed: 25 }} report={legacy} />);
    expect(html).toContain("Redeemed 25 credits");
  });

  it("VI: the chrome comes from tbr-strings (diacritics), the v2 document renders its Vietnamese chapter titles", () => {
    const html = renderToStaticMarkup(<ReportOrderReady order={order} report={{ ...legacy, reportV2: demoReportV2() }} locale="vi" />);
    expect(html).toContain("Báo cáo Kinh doanh Tin cậy");
    expect(html).toContain("Tải DOCX");
    expect(html).toContain("Bằng chứng tăng trưởng &amp; doanh thu");
    expect(html).not.toContain("Download DOCX");
  });
});

describe("pending / blocked panels", () => {
  it("pending shows the server sentence and a progress bar", () => {
    const html = renderToStaticMarkup(<ReportOrderPending message="Payment received. Your report is queued." />);
    expect(html).toContain('data-testid="report-order-pending"');
    expect(html).toContain("Payment received.");
    expect(html).toContain('role="progressbar"');
  });

  it("blocked: refunded vs unavailable headline + the support reference", () => {
    const refunded = renderToStaticMarkup(<ReportOrderBlocked refunded message="Money returned." />);
    expect(refunded).toContain("This order was refunded");
    const failed = renderToStaticMarkup(<ReportOrderBlocked refunded={false} message="Could not finish." failureReason="orchestration_failed: x" />);
    expect(failed).toContain("This report is not available");
    expect(failed).toContain("Reference: orchestration_failed: x");
  });
});
