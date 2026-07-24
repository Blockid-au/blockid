import { describe, expect, it } from "vitest";
import {
  LTV_REVENUE_KINDS,
  computeLtvCac,
  computeLtvCacByReseller,
  formatWeeklyDigestLtvCacSection,
  type CacCommissionRow,
  type LtvCacRow,
  type LtvRevenueRow,
} from "./ltv-cac";

describe("LTV_REVENUE_KINDS", () => {
  it("locks the revenue-recognising kind list per revenue_events_kind_check", () => {
    expect([...LTV_REVENUE_KINDS]).toEqual([
      "subscribe",
      "renewal",
      "upgrade",
      "downgrade",
      "trial_convert",
      "refund",
      "chargeback",
    ]);
  });

  it("excludes non-revenue kinds (trial_start, trial_end_no_payment, credit_pack)", () => {
    for (const k of ["trial_start", "trial_end_no_payment", "credit_pack"]) {
      expect((LTV_REVENUE_KINDS as readonly string[]).includes(k)).toBe(false);
    }
  });
});

function rev(reseller_id: string, net_aud_cents: number, kind?: string): LtvRevenueRow {
  return { reseller_id, net_aud_cents, kind };
}

function com(reseller_id: string, commission_aud_cents: number): CacCommissionRow {
  return { reseller_id, commission_aud_cents };
}

describe("computeLtvCac", () => {
  it("returns all-zero on empty input", () => {
    const r = computeLtvCac([], [], 0);
    expect(r.lifetime_revenue_cents).toBe(0);
    expect(r.cumulative_cleared_commission_cents).toBe(0);
    expect(r.attributed_customers).toBe(0);
    expect(r.ltv_per_customer_cents).toBe(0);
    expect(r.cac_per_customer_cents).toBe(0);
    expect(r.ltv_cac_ratio_hundredths).toBeNull();
  });

  it("sums lifetime revenue across positive rows", () => {
    const r = computeLtvCac(
      [rev("r1", 9900, "subscribe"), rev("r1", 9900, "renewal")],
      [],
      2,
    );
    expect(r.lifetime_revenue_cents).toBe(19800);
    expect(r.ltv_per_customer_cents).toBe(9900);
  });

  it("subtracts refund/chargeback rows because their net_aud_cents is negative", () => {
    const r = computeLtvCac(
      [
        rev("r1", 9900, "subscribe"),
        rev("r1", -9900, "refund"),
        rev("r1", 9900, "renewal"),
      ],
      [],
      1,
    );
    expect(r.lifetime_revenue_cents).toBe(9900);
  });

  it("clamps a net-negative lifetime revenue to 0", () => {
    const r = computeLtvCac(
      [rev("r1", 100, "subscribe"), rev("r1", -500, "refund")],
      [],
      1,
    );
    expect(r.lifetime_revenue_cents).toBe(0);
    expect(r.ltv_per_customer_cents).toBe(0);
  });

  it("sums cumulative commission and floors CAC per customer", () => {
    const r = computeLtvCac(
      [],
      [com("r1", 1000), com("r1", 2500), com("r1", 999)],
      2,
    );
    expect(r.cumulative_cleared_commission_cents).toBe(4499);
    expect(r.cac_per_customer_cents).toBe(2249); // floor(4499/2)
  });

  it("computes the LTV/CAC ratio in hundredths (integer scaled 100×)", () => {
    const r = computeLtvCac(
      [rev("r1", 30000, "subscribe")],
      [com("r1", 10000)],
      1,
    );
    // 30000 * 100 / 10000 = 300 → "3.00×"
    expect(r.ltv_cac_ratio_hundredths).toBe(300);
  });

  it("floors the ratio when it does not divide evenly", () => {
    const r = computeLtvCac(
      [rev("r1", 31234, "subscribe")],
      [com("r1", 10000)],
      1,
    );
    // 31234 * 100 / 10000 = 312.34 → floor = 312
    expect(r.ltv_cac_ratio_hundredths).toBe(312);
  });

  it("returns null ratio when cumulative commission is zero", () => {
    const r = computeLtvCac([rev("r1", 9900, "subscribe")], [], 1);
    expect(r.ltv_cac_ratio_hundredths).toBeNull();
  });

  it("floors non-finite net_aud_cents / commission_aud_cents to 0 without corrupting the sum", () => {
    const r = computeLtvCac(
      [
        rev("r1", 9900, "subscribe"),
        rev("r1", NaN as unknown as number, "renewal"),
        rev("r1", Infinity as unknown as number, "renewal"),
        { reseller_id: "r1", net_aud_cents: null, kind: "renewal" },
      ],
      [com("r1", 1000), { reseller_id: "r1", commission_aud_cents: null }],
      1,
    );
    expect(r.lifetime_revenue_cents).toBe(9900);
    expect(r.cumulative_cleared_commission_cents).toBe(1000);
  });

  it("clamps a negative attributed_customers to 0", () => {
    const r = computeLtvCac(
      [rev("r1", 9900, "subscribe")],
      [com("r1", 1000)],
      -5,
    );
    expect(r.attributed_customers).toBe(0);
    expect(r.ltv_per_customer_cents).toBe(0);
    expect(r.cac_per_customer_cents).toBe(0);
    // Ratio is independent of denominator
    expect(r.ltv_cac_ratio_hundredths).toBe(990);
  });

  it("returns 0 per-customer LTV / CAC when attributed_customers is 0 but keeps totals + ratio", () => {
    const r = computeLtvCac(
      [rev("r1", 9900, "subscribe")],
      [com("r1", 1000)],
      0,
    );
    expect(r.ltv_per_customer_cents).toBe(0);
    expect(r.cac_per_customer_cents).toBe(0);
    expect(r.lifetime_revenue_cents).toBe(9900);
    expect(r.ltv_cac_ratio_hundredths).toBe(990);
  });
});

