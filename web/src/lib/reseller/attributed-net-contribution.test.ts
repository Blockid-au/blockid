import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  computeCreditCogsCents,
  computeNetContribution,
  computeNetContributionByReseller,
  formatMarginPct,
  formatWeeklyDigestNetContributionSection,
  type NetContribution,
  type NetContributionInput,
  type NetContributionRow,
} from "./attributed-net-contribution";

/**
 * getCogsPerCreditAud reads COGS_PER_CREDIT_AUD from process.env every call so
 * we don't need to reset the module — set/unset the env before each test that
 * cares about the rate. All arithmetic in this suite is easier to eyeball at
 * the default 0.05 AUD/credit rate (5 cents per credit).
 */
const savedEnv = process.env.COGS_PER_CREDIT_AUD;

beforeEach(() => {
  delete process.env.COGS_PER_CREDIT_AUD;
});

afterEach(() => {
  if (savedEnv === undefined) delete process.env.COGS_PER_CREDIT_AUD;
  else process.env.COGS_PER_CREDIT_AUD = savedEnv;
});

describe("computeCreditCogsCents", () => {
  it("returns 0 for zero credits", () => {
    expect(computeCreditCogsCents(0)).toBe(0);
  });

  it("returns 0 for NaN / Infinity / negative credit counts", () => {
    expect(computeCreditCogsCents(Number.NaN)).toBe(0);
    expect(computeCreditCogsCents(Number.POSITIVE_INFINITY)).toBe(0);
    expect(computeCreditCogsCents(-100)).toBe(0);
  });

  it("uses the 0.05 AUD default rate", () => {
    // 1000 credits × 0.05 AUD = A$50 = 5000 cents
    expect(computeCreditCogsCents(1000)).toBe(5000);
  });

  it("floors fractional credit counts before applying the rate", () => {
    // Math.floor(1.9) = 1 credit × 0.05 × 100 = 5 cents
    expect(computeCreditCogsCents(1.9)).toBe(5);
  });

  it("respects a COGS_PER_CREDIT_AUD env override", () => {
    process.env.COGS_PER_CREDIT_AUD = "0.10";
    // 1000 × 0.10 × 100 = 10000 cents
    expect(computeCreditCogsCents(1000)).toBe(10000);
  });

  it("falls back to the default when the env is unparseable", () => {
    process.env.COGS_PER_CREDIT_AUD = "not-a-number";
    expect(computeCreditCogsCents(1000)).toBe(5000);
  });
});

function input(
  reseller_id: string,
  mrr: number,
  commission: number,
  credits: number,
): NetContributionInput {
  return {
    reseller_id,
    mrr_cents: mrr,
    commission_cleared_mtd_cents: commission,
    credits_used_mtd: credits,
  };
}

describe("computeNetContribution", () => {
  it("folds revenue − commission − credit_cogs into net_contribution_cents", () => {
    // revenue 10000, commission 4000, credits 1000 × 5c = 5000 → net = 1000
    const n = computeNetContribution(input("r1", 10000, 4000, 1000));
    expect(n.revenue_cents).toBe(10000);
    expect(n.commission_cost_cents).toBe(4000);
    expect(n.credit_cogs_cents).toBe(5000);
    expect(n.net_contribution_cents).toBe(1000);
  });

  it("reports a negative net when commission + COGS exceed revenue (loss-leader partner)", () => {
    // revenue 5000, commission 4000, credits 500 × 5c = 2500 → net = -1500
    const n = computeNetContribution(input("r1", 5000, 4000, 500));
    expect(n.net_contribution_cents).toBe(-1500);
  });

  it("floors garbled input toward zero rather than surfacing NaN", () => {
    const n = computeNetContribution(
      input("r1", Number.NaN, Number.POSITIVE_INFINITY, Number.NaN),
    );
    expect(n.revenue_cents).toBe(0);
    expect(n.commission_cost_cents).toBe(0);
    expect(n.credit_cogs_cents).toBe(0);
    expect(n.net_contribution_cents).toBe(0);
  });

  it("treats negative mrr / commission as zero (defensive against garbled ledger)", () => {
    const n = computeNetContribution(input("r1", -100, -50, 0));
    expect(n.revenue_cents).toBe(0);
    expect(n.commission_cost_cents).toBe(0);
    expect(n.net_contribution_cents).toBe(0);
  });
});

