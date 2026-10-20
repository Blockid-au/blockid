// G35 D26 — guest tier stamp (report_data.payg) → PDF cut + invoice label.

import { describe, expect, it } from "vitest";
import { guestPaygStamp, guestPdfTier, guestTierLabel } from "./payg-stamp";

describe("guestPaygStamp", () => {
  it("reads the tier create-order stamped; A$3 rows / junk → null", () => {
    expect(guestPaygStamp({ payg: { tier: "snapshot", sku: "report_snapshot", pricing_version: "v5" } })).toEqual({ tier: "snapshot", sku: "report_snapshot", pricing_version: "v5" });
    expect(guestPaygStamp({ payg: { tier: "full" } })).toEqual({ tier: "full", sku: "report_full", pricing_version: "v5" });
    expect(guestPaygStamp(null)).toBeNull();
    expect(guestPaygStamp({ totalScore: 120 })).toBeNull();
    expect(guestPaygStamp({ payg: { tier: "verified" } })).toBeNull();
  });

  it("Snapshot → preview PDF; Full and the A$3 SKU → standard (unchanged)", () => {
    expect(guestPdfTier({ tier: "snapshot", sku: "report_snapshot", pricing_version: "v5" })).toBe("preview");
    expect(guestPdfTier({ tier: "full", sku: "report_full", pricing_version: "v5" })).toBe("standard");
    expect(guestPdfTier(null)).toBe("standard");
    expect(guestTierLabel({ tier: "full", sku: "report_full", pricing_version: "v5" })).toBe("Full report");
  });
});
