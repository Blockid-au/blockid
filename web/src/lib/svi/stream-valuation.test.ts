import { describe, expect, it } from "vitest";
import { readStreamValuation, valuationForRun } from "./stream-valuation";
const chapter = { currency: "AUD", consensus: { lowAud: 11000000, midAud: 12000000, highAud: 13000000, confidence: .7 }, scenarios: { bear: 9000000, base: 12000000, bull: 15000000 } };
describe("canonical stream valuation", () => {
  it("restores exact values and preserves them across a partial retry, but clears a new full run", () => {
    const restored = readStreamValuation(JSON.parse(JSON.stringify(readStreamValuation(chapter))));
    expect(restored).toEqual(chapter);
    expect(valuationForRun(restored, true)).toEqual(chapter);
    expect(valuationForRun(restored, false)).toBeNull();
  });
  it.each([undefined, { status: "available" }, { ...chapter, status: "unavailable" }, { ...chapter, consensus: { ...chapter.consensus, lowAud: -1 } }, { ...chapter, scenarios: { ...chapter.scenarios, bull: NaN } }])("rejects invalid monetary payloads %j", value => expect(readStreamValuation(value)).toBeNull());
  it("retains valid zero values", () => expect(readStreamValuation({ ...chapter, scenarios: { bear: 0, base: 0, bull: 0 } })?.scenarios.bear).toBe(0));
});