describe("computeLtvCacByReseller", () => {
  it("isolates revenue + commission per reseller_id", () => {
    const rev1 = [rev("r1", 9900, "subscribe"), rev("r2", 4900, "subscribe")];
    const com1 = [com("r1", 3960), com("r2", 1960)];
    const totals = new Map([
      ["r1", 5],
      ["r2", 3],
    ]);
    const map = computeLtvCacByReseller(["r1", "r2"], rev1, com1, totals);
    const r1 = map.get("r1")!;
    const r2 = map.get("r2")!;
    expect(r1.lifetime_revenue_cents).toBe(9900);
    expect(r1.cumulative_cleared_commission_cents).toBe(3960);
    expect(r1.attributed_customers).toBe(5);
    expect(r2.lifetime_revenue_cents).toBe(4900);
    expect(r2.cumulative_cleared_commission_cents).toBe(1960);
    expect(r2.attributed_customers).toBe(3);
  });

  it("returns a zero-defaulted row for a reseller with no signal", () => {
    const map = computeLtvCacByReseller(["r1"], [], [], new Map());
    const r1 = map.get("r1")!;
    expect(r1.lifetime_revenue_cents).toBe(0);
    expect(r1.cumulative_cleared_commission_cents).toBe(0);
    expect(r1.attributed_customers).toBe(0);
    expect(r1.ltv_cac_ratio_hundredths).toBeNull();
  });

  it("drops rows whose reseller_id is not in the requested set", () => {
    const map = computeLtvCacByReseller(
      ["r1"],
      [rev("r1", 100, "subscribe"), rev("r_ghost", 9999, "subscribe")],
      [com("r1", 40), com("r_ghost", 999)],
      new Map([["r1", 1]]),
    );
    expect(map.has("r_ghost")).toBe(false);
    const r1 = map.get("r1")!;
    expect(r1.lifetime_revenue_cents).toBe(100);
    expect(r1.cumulative_cleared_commission_cents).toBe(40);
  });

  it("defaults missing attributed_customers to 0", () => {
    const map = computeLtvCacByReseller(
      ["r1"],
      [rev("r1", 100, "subscribe")],
      [com("r1", 40)],
      new Map(),
    );
    expect(map.get("r1")?.attributed_customers).toBe(0);
  });
});

