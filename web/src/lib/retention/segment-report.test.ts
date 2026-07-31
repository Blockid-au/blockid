import { describe, it, expect } from "vitest";

import { formatSegmentReport, type SegmentMetrics } from "./segment-report";

const baseMetrics: SegmentMetrics = {
  activeSubs: 1234,
  trialConversion: 0.4275,
  churn30d: 42,
  netRevenueAud: 8765.42,
  asOf: "2026-07-31T00:00:00.000Z",
};

const KNOWN_SEGMENTS = [
  "founder",
  "investor_angel",
  "investor_vc",
  "advisor",
  "accelerator",
  "lp",
  "admin",
];

describe("formatSegmentReport / shared shape", () => {
  it("stamps a level-1 markdown title with the segment name", () => {
    const out = formatSegmentReport("founder", baseMetrics);
    expect(out.startsWith("# Retention snapshot — founder\n")).toBe(true);
  });

  it("renders the as-of line as italic markdown from the metrics.asOf value verbatim", () => {
    const out = formatSegmentReport("founder", baseMetrics);
    expect(out).toContain(`_As of ${baseMetrics.asOf}_`);
  });

  it("renders a 4-row metric table with the exact header + alignment row", () => {
    const out = formatSegmentReport("founder", baseMetrics);
    expect(out).toContain("| Metric | Value |");
    expect(out).toContain("| --- | --- |");
  });

  it("formats active subscribers with en-AU thousand separators", () => {
    const out = formatSegmentReport("founder", { ...baseMetrics, activeSubs: 1234567 });
    expect(out).toContain("| Active subscribers | 1,234,567 |");
  });

  it("formats trial conversion as percentage with 1 decimal", () => {
    const out = formatSegmentReport("founder", { ...baseMetrics, trialConversion: 0.4275 });
    expect(out).toContain("| Trial to paid (14d) | 42.8% |");
  });

  it("formats churn 30d with en-AU thousand separators", () => {
    const out = formatSegmentReport("founder", { ...baseMetrics, churn30d: 12345 });
    expect(out).toContain("| Churn (30d) | 12,345 |");
  });

  it("formats net revenue as A$ integer with en-AU thousand separators (rounds)", () => {
    const out = formatSegmentReport("founder", { ...baseMetrics, netRevenueAud: 9876.51 });
    expect(out).toContain("| Net revenue (30d) | A$9,877 |");
  });

  it("emits a level-2 Summary heading after the table", () => {
    const out = formatSegmentReport("founder", baseMetrics);
    expect(out).toContain("## Summary");
    expect(out.indexOf("## Summary")).toBeGreaterThan(out.indexOf("| Net revenue"));
  });

  it("ends with a trailing newline", () => {
    const out = formatSegmentReport("founder", baseMetrics);
    expect(out.endsWith("\n")).toBe(true);
  });

  it("pins the exact ordering: title → asOf → table → summary", () => {
    const out = formatSegmentReport("founder", baseMetrics);
    const iTitle = out.indexOf("# Retention snapshot");
    const iAsOf = out.indexOf("_As of ");
    const iTable = out.indexOf("| Metric | Value |");
    const iSummary = out.indexOf("## Summary");
    expect(iTitle).toBeGreaterThanOrEqual(0);
    expect(iAsOf).toBeGreaterThan(iTitle);
    expect(iTable).toBeGreaterThan(iAsOf);
    expect(iSummary).toBeGreaterThan(iTable);
  });
});

describe("formatSegmentReport / known-segment summariser branches", () => {
  it.each(KNOWN_SEGMENTS)("mentions active subs + churn count for %s", (segment) => {
    const out = formatSegmentReport(segment, baseMetrics);
    const summary = out.split("## Summary\n\n")[1] ?? "";
    expect(summary).toContain(String(baseMetrics.activeSubs));
    expect(summary).toContain(String(baseMetrics.churn30d));
  });

  it("founder summariser mentions activation + coach touchpoints as retention levers", () => {
    const out = formatSegmentReport("founder", baseMetrics);
    expect(out).toContain("Founder cohort:");
    expect(out).toContain("activation and coach touchpoints");
  });

  it("investor_angel summariser mentions deal-flow quality + syndicate features", () => {
    const out = formatSegmentReport("investor_angel", baseMetrics);
    expect(out).toContain("Angel investors:");
    expect(out).toContain("deal-flow quality and syndicate features");
  });

  it("investor_vc summariser mentions portfolio-monitoring depth + multi-seat expansion", () => {
    const out = formatSegmentReport("investor_vc", baseMetrics);
    expect(out).toContain("VC seats:");
    expect(out).toContain("portfolio-monitoring depth and multi-seat expansion");
  });

  it("advisor summariser mentions founder-match cadence", () => {
    const out = formatSegmentReport("advisor", baseMetrics);
    expect(out).toContain("Advisors:");
    expect(out).toContain("founder-match cadence");
  });

  it("accelerator summariser mentions cohort-level dashboards + demo-day exports", () => {
    const out = formatSegmentReport("accelerator", baseMetrics);
    expect(out).toContain("Accelerator accounts:");
    expect(out).toContain("Cohort-level dashboards and demo-day exports");
  });

  it("lp summariser mentions portfolio transparency + quarterly reporting cadence", () => {
    const out = formatSegmentReport("lp", baseMetrics);
    expect(out).toContain("Limited Partners:");
    expect(out).toContain("Portfolio transparency and quarterly reporting cadence");
  });

  it("admin summariser mentions SSO health + role-permission clarity as operational levers", () => {
    const out = formatSegmentReport("admin", baseMetrics);
    expect(out).toContain("Admin seats:");
    expect(out).toContain("verify SSO health and role-permission clarity");
  });

  it.each(KNOWN_SEGMENTS)("known segment %s renders trial conversion as percentage in the summary", (segment) => {
    const out = formatSegmentReport(segment, { ...baseMetrics, trialConversion: 0.5 });
    const summary = out.split("## Summary\n\n")[1] ?? "";
    expect(summary).toMatch(/50\.0%/);
  });

  it.each(KNOWN_SEGMENTS)("known segment %s renders net revenue as A$ integer in the summary", (segment) => {
    const out = formatSegmentReport(segment, { ...baseMetrics, netRevenueAud: 1234 });
    const summary = out.split("## Summary\n\n")[1] ?? "";
    expect(summary).toContain("A$1,234");
  });
});