describe("computeNetContributionByReseller", () => {
  it("returns one NetContribution per requested reseller id, even when no input row exists", () => {
    const out = computeNetContributionByReseller(["r1", "r2", "r3"], [
      input("r1", 10000, 4000, 1000),
      input("r2", 5000, 2000, 500),
    ]);
    expect(out.size).toBe(3);
    expect(out.get("r1")?.net_contribution_cents).toBe(10000 - 4000 - 5000);
    expect(out.get("r2")?.net_contribution_cents).toBe(5000 - 2000 - 2500);
    expect(out.get("r3")?.net_contribution_cents).toBe(0);
    expect(out.get("r3")?.revenue_cents).toBe(0);
  });

  it("ignores rows whose reseller_id is not in the requested list", () => {
    const out = computeNetContributionByReseller(["r1"], [
      input("r1", 10000, 4000, 1000),
      input("r-orphan", 99999, 0, 0),
    ]);
    expect(out.size).toBe(1);
    expect(out.get("r1")?.revenue_cents).toBe(10000);
  });
});

describe("formatMarginPct", () => {
  function n(revenue: number, commission: number, cogs: number): NetContribution {
    return {
      revenue_cents: revenue,
      commission_cost_cents: commission,
      credit_cogs_cents: cogs,
      net_contribution_cents: revenue - commission - cogs,
    };
  }

  it("renders integer percent for positive margins", () => {
    // 10000 revenue, 5000 net → 50%
    expect(formatMarginPct(n(10000, 3000, 2000))).toBe("50%");
  });

  it("renders integer percent for negative margins with leading minus", () => {
    // 5000 revenue, -1500 net → -30%
    expect(formatMarginPct(n(5000, 4000, 2500))).toBe("-30%");
  });

  it("truncates toward zero rather than rounding", () => {
    // 100 revenue, 12 net → 12% (not 12.5%)
    expect(formatMarginPct(n(100, 88, 0))).toBe("12%");
  });

  it("renders — when revenue is zero", () => {
    expect(formatMarginPct(n(0, 0, 5000))).toBe("—");
  });

  it("renders — when revenue is negative (defensive)", () => {
    expect(formatMarginPct({
      revenue_cents: -100,
      commission_cost_cents: 0,
      credit_cogs_cents: 0,
      net_contribution_cents: -100,
    })).toBe("—");
  });
});

function contribRow(
  code: string,
  display: string,
  mrr: number,
  commission: number,
  credits: number,
): NetContributionRow {
  return {
    reseller_id: `rid-${code.toLowerCase()}`,
    reseller_code: code,
    reseller_display_name: display,
    net: computeNetContribution({
      reseller_id: `rid-${code.toLowerCase()}`,
      mrr_cents: mrr,
      commission_cleared_mtd_cents: commission,
      credits_used_mtd: credits,
    }),
  };
}

