import { describe, expect, it, vi } from "vitest";

// The seed-catalog module resolves its EN + VI catalogs from static JSON
// imports. Mock both at module scope so every case below drives a specific
// (enVal, targetVal) branch — otherwise the assertions would be pinned to
// whatever strings ship in web/src/lib/i18n/messages/*.json at HEAD.
vi.mock("./messages/en.json", () => ({
  default: {
    "greeting.hello": "Hello",
    "greeting.bye": "Goodbye",
    "nav.pricing": "Pricing",
    "shared.same": "Same",
    "extra.en_only": "OnlyEn",
    "extra.en_empty": "",
    "extra.en_number": 42,
    "extra.en_null": null,
    "target.empty": "TargetIsEmpty",
    "target.missing_type": "TargetIsNumber",
    "target.missing_null": "TargetIsNull",
    "target.absent": "TargetIsAbsent",
    "dup.key_a": "SharedEnValue",
    "dup.key_b": "SharedEnValue",
    "roundtrip.one": "Alpha",
    "roundtrip.two": "Beta",
  },
}));

vi.mock("./messages/vi.json", () => ({
  default: {
    "greeting.hello": "Xin chào",
    "greeting.bye": "Tạm biệt",
    "nav.pricing": "Giá",
    "shared.same": "Same",
    "extra.en_only": "OnlyVi",
    "extra.en_empty": "SomeVI",
    "extra.en_number": "NumberVi",
    "extra.en_null": "NullVi",
    "target.empty": "",
    "target.missing_type": 99,
    "target.missing_null": null,
    "dup.key_a": "ViValueA",
    "dup.key_b": "ViValueB",
    "roundtrip.one": "MotAlpha",
    "roundtrip.two": "HaiBeta",
    "vi.only": "OnlyPresentInVi",
  },
}));

import { buildSeedCatalog } from "./seed-catalog";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "./locales";

describe("buildSeedCatalog — DEFAULT_LOCALE short-circuit", () => {
  it("returns an empty object when target === DEFAULT_LOCALE", () => {
    // The DOM walker never needs an EN→EN swap, so the builder must not
    // even iterate the catalog on the default locale — pinning the fast-path.
    expect(buildSeedCatalog(DEFAULT_LOCALE)).toEqual({});
  });

  it("returns an object literal (not a Map) for the default-locale path", () => {
    // Provider consumers spread the result into an object; a Map here would
    // silently disable seeding.
    const seed = buildSeedCatalog(DEFAULT_LOCALE);
    expect(Object.prototype.toString.call(seed)).toBe("[object Object]");
    expect(seed instanceof Map).toBe(false);
  });

  it("default-locale result has no own keys", () => {
    expect(Object.keys(buildSeedCatalog(DEFAULT_LOCALE))).toHaveLength(0);
  });
});

describe("buildSeedCatalog — VI happy path", () => {
  it("swaps EN string value → VI string value for a well-formed pair", () => {
    const seed = buildSeedCatalog("vi");
    expect(seed["Hello"]).toBe("Xin chào");
    expect(seed["Goodbye"]).toBe("Tạm biệt");
    expect(seed["Pricing"]).toBe("Giá");
  });

  it("keys of the result are the EN VALUES (what the DOM walker sees), not the JSON KEYS", () => {
    // Regression pin: if this ever inverts, the provider's DOM matching
    // breaks silently — nothing gets swapped.
    const seed = buildSeedCatalog("vi");
    expect(Object.prototype.hasOwnProperty.call(seed, "greeting.hello")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(seed, "Hello")).toBe(true);
  });

  it("every emitted key and value is a non-empty string", () => {
    const seed = buildSeedCatalog("vi");
    const entries = Object.entries(seed);
    expect(entries.length).toBeGreaterThan(0);
    for (const [k, v] of entries) {
      expect(typeof k).toBe("string");
      expect(typeof v).toBe("string");
      expect(k.length).toBeGreaterThan(0);
      expect(v.length).toBeGreaterThan(0);
    }
  });

  it("does not emit an EN→VI entry when the two values are identical", () => {
    // "shared.same" is "Same" in both catalogs — no swap is a no-op, so
    // omitting it keeps the provider's payload lean.
    const seed = buildSeedCatalog("vi");
    expect(seed["Same"]).toBeUndefined();
  });
});

