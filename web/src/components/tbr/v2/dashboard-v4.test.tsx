// G34 BT3 (RQ02–RQ07) — page 1 renders the dashboard-v4 projection: 5 tiles,
// meeting label, key-metrics table, 8-row scorecard table (lead abbr,
// emphasis band, pending "—"), red-flag panel, signal status chips linked
// to the screening cards, why / stop / ask (risks first on a phone), the
// degraded banner and the free "In full report" rows. renderToStaticMarkup
// (no @testing-library in this workspace).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { demoReportV2, freeFixtureReportV2 } from "@/lib/report-v2/fixtures";
import { unavailableValuation } from "@/lib/report-v2/schema";
import { freeScreeningLeakProbe, LEAK_PROBE_MARK } from "@/lib/report-v2/screening-leak-fixture";
import { TbrReportV2 } from "./report";

const page1 = (html: string) => html.slice(html.indexOf('id="tbr-dashboard"'), html.indexOf('id="tbr-investment-view"'));
const textOf = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "\n").replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');

describe("TbrDashboard — dashboard v4 page 1", () => {
  const html = page1(renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />));

  it("renders the 5 tiles in order with the valuation range and the uncapped SVI", () => {
    expect([...html.matchAll(/data-tbr-tile="([a-z]+)"/g)].map((m) => m[1])).toEqual(["valuation", "svi", "investor", "evidence", "verification"]);
    expect(html).toContain("A$6M – A$9.8M");
    expect(html).toMatch(/data-tbr-tile="svi"[\s\S]*?>74</);
    expect(html).not.toMatch(/data-tbr-tile="svi"[^]*?74\/100/);
    expect(html).toMatch(/data-tbr-tile="investor"[\s\S]*?>\d+\/100</);
    expect(html).toMatch(/data-tbr-tile="verification"[\s\S]*?>L2</);
    expect(html).toContain('data-tbr-confidence-meter="');
    expect(html).toContain('data-tbr-meeting-label="B"');
    expect(html).toContain("Worth investigating");
  });

  it("key metrics: a captioned table, 6 cells, NRR / GM / runway / burn as dashed 'Not evidenced' (never 0)", () => {
    expect(html).toContain("data-tbr-key-metrics");
    expect(html).toMatch(/<table[^>]*>\s*<caption class="sr-only">Key metrics/);
    expect((html.match(/data-tbr-metric="/g) ?? []).length).toBe(6);
    expect((html.match(/data-status="not_evidenced"/g) ?? []).length).toBe(4);
    expect(html).toMatch(/data-tbr-metric="arr" data-status="verified"[\s\S]*?A\$1\.2M/);
    expect(html).toContain("border-dashed");
  });

  it("scorecard: a captioned table of 8 row links in chapter order, lead abbr, emphasis band, score bar as role=img with a full label", () => {
    expect(html).toMatch(/<caption class="sr-only">Eight dimensions/);
    const rows = [...html.matchAll(/data-tbr-scorecard-row="([a-z]+)"/g)].map((m) => m[1]);
    expect(rows).toEqual(["tre", "mpc", "ftv", "ptd", "cgh", "iri", "lco", "svm"]);
    for (const dim of rows) expect(html).toContain(`href="#tbr-dim-${dim}"`);
    expect(html).toContain('<abbr title="CRO agent" class="no-underline">Lead · CRO</abbr>');
    expect(html).toMatch(/data-tbr-emphasis="(VeryHigh|High|Medium|Low)"/);
    expect(html).toMatch(/role="img" aria-label="Traction &amp; Revenue: score \d+, (Strong|Developing|Early)/);
    expect(html).toContain("Lead = AI agent role that drafted and scored the chapter");
    expect(html).not.toMatch(/weight \d+ %/);
  });

  it("red flags + signal chips + why / stop / ask; the chips link to the screening cards; no dim_bars chart, no duplicate brief", () => {
    expect(html).toContain("data-tbr-red-flags=");
    expect(html).toContain('data-tbr-red-flag="unverified"');
    expect(html).toContain('href="#tbr-risk-matrix"');
    expect((html.match(/data-tbr-signal-chip="/g) ?? []).length).toBe(6);
    for (const key of ["team", "traction", "moat", "liquidity", "capital_structure", "ip"]) {
      expect(html).toContain(`href="#investor-signal-${key}"`);
      expect(html).toContain(`id="investor-signal-${key}"`);
    }
    for (const kind of ["why", "stop", "ask"]) expect(html).toContain(`data-tbr-list="${kind}"`);
    expect(html).not.toContain('data-visual-kind="dim_bars"');
    expect(html).not.toContain("data-investor-brief");
    expect(html).toContain("data-tbr-investor-screening");
    expect(html).toContain("data-tbr-cover-ledger");
  });

  it("375 px order: red flags (order-1) and the stop list before strengths; desktop order via lg:order-*", () => {
    expect(html).toMatch(/order-1 min-w-0 lg:order-3 lg:col-span-5"><aside data-tbr-red-flags/);
    expect(html).toMatch(/order-3 min-w-0 lg:order-1 lg:col-span-12"><div data-tbr-key-metrics/);
    expect(html).toMatch(/data-tbr-list="stop" class="[^"]*order-1 md:order-2/);
    expect(html).toMatch(/data-tbr-list="why" class="[^"]*order-2 md:order-1/);
  });
});

describe("TbrDashboard — states (RQ07)", () => {
  it("pending row: '—' in a dashed chip, never a 0 score", () => {
    const report = demoReportV2();
    const svm = report.dimensions.find((d) => d.dim === "svm")!;
    svm.band = "pending";
    svm.score = 0;
    svm.scoreBreakdown = { base: 35, signals: [], confidenceMultiplier: 0.2, adjustment: 0, assessed: false };
    report.cover.dims.svm = { ...report.cover.dims.svm, band: "pending", score: 0 };
    const html = page1(renderToStaticMarkup(<TbrReportV2 report={report} />));
    const row = html.slice(html.indexOf('data-tbr-scorecard-row="svm"'), html.indexOf("</tr>", html.indexOf('data-tbr-scorecard-row="svm"')));
    expect(row).toContain('data-state="pending"');
    expect(row).toContain("data-tbr-score-pending");
    expect(row).toContain("—");
    expect(row).not.toMatch(/>0</);
  });

  it("degraded: a status banner naming the sections; the affected row says the written analysis is unavailable", () => {
    const report = demoReportV2();
    report.quality = { ...report.quality, degradedSections: ["mpc"] };
    const html = page1(renderToStaticMarkup(<TbrReportV2 report={report} />));
    expect(html).toMatch(/role="status" data-tbr-degraded-banner/);
    expect(textOf(html)).toContain("Written analysis is unavailable for 1 section (Market & Problem)");
    const row = html.slice(html.indexOf('data-tbr-scorecard-row="mpc"'), html.indexOf("</tr>", html.indexOf('data-tbr-scorecard-row="mpc"')));
    expect(row).toContain("data-tbr-row-degraded");
  });

  it("valuation not estimable: the sentence + unlock hint, no range bar", () => {
    const report = demoReportV2();
    report.valuation = unavailableValuation("No revenue evidence", report.generatedAt, ["revenue evidence"]);
    const html = page1(renderToStaticMarkup(<TbrReportV2 report={report} />));
    expect(html).toContain("data-tbr-valuation-unavailable");
    expect(html).toContain("Not enough evidence to estimate a range");
    expect(html).toContain("Add revenue evidence to unlock a valuation method");
  });

  it("free (D24-b): scores and bands visible on every row; card chapters show 'In full report' and no locked detail", () => {
    const report = freeFixtureReportV2();
    const html = page1(renderToStaticMarkup(<TbrReportV2 report={report} unlock={{ mode: "buy" }} />));
    const cards = report.dimensions.filter((d) => d.renderAs === "card").map((d) => d.dim);
    expect((html.match(/data-tbr-row-locked/g) ?? []).length).toBe(cards.length);
    for (const dim of cards) {
      const ch = report.dimensions.find((d) => d.dim === dim)!;
      const row = html.slice(html.indexOf(`data-tbr-scorecard-row="${dim}"`), html.indexOf("</tr>", html.indexOf(`data-tbr-scorecard-row="${dim}"`)));
      expect(row).toContain('data-locked="true"');
      expect(row).toContain("In full report");
      if (ch.band !== "pending") expect(row).toContain(`>${ch.score}<`);
    }
    expect(textOf(html)).toMatch(/\+\d dimensions detailed in the full report/);

    const { report: probe, secrets } = freeScreeningLeakProbe();
    const leak = page1(renderToStaticMarkup(<TbrReportV2 report={probe} unlock={{ mode: "buy" }} />));
    expect(leak).not.toContain(LEAK_PROBE_MARK);
    for (const secret of secrets) expect(textOf(leak)).not.toContain(secret);
  });
});

describe("TbrDashboard — G34 BT6 position line + calibration (RQ19–RQ21, RQ27, RQ28)", () => {
  it("stage ladder under the scorecard as text + dots (role=img label); no peer / spike / round line when the report has no data", () => {
    const html = page1(renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />));
    expect(html).toContain('data-tbr-stage-ladder="4"');
    expect(html).toContain('aria-label="Stage ladder: step 4 of 5, Scaling"');
    expect(textOf(html)).toContain("Scaling");
    expect(html).toContain("Commercial maturity from verified evidence only");
    expect(html).not.toContain("data-tbr-spike");
    expect(html).not.toContain("data-tbr-round-readiness");
    expect(html).toMatch(/data-tbr-position[\s\S]*<\/div>/);
  });

  it("peer position and spike print only when the report publishes them", () => {
    const report = demoReportV2();
    report.cover.svi = { ...report.cover.svi, cohortPercentile: 62, cohortN: 41 };
    for (const d of report.dimensions) d.benchmark = { ...d.benchmark, percentile: d.dim === "tre" ? 95 : 50, n: 41 };
    const html = page1(renderToStaticMarkup(<TbrReportV2 report={report} />));
    expect(html).toContain('data-tbr-peer="published"');
    expect(textOf(html)).toContain(`p62 of ${report.cover.stageLabel} cohort (n = 41)`);
    expect(html).toContain('data-tbr-spike="tre"');
    expect(textOf(html)).toMatch(/\(top 10% of stage\)/);
  });

  it("calibration: the server-loaded backtest headline with the methodology link; pending when none; no figures when the surface did not load it", () => {
    const published = page1(renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} benchmarks={{ calibration: { rho: 0.762, n: 41, asOf: "2026-09-17T00:07:42.936Z" } }} />));
    expect(published).toContain('data-tbr-calibration="published"');
    expect(textOf(published)).toMatch(/SVI backtest ρ 0\.76 vs round size \(n = 41, /);
    expect(textOf(published)).toContain("not a substitute for diligence");
    expect(published).toContain('href="/methodology/calibration"');
    const pending = page1(renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} benchmarks={{ calibration: null }} />));
    expect(pending).toContain('data-tbr-calibration="pending"');
    expect(textOf(pending)).toContain("Calibration pending");
    const unknown = page1(renderToStaticMarkup(<TbrReportV2 report={demoReportV2()} />));
    expect(unknown).toContain('data-tbr-calibration="unknown"');
    expect(unknown).toContain('href="/methodology/calibration"');
  });
});
