// S31-D — /funding/grants URL → internal route decision (proxy rewrite).
import { describe, expect, it } from "vitest";
import { grantsRewriteTarget, grantsStateParams } from "./grants-route";

const sp = (q: string) => new URLSearchParams(q);

describe("grantsRewriteTarget()", () => {
  it("leaves the bare directory and every other path alone", () => {
    expect(grantsRewriteTarget("/funding/grants", sp(""))).toBeNull();
    expect(grantsRewriteTarget("/funding/grants", sp("utm_source=x&_rsc=abc"))).toBeNull();
    expect(grantsRewriteTarget("/funding/grants/mvp-ventures", sp("state=NSW"))).toBeNull();
    expect(grantsRewriteTarget("/funding/programs", sp("state=NSW"))).toBeNull();
    expect(grantsRewriteTarget("/funding/grants", sp("state="))).toBeNull();
  });

  it("a lone valid state → the static per-state route (case-normalised, `national` kept lower)", () => {
    expect(grantsRewriteTarget("/funding/grants", sp("state=NSW"))).toBe("/funding/grants/state/NSW");
    expect(grantsRewriteTarget("/funding/grants", sp("state=nsw"))).toBe("/funding/grants/state/NSW");
    expect(grantsRewriteTarget("/funding/grants", sp("state=National"))).toBe("/funding/grants/state/national");
    expect(grantsRewriteTarget("/funding/grants", sp("state=NSW&utm_campaign=x"))).toBe("/funding/grants/state/NSW");
  });

  it("an unknown state, or any other filter combination → the dynamic view", () => {
    expect(grantsRewriteTarget("/funding/grants", sp("state=XX"))).toBe("/funding/grants/view");
    expect(grantsRewriteTarget("/funding/grants", sp("state=../etc"))).toBe("/funding/grants/view");
    expect(grantsRewriteTarget("/funding/grants", sp("type=voucher"))).toBe("/funding/grants/view");
    expect(grantsRewriteTarget("/funding/grants", sp("state=WA&type=voucher"))).toBe("/funding/grants/view");
    expect(grantsRewriteTarget("/funding/grants", sp("stage=mvp&status=open"))).toBe("/funding/grants/view");
  });

  it("grantsStateParams() covers national + the eight states/territories", () => {
    expect(grantsStateParams().map((p) => p.state)).toEqual(["national", "NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]);
  });
});
