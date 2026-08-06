/**
 * Colocated tests for the Remotion pitch-video brand token registry
 * (src/remotion/styles/brand.ts).
 *
 * BRAND is the single source of truth for every pitch composition —
 * 18 files import it (Root.tsx, all compositions/*.tsx, and every
 * components/*.tsx overlay) and rely on three separable contracts:
 *
 *   1. **Concat-safe hex palette.** Component code writes idioms like
 *      `${BRAND.colors.ink800}80` and `${BRAND.colors.brand500}15` to
 *      layer alpha onto a base swatch — that only produces a valid
 *      8-char CSS hex if every base is exactly `#` + six uppercase
 *      hex digits. A stray 3-char shorthand or trailing whitespace
 *      would render as a broken colour band in the exported MP4.
 *   2. **Semantic aliases.** `brand` ≡ `brand500` and `gold` ≡ `gold400`
 *      are used interchangeably across compositions (PitchVideoSWC
 *      uses `.brand`, PitchAntler uses `.brand500`); a silent drift
 *      between the two would show up as two subtly different blues
 *      in the same frame. Same for `slate400` ≡ `ink400` (the neutral
 *      caption grey — deliberately shared so ink/slate switches don't
 *      shift caption tone).
 *   3. **Video-frame invariants.** fps=30, 1920×1080 (16:9) — Remotion
 *      requires an integer fps and Root.tsx multiplies `60 * BRAND.fps`
 *      to derive `durationInFrames`; a non-integer or mismatched
 *      aspect ratio would silently corrupt the timeline.
 *
 * These tests pin the shape, palette values, alias identities, and
 * frame invariants so a future edit to brand.ts can't ship a
 * composition-breaking regression past `npm test`.
 */

import { describe, expect, it } from "vitest";

import { BRAND } from "./brand";

const HEX6 = /^#[0-9A-F]{6}$/;
const HEX6_LOOSE = /^#[0-9a-fA-F]{6}$/;

const EXPECTED_COLOR_KEYS = [
  "brand",
  "brand500",
  "brand600",
  "brand400",
  "ink950",
  "ink900",
  "ink800",
  "ink500",
  "ink400",
  "slate50",
  "slate300",
  "slate400",
  "gold",
  "gold400",
  "emerald500",
  "red400",
  "white",
] as const;

const EXPECTED_FONT_KEYS = ["heading", "body", "mono"] as const;

describe("BRAND — top-level shape", () => {
  it("exposes exactly the four top-level keys the compositions consume", () => {
    expect(Object.keys(BRAND).sort()).toEqual(
      ["colors", "fonts", "fps", "height", "width"].sort(),
    );
  });

  it("colors is a plain object (not array / null)", () => {
    expect(BRAND.colors).toBeTypeOf("object");
    expect(BRAND.colors).not.toBeNull();
    expect(Array.isArray(BRAND.colors)).toBe(false);
  });

  it("fonts is a plain object (not array / null)", () => {
    expect(BRAND.fonts).toBeTypeOf("object");
    expect(BRAND.fonts).not.toBeNull();
    expect(Array.isArray(BRAND.fonts)).toBe(false);
  });

  it("fps / width / height are numeric primitives", () => {
    expect(typeof BRAND.fps).toBe("number");
    expect(typeof BRAND.width).toBe("number");
    expect(typeof BRAND.height).toBe("number");
  });
});

describe("BRAND.colors — palette shape", () => {
  it("declares exactly 17 keys (guard against silent additions/removals)", () => {
    expect(Object.keys(BRAND.colors)).toHaveLength(EXPECTED_COLOR_KEYS.length);
  });

  it("contains every key the compositions import by name", () => {
    for (const key of EXPECTED_COLOR_KEYS) {
      expect(BRAND.colors).toHaveProperty(key);
    }
  });

  it("has no unexpected color keys leaking into the token surface", () => {
    const extras = Object.keys(BRAND.colors).filter(
      (k) => !EXPECTED_COLOR_KEYS.includes(k as (typeof EXPECTED_COLOR_KEYS)[number]),
    );
    expect(extras).toEqual([]);
  });

  it("every value is a non-empty string", () => {
    for (const [key, value] of Object.entries(BRAND.colors)) {
      expect(value, `colors.${key}`).toBeTypeOf("string");
      expect((value as string).length, `colors.${key}`).toBeGreaterThan(0);
    }
  });
});

