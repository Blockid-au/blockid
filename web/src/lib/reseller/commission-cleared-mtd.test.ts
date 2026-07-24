import { describe, expect, it } from "vitest";
import {
  computeClearedMtd,
  computeClearedMtdByReseller,
  formatWeeklyDigestClearedMtdSection,
  type ClearedCommissionRow,
  type ClearedMtdRow,
} from "./commission-cleared-mtd";

function row(reseller_id: string, cents: number): ClearedCommissionRow {
  return { reseller_id, commission_aud_cents: cents };
}

describe("computeClearedMtd", () => {
  it("returns zeros when no rows are supplied", () => {
    const m = computeClearedMtd([]);
    expect(m.cleared_count).toBe(0);
    expect(m.cleared_cents).toBe(0);
  });

  it("sums commission_aud_cents across rows", () => {
    const m = computeClearedMtd([
      row("r1", 1200),
      row("r1", 800),
      row("r1", 4000),
    ]);
    expect(m.cleared_count).toBe(3);
    expect(m.cleared_cents).toBe(6000);
  });

  it("floors fractional cents so the sum stays a whole-integer count", () => {
    const m = computeClearedMtd([row("r1", 199.9), row("r1", 100.5)]);
    expect(m.cleared_cents).toBe(199 + 100);
  });

  it("counts garbled rows in cleared_count but contributes 0 to cleared_cents so total-invariant is visible", () => {
    const m = computeClearedMtd([
      row("r1", 1000),
      row("r1", Number.NaN),
      row("r1", Number.POSITIVE_INFINITY),
      row("r1", -500),
      row("r1", 2500),
    ]);
    expect(m.cleared_count).toBe(5);
    expect(m.cleared_cents).toBe(1000 + 2500);
  });
});

describe("computeClearedMtdByReseller", () => {
  it("returns one ClearedMtd per requested reseller id, even when the reseller has zero cleared events", () => {
    const out = computeClearedMtdByReseller(["r1", "r2", "r3"], [
      row("r1", 1000),
      row("r2", 2500),
      row("r2", 500),
    ]);
    expect(out.size).toBe(3);
    expect(out.get("r1")?.cleared_cents).toBe(1000);
    expect(out.get("r2")?.cleared_cents).toBe(3000);
    expect(out.get("r3")?.cleared_cents).toBe(0);
    expect(out.get("r3")?.cleared_count).toBe(0);
  });

  it("groups rows by reseller_id without leaking across partners", () => {
    const out = computeClearedMtdByReseller(["r1", "r2"], [
      row("r1", 4000),
      row("r2", 1000),
      row("r2", 2000),
    ]);
    expect(out.get("r1")?.cleared_cents).toBe(4000);
    expect(out.get("r1")?.cleared_count).toBe(1);
    expect(out.get("r2")?.cleared_cents).toBe(3000);
    expect(out.get("r2")?.cleared_count).toBe(2);
  });

  it("ignores rows whose reseller_id is not in the requested list", () => {
    const out = computeClearedMtdByReseller(["r1"], [
      row("r1", 1000),
      row("r-orphan", 9999),
    ]);
    expect(out.size).toBe(1);
    expect(out.get("r1")?.cleared_cents).toBe(1000);
  });
});

function mtdRow(code: string, display: string, seed: ClearedCommissionRow[]): ClearedMtdRow {
  return {
    reseller_id: `rid-${code.toLowerCase()}`,
    reseller_code: code,
    reseller_display_name: display,
    mtd: computeClearedMtd(seed),
  };
}

describe("formatWeeklyDigestClearedMtdSection", () => {
  it("returns an empty string when no rows are supplied", () => {
    expect(formatWeeklyDigestClearedMtdSection([], "2026-07")).toBe("");
  });

  it("renders the section header with the monthKey", () => {
    const html = formatWeeklyDigestClearedMtdSection(
      [mtdRow("ALPHA", "Alpha", [row("rid-alpha", 1000)])],
      "2026-07",
    );
    expect(html).toContain("Commission cleared MTD");
    expect(html).toContain("2026-07");
    expect(html).toContain("reseller_commission_events");
    expect(html).toContain(">Code<");
    expect(html).toContain(">Display name<");
    expect(html).toContain(">Cleared count<");
    expect(html).toContain(">Cleared AUD<");
  });

  it("sorts rows by reseller_code alphabetically", () => {
    const html = formatWeeklyDigestClearedMtdSection(
      [
        mtdRow("ZULU", "Zulu", [row("rid-zulu", 2500)]),
        mtdRow("ALPHA", "Alpha", [row("rid-alpha", 1000)]),
      ],
      "2026-07",
    );
    expect(html.indexOf("ALPHA")).toBeLessThan(html.indexOf("ZULU"));
  });

  it("formats cleared_cents as A$D.CC (two-decimal AUD)", () => {
    const html = formatWeeklyDigestClearedMtdSection(
      [mtdRow("ALPHA", "Alpha", [row("rid-alpha", 12345)])],
      "2026-07",
    );
    expect(html).toContain("A$123.45");
  });

  it("pads sub-dollar amounts so A$1.05 does not render as A$1.5", () => {
    const html = formatWeeklyDigestClearedMtdSection(
      [mtdRow("ALPHA", "Alpha", [row("rid-alpha", 105)])],
      "2026-07",
    );
    expect(html).toContain("A$1.05");
  });

  it("HTML-escapes hostile display names so a bad row cannot inject markup", () => {
    const html = formatWeeklyDigestClearedMtdSection(
      [mtdRow("XSS", "<script>alert(1)</script>", [row("rid-xss", 1000)])],
      "2026-07",
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("HTML-escapes the monthKey in the header", () => {
    const html = formatWeeklyDigestClearedMtdSection(
      [mtdRow("ALPHA", "Alpha", [row("rid-alpha", 1000)])],
      "<evil>",
    );
    expect(html).toContain("&lt;evil&gt;");
    expect(html).not.toContain("<evil>");
  });

  it("renders a <tfoot> Total row that sums cleared_count + cleared_cents across rows", () => {
    const html = formatWeeklyDigestClearedMtdSection(
      [
        mtdRow("ALPHA", "Alpha", [row("rid-alpha", 1000), row("rid-alpha", 500)]),
        mtdRow("BETA", "Beta", [row("rid-beta", 2500)]),
      ],
      "2026-07",
    );
    expect(html).toContain("<tfoot>");
    expect(html).toContain("<strong>3</strong>");
    expect(html).toContain("<strong>A$40.00</strong>");
  });

  it("renders zeroed rows explicitly rather than omitting them so a partner with zero clearances is visible", () => {
    const html = formatWeeklyDigestClearedMtdSection(
      [mtdRow("ZERO", "Zero", [])],
      "2026-07",
    );
    expect(html).toContain("ZERO");
    expect(html).toContain("A$0.00");
  });

  it("renders 4 <td> cells per body row (code, display, count, AUD)", () => {
    const html = formatWeeklyDigestClearedMtdSection(
      [mtdRow("ALPHA", "Alpha", [row("rid-alpha", 1000)])],
      "2026-07",
    );
    const tbodyStart = html.indexOf("<tbody>");
    const tbodyEnd = html.indexOf("</tbody>");
    const body = html.slice(tbodyStart, tbodyEnd);
    const cellCount = (body.match(/<td[\s>]/g) ?? []).length;
    expect(cellCount).toBe(4);
  });
});
