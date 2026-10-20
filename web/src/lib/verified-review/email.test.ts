import { beforeEach, describe, expect, it, vi } from "vitest";

const sent = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/email-core", () => ({ sendEmail: vi.fn(async (a: Record<string, unknown>) => (sent.calls.push(a), { ok: true, id: "m1" })) }));
vi.mock("@/lib/email", () => ({ SENDER_IDENTITY_HTML: "Auschain Pty Ltd &middot; ABN 79 659 615 111", SENDER_IDENTITY_LINE: "Auschain Pty Ltd · ABN 79 659 615 111" }));

import { INVESTOR_PACK_ATTACH_MAX_BYTES, renderVerifiedReviewedEmail, sendVerifiedReviewedEmail } from "./email";

const INPUT = {
  startupName: "Acme <Robotics>",
  reportUrl: "https://blockid.au/workspace/reports/business?order=o1",
  badgeLabel: "BlockID Reviewed · 22 Oct 2026 · Long Do",
  name: "Jamie Buyer",
  accepted: 3,
  reviewed: 4,
};

beforeEach(() => {
  sent.calls = [];
});

describe("Verified reviewed e-mail (T-class, report-delivery)", () => {
  it("template: escaped startup, badge, link, review counts, no price / upsell", () => {
    const m = renderVerifiedReviewedEmail({ ...INPUT, packAttached: true });
    expect(m.subject).toBe("Reviewed: your Verified report for Acme <Robotics>");
    expect(m.html).toContain("Acme &lt;Robotics&gt;");
    expect(m.html).not.toContain("<Robotics>");
    expect(m.html).toContain(INPUT.badgeLabel);
    expect(m.html).toContain(INPUT.reportUrl);
    expect(m.text).toContain("checked 4 evidence items behind the report and accepted 3");
    expect(m.text).toContain("Investor Pack (PDF) is attached");
    expect(m.html).not.toMatch(/A\$\s?\d|\/pricing|upgrad|\bbuy\b|credits?/i);
    expect(m.text).toContain("ABN 79 659 615 111");
  });

  it("sends T-class on the report-delivery flow with the pack attached", async () => {
    await sendVerifiedReviewedEmail({ to: "buyer@example.test", input: INPUT, investorPack: Buffer.from("%PDF") });
    expect(sent.calls[0]).toMatchObject({ to: "buyer@example.test", emailClass: "T", flow: "report-delivery", template: "verified_report_reviewed" });
    expect(sent.calls[0].attachments).toEqual([expect.objectContaining({ filename: "investor-pack-acme-robotics.pdf", contentType: "application/pdf" })]);
  });

  it("an oversized or missing pack goes without attachment and says how to get it", async () => {
    await sendVerifiedReviewedEmail({ to: "b@x.test", input: INPUT, investorPack: Buffer.alloc(INVESTOR_PACK_ATTACH_MAX_BYTES + 1) });
    expect(sent.calls[0].attachments).toBeUndefined();
    expect(String(sent.calls[0].text)).toContain("reply to this message");
    await sendVerifiedReviewedEmail({ to: "b@x.test", input: INPUT, investorPack: null });
    expect(sent.calls[1].attachments).toBeUndefined();
  });
});
