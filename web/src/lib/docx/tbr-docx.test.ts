// Trusted Business Report v2 DOCX (S-R4) — colocated suite.
//
//   - the demo report packs to a valid DOCX with one PNG per visual
//     (word/media/*.png count = distinct visuals) when sharp is present;
//   - every section heading appears in document.xml in the web's chapter
//     order (same parity check as the PDF);
//   - the free tier embeds the a11y table for card chapters, the upgrade
//     line and no valuation method table;
//   - a rasteriser outage falls back to SVG embeds (word/media/*.svg) and
//     the document still opens.

import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tbrV2Toc } from "@/components/tbr/v2/report";
import { demoReportV2, freeFixtureReportV2, preRevenueFixtureReportV2 } from "@/lib/report-v2/fixtures";
import { __resetPngCache, __resetSharpLoader } from "@/lib/report-visuals/png";

vi.mock("server-only", () => ({}));

import { buildTbrDocx, generateTbrDocx, rasteriseReportVisuals } from "./tbr-docx";

async function unzip(buffer: Buffer): Promise<{ doc: string; media: string[]; header: string; footer: string }> {
  const zip = await JSZip.loadAsync(buffer);
  const doc = await zip.file("word/document.xml")!.async("string");
  const media = Object.keys(zip.files).filter((f) => f.startsWith("word/media/"));
  const header = (await Promise.all(Object.keys(zip.files).filter((f) => /word\/header\d*\.xml/.test(f)).map((f) => zip.file(f)!.async("string")))).join("\n");
  const footer = (await Promise.all(Object.keys(zip.files).filter((f) => /word\/footer\d*\.xml/.test(f)).map((f) => zip.file(f)!.async("string")))).join("\n");
  return { doc, media, header, footer };
}

const xmlText = (xml: string) => xml.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ");

function assertOrdered(text: string, labels: string[]): void {
  let last = -1;
  for (const label of labels) {
    const idx = text.indexOf(label, last + 1);
    expect(idx, `"${label}" missing or out of order`).toBeGreaterThan(last);
    last = idx;
  }
}

beforeEach(() => {
  __resetPngCache();
  __resetSharpLoader();
});
afterEach(() => {
  vi.doUnmock("sharp");
  __resetSharpLoader();
});

