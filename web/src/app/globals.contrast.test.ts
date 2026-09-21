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

describe("globals.css: light is the only default (G26) — no OS auto-dark", () => {
  it("has no `@media (prefers-color-scheme: dark)` token scope; the dark ramp is an explicit [data-theme=dark] / .dark opt-in", () => {
    expect(CSS).not.toMatch(/@media\s*\(prefers-color-scheme:\s*dark\)/);
    expect(CSS).toContain(':root[data-theme="dark"],');
  });
});

// G24 UI lane (2026-09-21): `text-ink-500` is the workspace's default muted
// text (2 200+ uses) and sits on the sunken / hover grounds as often as on
// white — it must clear AA on all three, not only on #ffffff.
describe("globals.css ink-500 is AA on every light ground", () => {
  it("light: ink-500 >= 4.5:1 on surface, surface-sunken and surface-hover", () => {
    const ink = light.get("color-ink-500")!;
    expect(ink).toMatch(/^#[0-9a-f]{6}$/);
    for (const ground of ["#ffffff", "#f7f8fa", "#eef0f5"]) {
      expect(contrastRatio(ink, ground), `ink-500 ${ink} on ${ground}`).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });
});

describe("globals.css dark scope keeps the same tokens AA on the dark ground", () => {
  for (const [label, block] of [
    ["[data-theme=dark]", darkBlock()],
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

// G17 D6 (docs/design/unicorn-template.md) — the violet accent ramp and its
// semantic pair. The ramp is decorative (ring gradient, eyebrow pills, focus
// rings); the only step allowed as TEXT is `--ds-highlight`, which must stay
// AA on white (light) and on the dark ground (both dark scopes). The ring
// endpoints are tokens, not hex, so the conic gradient re-tints per theme.
describe("globals.css G17 accent tokens (violet) are AA where they carry text", () => {
  it("declares the ten-step accent ramp with #7c3aed at 600 and the two-level shadow + motion tokens", () => {
    for (const step of ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900"]) {
      expect(light.get(`color-accent-${step}`), `accent-${step}`).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(light.get("color-accent-600")).toBe("#7c3aed");
    const theme = themeBlock();
    for (const token of ["--shadow-1:", "--shadow-2:", "--dur-fast: 150ms", "--dur-base: 200ms", "--ease-out:", "--color-accent: var(--ds-highlight)"]) {
      expect(theme, token).toContain(token);
    }
  });

  it("--ds-highlight (text-accent) is ≥ 4.5:1 on white in the light scopes and on the dark ground in both dark scopes", () => {
    const root = cssHexTokens(CSS.slice(CSS.indexOf(":root {"), CSS.indexOf("\n}\n", CSS.indexOf(":root {"))));
    expect(root.get("ds-highlight")).toBe("#6d28d9");
    expect(contrastRatio(root.get("ds-highlight")!, WHITE)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(root.get("ds-highlight")!, OFF_WHITE)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(light.get("color-accent-600")!, WHITE), "accent-600 (ring / focus) on white").toBeGreaterThanOrEqual(AA_TEXT);
    for (const [label, block] of [["[data-theme=dark]", darkBlock()]] as const) {
      const dark = cssHexTokens(block);
      expect(dark.get("ds-highlight"), `${label} ds-highlight declared`).toBeTruthy();
      expect(contrastRatio(dark.get("ds-highlight")!, dark.get("color-surface-50")!), `${label} ds-highlight`).toBeGreaterThanOrEqual(AA_TEXT);
      for (const name of ["ds-ring-start", "ds-ring-end"]) expect(dark.get(name), `${label} ${name}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("the search ring gradient reads its stops from --ds-ring-start / --ds-ring-end (no raw hex) and freezes under reduced motion", () => {
    const ring = CSS.slice(CSS.indexOf(".asf-wrap::before {"), CSS.indexOf(".asf-wrap:hover::before"));
    expect(ring).toContain("var(--ds-ring-start) 0deg");
    expect(ring).toContain("var(--ds-ring-end) 120deg");
    expect(ring).not.toMatch(/#[0-9a-f]{3,6}\s+\d+deg/i);
    const reduced = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce) {\n  /* Frozen"), CSS.indexOf("@layer utilities"));
    expect(reduced).toContain(".asf-wrap::before { animation: none;");
  });
});
