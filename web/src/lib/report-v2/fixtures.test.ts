import { describe, expect, it } from "vitest";
import { DEMO_GENERATED_AT, demoReportV2, freeFixtureReportV2 } from "./fixtures";
import { assertReportV2 } from "./schema";

describe("ReportV2 fixtures", () => {
  it("demo and free fixtures validate and are deterministic", () => {
    const a = assertReportV2(demoReportV2());
    const b = demoReportV2();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.generatedAt).toBe(DEMO_GENERATED_AT);
    expect(a.source).toBe("fixture");
    expect(a.cover.startupName).toContain("demo");
    const free = assertReportV2(freeFixtureReportV2());
    expect(free.tier).toBe("free");
  });

  it("demo shows exactly 8 primary chapter visuals with role=img", () => {
    const r = demoReportV2();
    const count = r.dimensions.filter((d) => d.primaryVisual.svg?.includes('role="img"')).length;
    expect(count).toBe(8);
  });
});