describe("buildTbrDocx", () => {
  it("standard demo: one PNG per distinct visual, sections in the web order, paid detail present", async () => {
    const report = demoReportV2();
    const rasterised = await rasteriseReportVisuals(report);
    const { buffer, images } = await buildTbrDocx(report, { images: rasterised });
    expect(buffer.subarray(0, 2).toString("latin1")).toBe("PK");
    const { doc, media, header, footer } = await unzip(buffer);
    const distinct = new Set([
      ...report.cover.visuals,
      ...report.executive.visuals,
      ...report.dimensions.flatMap((d) => [d.primaryVisual, ...d.secondaryVisuals]),
      ...report.valuation.visuals,
      ...report.phaseGates.visuals,
      ...report.moneyOnTable.visuals,
      ...report.actionPlan.visuals,
    ].map((v) => v.id)).size;
    expect(images.png).toBe(distinct);
    expect(images.svg).toBe(0);
    // docx de-duplicates byte-identical media (two route maps drawn from the
    // same phase data), so count unique PNG payloads rather than specs.
    const uniquePng = new Set([...rasterised.byId.values()].map((r) => r.png!.toString("base64"))).size;
    expect(media.filter((m) => m.endsWith(".png"))).toHaveLength(uniquePng);
    expect(uniquePng).toBeGreaterThanOrEqual(distinct - 2);
    expect(distinct).toBeGreaterThanOrEqual(15);

    const text = xmlText(doc);
    expect(text).toContain("Sample SME Compliance SaaS (demo)");
    assertOrdered(text, tbrV2Toc(report).map((e) => e.label));
    expect(text).toContain("Revenue multiple");
    expect(text).toContain("Risk-factor summation");
    // G19-S42: inputs & assumptions, unit economics, cross-checks, no ask.
    expect(text).toContain("Inputs & assumptions");
    expect(text).toContain("Unit economics");
    expect(text).toContain("Cross-checks");
    expect(text).toContain("SVI backtest Q1 (lowest SVI)");
    expect(text).toContain("(N=10)");
    expect(text).not.toContain("Ask: ");
    expect(text).not.toContain("Unlock the full");
    expect(header).toContain("BlockID.au");
    expect(xmlText(footer)).toContain("Trusted Business Report · Sample SME Compliance SaaS (demo)");
    expect(text).toContain("Auschain PTY LTD");
  }, 60_000);

  // G19-S41 — the ledger table is the same rows as the web chapter and the PDF.
  it("renders 'How this score was built' per chapter (signal rows, confidence factor, adjustment), the pending line and the cover ledger strip", async () => {
    const report = demoReportV2();
    const svm = report.dimensions.find((d) => d.dim === "svm")!;
    svm.scoreBreakdown = { base: 35, signals: [], confidenceMultiplier: 0.2, adjustment: -1, assessed: false };
    svm.band = "pending";
    svm.scoreNote = "Owner proposed 48; reconciled to 45 (±10 of the deterministic 35).";
    report.cover.dims.svm.band = "pending";
    report.cover.sviLedger = { base: 100, dimAdjustments: { tre: 4, mpc: 3, ftv: 4, ptd: 3, cgh: 2, iri: 2, lco: 2, svm: 1 }, stageBonus: 8, riskPenalties: -6, sectorAdj: 4, metricsBonus: 0, ciBoost: 0, floorClamp: 0, total: 127 };
    const { buffer } = await buildTbrDocx(report);
    const { doc } = await unzip(buffer);
    const text = xmlText(doc);
    expect((text.match(/HOW THIS SCORE WAS BUILT/g) ?? []).length).toBe(8);
    const ftv = report.dimensions.find((d) => d.dim === "ftv")!;
    for (const s of ftv.scoreBreakdown!.signals) expect(text).toContain(s.signal);
    expect(text).toContain("Base 50");
    expect(text).toContain(`= score ${ftv.score}/100`);
    expect(text).toContain("× weight 15 % × evidence confidence 0.75");
    expect(text).toContain("× verification L2 1.00");
    expect(text).toContain(`= adjustment +${ftv.scoreBreakdown!.adjustment} on the SVI base of 100`);
    expect(text).toContain("Not assessed yet");
    expect(text).toContain("Add: upload, url");
    expect(text).toContain("Score note: Owner proposed 48");
    expect(text).toContain("1 of 8 dimensions pending");
    expect(text).toContain("SVI LEDGER");
    expect(text).toContain("Total 127");
  }, 60_000);

  it("free fixture: card chapters carry the a11y table + upgrade line, no valuation method table, same order", async () => {
    const report = freeFixtureReportV2();
    const { buffer, images } = await buildTbrDocx(report);
    const { doc, media } = await unzip(buffer);
    const text = xmlText(doc);
    assertOrdered(text, tbrV2Toc(report).map((e) => e.label));
    for (const c of report.dimensions.filter((d) => d.renderAs === "card")) expect(text).toContain(`Unlock the full ${c.title} chapter`);
    expect(text).not.toContain("Risk-factor summation");
    expect(text).toContain("Free tier (10-page budget) omits");
    // No secondary visuals on the free tier → fewer images than the standard export.
    expect(images.png).toBeGreaterThanOrEqual(media.length);
    expect(media.length).toBeGreaterThanOrEqual(12);
    expect(images.png).toBeLessThan(25);
  }, 60_000);

  it("falls back to SVG embeds (with PNG fallback) when sharp cannot load", async () => {
    vi.doMock("sharp", () => {
      throw new Error("Cannot find module 'sharp'");
    });
    __resetSharpLoader();
    const report = freeFixtureReportV2();
    const { buffer, images } = await buildTbrDocx(report);
    expect(images.png).toBe(0);
    expect(images.svg).toBeGreaterThan(10);
    const { media, doc } = await unzip(buffer);
    expect(media.some((m) => m.endsWith(".svg"))).toBe(true);
    expect(doc).toContain("Cover");
  }, 60_000);

  it("accepts pre-rasterised images and a verbatim prepared-with line; generateTbrDocx returns the buffer", async () => {
    const report = demoReportV2();
    const images = await rasteriseReportVisuals(report, 400);
    const { buffer } = await buildTbrDocx(report, { images, preparedWith: "Prepared with DeepSeek-V4-Flash via DeepInfra." });
    const { doc } = await unzip(buffer);
    expect(xmlText(doc)).toContain("Prepared with DeepSeek-V4-Flash via DeepInfra.");
    const plain = await generateTbrDocx(report, { images });
    expect(plain.subarray(0, 2).toString("latin1")).toBe("PK");
  }, 60_000);
});

describe("buildTbrDocx — valuation chapter variants (G19-S42)", () => {
  it("pre-revenue: Berkus / scorecard / stage baseline rows only, needs-revenue line with the connectors path, no ask", async () => {
    const { buffer } = await buildTbrDocx(preRevenueFixtureReportV2());
    const { doc } = await unzip(buffer);
    const text = xmlText(doc);
    expect(text).toContain("Inputs & assumptions");
    expect(text).toContain("AU stage baseline");
    expect(text).toContain("Scorecard (Bill Payne)");
    expect(text).toContain("4 methods need revenue");
    expect(text).toContain("/workspace/evidence/connectors");
    expect(text).not.toContain("Risk-factor summation");
    expect(text).not.toContain("Ask: ");
  }, 60_000);
});
