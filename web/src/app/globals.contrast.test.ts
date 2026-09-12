// Contrast pins for the design tokens in globals.css (release QA-1 #7).
//
// pa11y found 89 WCAG2AA contrast failures on 12/42 crawled pages, almost all
// from two tokens: `--color-ink-400` (#94a3b8 = 2.56:1 on white; 59 hits on
// /tools/cap-table, /tools/dilution, /tools/funding-plan, /tools/esic,
// insight meta and showcase separators) and `--color-gold-600` (#d97706 =
// 3.19:1; the "Free tool · No login" eyebrow on every /tools/* hero). The
// login divider used `text-surface-400` (1.48:1) and the home logo band's
// "·" used `text-line` (1.39:1). This test reads the real stylesheet so the
// values cannot drift back.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AA_TEXT, contrastRatio, cssHexTokens, hexToRgb } from "@/lib/a11y/contrast";

const CSS = readFileSync(join(__dirname, "globals.css"), "utf8");

/** The `@theme { … }` block — Tailwind's light-first token ramp. */
function themeBlock(): string {
  const start = CSS.indexOf("@theme {");
  const end = CSS.indexOf("\n}\n", start);
  return CSS.slice(start, end);
}

/** The explicit `:root[data-theme="dark"]` scope. */
function darkBlock(): string {
  const start = CSS.indexOf(':root[data-theme="dark"],');
  const end = CSS.indexOf("\n}\n", start);
  return CSS.slice(start, end);
}

/** The `@media (prefers-color-scheme: dark)` scope. */
function osDarkBlock(): string {
  const start = CSS.indexOf("@media (prefers-color-scheme: dark) {");
  const end = CSS.indexOf("\n}\n", start);
  return CSS.slice(start, end);
}

const light = cssHexTokens(themeBlock());
const WHITE = "#ffffff";
const OFF_WHITE = light.get("color-surface-100")!; // #f8fafc

describe("contrast helper", () => {
  it("computes the WCAG reference values", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
    // The two values pa11y reported for the old tokens.
    expect(contrastRatio("#94a3b8", WHITE)).toBeCloseTo(2.56, 1);
    expect(contrastRatio("#d97706", WHITE)).toBeCloseTo(3.19, 1);
    expect(hexToRgb("#abc")).toEqual({ r: 170, g: 187, b: 204 });
    expect(() => hexToRgb("blue")).toThrow();
  });
});

describe("globals.css light tokens meet WCAG AA on white (release QA-1 #7)", () => {
  it("--color-ink-400 (default muted meta) is ≥ 4.5:1 on white", () => {
    const v = light.get("color-ink-400")!;
    expect(v).toBe("#647389");
    expect(contrastRatio(v, OFF_WHITE), "on surface-100 (showcase separators, tool cards)").toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(v, WHITE)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("--color-gold-600 (tool-hero eyebrow) is ≥ 4.5:1 on white and on the off-white surface", () => {
    const v = light.get("color-gold-600")!;
    expect(v).toBe("#b45309");
    expect(contrastRatio(v, WHITE)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(v, OFF_WHITE)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("the whole ink text ramp 400–950 is AA on white", () => {
    for (const step of ["400", "500", "600", "700", "800", "900", "950"]) {
      const v = light.get(`color-ink-${step}`)!;
      expect(contrastRatio(v, WHITE), `ink-${step} ${v}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("the semantic --ds-ink-subtle / --ds-ink-tertiary text tokens stay AA on white", () => {
    const root = cssHexTokens(CSS.slice(CSS.indexOf(":root {"), CSS.indexOf("\n}\n", CSS.indexOf(":root {"))));
    for (const name of ["ds-ink", "ds-ink-muted", "ds-ink-subtle", "ds-ink-tertiary", "ds-warn"]) {
      expect(contrastRatio(root.get(name)!, WHITE), name).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it("--color-surface-400 and --color-line are NOT text tokens (< 4.5:1) — the login divider and the home '·' no longer use them", () => {
    expect(contrastRatio(light.get("color-surface-400")!, WHITE)).toBeLessThan(AA_TEXT);
    const login = readFileSync(join(__dirname, "auth/login/login-form.tsx"), "utf8");
    // Placeholder tints may keep surface-400; no visible text may.
    const textUses = login.match(/(?<!placeholder:)text-surface-400/g) ?? [];
    expect(textUses, "text-surface-400 on visible login text").toEqual([]);
    expect(login).toContain("or continue with email");
    const band = readFileSync(join(__dirname, "../components/marketing/logo-band.tsx"), "utf8");
    expect(band).not.toMatch(/className="[^"]*\btext-line\b/);
  });
});

describe("globals.css dark scopes keep the same tokens AA on the dark ground", () => {
  for (const [label, block] of [
    ["[data-theme=dark]", darkBlock()],
    ["prefers-color-scheme: dark", osDarkBlock()],
  ] as const) {
    it(`${label}: ink-400 and gold-600 are ≥ 4.5:1 on --color-surface-50`, () => {
      const dark = cssHexTokens(block);
      const ground = dark.get("color-surface-50")!;
      expect(ground, "dark ground").toMatch(/^#[0-9a-f]{6}$/);
      for (const name of ["color-ink-400", "color-ink-500", "color-gold-600"]) {
        const v = dark.get(name);
        expect(v, `${label} ${name} declared`).toBeTruthy();
        expect(contrastRatio(v!, ground), `${label} ${name} ${v}`).toBeGreaterThanOrEqual(AA_TEXT);
      }
    });
  }
});
