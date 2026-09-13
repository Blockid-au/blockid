// Colocated suite for the listing readiness renderer (S29-A) — one
// pdf-parse pass per exchange pinning: A4, the FOUNDER's company block
// (never Auschain / BlockID's ACN as the company), the score strip, every
// row's status / rule / basis / next step, the sources with the as-at
// date, the indicator-not-advice note, the advice disclaimer, the
// watermark when a recipient label is given, and never "PhD".

import { describe, expect, it } from "vitest";
import { PDFParse } from "pdf-parse";

import { pdfPageCount } from "./page-count";
import { pdfSafe, renderListingReadinessPdf } from "./listing-readiness-pdf";
import { PDF_GENERAL_ADVICE_DISCLAIMER } from "./advice-disclaimer";
import { watermarkLabel } from "./watermark";
import { buildAsxChecklist, buildNasdaqChecklist, emptyListingFacts, LISTING_READINESS_NOTE, scoreReadiness, type ListingFacts } from "@/lib/listing/readiness";

const COMPANY = { name: "Acme Robotics Pty Ltd", abn: "12 345 678 901", acn: "123 456 789", address: "Sydney NSW" };

async function text(buffer: Buffer): Promise<string> {
  expect(buffer.subarray(0, 4).toString("latin1")).toBe("%PDF");
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const result = await parser.getText();
    return result.pages.map((p) => p.text).join("\n").replace(/\s+/g, " ");
  } finally {
    await parser.destroy();
  }
}

const facts: ListingFacts = {
  ...emptyListingFacts(),
  holders: [
    { id: "f", name: "Jane Founder", role: "founder", sharesHeld: 800_000 },
    { id: "s", name: "Seed Investor Pty Ltd", role: "investor", sharesHeld: 200_000 },
  ],
  sharePriceAud: 2,
  incorporatedAt: "2021-03-01",
  listed: false,
  profile: { constitution_reviewed_at: "2026-07-01", aud_usd_rate: 0.65, market_makers: 1 },
};

describe("renderListingReadinessPdf", () => {
  it("ASX: company block, score strip, rows with rule / basis / next step, sources, note + disclaimer", async () => {
    const rows = buildAsxChecklist(facts);
    const buf = await renderListingReadinessPdf({ company: COMPANY, exchange: "asx", rows, score: scoreReadiness(rows), generatedAt: "2026-09-13", watermark: null });
    expect(pdfPageCount(buf)).toBeLessThanOrEqual(4);
    const t = await text(buf);
    expect(t).toContain("Listing readiness — ASX (admission conditions)");
    expect(t).toContain("Acme Robotics Pty Ltd");
    expect(t).toContain("ACN 123 456 789 · ABN 12 345 678 901 · Sydney NSW");
    expect(t).not.toContain("659 615 111 · Sydney NSW"); // Auschain's line is only inside the disclaimer, never the company block
    expect(t).toContain("67 %"); // met 2 (free float, constitution) ÷ (2 + 1 not met)
    expect(t).toContain("NOT CONFIRMED");
    expect(t).toContain("CONFIRM CURRENT RULE");
    expect(t).toContain("ASX LR 1.1 condition 8 · checked 13 September 2026");
    expect(t).toContain("Basis: 1 of 1 non-affiliated holders hold a parcel worth >= A$2,000 at A$2.00 per share");
    expect(t).not.toMatch(/[≥≤→]/);
    expect(t).toContain("Next: Plan a pre-IPO placement");
    expect(t).toContain("ASX LR 1.1 condition 1A (LR 15.11)");
    expect(t).toContain("Constitution reviewed against LR 15.11 on 2026-07-01 (entered)");
    expect(t).toContain("ASX Listing Rules, Chapter 1 (Admission) and Chapter 19 (Definitions) (checked 13 September 2026)");
    expect(t).toContain(LISTING_READINESS_NOTE);
    expect(t).toContain(PDF_GENERAL_ADVICE_DISCLAIMER);
    expect(t).toContain("Generated 13 September 2026 · 11 rows");
    expect(t).not.toMatch(/PhD/);
    expect(t).not.toContain("Prepared for");
  });

  it("Nasdaq: standards, governance rows, the 2025-amendments row and a watermark", async () => {
    const rows = buildNasdaqChecklist(facts);
    const buf = await renderListingReadinessPdf({ company: { ...COMPANY, abn: null, acn: null, address: null }, exchange: "nasdaq", rows, score: scoreReadiness(rows), generatedAt: "2026-09-13", watermark: watermarkLabel({ recipient: "US counsel", date: new Date("2026-09-13T00:00:00Z") }) });
    const t = await text(buf);
    expect(t).toContain("Listing readiness — Nasdaq Capital Market (initial listing)");
    expect(t).toContain("ACN not supplied · ABN not supplied");
    expect(t).toContain("Nasdaq Rule 5505(a)(3)");
    expect(t).toContain("Nasdaq Rule 5505(b)(1) — Equity Standard");
    expect(t).toContain("Nasdaq Rule 5605(c)(2)");
    expect(t).toContain("1 market maker committed (entered)");
    expect(t).toContain("Nasdaq Rule 5505 — 2025 amendments");
    expect(t).toContain("This module does not assert those figures");
    expect(t).toContain("Prepared for US counsel");
    expect(t).not.toMatch(/PhD/);
  });

  it("pdfSafe swaps the glyphs the standard fonts lack", () => {
    expect(pdfSafe("≥ 1 ≤ 2 → 3 −4")).toBe(">= 1 <= 2 -> 3 -4");
  });
});