describe("formatWeeklyDigestNetContributionSection", () => {
  it("returns an empty string when no rows are supplied", () => {
    expect(formatWeeklyDigestNetContributionSection([], "2026-07")).toBe("");
  });

  it("renders the section header + monthKey + column labels", () => {
    const html = formatWeeklyDigestNetContributionSection(
      [contribRow("ALPHA", "Alpha", 9900, 3960, 200)],
      "2026-07",
    );
    expect(html).toContain("Attributed net contribution");
    expect(html).toContain("2026-07");
    expect(html).toContain(">Code<");
    expect(html).toContain(">Display name<");
    expect(html).toContain(">Revenue (MRR)<");
    expect(html).toContain(">Commission cost<");
    expect(html).toContain(">Credit COGS<");
    expect(html).toContain(">Net contribution<");
    expect(html).toContain(">Margin<");
  });

  it("sorts rows by reseller_code alphabetically", () => {
    const html = formatWeeklyDigestNetContributionSection(
      [
        contribRow("ZULU", "Zulu", 9900, 3000, 100),
        contribRow("ALPHA", "Alpha", 9900, 3000, 100),
      ],
      "2026-07",
    );
    expect(html.indexOf("ALPHA")).toBeLessThan(html.indexOf("ZULU"));
  });

  it("formats positive money cells with A$D.CC and no leading minus", () => {
    const html = formatWeeklyDigestNetContributionSection(
      [contribRow("ALPHA", "Alpha", 12345, 0, 0)],
      "2026-07",
    );
    expect(html).toContain("A$123.45");
    expect(html).not.toContain("-A$123.45");
  });

  it("formats negative net contributions with a leading minus", () => {
    // revenue 5000, commission 4000, credits 500 → net = 5000 - 4000 - 2500 = -1500
    const html = formatWeeklyDigestNetContributionSection(
      [contribRow("LOSS", "LossLeader", 5000, 4000, 500)],
      "2026-07",
    );
    expect(html).toContain("-A$15.00");
    // Margin = -1500 / 5000 = -30%
    expect(html).toContain("-30%");
  });

  it("pads sub-dollar amounts so A$1.05 does not render as A$1.5", () => {
    const html = formatWeeklyDigestNetContributionSection(
      [contribRow("ALPHA", "Alpha", 105, 0, 0)],
      "2026-07",
    );
    expect(html).toContain("A$1.05");
  });

  it("HTML-escapes hostile display names + monthKey so a bad row cannot inject markup", () => {
    const html = formatWeeklyDigestNetContributionSection(
      [contribRow("XSS", "<script>alert(1)</script>", 9900, 0, 0)],
      "<b>bad</b>",
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;bad&lt;/b&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("renders zero-revenue rows with — in the margin column", () => {
    const html = formatWeeklyDigestNetContributionSection(
      [contribRow("EMPTY", "Empty", 0, 0, 0)],
      "2026-07",
    );
    expect(html).toContain("EMPTY");
    expect(html).toContain("—");
  });

  it("renders a <tfoot> Total row summing revenue + commission + COGS + net", () => {
    const html = formatWeeklyDigestNetContributionSection(
      [
        contribRow("ALPHA", "Alpha", 10000, 4000, 1000),
        contribRow("BETA", "Beta", 5000, 2000, 200),
      ],
      "2026-07",
    );
    expect(html).toContain("<tfoot>");
    // Revenue total: 15000 = A$150.00
    expect(html).toContain("<strong>A$150.00</strong>");
    // Commission total: 6000 = A$60.00
    expect(html).toContain("<strong>A$60.00</strong>");
    // COGS total: (1000 + 200) × 5 = 6000 cents = A$60.00 — collides with commission,
    // so check the net cell directly instead: net = 15000 - 6000 - 6000 = 3000 = A$30.00
    expect(html).toContain("<strong>A$30.00</strong>");
    // Portfolio margin: 3000 / 15000 = 20%
    expect(html).toContain("<strong>20%</strong>");
  });

  it("renders 7 <td> cells per body row (code, display, revenue, commission, COGS, net, margin)", () => {
    const html = formatWeeklyDigestNetContributionSection(
      [contribRow("ALPHA", "Alpha", 9900, 3000, 100)],
      "2026-07",
    );
    const tbodyStart = html.indexOf("<tbody>");
    const tbodyEnd = html.indexOf("</tbody>");
    const body = html.slice(tbodyStart, tbodyEnd);
    const cellCount = (body.match(/<td[\s>]/g) ?? []).length;
    expect(cellCount).toBe(7);
  });

  it("puts revenue before commission before COGS before net before margin in the row shape", () => {
    const html = formatWeeklyDigestNetContributionSection(
      [contribRow("ALPHA", "AlphaCo", 10000, 4000, 1000)],
      "2026-07",
    );
    const tbodyStart = html.indexOf("<tbody>");
    const tbodyEnd = html.indexOf("</tbody>");
    const body = html.slice(tbodyStart, tbodyEnd);
    // revenue 10000 = A$100.00, commission 4000 = A$40.00, COGS 5000 = A$50.00,
    // net = 10000 - 4000 - 5000 = 1000 = A$10.00, margin = 1000/10000 = 10%
    const iRev = body.indexOf("A$100.00");
    const iCom = body.indexOf("A$40.00");
    const iCog = body.indexOf("A$50.00");
    const iNet = body.indexOf("A$10.00");
    const iMar = body.indexOf("10%");
    expect(iRev).toBeGreaterThan(-1);
    expect(iCom).toBeGreaterThan(iRev);
    expect(iCog).toBeGreaterThan(iCom);
    expect(iNet).toBeGreaterThan(iCog);
    expect(iMar).toBeGreaterThan(iNet);
  });
});
