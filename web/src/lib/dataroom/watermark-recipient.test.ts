// Colocated suite for the watermark recipient rule (S21-A review P2-3).

import { describe, expect, it } from "vitest";
import { linkFallbackRecipient, watermarkRecipient, willWatermark } from "./watermark-recipient";

const LINK = {
  id: "9f3c2a1b-0000-4000-8000-000000000000",
  watermark: null,
  investor_name: null,
  investor_firm: null,
  investor_email: null,
};

describe("watermarkRecipient", () => {
  it("prefers the founder's explicit watermark line, then name, firm, email", () => {
    expect(watermarkRecipient({ ...LINK, watermark: " Fund IV ", investor_name: "Jane" })).toBe("Fund IV");
    expect(watermarkRecipient({ ...LINK, investor_name: "Jane  Chen", investor_firm: "BB" })).toBe("Jane Chen");
    expect(watermarkRecipient({ ...LINK, investor_firm: "Blackbird", investor_email: "j@bb.vc" })).toBe("Blackbird");
    expect(watermarkRecipient({ ...LINK, investor_email: "j@bb.vc" })).toBe("j@bb.vc");
  });

  it("falls back to the NDA-ledger email the caller passes, then to `link <8 chars>` — never null for a link with an id", () => {
    expect(watermarkRecipient(LINK, "viewer@fund.vc")).toBe("viewer@fund.vc");
    expect(watermarkRecipient(LINK, "   ")).toBe("link 9f3c2a1b");
    expect(watermarkRecipient(LINK)).toBe("link 9f3c2a1b");
    expect(watermarkRecipient({ ...LINK, watermark: "  " }, null)).toBe("link 9f3c2a1b");
  });

  it("founder-set fields beat the ledger email (P1-1: the viewer cannot rename the founder's mark)", () => {
    expect(watermarkRecipient({ ...LINK, investor_email: "jane@bb.vc" }, "partner@blackbird.vc")).toBe("jane@bb.vc");
  });

  it("linkFallbackRecipient shows 8 chars of the id and is null only for an empty id", () => {
    expect(linkFallbackRecipient("abcdefghijkl")).toBe("link abcdefgh");
    expect(linkFallbackRecipient("ab")).toBe("link ab");
    expect(linkFallbackRecipient("")).toBeNull();
    expect(linkFallbackRecipient(null)).toBeNull();
  });

  it("willWatermark is the room toggle AND a nameable link — the same rule the label uses", () => {
    expect(willWatermark(true, LINK)).toBe(true);
    expect(willWatermark(false, LINK)).toBe(false);
    expect(willWatermark(true, { id: "" })).toBe(false);
  });
});