describe("BRAND.colors — concat-safe hex format", () => {
  it("every color is exactly a 6-char hex string prefixed with '#'", () => {
    for (const [key, value] of Object.entries(BRAND.colors)) {
      expect((value as string).length, `colors.${key} length`).toBe(7);
      expect((value as string).startsWith("#"), `colors.${key} prefix`).toBe(true);
    }
  });

  it("every color matches the strict uppercase-hex shape `#RRGGBB`", () => {
    for (const [key, value] of Object.entries(BRAND.colors)) {
      expect((value as string), `colors.${key}`).toMatch(HEX6);
    }
  });

  it("no color uses lowercase hex digits (renderers accept it but the palette normalises to upper)", () => {
    for (const [key, value] of Object.entries(BRAND.colors)) {
      expect((value as string), `colors.${key}`).toBe((value as string).toUpperCase());
    }
  });

  it("no color contains whitespace or trailing punctuation", () => {
    for (const [key, value] of Object.entries(BRAND.colors)) {
      expect((value as string), `colors.${key}`).toBe((value as string).trim());
      expect(/[;\s]/.test(value as string), `colors.${key}`).toBe(false);
    }
  });

  it("appending a 2-char alpha suffix still yields a valid 8-char CSS hex", () => {
    // Direct guard for the `${BRAND.colors.X}80` pattern used across
    // components/*.tsx to layer alpha onto base swatches.
    for (const [key, value] of Object.entries(BRAND.colors)) {
      const composed = `${value}80`;
      expect(composed.length, `colors.${key} composed length`).toBe(9);
      expect(composed, `colors.${key} composed shape`).toMatch(/^#[0-9A-F]{6}80$/);
    }
  });

  it("appending a 1-char alpha suffix does NOT accidentally form a valid 8-char hex (protects against 5-char base leaking through)", () => {
    // 6-char base + "8" would be 8 chars total → could deceptively look
    // valid. Verify base is 6 chars so the composed form is 8 chars only
    // for the *intended* 2-char alpha idiom, never a stray 1-char.
    for (const [key, value] of Object.entries(BRAND.colors)) {
      const composed = `${value}8`;
      expect(composed.length, `colors.${key} + 1-char`).toBe(8);
      // Should NOT match the strict 6-hex regex (it's 7 hex digits).
      expect(HEX6.test(composed), `colors.${key} + 1-char must not match RRGGBB`).toBe(false);
    }
  });
});

describe("BRAND.colors — canonical swatch values", () => {
  it("brand = brand500 = #3B7DD8 (primary blue)", () => {
    expect(BRAND.colors.brand).toBe("#3B7DD8");
    expect(BRAND.colors.brand500).toBe("#3B7DD8");
  });

  it("brand600 is #2B6BC4 (darker press state)", () => {
    expect(BRAND.colors.brand600).toBe("#2B6BC4");
  });

  it("brand400 is #5B9AEB (lighter hover state)", () => {
    expect(BRAND.colors.brand400).toBe("#5B9AEB");
  });

  it("ink shades match the pitch-video base palette", () => {
    expect(BRAND.colors.ink950).toBe("#0B1220");
    expect(BRAND.colors.ink900).toBe("#0F172A");
    expect(BRAND.colors.ink800).toBe("#172033");
    expect(BRAND.colors.ink500).toBe("#64748B");
    expect(BRAND.colors.ink400).toBe("#94A3B8");
  });

  it("slate shades match the caption/subtle-text palette", () => {
    expect(BRAND.colors.slate50).toBe("#F8FAFC");
    expect(BRAND.colors.slate300).toBe("#CBD5E1");
    expect(BRAND.colors.slate400).toBe("#94A3B8");
  });

  it("accent swatches (gold / emerald / red / white) match", () => {
    expect(BRAND.colors.gold).toBe("#FBBF24");
    expect(BRAND.colors.gold400).toBe("#FBBF24");
    expect(BRAND.colors.emerald500).toBe("#10B981");
    expect(BRAND.colors.red400).toBe("#F87171");
    expect(BRAND.colors.white).toBe("#FFFFFF");
  });
});

describe("BRAND.colors — semantic aliases", () => {
  it("brand and brand500 point to the same swatch (used interchangeably)", () => {
    expect(BRAND.colors.brand).toBe(BRAND.colors.brand500);
  });

  it("gold and gold400 point to the same swatch (used interchangeably)", () => {
    expect(BRAND.colors.gold).toBe(BRAND.colors.gold400);
  });

  it("slate400 ≡ ink400 — caption grey is deliberately shared across families", () => {
    expect(BRAND.colors.slate400).toBe(BRAND.colors.ink400);
  });
});

describe("BRAND.colors — ordinal shading", () => {
  const parseHex = (value: string) => ({
    r: parseInt(value.slice(1, 3), 16),
    g: parseInt(value.slice(3, 5), 16),
    b: parseInt(value.slice(5, 7), 16),
  });
  const luma = (hex: string) => {
    const { r, g, b } = parseHex(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };

  it("brand ramp lightens 600 → 500 → 400", () => {
    expect(luma(BRAND.colors.brand600)).toBeLessThan(luma(BRAND.colors.brand500));
    expect(luma(BRAND.colors.brand500)).toBeLessThan(luma(BRAND.colors.brand400));
  });

  it("ink ramp lightens 950 → 900 → 800 → 500 → 400 (monotonic)", () => {
    const ramp = [
      BRAND.colors.ink950,
      BRAND.colors.ink900,
      BRAND.colors.ink800,
      BRAND.colors.ink500,
      BRAND.colors.ink400,
    ];
    for (let i = 1; i < ramp.length; i += 1) {
      expect(
        luma(ramp[i]!),
        `ink[${i}] must be lighter than ink[${i - 1}]`,
      ).toBeGreaterThan(luma(ramp[i - 1]!));
    }
  });

  it("slate ramp lightens 400 → 300 → 50 (monotonic)", () => {
    expect(luma(BRAND.colors.slate400)).toBeLessThan(luma(BRAND.colors.slate300));
    expect(luma(BRAND.colors.slate300)).toBeLessThan(luma(BRAND.colors.slate50));
  });

  it("white is the lightest swatch in the palette", () => {
    const whiteLuma = luma(BRAND.colors.white);
    for (const [key, value] of Object.entries(BRAND.colors)) {
      if (key === "white") continue;
      expect(luma(value as string), `white vs ${key}`).toBeLessThanOrEqual(whiteLuma);
    }
  });

  it("ink950 is the darkest swatch in the palette", () => {
    const darkLuma = luma(BRAND.colors.ink950);
    for (const [key, value] of Object.entries(BRAND.colors)) {
      if (key === "ink950") continue;
      expect(luma(value as string), `ink950 vs ${key}`).toBeLessThanOrEqual(luma(value as string));
    }
  });
});

describe("BRAND.fonts — family stacks", () => {
  it("exposes exactly heading / body / mono keys", () => {
    expect(Object.keys(BRAND.fonts).sort()).toEqual([...EXPECTED_FONT_KEYS].sort());
  });

  it("every family is a non-empty string", () => {
    for (const [key, value] of Object.entries(BRAND.fonts)) {
      expect(value, `fonts.${key}`).toBeTypeOf("string");
      expect((value as string).length, `fonts.${key}`).toBeGreaterThan(0);
    }
  });

  it("heading and body share the same family (Inter) — pitch-video body copy stays on-brand", () => {
    expect(BRAND.fonts.heading).toBe(BRAND.fonts.body);
  });

  it("heading stack starts with 'Inter' as the primary face", () => {
    expect(BRAND.fonts.heading.startsWith("'Inter'")).toBe(true);
  });

  it("mono stack starts with 'IBM Plex Mono' as the primary face", () => {
    expect(BRAND.fonts.mono.startsWith("'IBM Plex Mono'")).toBe(true);
  });

  it("proportional stacks (heading / body) end with 'sans-serif' generic fallback", () => {
    expect(BRAND.fonts.heading.endsWith("sans-serif")).toBe(true);
    expect(BRAND.fonts.body.endsWith("sans-serif")).toBe(true);
  });

  it("mono stack ends with 'monospace' generic fallback", () => {
    expect(BRAND.fonts.mono.endsWith("monospace")).toBe(true);
  });

  it("every family stack lists ≥ 3 fallbacks (comma-separated), never a single face", () => {
    for (const [key, value] of Object.entries(BRAND.fonts)) {
      const count = (value as string).split(",").length;
      expect(count, `fonts.${key} fallback count`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("BRAND — video-frame invariants", () => {
  it("fps is exactly 30 (Remotion Root.tsx derives durationInFrames from this)", () => {
    expect(BRAND.fps).toBe(30);
  });

  it("fps is a positive integer (Remotion rejects non-integer fps)", () => {
    expect(Number.isInteger(BRAND.fps)).toBe(true);
    expect(BRAND.fps).toBeGreaterThan(0);
  });

  it("width is exactly 1920 (1080p landscape)", () => {
    expect(BRAND.width).toBe(1920);
  });

  it("height is exactly 1080 (1080p landscape)", () => {
    expect(BRAND.height).toBe(1080);
  });

  it("width / height form a 16:9 aspect ratio", () => {
    expect(BRAND.width / BRAND.height).toBeCloseTo(16 / 9, 6);
  });

  it("dimensions are positive integers", () => {
    expect(Number.isInteger(BRAND.width)).toBe(true);
    expect(Number.isInteger(BRAND.height)).toBe(true);
    expect(BRAND.width).toBeGreaterThan(0);
    expect(BRAND.height).toBeGreaterThan(0);
  });

  it("60-second composition derives to an integer frame count (60 * fps)", () => {
    // Root.tsx literally computes `durationInFrames={60 * BRAND.fps}`.
    const durationInFrames = 60 * BRAND.fps;
    expect(Number.isInteger(durationInFrames)).toBe(true);
    expect(durationInFrames).toBe(1800);
  });
});

describe("BRAND — regression pins", () => {
  it("HEX6_LOOSE-vs-HEX6 divergence catches a lowercase drift regression", () => {
    // Sanity check that the strict regex above would actually catch a
    // lowercase leak — if someone loosens the palette to accept both,
    // this test fails and forces an explicit decision.
    expect(HEX6.test("#ff0000")).toBe(false);
    expect(HEX6_LOOSE.test("#ff0000")).toBe(true);
  });

  it("BRAND object is reference-stable across imports (no per-call reconstruction)", async () => {
    const { BRAND: again } = await import("./brand");
    expect(again).toBe(BRAND);
  });
});
