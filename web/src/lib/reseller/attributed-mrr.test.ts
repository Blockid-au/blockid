import { describe, expect, it } from "vitest";
import {
  computeAttributedMrr,
  computeAttributedMrrByReseller,
  computeMrrCentsForRow,
  formatWeeklyDigestAttributedMrrSection,
  type AttributedMrrRow,
  type AttributedSubscriptionRow,
} from "./attributed-mrr";

function monthly(reseller_id: string, price: number): AttributedSubscriptionRow {
  return { reseller_id, plan_id: "founder_growth", price_aud_cents: price, interval: "monthly" };
}

function yearly(reseller_id: string, price: number): AttributedSubscriptionRow {
  return { reseller_id, plan_id: "founder_growth_annual", price_aud_cents: price, interval: "yearly" };
}

describe("computeMrrCentsForRow", () => {
  it("returns monthly price unchanged", () => {
    expect(computeMrrCentsForRow(monthly("r1", 9900))).toBe(9900);
  });

  it("divides yearly price by 12", () => {
    expect(computeMrrCentsForRow(yearly("r1", 99000))).toBe(8250);
  });

  it("floors the division so mrr_cents stays whole-integer", () => {
    // 100 / 12 = 8.333 → floor 8
    expect(computeMrrCentsForRow(yearly("r1", 100))).toBe(8);
  });

  it("returns 0 for once interval", () => {
    expect(
      computeMrrCentsForRow({ reseller_id: "r1", plan_id: "credit_pack", price_aud_cents: 5000, interval: "once" }),
    ).toBe(0);
  });

  it("returns 0 for custom interval", () => {
    expect(
      computeMrrCentsForRow({ reseller_id: "r1", plan_id: "enterprise", price_aud_cents: 50000, interval: "custom" }),
    ).toBe(0);
  });

  it("returns 0 for null interval", () => {
    expect(
      computeMrrCentsForRow({ reseller_id: "r1", plan_id: null, price_aud_cents: 5000, interval: null }),
    ).toBe(0);
  });

  it("returns 0 for NaN / Infinity / non-positive prices", () => {
    expect(computeMrrCentsForRow(monthly("r1", Number.NaN))).toBe(0);
    expect(computeMrrCentsForRow(monthly("r1", Number.POSITIVE_INFINITY))).toBe(0);
    expect(computeMrrCentsForRow(monthly("r1", 0))).toBe(0);
    expect(computeMrrCentsForRow(monthly("r1", -100))).toBe(0);
  });
});

describe("computeAttributedMrr", () => {
  it("returns zeros when no rows are supplied", () => {
    const m = computeAttributedMrr([]);
    expect(m.active_subs).toBe(0);
    expect(m.mrr_cents).toBe(0);
  });

  it("sums monthly and yearly-normalised prices", () => {
    const m = computeAttributedMrr([
      monthly("r1", 9900),
      yearly("r1", 99000),
    ]);
    expect(m.active_subs).toBe(2);
    expect(m.mrr_cents).toBe(9900 + 8250);
  });

  it("counts once/custom subs but contributes 0 to mrr so mismatch is visible", () => {
    const m = computeAttributedMrr([
      monthly("r1", 9900),
      { reseller_id: "r1", plan_id: "credit_pack", price_aud_cents: 5000, interval: "once" },
      { reseller_id: "r1", plan_id: "ent", price_aud_cents: 50000, interval: "custom" },
    ]);
    expect(m.active_subs).toBe(3);
    expect(m.mrr_cents).toBe(9900);
  });

  it("counts garbled rows in the count but contributes 0 to mrr_cents", () => {
    const m = computeAttributedMrr([
      monthly("r1", 9900),
      monthly("r1", Number.NaN),
      yearly("r1", Number.POSITIVE_INFINITY),
      monthly("r1", -100),
    ]);
    expect(m.active_subs).toBe(4);
    expect(m.mrr_cents).toBe(9900);
  });
});

describe("computeAttributedMrrByReseller", () => {
  it("returns one AttributedMrr per requested reseller id, even when the reseller has zero active subs", () => {
    const out = computeAttributedMrrByReseller(["r1", "r2", "r3"], [
      monthly("r1", 2900),
      yearly("r2", 99000),
    ]);
    expect(out.size).toBe(3);
    expect(out.get("r1")?.mrr_cents).toBe(2900);
    expect(out.get("r2")?.mrr_cents).toBe(8250);
    expect(out.get("r3")?.mrr_cents).toBe(0);
    expect(out.get("r3")?.active_subs).toBe(0);
  });

  it("groups rows by reseller_id without leaking across partners", () => {
    const out = computeAttributedMrrByReseller(["r1", "r2"], [
      monthly("r1", 9900),
      monthly("r1", 2900),
      yearly("r2", 99000),
    ]);
    expect(out.get("r1")?.active_subs).toBe(2);
    expect(out.get("r1")?.mrr_cents).toBe(12800);
    expect(out.get("r2")?.active_subs).toBe(1);
    expect(out.get("r2")?.mrr_cents).toBe(8250);
  });

  it("ignores rows whose reseller_id is not in the requested list", () => {
    const out = computeAttributedMrrByReseller(["r1"], [
      monthly("r1", 9900),
      monthly("r-orphan", 99900),
    ]);
    expect(out.size).toBe(1);
    expect(out.get("r1")?.mrr_cents).toBe(9900);
  });
});

