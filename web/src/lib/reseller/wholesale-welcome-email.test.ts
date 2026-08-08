import { describe, it, expect } from "vitest";
import { buildWholesaleWelcomeEmail } from "./wholesale-welcome-email";

const base = {
  companyName: "Acme Pty Ltd",
  resellerDisplayName: "InfoVision",
  magicLinkUrl: "https://blockid.au/auth/verify?token=abc123",
  ttlHours: 24,
};

describe("buildWholesaleWelcomeEmail", () => {
  it("throws when companyName is missing", () => {
    expect(() =>
      buildWholesaleWelcomeEmail({ ...base, companyName: "" }),
    ).toThrow("companyName required");
  });

  it("throws when resellerDisplayName is missing", () => {
    expect(() =>
      buildWholesaleWelcomeEmail({ ...base, resellerDisplayName: "   " }),
    ).toThrow("resellerDisplayName required");
  });

  it("throws when magicLinkUrl is missing", () => {
    expect(() =>
      buildWholesaleWelcomeEmail({ ...base, magicLinkUrl: "" }),
    ).toThrow("magicLinkUrl required");
  });

  it("renders EN subject + company + reseller + magic-link", () => {
    const out = buildWholesaleWelcomeEmail(base);
    expect(out.subject).toContain("Acme Pty Ltd");
    expect(out.subject).toContain("Verify");
    expect(out.html).toContain("InfoVision");
    expect(out.html).toContain("Acme Pty Ltd");
    expect(out.html).toContain(base.magicLinkUrl);
    expect(out.text).toContain(base.magicLinkUrl);
    expect(out.text).toContain("Acme Pty Ltd");
  });

  it("renders VI locale with Vietnamese subject + provisional block", () => {
    const out = buildWholesaleWelcomeEmail({ ...base, locale: "vi" });
    expect(out.subject).toContain("Xác minh");
    expect(out.subject).not.toContain("Verify");
    expect(out.html).toContain("Trạng thái: Tạm thời");
    expect(out.html).not.toContain("Status: Provisional");
    expect(out.text).toContain("Xác minh");
  });

  it("includes provisional workspace banner (H.8) in EN body", () => {
    const out = buildWholesaleWelcomeEmail(base);
    expect(out.html).toContain("Status: Provisional");
    expect(out.html).toContain("read-only");
    expect(out.text).toContain("Status: Provisional");
  });

  it("includes non-payment reassurance in EN body (CPO §25)", () => {
    const out = buildWholesaleWelcomeEmail(base);
    expect(out.html).toContain("No payment required from you");
    expect(out.html).toContain("seller-of-record");
    expect(out.html).toContain("will not ask you for a credit card");
    expect(out.text).toContain("No payment required from you");
  });

  it("includes non-payment reassurance in VI body", () => {
    const out = buildWholesaleWelcomeEmail({ ...base, locale: "vi" });
    expect(out.html).toContain("Bạn không cần thanh toán");
    expect(out.html).toContain("bên phát hành hóa đơn");
  });

  it("escapes HTML in reseller display name + company name", () => {
    const out = buildWholesaleWelcomeEmail({
      ...base,
      companyName: '<img src=x onerror=alert(1)>',
      resellerDisplayName: '<script>hax</script>',
    });
    expect(out.html).not.toContain("<script>hax</script>");
    expect(out.html).not.toContain("<img src=x");
    expect(out.html).toContain("&lt;script&gt;");
    expect(out.html).toContain("&lt;img");
  });

  it("uses greeting with founderName when provided", () => {
    const out = buildWholesaleWelcomeEmail({ ...base, founderName: "Long" });
    expect(out.html).toContain("Hi Long,");
    expect(out.text).toContain("Hi Long,");
  });

  it("falls back to generic greeting when founderName is missing", () => {
    const en = buildWholesaleWelcomeEmail(base);
    expect(en.html).toContain("Hi there,");
    const vi = buildWholesaleWelcomeEmail({ ...base, locale: "vi" });
    expect(vi.html).toContain("Chào bạn,");
  });

  it("floors non-integer ttlHours and defaults invalid values to 24", () => {
    const withFractional = buildWholesaleWelcomeEmail({ ...base, ttlHours: 47.9 });
    expect(withFractional.html).toContain("next 47 hours");

    const withZero = buildWholesaleWelcomeEmail({ ...base, ttlHours: 0 });
    expect(withZero.html).toContain("next 24 hours");

    const withNegative = buildWholesaleWelcomeEmail({ ...base, ttlHours: -5 });
    expect(withNegative.html).toContain("next 24 hours");

    const withNaN = buildWholesaleWelcomeEmail({ ...base, ttlHours: Number.NaN });
    expect(withNaN.html).toContain("next 24 hours");
  });

  it("embeds co-branding footer from resellerFooterHtml", () => {
    const out = buildWholesaleWelcomeEmail(base);
    expect(out.html).toContain("Introduced by");
    expect(out.html).toContain("<strong");

    const vi = buildWholesaleWelcomeEmail({ ...base, locale: "vi" });
    expect(vi.html).toContain("Được giới thiệu bởi");
  });

  it("plain-text output ends with single trailing newline", () => {
    const out = buildWholesaleWelcomeEmail(base);
    expect(out.text.endsWith("\n")).toBe(true);
    expect(out.text.endsWith("\n\n")).toBe(false);
  });

  it("omits first-run pointer when guideUrl is absent (default)", () => {
    const out = buildWholesaleWelcomeEmail(base);
    expect(out.html).not.toContain("First run:");
    expect(out.html).not.toContain("You're on Phase 1 of 12");
    expect(out.text).not.toContain("First run:");
  });

  it("renders EN first-run pointer to /guide/01-vision when guideUrl set (CS §1)", () => {
    const guideUrl = "https://blockid.au/guide/01-vision";
    const out = buildWholesaleWelcomeEmail({ ...base, guideUrl });
    expect(out.html).toContain("First run: You&#39;re on Phase 1 of 12");
    expect(out.html).toContain("Open Chapter 1");
    expect(out.html).toContain(guideUrl);
    expect(out.text).toContain("First run: You're on Phase 1 of 12");
    expect(out.text).toContain(guideUrl);
  });

  it("renders VI first-run pointer with Vietnamese copy", () => {
    const guideUrl = "https://blockid.au/guide/01-vision";
    const out = buildWholesaleWelcomeEmail({ ...base, guideUrl, locale: "vi" });
    expect(out.html).toContain("Bắt đầu: Bạn đang ở Giai đoạn 1 trên 12");
    expect(out.html).toContain("Mở Chương 1");
    expect(out.html).toContain(guideUrl);
    expect(out.html).not.toContain("First run:");
  });

  it("escapes HTML in guideUrl to prevent injection", () => {
    const out = buildWholesaleWelcomeEmail({
      ...base,
      guideUrl: "https://blockid.au/guide?x=1&y=2\"><script>x</script>",
    });
    expect(out.html).not.toContain("<script>x</script>");
    expect(out.html).toContain("&amp;y=2");
  });
});
