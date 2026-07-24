import { describe, expect, it } from "vitest";
import {
  CHURN_STATUSES,
  CHURN_WINDOW_DAYS,
  computeAttributedChurn30d,
  computeAttributedChurn30dByReseller,
  formatWeeklyDigestAttributedChurnSection,
  type AttributedChurnRow,
  type ChurnCandidateRow,
} from "./attributed-churn-30d";

const NOW = new Date("2026-07-24T12:00:00.000Z");

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

function canceled(reseller_id: string, ago = 5): ChurnCandidateRow {
  return { reseller_id, status: "canceled", updated_at: daysAgo(ago) };
}

function trialEnded(reseller_id: string, ago = 5): ChurnCandidateRow {
  return {
    reseller_id,
    status: "trial_ended_no_payment",
    updated_at: daysAgo(ago),
  };
}

describe("CHURN_STATUSES", () => {
  it("locks in the two terminal-loss buckets from migration 0075", () => {
    expect(CHURN_STATUSES).toEqual(["canceled", "trial_ended_no_payment"]);
  });

  it("locks the 30-day window constant so the section header cannot drift", () => {
    expect(CHURN_WINDOW_DAYS).toBe(30);
  });
});

describe("computeAttributedChurn30d", () => {
  it("returns zeros when no rows are supplied", () => {
    const c = computeAttributedChurn30d([], { now: NOW, attributed_total: 10 });
    expect(c.churned_count).toBe(0);
    expect(c.canceled_count).toBe(0);
    expect(c.trial_ended_count).toBe(0);
    expect(c.attributed_total).toBe(10);
    expect(c.churn_pct).toBe(0);
  });

  it("counts canceled and trial_ended_no_payment inside the window", () => {
    const c = computeAttributedChurn30d(
      [canceled("r1", 5), trialEnded("r1", 10), canceled("r1", 29)],
      { now: NOW, attributed_total: 100 },
    );
    expect(c.churned_count).toBe(3);
    expect(c.canceled_count).toBe(2);
    expect(c.trial_ended_count).toBe(1);
    expect(c.churn_pct).toBe(3);
  });

  it("ignores rows outside the 30-day window", () => {
    const c = computeAttributedChurn30d(
      [canceled("r1", 31), canceled("r1", 45), canceled("r1", 5)],
      { now: NOW, attributed_total: 10 },
    );
    expect(c.churned_count).toBe(1);
    expect(c.canceled_count).toBe(1);
  });

  it("ignores rows with non-churn statuses (active, trialing, past_due, incomplete, null)", () => {
    const c = computeAttributedChurn30d(
      [
        { reseller_id: "r1", status: "active", updated_at: daysAgo(1) },
        { reseller_id: "r1", status: "trialing", updated_at: daysAgo(1) },
        { reseller_id: "r1", status: "past_due", updated_at: daysAgo(1) },
        { reseller_id: "r1", status: "incomplete", updated_at: daysAgo(1) },
        { reseller_id: "r1", status: null, updated_at: daysAgo(1) },
      ],
      { now: NOW, attributed_total: 5 },
    );
    expect(c.churned_count).toBe(0);
  });

  it("ignores rows with null updated_at (defensive against a garbled row)", () => {
    const c = computeAttributedChurn30d(
      [{ reseller_id: "r1", status: "canceled", updated_at: null }],
      { now: NOW, attributed_total: 5 },
    );
    expect(c.churned_count).toBe(0);
  });

  it("ignores rows with unparseable updated_at", () => {
    const c = computeAttributedChurn30d(
      [{ reseller_id: "r1", status: "canceled", updated_at: "not-a-date" }],
      { now: NOW, attributed_total: 5 },
    );
    expect(c.churned_count).toBe(0);
  });

  it("ignores rows dated in the future (defensive against clock skew)", () => {
    const futureIso = new Date(NOW.getTime() + 3600 * 1000).toISOString();
    const c = computeAttributedChurn30d(
      [{ reseller_id: "r1", status: "canceled", updated_at: futureIso }],
      { now: NOW, attributed_total: 5 },
    );
    expect(c.churned_count).toBe(0);
  });

  it("floors churn_pct to integer so 33.33% renders as 33", () => {
    const c = computeAttributedChurn30d([canceled("r1")], {
      now: NOW,
      attributed_total: 3,
    });
    expect(c.churn_pct).toBe(33);
  });

  it("keeps churn_pct at 0 when attributed_total is 0 (no division by zero)", () => {
    const c = computeAttributedChurn30d([canceled("r1")], {
      now: NOW,
      attributed_total: 0,
    });
    expect(c.churn_pct).toBe(0);
    expect(c.churned_count).toBe(1);
  });

  it("coerces a negative attributed_total to 0 rather than emitting a negative denominator", () => {
    const c = computeAttributedChurn30d([], { now: NOW, attributed_total: -5 });
    expect(c.attributed_total).toBe(0);
  });

  it("boundary: updated_at exactly 30 days ago is inside the window", () => {
    const c = computeAttributedChurn30d(
      [{ reseller_id: "r1", status: "canceled", updated_at: daysAgo(30) }],
      { now: NOW, attributed_total: 10 },
    );
    expect(c.churned_count).toBe(1);
  });
});