function mrrRow(
  code: string,
  display: string,
  seed: AttributedSubscriptionRow[],
): AttributedMrrRow {
  return {
    reseller_id: `rid-${code.toLowerCase()}`,
    reseller_code: code,
    reseller_display_name: display,
    mrr: computeAttributedMrr(seed),
  };
}

describe("formatWeeklyDigestAttributedMrrSection", () => {
  it("returns an empty string when no rows are supplied", () => {
    expect(formatWeeklyDigestAttributedMrrSection([])).toBe("");
  });

  it("renders the section header + column labels", () => {
    const html = formatWeeklyDigestAttributedMrrSection([
      mrrRow("ALPHA", "Alpha", [monthly("rid-alpha", 9900)]),
    ]);
    expect(html).toContain("Attributed MRR");
    expect(html).toContain("subscription_trial_state");
    expect(html).toContain(">Code<");
    expect(html).toContain(">Display name<");
    expect(html).toContain(">Active subs<");
    expect(html).toContain(">MRR (AUD)<");
    expect(html).toContain(">ARR (AUD)<");
  });

  it("sorts rows by reseller_code alphabetically", () => {
    const html = formatWeeklyDigestAttributedMrrSection([
      mrrRow("ZULU", "Zulu", [monthly("rid-zulu", 2500)]),
      mrrRow("ALPHA", "Alpha", [monthly("rid-alpha", 1000)]),
    ]);
    expect(html.indexOf("ALPHA")).toBeLessThan(html.indexOf("ZULU"));
  });

  it("formats MRR + ARR as A$D.CC", () => {
    const html = formatWeeklyDigestAttributedMrrSection([
      mrrRow("ALPHA", "Alpha", [monthly("rid-alpha", 12345)]),
    ]);
    expect(html).toContain("A$123.45");
    // ARR = 12345 × 12 = 148140 = A$1481.40
    expect(html).toContain("A$1481.40");
  });

  it("pads sub-dollar amounts so A$1.05 does not render as A$1.5", () => {
    const html = formatWeeklyDigestAttributedMrrSection([
      mrrRow("ALPHA", "Alpha", [monthly("rid-alpha", 105)]),
    ]);
    expect(html).toContain("A$1.05");
  });

  it("HTML-escapes hostile display names so a bad row cannot inject markup", () => {
    const html = formatWeeklyDigestAttributedMrrSection([
      mrrRow("XSS", "<script>alert(1)</script>", [monthly("rid-xss", 9900)]),
    ]);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("renders a <tfoot> Total row summing active_subs and MRR across rows", () => {
    const html = formatWeeklyDigestAttributedMrrSection([
      mrrRow("ALPHA", "Alpha", [monthly("rid-alpha", 9900), monthly("rid-alpha", 2900)]),
      mrrRow("BETA", "Beta", [yearly("rid-beta", 99000)]),
    ]);
    expect(html).toContain("<tfoot>");
    // Subs total: 3
    expect(html).toContain("<strong>3</strong>");
    // MRR total: 9900 + 2900 + 8250 = 21050 = A$210.50
    expect(html).toContain("<strong>A$210.50</strong>");
    // ARR total: 21050 × 12 = 252600 = A$2526.00
    expect(html).toContain("<strong>A$2526.00</strong>");
  });

  it("renders zeroed rows explicitly rather than omitting them so a partner with zero MRR is visible", () => {
    const html = formatWeeklyDigestAttributedMrrSection([
      mrrRow("ZERO", "Zero", []),
    ]);
    expect(html).toContain("ZERO");
    expect(html).toContain("A$0.00");
  });

  it("renders 5 <td> cells per body row (code, display, active_subs, mrr, arr)", () => {
    const html = formatWeeklyDigestAttributedMrrSection([
      mrrRow("ALPHA", "Alpha", [monthly("rid-alpha", 9900)]),
    ]);
    const tbodyStart = html.indexOf("<tbody>");
    const tbodyEnd = html.indexOf("</tbody>");
    const body = html.slice(tbodyStart, tbodyEnd);
    const cellCount = (body.match(/<td[\s>]/g) ?? []).length;
    expect(cellCount).toBe(5);
  });

  it("MRR column is monthly-normalised even when the seed includes yearly plans", () => {
    const html = formatWeeklyDigestAttributedMrrSection([
      mrrRow("ALPHA", "Alpha", [yearly("rid-alpha", 99000)]),
    ]);
    // MRR = 99000 / 12 = 8250 = A$82.50; ARR = 82.50 × 12 = A$990.00 (loops back).
    // Assert both appear and the MRR cell comes before the ARR cell in the body row.
    const tbodyStart = html.indexOf("<tbody>");
    const tbodyEnd = html.indexOf("</tbody>");
    const body = html.slice(tbodyStart, tbodyEnd);
    expect(body).toContain("A$82.50");
    expect(body).toContain("A$990.00");
    expect(body.indexOf("A$82.50")).toBeLessThan(body.indexOf("A$990.00"));
  });
});
