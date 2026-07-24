import { describe, expect, it } from "vitest";
import {
  computeClawbackExposure,
  computeClawbackExposureByReseller,
  formatWeeklyDigestClawbackExposureSection,
  type ClawbackExposureRow,
  type ExposedCommissionRow,
} from "./clawback-exposure";

function pending(reseller_id: string, cents: number): ExposedCommissionRow {
  return { reseller_id, commission_aud_cents: cents, status: "pending_clearance" };
}

function dispute(reseller_id: string, cents: number): ExposedCommissionRow {
  return { reseller_id, commission_aud_cents: cents, status: "dispute_open" };
}

describe("computeClawbackExposure", () => {
  it("returns zeros when no rows are supplied", () => {
    const e = computeClawbackExposure([]);
    expect(e.pending_count).toBe(0);
    expect(e.pending_cents).toBe(0);
    expect(e.dispute_count).toBe(0);
    expect(e.dispute_cents).toBe(0);
    expect(e.total_count).toBe(0);
    expect(e.total_cents).toBe(0);
  });

  it("sums pending commissions into the pending bucket", () => {
    const e = computeClawbackExposure([
      pending("r1", 1200),
      pending("r1", 800),
      pending("r1", 4000),
    ]);
    expect(e.pending_count).toBe(3);
    expect(e.pending_cents).toBe(6000);
    expect(e.dispute_count).toBe(0);
    expect(e.dispute_cents).toBe(0);
  });

  it("sums dispute commissions into the dispute bucket", () => {
    const e = computeClawbackExposure([
      dispute("r1", 500),
      dispute("r1", 2500),
    ]);
    expect(e.dispute_count).toBe(2);
    expect(e.dispute_cents).toBe(3000);
    expect(e.pending_count).toBe(0);
    expect(e.pending_cents).toBe(0);
  });

  it("keeps totals as the sum of pending + dispute", () => {
    const e = computeClawbackExposure([
      pending("r1", 1000),
      pending("r1", 500),
      dispute("r1", 2500),
    ]);
    expect(e.pending_count).toBe(2);
    expect(e.pending_cents).toBe(1500);
    expect(e.dispute_count).toBe(1);
    expect(e.dispute_cents).toBe(2500);
    expect(e.total_count).toBe(3);
    expect(e.total_cents).toBe(4000);
  });

  it("floors fractional cents so the sum stays whole-integer", () => {
    const e = computeClawbackExposure([
      pending("r1", 199.9),
      dispute("r1", 100.5),
    ]);
    expect(e.pending_cents).toBe(199);
    expect(e.dispute_cents).toBe(100);
  });

  it("counts garbled rows in the count but contributes 0 to cents so total-invariant is visible", () => {
    const e = computeClawbackExposure([
      pending("r1", 1000),
      pending("r1", Number.NaN),
      dispute("r1", Number.POSITIVE_INFINITY),
      dispute("r1", -500),
      pending("r1", 2500),
    ]);
    expect(e.pending_count).toBe(3);
    expect(e.pending_cents).toBe(1000 + 2500);
    expect(e.dispute_count).toBe(2);
    expect(e.dispute_cents).toBe(0);
    expect(e.total_count).toBe(5);
    expect(e.total_cents).toBe(3500);
  });
});

describe("computeClawbackExposureByReseller", () => {
  it("returns one ClawbackExposure per requested reseller id, even when the reseller has zero exposed events", () => {
    const out = computeClawbackExposureByReseller(["r1", "r2", "r3"], [
      pending("r1", 1000),
      dispute("r2", 2500),
      pending("r2", 500),
    ]);
    expect(out.size).toBe(3);
    expect(out.get("r1")?.total_cents).toBe(1000);
    expect(out.get("r2")?.total_cents).toBe(3000);
    expect(out.get("r3")?.total_cents).toBe(0);
    expect(out.get("r3")?.total_count).toBe(0);
  });

  it("groups rows by reseller_id without leaking across partners", () => {
    const out = computeClawbackExposureByReseller(["r1", "r2"], [
      pending("r1", 4000),
      dispute("r2", 1000),
      dispute("r2", 2000),
    ]);
    expect(out.get("r1")?.pending_cents).toBe(4000);
    expect(out.get("r1")?.dispute_cents).toBe(0);
    expect(out.get("r2")?.dispute_cents).toBe(3000);
    expect(out.get("r2")?.pending_cents).toBe(0);
  });

  it("ignores rows whose reseller_id is not in the requested list", () => {
    const out = computeClawbackExposureByReseller(["r1"], [
      pending("r1", 1000),
      pending("r-orphan", 9999),
    ]);
    expect(out.size).toBe(1);
    expect(out.get("r1")?.pending_cents).toBe(1000);
  });
});

function exposureRow(
  code: string,
  display: string,
  seed: ExposedCommissionRow[],
): ClawbackExposureRow {
  return {
    reseller_id: `rid-${code.toLowerCase()}`,
    reseller_code: code,
    reseller_display_name: display,
    exposure: computeClawbackExposure(seed),
  };
}

