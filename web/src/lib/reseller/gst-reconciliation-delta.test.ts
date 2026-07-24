import { describe, expect, it } from "vitest";
import {
  POSITIVE_GST_KINDS,
  REVERSAL_GST_KINDS,
  computeGstReconciliationDelta,
  computeGstReconciliationDeltaByReseller,
  formatWeeklyDigestGstReconciliationDeltaSection,
  type GstLedgerRow,
  type GstReconciliationDeltaRow,
} from "./gst-reconciliation-delta";

function row(
  reseller_id: string | null,
  kind: string | null,
  gst_aud_cents: number | null,
): GstLedgerRow {
  return { reseller_id, kind, gst_aud_cents };
}

describe("POSITIVE_GST_KINDS + REVERSAL_GST_KINDS", () => {
  it("locks the positive-kind set to the five revenue-recognising kinds", () => {
    expect([...POSITIVE_GST_KINDS]).toEqual([
      "subscribe",
      "renewal",
      "upgrade",
      "downgrade",
      "trial_convert",
    ]);
  });

  it("locks the reversal-kind set to refund + chargeback", () => {
    expect([...REVERSAL_GST_KINDS]).toEqual(["refund", "chargeback"]);
  });

  it("positive and reversal kind sets are disjoint", () => {
    const overlap = POSITIVE_GST_KINDS.filter((k) =>
      (REVERSAL_GST_KINDS as readonly string[]).includes(k),
    );
    expect(overlap).toEqual([]);
  });
});

describe("computeGstReconciliationDelta", () => {
  it("returns zeroed aggregate on empty input", () => {
    expect(computeGstReconciliationDelta([])).toEqual({
      positive_count: 0,
      positive_gst_cents: 0,
      reversal_count: 0,
      reversal_gst_cents: 0,
      net_gst_cents: 0,
    });
  });

  it("sums positive GST from each positive-kind row", () => {
    const agg = computeGstReconciliationDelta([
      row("r1", "subscribe", 900),
      row("r1", "renewal", 900),
      row("r1", "upgrade", 200),
    ]);
    expect(agg.positive_count).toBe(3);
    expect(agg.positive_gst_cents).toBe(2000);
    expect(agg.reversal_count).toBe(0);
    expect(agg.reversal_gst_cents).toBe(0);
    expect(agg.net_gst_cents).toBe(2000);
  });

  it("stores reversal GST as absolute magnitude", () => {
    const agg = computeGstReconciliationDelta([
      row("r1", "refund", -450),
      row("r1", "chargeback", -150),
    ]);
    expect(agg.reversal_count).toBe(2);
    expect(agg.reversal_gst_cents).toBe(600);
    expect(agg.net_gst_cents).toBe(-600);
  });

  it("computes net = positive − reversal across mixed inputs", () => {
    const agg = computeGstReconciliationDelta([
      row("r1", "subscribe", 900),
      row("r1", "renewal", 900),
      row("r1", "refund", -450),
    ]);
    expect(agg.positive_gst_cents).toBe(1800);
    expect(agg.reversal_gst_cents).toBe(450);
    expect(agg.net_gst_cents).toBe(1350);
  });

  it("drops rows whose kind is neither positive nor reversal", () => {
    const agg = computeGstReconciliationDelta([
      row("r1", "trial_start", 0),
      row("r1", "trial_end_no_payment", null),
      row("r1", "credit_pack", 500),
      row("r1", "subscribe", 900),
    ]);
    expect(agg.positive_count).toBe(1);
    expect(agg.positive_gst_cents).toBe(900);
    expect(agg.reversal_count).toBe(0);
    expect(agg.reversal_gst_cents).toBe(0);
    expect(agg.net_gst_cents).toBe(900);
  });

  it("drops rows whose kind is null / unknown", () => {
    const agg = computeGstReconciliationDelta([
      row("r1", null, 900),
      row("r1", "something_bogus", 900),
    ]);
    expect(agg.positive_count).toBe(0);
    expect(agg.reversal_count).toBe(0);
    expect(agg.net_gst_cents).toBe(0);
  });

  it("garbled gst_aud_cents (NaN/Infinity/null) contribute 0 to cents but still bump count", () => {
    const agg = computeGstReconciliationDelta([
      row("r1", "subscribe", Number.NaN),
      row("r1", "renewal", Number.POSITIVE_INFINITY),
      row("r1", "upgrade", null),
      row("r1", "refund", Number.NEGATIVE_INFINITY),
    ]);
    expect(agg.positive_count).toBe(3);
    expect(agg.positive_gst_cents).toBe(0);
    expect(agg.reversal_count).toBe(1);
    expect(agg.reversal_gst_cents).toBe(0);
    expect(agg.net_gst_cents).toBe(0);
  });

  it("floors fractional cents so a bogus 0.5c row does not offset the whole-cent invariant", () => {
    const agg = computeGstReconciliationDelta([
      row("r1", "subscribe", 900.7),
      row("r1", "refund", -449.9),
    ]);
    expect(agg.positive_gst_cents).toBe(900);
    expect(agg.reversal_gst_cents).toBe(449);
    expect(agg.net_gst_cents).toBe(451);
  });
});

