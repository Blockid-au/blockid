// G35 Pricing v5 P2 — the web renderer keeps working on server-projected
// payloads (lib/report-v2/tier-projection.ts): the free cut renders the same
// page the client-side gate rendered from the full document, and a Snapshot
// payload renders without crashing with every chapter as a locked card.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { citedDemoReportV2, demoReportV2, freeFixtureReportV2 } from "@/lib/report-v2/fixtures";
import { projectReportForTier } from "@/lib/report-v2/tier-projection";
import { TbrReportV2 } from "./report";

const lockedCount = (html: string) => (html.match(/data-tbr-locked="/g) ?? []).length;

describe("TbrReportV2 on server-projected payloads", () => {
  it("free document: the free cut renders the same page as the client-side gate did (buy rail)", () => {
    const source = freeFixtureReportV2();
    const before = renderToStaticMarkup(<TbrReportV2 report={source} unlock={{ mode: "buy" }} />);
    const after = renderToStaticMarkup(<TbrReportV2 report={projectReportForTier(source, "free")} unlock={{ mode: "buy" }} />);
    expect(lockedCount(after)).toBe(4);
    expect(after).toBe(before);
  });

  it("an uncharged standard document served free (G16 P1-2) now renders the 4 locked cards", () => {
    const source = citedDemoReportV2();
    expect(lockedCount(renderToStaticMarkup(<TbrReportV2 report={source} unlock={{ mode: "buy" }} />))).toBe(0);
    expect(lockedCount(renderToStaticMarkup(<TbrReportV2 report={projectReportForTier(source, "free")} unlock={{ mode: "buy" }} />))).toBe(4);
  });

  it("free cut without a rail (share view) renders the compact cards", () => {
    const source = freeFixtureReportV2();
    const before = renderToStaticMarkup(<TbrReportV2 report={source} />);
    const after = renderToStaticMarkup(<TbrReportV2 report={projectReportForTier(source, "free")} />);
    expect(after).toBe(before);
  });

  it("a Snapshot payload renders every chapter as a locked card and no valuation figures", () => {
    const source = demoReportV2();
    const html = renderToStaticMarkup(<TbrReportV2 report={projectReportForTier(source, "snapshot")} unlock={{ mode: "buy" }} />);
    expect(lockedCount(html)).toBe(8);
    const low = source.valuation.consensus.lowAud;
    expect(html).not.toContain(low.toLocaleString("en-AU"));
  });
});