describe("formatSegmentReport / default (unknown-segment) summariser", () => {
  it("uses the fallback summariser for an unknown segment key", () => {
    const out = formatSegmentReport("mentor", baseMetrics);
    const summary = out.split("## Summary\n\n")[1] ?? "";
    expect(summary.startsWith("mentor: ")).toBe(true);
  });

  it("fallback summariser echoes the segment name into the title AND the summary body", () => {
    const out = formatSegmentReport("qa-founder", baseMetrics);
    expect(out).toContain("# Retention snapshot — qa-founder");
    expect(out).toContain("qa-founder: ");
  });

  it("fallback summariser mentions active subscribers count and 'trial-to-paid conversion' phrase", () => {
    const out = formatSegmentReport("unknown", baseMetrics);
    const summary = out.split("## Summary\n\n")[1] ?? "";
    expect(summary).toContain(`${baseMetrics.activeSubs} active subscribers`);
    expect(summary).toContain("trial-to-paid conversion");
  });

  it("fallback summariser mentions churn events and net revenue with formatted values", () => {
    const out = formatSegmentReport("unknown", { ...baseMetrics, churn30d: 7, netRevenueAud: 500 });
    const summary = out.split("## Summary\n\n")[1] ?? "";
    expect(summary).toContain("7 churn events");
    expect(summary).toContain("A$500");
  });

  it("empty-string segment falls through to the fallback (empty prefix + colon)", () => {
    const out = formatSegmentReport("", baseMetrics);
    expect(out).toContain("# Retention snapshot — \n");
    const summary = out.split("## Summary\n\n")[1] ?? "";
    expect(summary.startsWith(": ")).toBe(true);
  });
});

describe("formatSegmentReport / numeric edge cases in formatPct + formatAud", () => {
  it("formatPct returns '0.0%' for NaN trialConversion (fallback branch)", () => {
    const out = formatSegmentReport("founder", { ...baseMetrics, trialConversion: Number.NaN });
    expect(out).toContain("| Trial to paid (14d) | 0.0% |");
  });

  it("formatPct returns '0.0%' for +Infinity trialConversion", () => {
    const out = formatSegmentReport("founder", { ...baseMetrics, trialConversion: Number.POSITIVE_INFINITY });
    expect(out).toContain("| Trial to paid (14d) | 0.0% |");
  });

  it("formatPct returns '0.0%' for -Infinity trialConversion", () => {
    const out = formatSegmentReport("founder", { ...baseMetrics, trialConversion: Number.NEGATIVE_INFINITY });
    expect(out).toContain("| Trial to paid (14d) | 0.0% |");
  });

  it("formatPct renders 0 as '0.0%'", () => {
    const out = formatSegmentReport("founder", { ...baseMetrics, trialConversion: 0 });
    expect(out).toContain("| Trial to paid (14d) | 0.0% |");
  });

  it("formatPct renders 1 as '100.0%'", () => {
    const out = formatSegmentReport("founder", { ...baseMetrics, trialConversion: 1 });
    expect(out).toContain("| Trial to paid (14d) | 100.0% |");
  });

  it("formatPct rounds 0.12345 to '12.3%' (single-decimal truncation via toFixed)", () => {
    const out = formatSegmentReport("founder", { ...baseMetrics, trialConversion: 0.12345 });
    expect(out).toContain("| Trial to paid (14d) | 12.3% |");
  });

  it("formatAud returns 'A$0' for NaN netRevenueAud (fallback branch)", () => {
    const out = formatSegmentReport("founder", { ...baseMetrics, netRevenueAud: Number.NaN });
    expect(out).toContain("| Net revenue (30d) | A$0 |");
  });

  it("formatAud returns 'A$0' for +Infinity netRevenueAud", () => {
    const out = formatSegmentReport("founder", { ...baseMetrics, netRevenueAud: Number.POSITIVE_INFINITY });
    expect(out).toContain("| Net revenue (30d) | A$0 |");
  });

  it("formatAud rounds 0.49 down to 'A$0'", () => {
    const out = formatSegmentReport("founder", { ...baseMetrics, netRevenueAud: 0.49 });
    expect(out).toContain("| Net revenue (30d) | A$0 |");
  });

  it("formatAud rounds 0.5 up to 'A$1'", () => {
    const out = formatSegmentReport("founder", { ...baseMetrics, netRevenueAud: 0.5 });
    expect(out).toContain("| Net revenue (30d) | A$1 |");
  });

  it("formatAud handles negative revenue (Math.round + toLocaleString) — churn refund month", () => {
    const out = formatSegmentReport("founder", { ...baseMetrics, netRevenueAud: -12345 });
    expect(out).toContain("| Net revenue (30d) | A$-12,345 |");
  });

  it("zero counts render as '0' in the metric table (not empty)", () => {
    const out = formatSegmentReport("founder", {
      ...baseMetrics,
      activeSubs: 0,
      churn30d: 0,
    });
    expect(out).toContain("| Active subscribers | 0 |");
    expect(out).toContain("| Churn (30d) | 0 |");
  });
});
