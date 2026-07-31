import { describe, it, expect } from "vitest";
import {
  decideRefCapture,
  normaliseRefCode,
  buildRefCookieString,
  RESELLER_CODE_RE,
  REF_COOKIE_KEY,
  REF_COOKIE_TTL_SECONDS,
} from "./reseller-ref-logic";

describe("normaliseRefCode", () => {
  it("uppercases and returns the letters+digits form", () => {
    expect(normaliseRefCode("ifv20")).toBe("IFV20");
    expect(normaliseRefCode("  Vision1 ")).toBe("VISION1");
    expect(normaliseRefCode("if.v-20")).toBe("IFV20");
  });

  it("returns null for the empty/absent/pure-punctuation cases", () => {
    expect(normaliseRefCode(null)).toBeNull();
    expect(normaliseRefCode(undefined)).toBeNull();
    expect(normaliseRefCode("")).toBeNull();
    expect(normaliseRefCode("-.-")).toBeNull();
  });

  it("rejects codes shorter than the 2-letter floor or with no leading letters", () => {
    expect(normaliseRefCode("A")).toBeNull();
    expect(normaliseRefCode("1")).toBeNull();
    expect(normaliseRefCode("123")).toBeNull();
  });

  it("rejects codes with more than 6 leading letters", () => {
    expect(normaliseRefCode("ABCDEFGH")).toBeNull();
    expect(normaliseRefCode("SEVENLETR")).toBeNull();
  });

  it("keeps trailing digits after 2-6 letters", () => {
    expect(normaliseRefCode("IF20")).toBe("IF20");
    expect(normaliseRefCode("IFVIS20250731")).toBe("IFVIS20250731");
  });

  it("regex matches the same shape the helper enforces", () => {
    expect(RESELLER_CODE_RE.test("IFV20")).toBe(true);
    expect(RESELLER_CODE_RE.test("A")).toBe(false);
  });
});

describe("decideRefCapture — happy capture", () => {
  it("writes cookie and fires ga4 event on first-touch valid code", () => {
    const out = decideRefCapture({
      refParam: "IFV20",
      overrideParam: null,
      existingCookie: null,
    });
    expect(out).toEqual({
      action: "write",
      code: "IFV20",
      ga4: { event: "reseller_ref_captured", code: "IFV20" },
    });
  });

  it("normalises lowercase param before writing", () => {
    const out = decideRefCapture({
      refParam: "ifv20",
      overrideParam: null,
      existingCookie: null,
    });
    expect(out.action).toBe("write");
    if (out.action === "write") expect(out.code).toBe("IFV20");
  });
});

describe("decideRefCapture — invalid format ignored", () => {
  it("skips when ref param fails the regex (single letter)", () => {
    const out = decideRefCapture({
      refParam: "A",
      overrideParam: null,
      existingCookie: null,
    });
    expect(out).toEqual({ action: "skip", reason: "invalid_format" });
  });

  it("skips when ref param is only digits", () => {
    const out = decideRefCapture({
      refParam: "12345",
      overrideParam: null,
      existingCookie: null,
    });
    expect(out).toEqual({ action: "skip", reason: "invalid_format" });
  });

  it("skips when ref param is empty string", () => {
    const out = decideRefCapture({
      refParam: "",
      overrideParam: null,
      existingCookie: null,
    });
    expect(out).toEqual({ action: "skip", reason: "no_ref_param" });
  });
});

describe("decideRefCapture — first-touch attribution wins", () => {
  it("keeps the existing cookie when a different code shows up without override", () => {
    const out = decideRefCapture({
      refParam: "OTHER",
      overrideParam: null,
      existingCookie: "IFV20",
    });
    expect(out).toEqual({ action: "skip", reason: "first_touch_wins" });
  });

  it("does NOT treat 'override_ref=false' as an override", () => {
    const out = decideRefCapture({
      refParam: "OTHER",
      overrideParam: "false",
      existingCookie: "IFV20",
    });
    expect(out.action).toBe("skip");
  });
});

describe("decideRefCapture — override flag respected", () => {
  it("replaces the existing cookie when override_ref=true", () => {
    const out = decideRefCapture({
      refParam: "OTHER",
      overrideParam: "true",
      existingCookie: "IFV20",
    });
    expect(out).toEqual({
      action: "write",
      code: "OTHER",
      ga4: { event: "reseller_ref_captured", code: "OTHER" },
    });
  });

  it("is case-insensitive on the override literal", () => {
    const out = decideRefCapture({
      refParam: "OTHER",
      overrideParam: "TrUe",
      existingCookie: "IFV20",
    });
    expect(out.action).toBe("write");
  });
});

describe("decideRefCapture — same-code idempotency", () => {
  it("skips write when incoming code equals cookie (avoids re-firing ga4)", () => {
    const out = decideRefCapture({
      refParam: "IFV20",
      overrideParam: null,
      existingCookie: "IFV20",
    });
    expect(out).toEqual({ action: "skip", reason: "same_as_cookie" });
  });

  it("normalises before comparing so 'ifv20' equals cookie 'IFV20'", () => {
    const out = decideRefCapture({
      refParam: "ifv20",
      overrideParam: null,
      existingCookie: "IFV20",
    });
    expect(out).toEqual({ action: "skip", reason: "same_as_cookie" });
  });
});

describe("buildRefCookieString", () => {
  it("stamps blockid_via with 90-day TTL, path=/, samesite=lax, secure", () => {
    const s = buildRefCookieString("IFV20", { isSecure: true });
    expect(s).toContain(`${REF_COOKIE_KEY}=IFV20`);
    expect(s).toContain(`max-age=${REF_COOKIE_TTL_SECONDS}`);
    expect(s).toContain("path=/");
    expect(s).toContain("samesite=lax");
    expect(s).toContain("secure");
  });

  it("omits secure attr when isSecure=false (local http dev)", () => {
    const s = buildRefCookieString("IFV20", { isSecure: false });
    expect(s).not.toContain("secure");
  });

  it("adds domain when provided (e.g. .blockid.au for cross-subdomain)", () => {
    const s = buildRefCookieString("IFV20", {
      isSecure: true,
      domain: ".blockid.au",
    });
    expect(s).toContain("domain=.blockid.au");
  });

  it("encodes special characters defensively", () => {
    // decideRefCapture normalises to A-Z0-9 only, but the serializer must
    // never trust its input — future callers might feed unsanitised values.
    const s = buildRefCookieString("A B", { isSecure: false });
    expect(s.startsWith(`${REF_COOKIE_KEY}=A%20B`)).toBe(true);
  });
});