describe("computeGstReconciliationDeltaByReseller", () => {
  it("isolates aggregates across resellers", () => {
    const map = computeGstReconciliationDeltaByReseller(
      ["r1", "r2"],
      [
        row("r1", "subscribe", 900),
        row("r2", "renewal", 4900),
        row("r2", "refund", -900),
      ],
    );
    expect(map.get("r1")?.net_gst_cents).toBe(900);
    expect(map.get("r2")?.net_gst_cents).toBe(4000);
  });

  it("returns a zeroed aggregate for a reseller with no rows", () => {
    const map = computeGstReconciliationDeltaByReseller(
      ["r1", "r2", "r3"],
      [row("r1", "subscribe", 900)],
    );
    expect(map.get("r3")).toEqual({
      positive_count: 0,
      positive_gst_cents: 0,
      reversal_count: 0,
      reversal_gst_cents: 0,
      net_gst_cents: 0,
    });
  });

  it("drops orphan reseller_id (row references a reseller not in the requested set)", () => {
    const map = computeGstReconciliationDeltaByReseller(
      ["r1"],
      [
        row("r1", "subscribe", 900),
        row("orphan", "subscribe", 5000),
      ],
    );
    expect(map.size).toBe(1);
    expect(map.get("r1")?.positive_gst_cents).toBe(900);
    expect(map.has("orphan")).toBe(false);
  });

  it("drops rows whose reseller_id is null", () => {
    const map = computeGstReconciliationDeltaByReseller(
      ["r1"],
      [
        row("r1", "subscribe", 900),
        row(null, "subscribe", 5000),
      ],
    );
    expect(map.get("r1")?.positive_gst_cents).toBe(900);
    expect(map.size).toBe(1);
  });
});

