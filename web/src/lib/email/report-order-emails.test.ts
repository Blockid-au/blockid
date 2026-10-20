// G35 P3 (gap G4) — report_orders lifecycle e-mails. T-class (report
// delivery / receipt): no offers, tier named, Verified due date in Sydney time.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sendEmailMock = vi.fn(async (_a: { to: string; subject: string; html: string; template?: string }) => ({ ok: true as const, id: "m1" }));
vi.mock("@/lib/email-core", () => ({ sendEmail: (a: { to: string; subject: string; html: string; template?: string }) => sendEmailMock(a) }));
vi.mock("@/lib/email", () => ({
  complianceFooter: async () => ({ unsubscribeUrl: "https://blockid.au/u", preferencesUrl: "https://blockid.au/p", footerHtml: "<footer/>", footerText: "" }),
}));

import { nextStepsText, sendGuestFullReportPaid, sendReportOrderInReview, sendReportOrderPaid, sendReportOrderReady, sydneyDueLabel } from "./report-order-emails";
import { verifiedSlaDueAt } from "@/lib/time/au-business-days";

beforeEach(() => {
  sendEmailMock.mockClear();
});

describe("report order e-mails", () => {
  it("paid: tier, amount (inc. GST), what happens next, order link", async () => {
    await sendReportOrderPaid({ to: "f@x.au", orderId: "o1", tier: "snapshot", amountCents: 1900, slaBusinessDays: 2 });
    const a = sendEmailMock.mock.calls[0][0];
    expect(a.subject).toBe("Payment received — your BlockID Snapshot report");
    expect(a.html).toContain("A$19.00");
    expect(a.html).toContain("A$19.00 inc. GST");
    expect(a.html).toContain("usually ready within an hour");
    expect(a.html).toContain("/workspace/reports/business?order=o1");
    expect(a.template).toBe("report_order_paid");
  });

  it("paid Verified explains the review and the business-day window", async () => {
    await sendReportOrderPaid({ to: "f@x.au", orderId: "o2", tier: "verified", amountCents: 14900, slaBusinessDays: 2 });
    expect(sendEmailMock.mock.calls[0][0].html).toContain("within 2 business days");
    expect(nextStepsText("full", 2, true)).toMatch(/no new analysis/);
  });

  it("ready: link to the report, no price", async () => {
    await sendReportOrderReady({ to: "f@x.au", orderId: "o3", tier: "full" });
    const a = sendEmailMock.mock.calls[0][0];
    expect(a.subject).toBe("Your BlockID Full report is ready");
    expect(a.html).not.toMatch(/A\$\d/);
  });

  it("in review: 'within 2 business days' and the due date in Sydney time", async () => {
    const due = verifiedSlaDueAt(new Date("2026-10-20T03:00:00Z"), 2);
    await sendReportOrderInReview({ to: "f@x.au", orderId: "o4", dueAt: due, slaBusinessDays: 2 });
    const a = sendEmailMock.mock.calls[0][0];
    expect(a.subject).toContain("ready within 2 business days");
    expect(a.html).toContain(sydneyDueLabel(due));
    expect(sydneyDueLabel(due)).toMatch(/Thursday,? 22 October 2026.*\(Sydney time\)/);
  });

  it("P2-1: evaluator orders link the order-scoped view (never the founder ReportV2 page); founders unchanged", async () => {
    await sendReportOrderPaid({ to: "e@x.au", orderId: "o6", tier: "full", amountCents: 4900, slaBusinessDays: 2, evaluator: true });
    await sendReportOrderReady({ to: "e@x.au", orderId: "o6", tier: "full", evaluator: true });
    await sendReportOrderInReview({ to: "e@x.au", orderId: "o6", dueAt: new Date(), slaBusinessDays: 2, evaluator: true });
    for (const [a] of sendEmailMock.mock.calls) {
      expect(a.html).toContain('href="https://blockid.au/workspace/reports/order?order=o6&amp;view=legacy"');
      expect(a.html).not.toContain("/workspace/reports/business?order=");
    }
    sendEmailMock.mockClear();
    await sendReportOrderReady({ to: "f@x.au", orderId: "o7", tier: "full" });
    expect(sendEmailMock.mock.calls[0][0].html).toContain('href="https://blockid.au/workspace/reports/business?order=o7"');
  });

  it("none of them says upgrade / buy (EM08)", async () => {
    await sendReportOrderPaid({ to: "f@x.au", orderId: "o5", tier: "full", amountCents: 3000, slaBusinessDays: 2, isTierChange: true });
    await sendReportOrderReady({ to: "f@x.au", orderId: "o5", tier: "full" });
    await sendReportOrderInReview({ to: "f@x.au", orderId: "o5", dueAt: new Date(), slaBusinessDays: 2 });
    for (const [a] of sendEmailMock.mock.calls) {
      expect(a.html).not.toMatch(/\bupgrad|\bbuy\b|\/pricing/i);
    }
  });
});

describe("guest Full receipt (G35 D26)", () => {
  it("receipt: amount inc. GST, tax-invoice line, signed report link, claim sentence", async () => {
    await sendGuestFullReportPaid({ to: "g@x.au", guestOrderId: "11111111-2222-4333-8444-555555555555", amountCents: 4900, reportUrl: "https://blockid.au/analyze/a1?t=sig" });
    const a = sendEmailMock.mock.calls[0][0];
    expect(a.subject).toBe("Payment received — your BlockID Full report");
    expect(a.html).toContain("A$49.00 inc. GST");
    expect(a.html).toContain("all 16 sections");
    expect(a.html).toMatch(/Tax invoice · .+ · ABN [\d ]+ · Full report · A\$49\.00 inc\. GST · Order 11111111/);
    expect(a.html).toContain('href="https://blockid.au/analyze/a1?t=sig"');
    expect(a.html).toContain("sign in with this e-mail address");
    expect(a.html).not.toMatch(/\bupgrad|\bbuy\b|\/pricing/i);
    expect(a.template).toBe("guest_full_report_paid");
  });

  it("no link secret → no button, still a receipt", async () => {
    await sendGuestFullReportPaid({ to: "g@x.au", guestOrderId: "o", amountCents: 4900, reportUrl: null });
    const a = sendEmailMock.mock.calls[0][0];
    expect(a.html).not.toContain("Open your report");
    expect(a.html).toContain("We will e-mail you the report with its PDF");
  });
});
