import { describe, it, expect } from "vitest";
import { pickActiveResellerDisplayName } from "./email-attribution";

describe("pickActiveResellerDisplayName", () => {
  it("returns null when userRow is missing", () => {
    expect(pickActiveResellerDisplayName(null, { display_name: "X", status: "active" })).toBe(null);
  });

  it("returns null when attribution_reseller_id is missing", () => {
    expect(pickActiveResellerDisplayName({}, { display_name: "X", status: "active" })).toBe(null);
    expect(
      pickActiveResellerDisplayName({ attribution_reseller_id: null }, { display_name: "X", status: "active" }),
    ).toBe(null);
  });

  it("returns null when resellerRow is missing", () => {
    expect(pickActiveResellerDisplayName({ attribution_reseller_id: "r-1" }, null)).toBe(null);
  });

  it("returns null when reseller.status is not 'active'", () => {
    expect(
      pickActiveResellerDisplayName(
        { attribution_reseller_id: "r-1" },
        { display_name: "InfoVision", status: "terminated" },
      ),
    ).toBe(null);
    expect(
      pickActiveResellerDisplayName(
        { attribution_reseller_id: "r-1" },
        { display_name: "InfoVision", status: "paused" },
      ),
    ).toBe(null);
  });

  it("returns null when display_name is blank/whitespace", () => {
    expect(
      pickActiveResellerDisplayName(
        { attribution_reseller_id: "r-1" },
        { display_name: "", status: "active" },
      ),
    ).toBe(null);
    expect(
      pickActiveResellerDisplayName(
        { attribution_reseller_id: "r-1" },
        { display_name: "   ", status: "active" },
      ),
    ).toBe(null);
    expect(
      pickActiveResellerDisplayName(
        { attribution_reseller_id: "r-1" },
        { display_name: null, status: "active" },
      ),
    ).toBe(null);
  });

  it("returns the trimmed display_name for an active attribution", () => {
    expect(
      pickActiveResellerDisplayName(
        { attribution_reseller_id: "r-1" },
        { display_name: "  InfoVision  ", status: "active" },
      ),
    ).toBe("InfoVision");
  });
});
