import { describe, it, expect } from "vitest";
import { detectInputType, parseGithubFullName, analyzeWebsiteText, guessSector, buildScnContext } from "./scn-detect";

describe("scn-detect — SCN context detection", () => {
  it("detects input type", () => {
    expect(detectInputType({ text: "an app idea" })).toBe("idea");
    expect(detectInputType({ websiteUrl: "https://x.com" })).toBe("website");
    expect(detectInputType({ githubUrl: "https://github.com/a/b" })).toBe("github");
    expect(detectInputType({ mrrAud: 5000 })).toBe("revenue");
    expect(detectInputType({ text: "idea", mrrAud: 5000 })).toBe("mixed");
  });
  it("parses github full name", () => {
    expect(parseGithubFullName("https://github.com/acme/widget.git")).toBe("acme/widget");
  });
  it("website analysis lifts product signal on rich pages", () => {
    const a = analyzeWebsiteText("Pricing plans, log in to your dashboard, API integrations, free trial, customers");
    expect(a.hasProduct).toBe(true);
    expect(a.features.length).toBeGreaterThanOrEqual(3);
  });
  it("idea-only input → low stage with follow-up questions + valuation", async () => {
    const c = await buildScnContext({ text: "exploring how to help tradies schedule their day better" });
    expect(c.stage).toBeLessThanOrEqual(1);
    expect(c.followUpQuestions.length).toBeGreaterThan(0);
    expect(c.valuation.blended.midAud).toBeGreaterThan(0);
    expect(c.nextBestAction).toBeTruthy();
  });
  it("website input lifts stage above idea", async () => {
    const c = await buildScnContext(
      { websiteUrl: "https://acme.com" },
      { fetchUrl: async () => "Pricing, login, dashboard, API, integrations, free trial" },
    );
    expect(c.stage).toBeGreaterThanOrEqual(2);
  });
  it("revenue input → revenue/growth stage", async () => {
    const c = await buildScnContext({ text: "saas", mrrAud: 30000, monthlyGrowthRatePct: 10 });
    expect(c.stage).toBeGreaterThanOrEqual(4);
    expect(c.valuation.injection.raiseAud).toBeGreaterThan(0);
  });
  it("github input → source/product signal", async () => {
    const c = await buildScnContext(
      { githubUrl: "https://github.com/acme/widget" },
      { auditRepo: async () => ({ hasSourceCode: true, hasProduct: true, activity: "active", evidence: "active repo" }) },
    );
    expect(c.stage).toBeGreaterThanOrEqual(2);
  });
});