describe("formatWeeklyDigestGstReconciliationDeltaSection", () => {
  function mkRow(
    code: string,
    display: string,
    positive_count: number,
    positive_gst_cents: number,
    reversal_count: number,
    reversal_gst_cents: number,
  ): GstReconciliationDeltaRow {
    return {
      reseller_id: code.toLowerCase(),
      reseller_code: code,
      reseller_display_name: display,
      delta: {
        positive_count,
        positive_gst_cents,
        reversal_count,
        reversal_gst_cents,
        net_gst_cents: positive_gst_cents - reversal_gst_cents,
      },
    };
  }

  it("returns empty string when no rows", () => {
    expect(formatWeeklyDigestGstReconciliationDeltaSection([], "2026-07")).toBe("");
  });

  it("renders month key in the header", () => {
    const html = formatWeeklyDigestGstReconciliationDeltaSection(
      [mkRow("INFOVISION", "InfoVision", 2, 1800, 1, 450)],
      "2026-07",
    );
    expect(html).toContain("GST reconciliation delta (2026-07)");
  });

  it("sorts rows by reseller_code", () => {
    const html = formatWeeklyDigestGstReconciliationDeltaSection(
      [
        mkRow("ZETA", "Zeta", 1, 100, 0, 0),
        mkRow("ALPHA", "Alpha", 1, 200, 0, 0),
      ],
      "2026-07",
    );
    expect(html.indexOf("ALPHA")).toBeLessThan(html.indexOf("ZETA"));
  });

  it("formats positive AUD without leading minus", () => {
    const html = formatWeeklyDigestGstReconciliationDeltaSection(
      [mkRow("INFOVISION", "InfoVision", 2, 1800, 0, 0)],
      "2026-07",
    );
    expect(html).toContain("A$18.00");
    expect(html).not.toContain("-A$18.00");
  });

  it("formats negative net with leading minus when reversal > positive", () => {
    const html = formatWeeklyDigestGstReconciliationDeltaSection(
      [mkRow("INFOVISION", "InfoVision", 1, 100, 2, 500)],
      "2026-07",
    );
    expect(html).toContain("-A$4.00");
  });

  it("sub-dollar amounts zero-pad the cent portion", () => {
    const html = formatWeeklyDigestGstReconciliationDeltaSection(
      [mkRow("INFOVISION", "InfoVision", 1, 105, 0, 0)],
      "2026-07",
    );
    expect(html).toContain("A$1.05");
    expect(html).not.toContain("A$1.5");
  });

  it("HTML-escapes display_name", () => {
    const html = formatWeeklyDigestGstReconciliationDeltaSection(
      [mkRow("X", "<script>evil</script>", 0, 0, 0, 0)],
      "2026-07",
    );
    expect(html).toContain("&lt;script&gt;evil&lt;/script&gt;");
    expect(html).not.toContain("<script>evil</script>");
  });

  it("HTML-escapes the monthKey header", () => {
    const html = formatWeeklyDigestGstReconciliationDeltaSection(
      [mkRow("X", "X", 0, 0, 0, 0)],
      "<img>",
    );
    expect(html).toContain("&lt;img&gt;");
  });

  it("<tfoot> Total row sums each column with correct sign on net", () => {
    const html = formatWeeklyDigestGstReconciliationDeltaSection(
      [
        mkRow("A", "A", 2, 1800, 1, 450),
        mkRow("B", "B", 1, 200, 0, 0),
      ],
      "2026-07",
    );
    // positive: 3 rows, A$20.00
    expect(html).toMatch(/<strong>3<\/strong>[\s\S]*<strong>A\$20\.00<\/strong>/);
    // reversal: 1 row, A$4.50
    expect(html).toMatch(/<strong>1<\/strong>[\s\S]*<strong>A\$4\.50<\/strong>/);
    // net: A$15.50
    expect(html).toContain("<strong>A$15.50</strong>");
  });

  it("zero-row visibility — every requested reseller renders even with zero deltas", () => {
    const html = formatWeeklyDigestGstReconciliationDeltaSection(
      [mkRow("QUIET", "Quiet Reseller", 0, 0, 0, 0)],
      "2026-07",
    );
    expect(html).toContain("QUIET");
    expect(html).toContain("Quiet Reseller");
  });

  it("renders 7 <td> cells per body row (code, display, pos-cnt, pos-gst, rev-cnt, rev-gst, net)", () => {
    const html = formatWeeklyDigestGstReconciliationDeltaSection(
      [mkRow("A", "A", 1, 100, 0, 0)],
      "2026-07",
    );
    const bodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    expect(bodyMatch).toBeTruthy();
    const tdCount = (bodyMatch![1].match(/<td/g) ?? []).length;
    expect(tdCount).toBe(7);
  });

  it("column-order invariant: positive → reversal → net across header + body + footer", () => {
    const html = formatWeeklyDigestGstReconciliationDeltaSection(
      [mkRow("A", "A", 1, 100, 1, 50)],
      "2026-07",
    );
    const positiveIdx = html.indexOf("Positive GST");
    const reversalIdx = html.indexOf("Reversal GST");
    const netIdx = html.indexOf("Net GST");
    expect(positiveIdx).toBeGreaterThan(0);
    expect(reversalIdx).toBeGreaterThan(positiveIdx);
    expect(netIdx).toBeGreaterThan(reversalIdx);
  });
});