describe("formatWeeklyDigestClawbackExposureSection", () => {
  it("returns an empty string when no rows are supplied", () => {
    expect(formatWeeklyDigestClawbackExposureSection([])).toBe("");
  });

  it("renders the section header + column labels", () => {
    const html = formatWeeklyDigestClawbackExposureSection([
      exposureRow("ALPHA", "Alpha", [pending("rid-alpha", 1000)]),
    ]);
    expect(html).toContain("Clawback exposure");
    expect(html).toContain("reseller_commissions_current");
    expect(html).toContain(">Code<");
    expect(html).toContain(">Display name<");
    expect(html).toContain(">Pending count<");
    expect(html).toContain(">Pending AUD<");
    expect(html).toContain(">Dispute count<");
    expect(html).toContain(">Dispute AUD<");
    expect(html).toContain(">Total count<");
    expect(html).toContain(">Total AUD<");
  });

  it("sorts rows by reseller_code alphabetically", () => {
    const html = formatWeeklyDigestClawbackExposureSection([
      exposureRow("ZULU", "Zulu", [pending("rid-zulu", 2500)]),
      exposureRow("ALPHA", "Alpha", [pending("rid-alpha", 1000)]),
    ]);
    expect(html.indexOf("ALPHA")).toBeLessThan(html.indexOf("ZULU"));
  });

  it("formats cents as A$D.CC (two-decimal AUD)", () => {
    const html = formatWeeklyDigestClawbackExposureSection([
      exposureRow("ALPHA", "Alpha", [pending("rid-alpha", 12345)]),
    ]);
    expect(html).toContain("A$123.45");
  });

  it("pads sub-dollar amounts so A$1.05 does not render as A$1.5", () => {
    const html = formatWeeklyDigestClawbackExposureSection([
      exposureRow("ALPHA", "Alpha", [pending("rid-alpha", 105)]),
    ]);
    expect(html).toContain("A$1.05");
  });

  it("HTML-escapes hostile display names so a bad row cannot inject markup", () => {
    const html = formatWeeklyDigestClawbackExposureSection([
      exposureRow("XSS", "<script>alert(1)</script>", [pending("rid-xss", 1000)]),
    ]);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("renders a <tfoot> Total row summing pending + dispute + totals across rows", () => {
    const html = formatWeeklyDigestClawbackExposureSection([
      exposureRow("ALPHA", "Alpha", [pending("rid-alpha", 1000), pending("rid-alpha", 500)]),
      exposureRow("BETA", "Beta", [dispute("rid-beta", 2500)]),
    ]);
    expect(html).toContain("<tfoot>");
    // Pending total: 2 rows, A$15.00
    expect(html).toContain("<strong>2</strong>");
    expect(html).toContain("<strong>A$15.00</strong>");
    // Dispute total: 1 row, A$25.00
    expect(html).toContain("<strong>1</strong>");
    expect(html).toContain("<strong>A$25.00</strong>");
    // Grand total: 3 rows, A$40.00
    expect(html).toContain("<strong>3</strong>");
    expect(html).toContain("<strong>A$40.00</strong>");
  });

  it("renders zeroed rows explicitly rather than omitting them so a partner with zero exposure is visible", () => {
    const html = formatWeeklyDigestClawbackExposureSection([
      exposureRow("ZERO", "Zero", []),
    ]);
    expect(html).toContain("ZERO");
    // Six A$0.00 cells (pending, dispute, total) plus footer totals — assert presence.
    expect(html).toContain("A$0.00");
  });

  it("renders 8 <td> cells per body row (code, display, 2×pending, 2×dispute, 2×total)", () => {
    const html = formatWeeklyDigestClawbackExposureSection([
      exposureRow("ALPHA", "Alpha", [pending("rid-alpha", 1000)]),
    ]);
    const tbodyStart = html.indexOf("<tbody>");
    const tbodyEnd = html.indexOf("</tbody>");
    const body = html.slice(tbodyStart, tbodyEnd);
    const cellCount = (body.match(/<td[\s>]/g) ?? []).length;
    expect(cellCount).toBe(8);
  });

  it("splits pending vs dispute cents into the correct columns", () => {
    const html = formatWeeklyDigestClawbackExposureSection([
      exposureRow("ALPHA", "Alpha", [pending("rid-alpha", 3300), dispute("rid-alpha", 7700)]),
    ]);
    const tbodyStart = html.indexOf("<tbody>");
    const tbodyEnd = html.indexOf("</tbody>");
    const body = html.slice(tbodyStart, tbodyEnd);
    // Pending 33.00, Dispute 77.00, Total 110.00 must all appear in that row.
    expect(body).toContain("A$33.00");
    expect(body).toContain("A$77.00");
    expect(body).toContain("A$110.00");
    expect(body.indexOf("A$33.00")).toBeLessThan(body.indexOf("A$77.00"));
    expect(body.indexOf("A$77.00")).toBeLessThan(body.indexOf("A$110.00"));
  });
});
