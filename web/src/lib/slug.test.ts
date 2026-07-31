import { describe, expect, it } from "vitest";
import { newSlug, newInvestorToken } from "./slug";

// base58 minus look-alikes (0/O/1/I/l). Mirrored here so a silent drift in
// slug.ts's ALPHABET constant fails this suite instead of leaking a
// forwarded /s/<slug> URL that trivially collides across recipients.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const ALPHABET_SET = new Set(ALPHABET.split(""));
const LOOK_ALIKES = ["0", "O", "1", "I", "l"];

describe("slug — newSlug()", () => {
  it("returns a 12-character string", () => {
    const s = newSlug();
    expect(typeof s).toBe("string");
    expect(s).toHaveLength(12);
  });

  it("only contains characters from the base58-minus-lookalikes ALPHABET", () => {
    for (let i = 0; i < 200; i++) {
      const s = newSlug();
      for (const ch of s) {
        expect(ALPHABET_SET.has(ch)).toBe(true);
      }
    }
  });

  it("never emits any look-alike character (0, O, 1, I, l)", () => {
    for (let i = 0; i < 500; i++) {
      const s = newSlug();
      for (const bad of LOOK_ALIKES) {
        expect(s.includes(bad)).toBe(false);
      }
    }
  });

  it("produces distinct values across 1000 calls (no collisions at ~70 bits)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(newSlug());
    expect(seen.size).toBe(1000);
  });

  it("every 12-slug uses at least 2 distinct alphabet symbols (rejects a degenerate all-one-char output)", () => {
    for (let i = 0; i < 50; i++) {
      const s = newSlug();
      expect(new Set(s.split("")).size).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("slug — newInvestorToken()", () => {
  it("returns a 16-character string (longer than newSlug so per-investor links don't collide)", () => {
    const t = newInvestorToken();
    expect(typeof t).toBe("string");
    expect(t).toHaveLength(16);
    expect(t.length).toBeGreaterThan(newSlug().length);
  });

  it("only contains characters from the base58-minus-lookalikes ALPHABET", () => {
    for (let i = 0; i < 200; i++) {
      const t = newInvestorToken();
      for (const ch of t) {
        expect(ALPHABET_SET.has(ch)).toBe(true);
      }
    }
  });

  it("never emits any look-alike character (0, O, 1, I, l)", () => {
    for (let i = 0; i < 500; i++) {
      const t = newInvestorToken();
      for (const bad of LOOK_ALIKES) {
        expect(t.includes(bad)).toBe(false);
      }
    }
  });

  it("produces distinct values across 1000 calls (no collisions at ~93 bits)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(newInvestorToken());
    expect(seen.size).toBe(1000);
  });

  it("investor tokens do not collide with score slugs (different lengths → structurally disjoint)", () => {
    const slugs = new Set<string>();
    for (let i = 0; i < 500; i++) slugs.add(newSlug());
    for (let i = 0; i < 500; i++) {
      expect(slugs.has(newInvestorToken())).toBe(false);
    }
  });
});

describe("slug — ALPHABET invariants", () => {
  it("ALPHABET is exactly 57 characters (base58 minus 0/O/1/I/l)", () => {
    expect(ALPHABET).toHaveLength(57);
  });

  it("ALPHABET contains no duplicate characters", () => {
    expect(new Set(ALPHABET.split("")).size).toBe(ALPHABET.length);
  });

  it("ALPHABET excludes every declared look-alike character", () => {
    for (const bad of LOOK_ALIKES) {
      expect(ALPHABET.includes(bad)).toBe(false);
    }
  });

  it("ALPHABET covers the expected digit/upper/lower families", () => {
    expect(ALPHABET).toContain("2");
    expect(ALPHABET).toContain("9");
    expect(ALPHABET).toContain("A");
    expect(ALPHABET).toContain("Z");
    expect(ALPHABET).toContain("a");
    expect(ALPHABET).toContain("z");
  });
});
