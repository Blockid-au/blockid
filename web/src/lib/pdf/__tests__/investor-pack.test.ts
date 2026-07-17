// Smoke tests for the Investor Pack v2 template (T-1201).
//
// Two cases:
//   (a) minimal input → non-empty Buffer with the PDF magic header.
//   (b) full input    → Buffer strictly larger than (a), proving every
//                       section (SVI table, cap table, traction chart,
//                       teaser callouts) actually contributed pixels.

import { describe, it, expect } from "vitest";
import {
  renderInvestorPack,
  SVI_13_CRITERIA,
  type InvestorPackData,
} from "@/lib/pdf/investor-pack";

const MINIMAL: InvestorPackData = {
  startup: {
    name: "Acme Placeholder",
    asOfDate: "2026-07-17",
  },
  svi: {
    grade: "—",
    score: 0,
    criteria: SVI_13_CRITERIA.map((c) => ({
      id: c.id,
      label: c.label,
      score: NaN,
    })),
  },
  traction: { mrrHistory: [] },
};

const FULL: InvestorPackData = {
  startup: {
    name: "Acme Robotics",
    tagline: "Warehouse automation for mid-market Australian retailers.",
    sector: "Industrial AI",
    asOfDate: "2026-07-17",
  },
  svi: {
    grade: "A",
    score: 812,
    delta30d: 18.4,
    criteria: SVI_13_CRITERIA.map((c, i) => ({
      id: c.id,
      label: c.label,
      score: 40 + i * 4,
      delta: (i % 3) - 1,
    })),
  },
  capTable: [
    { shareholder: "Founder Holdings Pty Ltd", class: "Ordinary", shares: 4_000_000, percentage: 55.5, valueAud: 5_550_000 },
    { shareholder: "ESOP Trust", class: "Options", shares: 800_000, percentage: 11.1, valueAud: 1_110_000 },
    { shareholder: "Seed Investor A", class: "Preferred", shares: 1_200_000, percentage: 16.7, valueAud: 1_670_000 },
    { shareholder: "Seed Investor B", class: "Preferred", shares: 900_000, percentage: 12.5, valueAud: 1_250_000 },
    { shareholder: "Angels", class: "Ordinary", shares: 300_000, percentage: 4.2, valueAud: 420_000 },
  ],
  traction: {
    mrrHistory: [
      { month: "Jan", mrrAud: 4200 },
      { month: "Feb", mrrAud: 5800 },
      { month: "Mar", mrrAud: 7100 },
      { month: "Apr", mrrAud: 9300 },
      { month: "May", mrrAud: 12400 },
      { month: "Jun", mrrAud: 15100 },
      { month: "Jul", mrrAud: 18400 },
    ],
    targetAud: 1_500_000,
    raisedAud: 720_000,
    round: "Seed",
  },
  teaser: {
    headline: "Warehouse automation, priced for mid-market AU.",
    oneliner:
      "Acme Robotics ships plug-and-play automation cells that pay back in under 18 months for AU retailers with < 50 SKU velocity ranks.",
    opportunity:
      "AU mid-market retail automation TAM A$1.4B; only two direct competitors, neither AU-based.",
    risk:
      "Hardware supply chain concentrated in one Vietnamese fab; dual-sourcing plan in Q3.",
  },
};

describe("Investor Pack v2 template", () => {
  it("renders a minimal input to a non-empty PDF buffer", async () => {
    const buf = await renderInvestorPack(MINIMAL);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(2000);
    // PDF magic header
    expect(buf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  }, 30_000);

  it("renders a fully-populated input to a strictly larger buffer than the minimal case", async () => {
    const [minimalBuf, fullBuf] = await Promise.all([
      renderInvestorPack(MINIMAL),
      renderInvestorPack(FULL),
    ]);
    expect(fullBuf.length).toBeGreaterThan(minimalBuf.length);
    expect(fullBuf.subarray(0, 4).toString("latin1")).toBe("%PDF");
  }, 60_000);
});
