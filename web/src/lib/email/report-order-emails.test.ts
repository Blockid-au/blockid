// G35 P3 (gap G4) — report_orders lifecycle e-mails. T-class (report
// delivery / receipt): no offers, tier named, Verified due date in Sydney time.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const sendEmailMock = vi.fn(async (_a: { to: string; subject: string; html: string; template?: string }) => ({ ok: true as const, id: "m1" }));
vi.mock("@/lib/email-core", () => ({ sendEmail: (a: { to: string; subject: string; html: string; template?: string }) => sendEmailMock(a) }));
vi.mock("@/lib/email", () => ({
  complianceFooter: async () => ({ unsubscribeUrl: "https://blockid.au/u", preferencesUrl: "https://blockid.au/p", footerHtml: "<footer/>", footerText: "" }),
}));

import { nextStepsText, sendReportOrderInReview, sendReportOrderPaid, sendReportOrderReady, sydneyDueLabel } from "./report-order-emails";
import { verifiedSlaDueAt } from "@/lib/time/au-business-days";

beforeEach(() => {
  sendEmailMock.mockClear();
});

describe("report order e-mails", () => {
  it("paid: tier, amount (GST incl.), what happens next, order link", async () => {
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

  it("none of them says upgrade / buy (EM08)", async () => {
    await sendReportOrderPaid({ to: "f@x.au", orderId: "o5", tier: "full", amountCents: 3000, slaBusinessDays: 2, isTierChange: true });
    await sendReportOrderReady({ to: "f@x.au", orderId: "o5", tier: "full" });
    await sendReportOrderInReview({ to: "f@x.au", orderId: "o5", dueAt: new Date(), slaBusinessDays: 2 });
    for (const [a] of sendEmailMock.mock.calls) {
      expect(a.html).not.toMatch(/\bupgrad|\bbuy\b|\/pricing/i);
    }
  });
});
