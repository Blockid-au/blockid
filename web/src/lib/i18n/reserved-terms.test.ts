// Colocated vitest for i18n/reserved-terms.ts — the machine-translation
// reserved-terms guard (T-1403). Pins the AU-statute + brand token list plus
// the two runtime helpers (`containsReservedDrift`, `isMostlyReserved`) so a
// silent MT drift on VI (or a future locale) cannot swallow "s708", "AFSL",
// "BlockID", etc. under a rewording.
//
// See web/AGENTS.md guard-rails — this test is part of the P9 ship-readiness
// legal-anchor regression net.

import { describe, it, expect } from "vitest";
import {
  RESERVED_TERMS,
  containsReservedDrift,
  isMostlyReserved,
} from "./reserved-terms";

describe("RESERVED_TERMS fixture", () => {
  it("is non-empty and every entry is a non-blank string", () => {
    expect(RESERVED_TERMS.length).toBeGreaterThan(0);
    for (const term of RESERVED_TERMS) {
      expect(typeof term).toBe("string");
      expect(term.trim().length).toBeGreaterThan(0);
    }
  });

  it("has no duplicate entries (case-sensitive)", () => {
    const set = new Set(RESERVED_TERMS);
    expect(set.size).toBe(RESERVED_TERMS.length);
  });

  it("has no duplicate entries when lowercased (the lookup set uses lower-case)", () => {
    const lower = RESERVED_TERMS.map((t) => t.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });

  it("carries every AU statutory shorthand anchor the MT prompt needs", () => {
    // Losing any of these on a VI translation would misrepresent legal
    // status — pin them bit-for-bit so a future refactor cannot silently
    // drop one from the reserved set.
    const requiredStatutory = [
      "s708",
      "s766B",
      "ACN",
      "ABN",
      "GST",
      "AFSL",
      "ESIC",
      "ESVCLP",
      "AUD",
      "ASIC",
      "APRA",
      "AUSTRAC",
      "ATO",
      "ACL",
      "SOC2",
    ];
    for (const term of requiredStatutory) {
      expect(RESERVED_TERMS).toContain(term);
    }
  });

  it("carries the Auschain + BlockID + BlockID.au brand anchors", () => {
    // Brand-name preservation is a legal (business-name registration) as
    // well as marketing invariant — see [[business_entity]].
    expect(RESERVED_TERMS).toContain("Auschain PTY LTD");
    expect(RESERVED_TERMS).toContain("BlockID");
    expect(RESERVED_TERMS).toContain("BlockID.au");
  });

  it("carries the SVI / SCN / ESOP product-surface names kept in English", () => {
    expect(RESERVED_TERMS).toContain("SVI");
    expect(RESERVED_TERMS).toContain("SCN");
    expect(RESERVED_TERMS).toContain("ESOP");
  });

  it("preserves original case for statutory references (AFSL not afsl)", () => {
    // The docstring on containsReservedDrift promises that RESERVED_TERMS
    // themselves are compared case-sensitively against the translation.
    // Pin the case posture on the fixture so a lower-casing sweep can't
    // silently soften the guard.
    expect(RESERVED_TERMS).toContain("AFSL");
    expect(RESERVED_TERMS).not.toContain("afsl");
    expect(RESERVED_TERMS).toContain("ASIC");
    expect(RESERVED_TERMS).not.toContain("Asic");
  });
});

describe("containsReservedDrift", () => {
  it("returns empty array when the translation preserves every reserved term verbatim", () => {
    const en = "The AFSL exemption under s708 applies to ASIC-registered ESIC startups.";
    const vi = "Miễn trừ AFSL theo s708 áp dụng cho các startup ESIC đã đăng ký ASIC.";
    expect(containsReservedDrift(en, vi)).toEqual([]);
  });

  it("returns [] when EN contains no reserved terms at all", () => {
    const en = "This is a plain sentence with no statutory anchors.";
    const vi = "Đây là một câu đơn giản.";
    expect(containsReservedDrift(en, vi)).toEqual([]);
  });

  it("flags a single dropped term (AFSL) as missing", () => {
    const en = "You need an AFSL to give financial advice.";
    const vi = "Bạn cần giấy phép để đưa ra lời khuyên tài chính.";
    const missing = containsReservedDrift(en, vi);
    expect(missing).toContain("AFSL");
    expect(missing).toHaveLength(1);
  });

  it("flags multiple dropped terms and preserves fixture order", () => {
    const en = "ACN and ABN are both required, along with GST registration.";
    const vi = "Cả hai đều được yêu cầu, cùng với đăng ký thuế.";
    const missing = containsReservedDrift(en, vi);
    expect(missing).toEqual(["ACN", "ABN", "GST"]);
  });

  it("uses word-boundary detection on the EN side — reserved substrings do not fire", () => {
    // "SVI" is reserved, but "supervised" (no word boundary) must NOT
    // register as an EN occurrence and thus not raise a drift flag when
    // the translation omits an unrelated substring.
    const en = "The team supervised the process.";
    const vi = "Nhóm giám sát quá trình.";
    expect(containsReservedDrift(en, vi)).toEqual([]);
  });

  it("word-boundary detection catches SVI as its own token", () => {
    const en = "Our SVI score is above 70.";
    const vi = "Điểm chúng tôi trên 70.";
    expect(containsReservedDrift(en, vi)).toEqual(["SVI"]);
  });

  it("EN case is ignored for presence detection (afsl → matches AFSL)", () => {
    // The regex is built with the "i" flag — lower-case in the EN input
    // should still trigger the presence check.
    const en = "you need an afsl.";
    const vi = "cần giấy phép.";
    expect(containsReservedDrift(en, vi)).toEqual(["AFSL"]);
  });

  it("translation-side comparison is case-sensitive — 'afsl' in the translation does NOT count as preserved", () => {
    // The docstring explicitly promises: "the RESERVED_TERMS themselves
    // are compared case-sensitively against the translation (the model
    // MUST keep case for statutory references)." Pin that promise.
    const en = "AFSL required.";
    const vi = "afsl bắt buộc.";
    expect(containsReservedDrift(en, vi)).toEqual(["AFSL"]);
  });

  it("uppercase preservation on the translation side counts as safe", () => {
    const en = "AFSL required.";
    const vi = "AFSL bắt buộc.";
    expect(containsReservedDrift(en, vi)).toEqual([]);
  });

  it("multi-word brand 'Auschain PTY LTD' matches when preserved verbatim", () => {
    const en = "Auschain PTY LTD is the registered entity.";
    const vi = "Auschain PTY LTD là đơn vị đăng ký.";
    expect(containsReservedDrift(en, vi)).toEqual([]);
  });

  it("multi-word brand 'Auschain PTY LTD' is flagged when the translation drops it", () => {
    const en = "Auschain PTY LTD is the registered entity.";
    const vi = "Đơn vị đăng ký.";
    expect(containsReservedDrift(en, vi)).toContain("Auschain PTY LTD");
  });

  it("brand 'BlockID.au' is treated as a distinct token from 'BlockID'", () => {
    // Word-boundary detection means a translation preserving only
    // 'BlockID' must still be flagged as dropping 'BlockID.au' if the
    // EN had that domain form — because ".au" changes the semantic.
    // NOTE: regex \b treats '.' as a non-word char so 'BlockID' in
    // 'BlockID.au' does match 'BlockID' with a boundary. Pin BOTH the
    // presence detection for BlockID.au (fires) and the case where the
    // translation includes 'BlockID.au' verbatim (does NOT fire).
    const enWithDomain = "Visit BlockID.au for the founder guide.";
    const viMissingDomain = "Truy cập để xem hướng dẫn.";
    const missing = containsReservedDrift(enWithDomain, viMissingDomain);
    expect(missing).toContain("BlockID.au");
    expect(missing).toContain("BlockID"); // parent brand is also detected via \b

    const viWithDomain = "Truy cập BlockID.au để xem hướng dẫn.";
    expect(containsReservedDrift(enWithDomain, viWithDomain)).toEqual([]);
  });

  it("returns a new array each call (no shared mutable state)", () => {
    const a = containsReservedDrift("AFSL", "");
    const b = containsReservedDrift("AFSL", "");
    expect(a).toEqual(["AFSL"]);
    expect(b).toEqual(["AFSL"]);
    expect(a).not.toBe(b);
  });

  it("empty EN input → [] (nothing to drift)", () => {
    expect(containsReservedDrift("", "")).toEqual([]);
    expect(containsReservedDrift("", "AFSL")).toEqual([]);
  });

  it("empty translated string → every EN-mentioned reserved term is flagged", () => {
    const en = "AFSL and ASIC.";
    expect(containsReservedDrift(en, "")).toEqual(["AFSL", "ASIC"]);
  });

  it("regex-escaping — 's708' with a literal dot suffix ('s708.') is still detected", () => {
    // escapeRegex covers . * + ? etc. Pin that 's708' followed by a
    // sentence period still matches on the \b boundary.
    const en = "See s708.";
    expect(containsReservedDrift(en, "See.")).toEqual(["s708"]);
  });

  it("does not double-count a term that appears multiple times in EN", () => {
    const en = "AFSL, AFSL, AFSL — always AFSL.";
    // Translation drops all instances → still just one entry in missing[].
    expect(containsReservedDrift(en, "luôn cần giấy phép.")).toEqual(["AFSL"]);
  });

  it("s708 vs s766B — both AU statutory refs are independently tracked", () => {
    const en = "Refer to s708 and s766B for the offer exemptions.";
    expect(containsReservedDrift(en, "Xem các miễn trừ chào bán.")).toEqual([
      "s708",
      "s766B",
    ]);
  });

  it("preserved-only-one-of-two flags only the missing one", () => {
    const en = "Refer to s708 and s766B for the offer exemptions.";
    const vi = "Xem s708 và các miễn trừ.";
    expect(containsReservedDrift(en, vi)).toEqual(["s766B"]);
  });
});

describe("isMostlyReserved", () => {
  it("returns true for an empty string", () => {
    // The implementation short-circuits on words.length === 0 → true, on
    // the theory that an empty node has nothing to translate anyway and
    // should be skipped by the DOM walker.
    expect(isMostlyReserved("")).toBe(true);
  });

  it("returns true for whitespace-only string (0 words after filter)", () => {
    expect(isMostlyReserved("   \t\n   ")).toBe(true);
  });

  it("returns true when 100% of words are reserved", () => {
    expect(isMostlyReserved("AFSL ASIC ESIC")).toBe(true);
  });

  it("returns true when > 50% of words are reserved (2 of 3)", () => {
    // 2/3 = 0.666… > 0.5
    expect(isMostlyReserved("AFSL ASIC needed")).toBe(true);
  });

  it("returns false for exactly 50% reserved (2 of 4) — strict > threshold", () => {
    // The predicate is `reserved.length / words.length > 0.5` — the
    // equality case is NOT majority, so it must return false.
    expect(isMostlyReserved("AFSL ASIC and required")).toBe(false);
  });

  it("returns false when < 50% of words are reserved (1 of 3)", () => {
    expect(isMostlyReserved("You need AFSL today")).toBe(false);
  });

  it("returns false for a plain sentence with no reserved terms", () => {
    expect(isMostlyReserved("This is a plain sentence about pricing")).toBe(false);
  });

  it("is case-insensitive on the presence check (afsl counts as reserved)", () => {
    expect(isMostlyReserved("afsl asic esic")).toBe(true);
  });

  it("strips trailing punctuation so 'AFSL,' still counts as reserved", () => {
    // The implementation replaces [.,;:()] before the lookup.
    expect(isMostlyReserved("AFSL, ASIC, ESIC.")).toBe(true);
  });

  it("strips parentheses so '(AFSL)' still counts as reserved", () => {
    expect(isMostlyReserved("(AFSL) (ASIC) (ESIC)")).toBe(true);
  });

  it("strips semicolons + colons but not slashes/hyphens", () => {
    // The regex only strips . , ; : ( ). A hyphenated compound like
    // 'AFSL-holder' will NOT be normalised to 'AFSL' and thus should
    // NOT count as reserved. Pin the boundary of the strip set.
    expect(isMostlyReserved("AFSL; ASIC:")).toBe(true);
    expect(isMostlyReserved("AFSL-holder ASIC-approved ESIC-eligible")).toBe(
      false,
    );
  });

  it("majority carries the vote — 3 reserved + 2 filler → true", () => {
    // 3/5 = 0.6 > 0.5
    expect(isMostlyReserved("AFSL ASIC ESIC and required")).toBe(true);
  });

  it("multi-word reserved token 'Auschain PTY LTD' is NOT recognised as one token", () => {
    // Because the check splits on whitespace, 'Auschain', 'PTY', and
    // 'LTD' are three separate words. Only whole matches against the
    // lower-cased RESERVED set count. The reserved fixture stores
    // 'Auschain PTY LTD' as a single-string key, so none of the three
    // words individually match → 0/3 reserved → false.
    expect(isMostlyReserved("Auschain PTY LTD")).toBe(false);
  });

  it("returns true for a legal-footer-style all-caps AU shorthand line", () => {
    // The DOM-walker use case: legal footers like 'AFSL, ASIC, AUSTRAC'
    // are mostly-reserved and should be skipped by translation.
    expect(isMostlyReserved("AFSL, ASIC, AUSTRAC, APRA, ATO.")).toBe(true);
  });

  it("does not throw on unusual whitespace (tabs, newlines mixed)", () => {
    expect(() => isMostlyReserved("AFSL\tASIC\nESIC")).not.toThrow();
    expect(isMostlyReserved("AFSL\tASIC\nESIC")).toBe(true);
  });
});