describe("formatWeeklyDigestLtvCacSection", () => {
  const rows: LtvCacRow[] = [
    {
      reseller_id: "r-info",
      reseller_code: "INFOVISION",
      reseller_display_name: "InfoVision",
      ltv_cac: {
        lifetime_revenue_cents: 30000,
        cumulative_cleared_commission_cents: 10000,
        attributed_customers: 3,
        ltv_per_customer_cents: 10000,
        cac_per_customer_cents: 3333,
        ltv_cac_ratio_hundredths: 300,
      },
    },
    {
      reseller_id: "r-alpha",
      reseller_code: "ALPHA",
      reseller_display_name: "Alpha",
      ltv_cac: {
        lifetime_revenue_cents: 4900,
        cumulative_cleared_commission_cents: 0,
        attributed_customers: 1,
        ltv_per_customer_cents: 4900,
        cac_per_customer_cents: 0,
        ltv_cac_ratio_hundredths: null,
      },
    },
  ];

  it("returns empty string for empty input", () => {
    expect(formatWeeklyDigestLtvCacSection([])).toBe("");
  });

  it("renders the section header with the column labels", () => {
    const html = formatWeeklyDigestLtvCacSection(rows);
    expect(html).toContain("LTV / CAC per reseller");
    expect(html).toContain("<th>Code</th>");
    expect(html).toContain("<th>Display name</th>");
    expect(html).toContain("<th>Customers</th>");
    expect(html).toContain("<th>Lifetime revenue</th>");
    expect(html).toContain("<th>Cumulative commission</th>");
    expect(html).toContain("<th>LTV / customer</th>");
    expect(html).toContain("<th>CAC / customer</th>");
    expect(html).toContain("<th>LTV / CAC</th>");
  });

  it("sorts resellers by reseller_code", () => {
    const html = formatWeeklyDigestLtvCacSection(rows);
    const alphaIdx = html.indexOf("ALPHA");
    const infoIdx = html.indexOf("INFOVISION");
    expect(alphaIdx).toBeGreaterThan(-1);
    expect(infoIdx).toBeGreaterThan(alphaIdx);
  });

  it("renders A$D.CC dollars with two-decimal cents", () => {
    const html = formatWeeklyDigestLtvCacSection(rows);
    expect(html).toContain("A$300.00"); // 30000 cents
    expect(html).toContain("A$100.00"); // 10000 cents
    expect(html).toContain("A$33.33"); // 3333 cents
    expect(html).toContain("A$49.00"); // 4900 cents
  });

  it("renders the LTV/CAC ratio as N.NN× via HTML times entity", () => {
    const html = formatWeeklyDigestLtvCacSection(rows);
    expect(html).toContain("3.00&times;");
  });

  it("renders — when the ratio is null (zero cleared commission)", () => {
    const html = formatWeeklyDigestLtvCacSection(rows);
    expect(html).toContain("&mdash;");
  });

  it("floors ratio N.NN with correct zero-padding on sub-hundredths", () => {
    const html = formatWeeklyDigestLtvCacSection([
      {
        ...rows[0],
        ltv_cac: { ...rows[0].ltv_cac, ltv_cac_ratio_hundredths: 105 },
      },
    ]);
    expect(html).toContain("1.05&times;");
    expect(html).not.toContain("1.5&times;");
  });

  it("HTML-escapes the display name", () => {
    const html = formatWeeklyDigestLtvCacSection([
      {
        reseller_id: "r-x",
        reseller_code: "XSS",
        reseller_display_name: "<script>alert(1)</script>",
        ltv_cac: {
          lifetime_revenue_cents: 100,
          cumulative_cleared_commission_cents: 50,
          attributed_customers: 1,
          ltv_per_customer_cents: 100,
          cac_per_customer_cents: 50,
          ltv_cac_ratio_hundredths: 200,
        },
      },
    ]);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("emits a <tfoot> Total row summing customers, LTV, CAC, and portfolio ratio", () => {
    const html = formatWeeklyDigestLtvCacSection(rows);
    expect(html).toContain("<tfoot>");
    // Portfolio totals: 4 customers, LTV = 34900, CAC = 10000, ratio = 349
    expect(html).toContain(">4<");
    expect(html).toContain("A$349.00");
    expect(html).toContain("A$100.00");
    expect(html).toContain("3.49&times;");
  });

  it("renders portfolio ratio as — when the whole portfolio has no cleared commission", () => {
    const html = formatWeeklyDigestLtvCacSection([
      {
        reseller_id: "r-alpha",
        reseller_code: "ALPHA",
        reseller_display_name: "Alpha",
        ltv_cac: {
          lifetime_revenue_cents: 100,
          cumulative_cleared_commission_cents: 0,
          attributed_customers: 1,
          ltv_per_customer_cents: 100,
          cac_per_customer_cents: 0,
          ltv_cac_ratio_hundredths: null,
        },
      },
    ]);
    // At least two — entries (row + portfolio row)
    expect((html.match(/&mdash;/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("renders 8 <td> cells per body row (code, display, customers, LTV, CAC, LTV/c, CAC/c, ratio)", () => {
    const html = formatWeeklyDigestLtvCacSection([rows[0]]);
    const bodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    expect(bodyMatch).not.toBeNull();
    const cellCount = (bodyMatch![1].match(/<td/g) ?? []).length;
    expect(cellCount).toBe(8);
  });
});
