import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RunningSviHero } from "./running-svi-hero";

const dims = ["tre", "mpc", "ftv", "ptd"].map((key) => ({ key, score: 80, weight: 25, label: key }));
describe("stream valuation availability", () => {
  it.each(["pending", "unavailable"] as const)("does not compute/display a range for %s, including restored state", (valuationStatus) => {
    const saved = JSON.parse(JSON.stringify({ valuationStatus }));
    const html = renderToStaticMarkup(<RunningSviHero dims={dims} stage="Seed" industry="SaaS" totalCount={8} running={false} done valuationStatus={saved.valuationStatus} />);
    expect(html).not.toContain("A$");
    expect(html).not.toContain("Directional");
    expect(html).toContain("80");
  });
  it("retains legacy missing-flag compatibility", () => {
    const html = renderToStaticMarkup(<RunningSviHero dims={dims} stage="Seed" industry="SaaS" totalCount={8} running={false} done />);
    expect(html).toContain("A$");
  });
});
