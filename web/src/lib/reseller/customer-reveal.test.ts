import { describe, it, expect } from "vitest";
import { decideReveal, maskEmail } from "./customer-reveal";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

describe("decideReveal", () => {
  it("rejects missing / non-string id", () => {
    expect(decideReveal(undefined, [UUID_A])).toEqual({ ok: false, reason: "missing_id" });
    expect(decideReveal("", [UUID_A])).toEqual({ ok: false, reason: "missing_id" });
    expect(decideReveal(42, [UUID_A])).toEqual({ ok: false, reason: "missing_id" });
    expect(decideReveal(null, [UUID_A])).toEqual({ ok: false, reason: "missing_id" });
  });

  it("rejects non-uuid strings", () => {
    expect(decideReveal("not-a-uuid", [UUID_A])).toEqual({ ok: false, reason: "invalid_id" });
    expect(decideReveal("11111111", [UUID_A])).toEqual({ ok: false, reason: "invalid_id" });
    // Trailing whitespace is invalid — the caller must trim.
    expect(decideReveal(`${UUID_A} `, [UUID_A])).toEqual({ ok: false, reason: "invalid_id" });
  });

  it("rejects uuids outside the scoped allowedIds set", () => {
    expect(decideReveal(UUID_A, [])).toEqual({ ok: false, reason: "not_in_scope" });
    expect(decideReveal(UUID_A, [UUID_B])).toEqual({ ok: false, reason: "not_in_scope" });
  });

  it("accepts an in-scope uuid", () => {
    expect(decideReveal(UUID_A, [UUID_A])).toEqual({ ok: true, customerId: UUID_A });
    expect(decideReveal(UUID_A.toUpperCase(), [UUID_A.toUpperCase()])).toEqual({
      ok: true,
      customerId: UUID_A.toUpperCase(),
    });
  });
});

describe("maskEmail", () => {
  it("keeps first two chars of local part", () => {
    expect(maskEmail("alice@acme.com")).toBe("al***@acme.com");
    expect(maskEmail("bob.smith@example.co")).toBe("bo***@example.co");
  });

  it("uses first char + bullet for very short locals", () => {
    expect(maskEmail("a@x.com")).toBe("a***@x.com");
    expect(maskEmail("ab@x.com")).toBe("a***@x.com");
  });

  it("returns input unchanged when it does not contain a proper @", () => {
    expect(maskEmail("no-at-sign")).toBe("no-at-sign");
    expect(maskEmail("@no-local")).toBe("@no-local");
    expect(maskEmail("no-domain@")).toBe("no-domain@");
  });
});
