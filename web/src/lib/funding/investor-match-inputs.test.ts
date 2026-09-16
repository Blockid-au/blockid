import { describe, expect, it } from "vitest";
import { fundingLocationFor, investorMatchProjectFor, matchStateFor } from "./investor-match-inputs";

// Shared derivation for /workspace/funding and /workspace/investors (S-IA2):
// the same report row + prefill + project must produce the same state /
// capital / InvestorMatchProject on both surfaces.

const PROJECT = { id: "proj-1", name: "Acme Agtech", industry: "AgTech", stage: 2 };

describe("fundingLocationFor", () => {
  it("reads state + city from a valid report intake and resolves the capital", () => {
    const loc = fundingLocationFor({ intake: { description: "Soil sensors for grain farmers", state: "NSW", stage: "mvp", city: "Sydney" } }, "VIC");
    expect(loc.intake?.ok).toBe(true);
    expect(loc.state).toBe("NSW");
    expect(loc.city).toBe("Sydney");
    expect(loc.capital).toBe("Sydney");
  });

  it("no report → the prefill state, no city, capital from the state alone", () => {
    const loc = fundingLocationFor(null, "VIC");
    expect(loc.intake).toBeNull();
    expect(loc.state).toBe("VIC");
    expect(loc.city).toBeNull();
    expect(loc.capital).toBe("Melbourne");
  });

  it("no report and no prefill state → Remote (null capital)", () => {
    expect(fundingLocationFor(null, null)).toEqual({ intake: null, state: null, city: null, capital: null });
  });

  it("not_incorporated intake falls back to based_state; without one the match state is null", () => {
    const based = fundingLocationFor({ intake: { description: "Soil sensors for grain farmers", state: "not_incorporated", based_state: "QLD", stage: "idea" } }, "NSW");
    expect(based.state).toBe("QLD");
    expect(based.capital).toBe("Brisbane");
    const none = fundingLocationFor({ intake: { description: "Soil sensors for grain farmers", state: "not_incorporated", stage: "idea" } }, "NSW");
    expect(none.state).toBeNull();
    expect(none.capital).toBeNull();
    expect(matchStateFor("not_incorporated")).toBeNull();
    expect(matchStateFor("NSW")).toBe("NSW");
  });
});

describe("investorMatchProjectFor", () => {
  it("prefers the project's industry and the intake stage; state never carries the sentinel", () => {
    const loc = fundingLocationFor({ intake: { description: "Soil sensors for grain farmers", state: "NSW", stage: "mvp", industry_tags: ["agtech_food"] } }, null);
    expect(investorMatchProjectFor(PROJECT, loc, 62)).toEqual({ id: "proj-1", name: "Acme Agtech", industry: "AgTech", stage: "mvp", state: "NSW", svi: 62 });
    expect(investorMatchProjectFor({ ...PROJECT, industry: null }, loc, null).industry).toBe("agtech_food");
  });

  it("no project and no report → placeholder name, null axes", () => {
    expect(investorMatchProjectFor(null, fundingLocationFor(null, null), null)).toEqual({ id: null, name: "Your startup", industry: null, stage: null, state: null, svi: null });
    expect(investorMatchProjectFor(PROJECT, fundingLocationFor(null, "NSW"), 40)).toMatchObject({ stage: 2, state: "NSW", svi: 40 });
  });
});
