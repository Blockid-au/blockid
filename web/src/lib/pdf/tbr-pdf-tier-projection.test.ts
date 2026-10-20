// G35 Pricing v5 P2: the PDF / DOCX twins render server-projected payloads
// (lib/report-v2/tier-projection.ts) — a Snapshot exports without a chapter
// body and the free cut stays inside the 10-page budget.

import { describe, expect, it } from "vitest";
import { demoReportV2, freeFixtureReportV2 } from "@/lib/report-v2/fixtures";
import { projectReportForTier } from "@/lib/report-v2/tier-projection";
import { renderTbrPdf } from "./tbr-pdf";
import { generateTbrDocx } from "@/lib/docx/tbr-docx";

describe("PDF / DOCX twins on projected payloads", () => {
  it("renders a Snapshot payload (PDF ≤ the free page budget, DOCX non-empty)", async () => {
    const snap = projectReportForTier(demoReportV2(), "snapshot");
    const pdf = await renderTbrPdf(snap);
    expect(pdf.buffer.length).toBeGreaterThan(1000);
    expect(pdf.pages).toBeLessThanOrEqual(snap.pageBudget.free);
    const docx = await generateTbrDocx(snap);
    expect(docx.length).toBeGreaterThan(1000);
  }, 60_000);

  it("renders the free cut of a free document within the 10-page budget", async () => {
    const free = projectReportForTier(freeFixtureReportV2(), "free");
    const pdf = await renderTbrPdf(free);
    expect(pdf.pages).toBeLessThanOrEqual(free.pageBudget.free);
  }, 60_000);
});