describe("computeAttributedChurn30dByReseller", () => {
  it("returns one AttributedChurn30d per requested reseller id, even when the reseller has zero churn", () => {
    const totals = new Map([
      ["r1", 10],
      ["r2", 5],
      ["r3", 20],
    ]);
    const out = computeAttributedChurn30dByReseller(
      ["r1", "r2", "r3"],
      [canceled("r1", 5), trialEnded("r2", 15)],
      { now: NOW, attributedTotals: totals },
    );
    expect(out.size).toBe(3);
    expect(out.get("r1")?.churned_count).toBe(1);
    expect(out.get("r2")?.churned_count).toBe(1);
    expect(out.get("r3")?.churned_count).toBe(0);
    expect(out.get("r3")?.attributed_total).toBe(20);
  });

  it("groups rows by reseller_id without leaking across partners", () => {
    const totals = new Map([
      ["r1", 10],
      ["r2", 8],
    ]);
    const out = computeAttributedChurn30dByReseller(
      ["r1", "r2"],
      [canceled("r1", 5), canceled("r1", 10), trialEnded("r2", 3)],
      { now: NOW, attributedTotals: totals },
    );
    expect(out.get("r1")?.churned_count).toBe(2);
    expect(out.get("r1")?.canceled_count).toBe(2);
    expect(out.get("r2")?.churned_count).toBe(1);
    expect(out.get("r2")?.trial_ended_count).toBe(1);
  });

  it("ignores rows whose reseller_id is not in the requested list", () => {
    const totals = new Map([["r1", 10]]);
    const out = computeAttributedChurn30dByReseller(
      ["r1"],
      [canceled("r1", 5), canceled("r-orphan", 5)],
      { now: NOW, attributedTotals: totals },
    );
    expect(out.size).toBe(1);
    expect(out.get("r1")?.churned_count).toBe(1);
  });

  it("defaults attributed_total to 0 when the reseller is not in the totals map", () => {
    const out = computeAttributedChurn30dByReseller(
      ["r1"],
      [canceled("r1")],
      { now: NOW, attributedTotals: new Map() },
    );
    expect(out.get("r1")?.attributed_total).toBe(0);
    expect(out.get("r1")?.churn_pct).toBe(0);
  });
});

function churnRow(
  code: string,
  display: string,
  seed: ChurnCandidateRow[],
  attributed_total: number,
): AttributedChurnRow {
  return {
    reseller_id: `rid-${code.toLowerCase()}`,
    reseller_code: code,
    reseller_display_name: display,
    churn: computeAttributedChurn30d(seed, { now: NOW, attributed_total }),
  };
}

