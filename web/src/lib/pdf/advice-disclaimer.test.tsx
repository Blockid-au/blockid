// QA-3 commercial audit P1-7 (2026-09-12): the five founder-facing PDF
// exports that shipped without an advice disclaimer now render
// <AdviceDisclaimer /> (lib/pdf/advice-disclaimer, re-exported by
// disclaimer-footer.ts). Each document is rendered for real and the text
// read back with pdf-parse, so a template that drops the block fails here.

import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { PDFParse } from "pdf-parse";

import {
  PDF_GENERAL_ADVICE_DISCLAIMER,
  PDF_FINANCIAL_PROJECTION_DISCLAIMER,
  PDF_PITCH_DECK_DISCLAIMER,
  adviceDisclaimerText,
} from "./advice-disclaimer";
import { FinancialProjectionPDF } from "./financial-projection-pdf";
import { GtmStrategyPDF } from "./gtm-strategy-pdf";
import { ScorePDF } from "./score-pdf";
import { FounderPackPDF } from "./founder-pack-pdf";
import { PitchDeckPDF } from "./pitch-deck-pdf";
import type { FinancialProjectionOutput } from "@/lib/agents/cfo-financial-projection";
import type { HydratedFounderPack } from "@/lib/idea-phase/persist";

async function allText(buffer: Buffer): Promise<string> {
  expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => p.text).join(" ").replace(/\s+/g, " ");
  } finally {
    await parser.destroy();
  }
}

// pdf-parse joins wrapped lines with spaces; compare on a whitespace-folded
// prefix long enough to be unambiguous.
const KEY_PHRASES = [
  "general information only",
  "or personal financial product advice under s766B of the Corporations Act 2001 (Cth)",
  "not a financial valuation, an investment recommendation",
  "does not hold an Australian Financial Services Licence (AFSL)",
  "Seek independent professional advice",
  "ACN 659 615 111",
  "ABN 79 659 615 111",
];

function expectGeneralDisclaimer(text: string): void {
  for (const phrase of KEY_PHRASES) expect(text, phrase).toContain(phrase);
}

const PROJECTION: FinancialProjectionOutput = {
  startupName: "Acme Pty Ltd",
  stage: "seed",
  currency: "AUD",
  assumptions: {
    startingMrr: 20_000,
    monthlyGrowthPct: 12,
    grossMarginPct: 65,
    monthlyBurn: 80_000,
    startingCash: 1_200_000,
    quarterlyOpexGrowthPct: 10,
  },
  quarters: [
    { quarter: "Y1Q1", revenue: 60_000, cogs: 21_000, grossProfit: 39_000, opex: 240_000, netIncome: -201_000, cashBalance: 999_000 },
    { quarter: "Y1Q2", revenue: 85_000, cogs: 29_750, grossProfit: 55_250, opex: 264_000, netIncome: -208_750, cashBalance: 790_250 },
  ],
  totals: { revenueY1: 400_000, revenueY2: 1_400_000, revenueY3: 3_900_000, netY1: -800_000, netY2: -300_000, netY3: 600_000, runwayMonths: 14 },
  narrative: {
    assumptions: "Seed-stage defaults.",
    commentary: "Growth compounds from Y2.",
    investorTakeaway: "Runway covers the raise window.",
  },
  sources: ["BlockID seed benchmarks 2026"],
};

const PACK: HydratedFounderPack = {
  id: "pack-1",
  slug: "acme-pack",
  ideaName: "Acme",
  createdAt: "2026-09-12T00:00:00.000Z",
  viewCount: 0,
  lastViewedAt: null,
  evaluation: null,
  split: null,
  funding: null,
  user: { email: "jo@acme.io", displayName: "Jo" },
};

describe("adviceDisclaimerText", () => {
  it("composes the variants from the general block", () => {
    expect(adviceDisclaimerText()).toBe(PDF_GENERAL_ADVICE_DISCLAIMER);
    expect(adviceDisclaimerText("financial")).toBe(`${PDF_FINANCIAL_PROJECTION_DISCLAIMER} ${PDF_GENERAL_ADVICE_DISCLAIMER}`);
    expect(adviceDisclaimerText("pitch")).toBe(`${PDF_PITCH_DECK_DISCLAIMER} ${PDF_GENERAL_ADVICE_DISCLAIMER}`);
  });
});

describe("PDF exports carry the general-advice disclaimer (QA-3 P1-7)", () => {
  it("financial-projection-pdf: forward-looking + general advice", async () => {
    const text = await allText((await renderToBuffer(<FinancialProjectionPDF data={PROJECTION} email="jo@acme.io" />)) as Buffer);
    expectGeneralDisclaimer(text);
    expect(text).toContain("Forward-looking financial projections are estimates");
    expect(text).toContain("Consult a qualified accountant or financial adviser");
  });

  it("gtm-strategy-pdf: general advice on the closing page", async () => {
    const text = await allText(
      (await renderToBuffer(
        <GtmStrategyPDF
          input={{
            startupName: "Acme",
            sector: "SaaS",
            gtm: {
              positioning: "The fastest way to X.",
              channels: [{ name: "Partnerships", priority: "high", rationale: "Warm intros." }],
              first90Days: ["Ship", "Sell", "Scale"],
              keyMetrics: ["CAC payback"],
            },
          }}
        />,
      )) as Buffer,
    );
    expectGeneralDisclaimer(text);
  });

  it("score-pdf: general advice (not a valuation, no AFSL)", async () => {
    const text = await allText(
      (await renderToBuffer(
        <ScorePDF
          data={{
            slug: "acme",
            totalScore: 61,
            email: "jo@acme.io",
            subScores: [{ label: "Team", value: 70 }],
            inputs: { stage: "seed" },
            createdAt: "2026-09-12T00:00:00.000Z",
            shareUrl: "https://blockid.au/s/acme",
          }}
        />,
      )) as Buffer,
    );
    expectGeneralDisclaimer(text);
  });

  it("founder-pack-pdf: general advice on page 1 even when the pack is empty", async () => {
    const text = await allText((await renderToBuffer(<FounderPackPDF data={{ pack: PACK, shareUrl: "https://blockid.au/s/p/acme-pack" }} />)) as Buffer);
    expectGeneralDisclaimer(text);
  });

  it("pitch-deck-pdf: not-an-offer (Ch 6D / s708) + general advice on the closing slide", async () => {
    const text = await allText((await renderToBuffer(<PitchDeckPDF />)) as Buffer);
    expectGeneralDisclaimer(text);
    expect(text).toContain("not an offer, invitation or recommendation to acquire securities");
    expect(text).toContain("s708");
  });
});
