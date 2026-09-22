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

it("uses canonical range despite conflicting local stage inputs", () => {
  const valuation = { currency: "AUD" as const, consensus: { lowAud: 11000000, midAud: 12000000, highAud: 13000000, confidence: .7 }, scenarios: { bear: 9000000, base: 12000000, bull: 15000000 } };
  for (const stage of ["Idea", "Series B"]) {
    const html = renderToStaticMarkup(<RunningSviHero dims={dims} stage={stage} industry="SaaS" totalCount={8} running={false} done valuationStatus="available" valuation={valuation} />);
    expect(html).toContain("A$11M");
    expect(html).toContain("A$13M");
    expect(html).toContain("70%");
    expect(html).not.toContain("Directional pre-money");
  }
});
it("available status without payload never falls back to SVI math", () => {
  expect(renderToStaticMarkup(<RunningSviHero dims={dims} stage="Seed" industry="SaaS" totalCount={8} running={false} done valuationStatus="available" />)).not.toContain("A$");
});

it.each(["pending", "unavailable"] as const)("suppresses a retained payload when status is %s", valuationStatus => {
  const valuation = { currency: "AUD" as const, consensus: { lowAud: 11000000, midAud: 12000000, highAud: 13000000, confidence: .7 }, scenarios: { bear: 9000000, base: 12000000, bull: 15000000 } };
  const html = renderToStaticMarkup(<RunningSviHero dims={dims} stage="Seed" industry="SaaS" totalCount={8} running={false} done valuationStatus={valuationStatus} valuation={valuation} />);
  expect(html).not.toContain("A$");
});