describe("formatWeeklyDigestAttributedChurnSection", () => {
  it("returns an empty string when no rows are supplied", () => {
    expect(formatWeeklyDigestAttributedChurnSection([])).toBe("");
  });

  it("renders the section header + all column labels", () => {
    const html = formatWeeklyDigestAttributedChurnSection([
      churnRow("ALPHA", "Alpha", [canceled("rid-alpha")], 10),
    ]);
    expect(html).toContain("Attributed churn (last 30 days)");
    expect(html).toContain("subscription_trial_state");
    expect(html).toContain(">Code<");
    expect(html).toContain(">Display name<");
    expect(html).toContain(">Attributed<");
    expect(html).toContain(">Canceled<");
    expect(html).toContain(">Trial ended<");
    expect(html).toContain(">Churned<");
    expect(html).toContain(">Rate<");
  });

  it("sorts rows by reseller_code alphabetically", () => {
    const html = formatWeeklyDigestAttributedChurnSection([
      churnRow("ZULU", "Zulu", [canceled("rid-zulu")], 5),
      churnRow("ALPHA", "Alpha", [canceled("rid-alpha")], 5),
    ]);
    expect(html.indexOf("ALPHA")).toBeLessThan(html.indexOf("ZULU"));
  });

  it("renders the rate as an integer percent suffix", () => {
    const html = formatWeeklyDigestAttributedChurnSection([
      churnRow("ALPHA", "Alpha", [canceled("rid-alpha"), canceled("rid-alpha")], 10),
    ]);
    // 2/10 = 20%
    expect(html).toContain("20%");
  });

  it("renders — for the rate when attributed_total is 0", () => {
    const html = formatWeeklyDigestAttributedChurnSection([
      churnRow("ZERO", "Zero", [canceled("rid-zero")], 0),
    ]);
    expect(html).toContain("&mdash;");
  });

  it("HTML-escapes hostile display names so a bad row cannot inject markup", () => {
    const html = formatWeeklyDigestAttributedChurnSection([
      churnRow("XSS", "<script>alert(1)</script>", [canceled("rid-xss")], 10),
    ]);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>alert");
  });

  it("renders a <tfoot> Total row summing attributed + canceled + trial_ended + churned + portfolio rate", () => {
    const html = formatWeeklyDigestAttributedChurnSection([
      churnRow("ALPHA", "Alpha", [canceled("rid-alpha"), trialEnded("rid-alpha")], 20),
      churnRow("BETA", "Beta", [canceled("rid-beta")], 30),
    ]);
    expect(html).toContain("<tfoot>");
    // attributed total: 50, canceled: 2, trial_ended: 1, churned: 3
    expect(html).toContain("<strong>50</strong>");
    expect(html).toContain("<strong>2</strong>");
    expect(html).toContain("<strong>1</strong>");
    expect(html).toContain("<strong>3</strong>");
    // portfolio rate 3/50 = 6%
    expect(html).toContain("<strong>6%</strong>");
  });

  it("renders — for the portfolio rate when portfolio-wide attributed_total is 0", () => {
    const html = formatWeeklyDigestAttributedChurnSection([
      churnRow("ZERO", "Zero", [], 0),
    ]);
    expect(html).toContain("<strong>&mdash;</strong>");
  });

  it("renders zeroed rows explicitly rather than omitting them so a partner with zero churn is visible", () => {
    const html = formatWeeklyDigestAttributedChurnSection([
      churnRow("HEALTHY", "Healthy Partner", [], 25),
    ]);
    expect(html).toContain("HEALTHY");
    // Attributed=25, churned=0, rate=0%
    expect(html).toContain("0%");
  });

  it("renders 7 <td> cells per body row (code, display, attributed, canceled, trial_ended, churned, rate)", () => {
    const html = formatWeeklyDigestAttributedChurnSection([
      churnRow("ALPHA", "Alpha", [canceled("rid-alpha")], 10),
    ]);
    const tbodyStart = html.indexOf("<tbody>");
    const tbodyEnd = html.indexOf("</tbody>");
    const body = html.slice(tbodyStart, tbodyEnd);
    const cellCount = (body.match(/<td[\s>]/g) ?? []).length;
    expect(cellCount).toBe(7);
  });

  it("column-order invariant: canceled before trial_ended before churned before rate", () => {
    const html = formatWeeklyDigestAttributedChurnSection([
      churnRow("ALPHA", "Alpha", [canceled("rid-alpha"), trialEnded("rid-alpha")], 10),
    ]);
    const thStart = html.indexOf("<thead>");
    const thEnd = html.indexOf("</thead>");
    const head = html.slice(thStart, thEnd);
    expect(head.indexOf("Canceled")).toBeLessThan(head.indexOf("Trial ended"));
    expect(head.indexOf("Trial ended")).toBeLessThan(head.indexOf("Churned"));
    expect(head.indexOf("Churned")).toBeLessThan(head.indexOf("Rate"));
  });
});