describe("buildSeedCatalog — skip branches", () => {
  it("skips keys where the EN value is not a string (number)", () => {
    // "extra.en_number" → 42 in EN; the typeof-guard must drop it even
    // though VI has a legitimate string on the other side.
    const seed = buildSeedCatalog("vi");
    expect(seed[42 as unknown as string]).toBeUndefined();
    expect(Object.values(seed)).not.toContain("NumberVi");
  });

  it("skips keys where the EN value is null", () => {
    const seed = buildSeedCatalog("vi");
    expect(Object.values(seed)).not.toContain("NullVi");
  });

  it("skips keys where the EN value is an empty string", () => {
    // The empty-string guard prevents "" → "SomeVI" — an empty DOM node
    // must never trigger a swap.
    const seed = buildSeedCatalog("vi");
    expect(Object.prototype.hasOwnProperty.call(seed, "")).toBe(false);
  });

  it("skips keys where the target value is an empty string", () => {
    // "target.empty" → "TargetIsEmpty" (EN) / "" (VI). Emitting would
    // wipe the visible string with an empty one.
    const seed = buildSeedCatalog("vi");
    expect(seed["TargetIsEmpty"]).toBeUndefined();
  });

  it("skips keys where the target value is not a string (number)", () => {
    const seed = buildSeedCatalog("vi");
    expect(seed["TargetIsNumber"]).toBeUndefined();
  });

  it("skips keys where the target value is null", () => {
    const seed = buildSeedCatalog("vi");
    expect(seed["TargetIsNull"]).toBeUndefined();
  });

  it("skips keys entirely absent from the target catalog", () => {
    // "target.absent" only exists on the EN side — the lookup yields
    // undefined and the typeof-guard drops it.
    const seed = buildSeedCatalog("vi");
    expect(seed["TargetIsAbsent"]).toBeUndefined();
  });

  it("ignores keys present only in the target catalog (loop iterates EN keys)", () => {
    // "vi.only" has no EN counterpart, so its value must never appear.
    const seed = buildSeedCatalog("vi");
    expect(Object.values(seed)).not.toContain("OnlyPresentInVi");
  });
});

describe("buildSeedCatalog — duplicate EN values", () => {
  it("collapses two EN keys sharing a value; last-write-wins in insertion order", () => {
    // Object.keys iterates insertion order for string keys — the second
    // dup entry ("dup.key_b" → "ViValueB") overwrites the first ("ViValueA").
    // Pinning this is defensive: a future Map-based rewrite must preserve
    // the same final choice or callers see a UI regression.
    const seed = buildSeedCatalog("vi");
    expect(seed["SharedEnValue"]).toBe("ViValueB");
  });

  it("does not preserve the losing duplicate's value in the output", () => {
    const seed = buildSeedCatalog("vi");
    expect(Object.values(seed)).not.toContain("ViValueA");
  });
});

describe("buildSeedCatalog — determinism + purity", () => {
  it("is idempotent: two calls return deep-equal maps", () => {
    expect(buildSeedCatalog("vi")).toEqual(buildSeedCatalog("vi"));
  });

  it("returns a fresh object per call (no shared reference)", () => {
    // Mutating one call's output must not leak into the next — pins the
    // per-call `const out = {}` allocation.
    const a = buildSeedCatalog("vi");
    const b = buildSeedCatalog("vi");
    expect(a).not.toBe(b);
    a["MUTATED"] = "x";
    expect(b["MUTATED"]).toBeUndefined();
  });

  it("does not throw on repeated invocation across every shipped locale", () => {
    for (const code of LOCALES) {
      expect(() => buildSeedCatalog(code)).not.toThrow();
    }
  });

  it("EN result stays empty across repeated calls", () => {
    for (let i = 0; i < 3; i += 1) {
      expect(buildSeedCatalog("en")).toEqual({});
    }
  });
});

describe("buildSeedCatalog — output shape", () => {
  it("returns a plain object with a string-index signature", () => {
    const seed = buildSeedCatalog("vi");
    expect(seed).not.toBeNull();
    expect(typeof seed).toBe("object");
    expect(Array.isArray(seed)).toBe(false);
  });

  it("has no undefined values in the emitted map", () => {
    // The typeof-string guards on both sides make this impossible; pin it
    // so a future refactor cannot leak undefined into a Record<string,string>.
    const seed = buildSeedCatalog("vi");
    for (const v of Object.values(seed)) {
      expect(v).not.toBeUndefined();
    }
  });

  it("emits at least the well-formed pairs that are neither skipped nor equal", () => {
    // Sanity floor — greeting.hello / greeting.bye / nav.pricing /
    // roundtrip.* / dup.key_b are the legitimate emissions (7 entries).
    const seed = buildSeedCatalog("vi");
    expect(Object.keys(seed).length).toBeGreaterThanOrEqual(6);
  });

  it("Locale type accepts every shipped code (compile-time smoke)", () => {
    const en: Locale = "en";
    const vi: Locale = "vi";
    expect(buildSeedCatalog(en)).toEqual({});
    expect(typeof buildSeedCatalog(vi)).toBe("object");
  });
});

describe("buildSeedCatalog — round-trip", () => {
  it("Alpha/Beta pairs survive the swap and reach VI", () => {
    const seed = buildSeedCatalog("vi");
    expect(seed["Alpha"]).toBe("MotAlpha");
    expect(seed["Beta"]).toBe("HaiBeta");
  });

  it("swapped values are recoverable via Object.entries walk", () => {
    // Provider iteration model: (enVal, viVal) pairs, order-independent.
    const seed = buildSeedCatalog("vi");
    const pairs = new Map(Object.entries(seed));
    expect(pairs.get("Alpha")).toBe("MotAlpha");
    expect(pairs.get("Hello")).toBe("Xin chào");
  });
});
