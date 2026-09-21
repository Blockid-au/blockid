// G26 — the light template palette, verified as pure WCAG maths on the hex
// values parsed from `app/globals.css` (docs/design/unicorn-template.md v2
// § 2). Every text / surface pair the template uses is listed here with its
// floor; if a token drifts, this test names the pair and the ratio.
//
// Floors: body ≥ 4.5:1 (AA), headings / primary ink ≥ 7:1 (AAA), primary
// action label ≥ 12:1 (the founder's "white on navy" bar), secondary accent
// ≥ 4.5:1 on white AND on the sunken ground.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AA_TEXT, contrastRatio, cssHexTokens } from "@/lib/a11y/contrast";

const CSS = readFileSync(join(__dirname, "../app/globals.css"), "utf8");

function block(anchor: string): string {
  const start = CSS.indexOf(anchor);
  if (start < 0) throw new Error(`globals.css: anchor not found: ${anchor}`);
  return CSS.slice(start, CSS.indexOf("\n}\n", start));
}

const theme = cssHexTokens(block("@theme {"));
const root = cssHexTokens(block(":root {"));
const forcedLight = cssHexTokens(block(':root[data-theme="light"],'));

const AAA_TEXT = 7;
const PRIMARY_ACTION_FLOOR = 12;

/** The light template — token · expected value · role. */
const LIGHT_TOKENS = {
  "ds-surface": ["#ffffff", "page ground"],
  "ds-surface-sunken": ["#f7f8fa", "alternating band / footer / table head"],
  "ds-surface-hover": ["#eef0f5", "hover wash"],
  "ds-ink": ["#0b0f1a", "primary ink"],
  "ds-ink-muted": ["#1f2937", "secondary ink"],
  "ds-ink-subtle": ["#4b5563", "muted ink (body-safe)"],
  "ds-ink-tertiary": ["#6b7280", "tertiary / placeholders"],
  "ds-accent": ["#1b2a5e", "primary action = brand navy"],
  "ds-accent-hover": ["#22326b", "primary action hover"],
  "ds-accent-contrast": ["#ffffff", "label on the primary action"],
  "ds-accent-secondary": ["#0e7490", "cyan-muted secondary accent"],
  "ds-highlight": ["#6d28d9", "violet — eyebrows only"],
  "ds-focus-ring": ["#1b2a5e", "focus ring (ring-brand-navy)"],
  "ds-success": ["#047857", "bull"],
  "ds-warn": ["#b45309", "warn"],
  "ds-danger": ["#b91c1c", "bear"],
} as const;

type LightToken = keyof typeof LIGHT_TOKENS;

function tok(name: LightToken): string {
  const v = root.get(name);
  if (!v) throw new Error(`:root does not declare --${name}`);
  return v;
}

/** fg · bg · floor · why — the full pair table. */
const PAIRS: ReadonlyArray<[LightToken, LightToken, number, string]> = [
  ["ds-ink", "ds-surface", AAA_TEXT, "headings on white"],
  ["ds-ink", "ds-surface-sunken", AAA_TEXT, "headings on the sunken band"],
  ["ds-ink-muted", "ds-surface", AAA_TEXT, "secondary text on white"],
  ["ds-ink-muted", "ds-surface-sunken", AAA_TEXT, "secondary text on sunken"],
  // The old globals.css comment claimed 8.94:1 for #4b5563; the real figure is 7.56:1 (still AAA).
  ["ds-ink-subtle", "ds-surface", AAA_TEXT, "muted meta on white"],
  ["ds-ink-subtle", "ds-surface-sunken", AA_TEXT, "muted meta on sunken"],
  ["ds-ink-subtle", "ds-surface-hover", AA_TEXT, "muted meta on the hover wash"],
  ["ds-ink-tertiary", "ds-surface", AA_TEXT, "tertiary / placeholder on white"],
  ["ds-accent-contrast", "ds-accent", PRIMARY_ACTION_FLOOR, "white label on the navy primary button"],
  ["ds-accent-contrast", "ds-accent-hover", PRIMARY_ACTION_FLOOR, "white label on the navy hover"],
  ["ds-accent", "ds-surface", AAA_TEXT, "navy as link / heading accent on white"],
  ["ds-accent", "ds-surface-sunken", AAA_TEXT, "navy as link on sunken"],
  ["ds-accent-secondary", "ds-surface", AA_TEXT, "cyan-muted secondary accent as text on white"],
  ["ds-accent-secondary", "ds-surface-sunken", AA_TEXT, "cyan-muted secondary accent on sunken"],
  ["ds-highlight", "ds-surface", AA_TEXT, "violet eyebrow on white"],
  ["ds-highlight", "ds-surface-sunken", AA_TEXT, "violet eyebrow on sunken"],
  ["ds-success", "ds-surface", AA_TEXT, "bull text on white"],
  ["ds-warn", "ds-surface", AA_TEXT, "warn text on white"],
  ["ds-danger", "ds-surface", AA_TEXT, "bear text on white"],
  ["ds-focus-ring", "ds-surface", 3, "focus ring visible on white (non-text ≥ 3:1)"],
];

describe("G26 light palette — token values", () => {
  for (const [name, [hex, role]] of Object.entries(LIGHT_TOKENS) as [LightToken, readonly [string, string]][]) {
    it(`--${name} is ${hex} (${role})`, () => {
      expect(root.get(name), `:root --${name}`).toBe(hex);
      expect(forcedLight.get(name), `[data-theme=light] --${name} must match :root`).toBe(hex);
    });
  }

  it("the primary action IS brand navy and the focus ring matches it", () => {
    expect(theme.get("color-brand-navy")).toBe(tok("ds-accent"));
    expect(theme.get("color-brand-navy-elev-1")).toBe(tok("ds-accent-hover"));
    expect(tok("ds-focus-ring")).toBe(tok("ds-accent"));
  });

  it("the cyan secondary accent was darkened past #0891b2 (3.68:1) so it clears AA as text", () => {
    expect(contrastRatio("#0891b2", "#ffffff")).toBeLessThan(AA_TEXT);
    expect(theme.get("color-brand-cyan-muted")).toBe(tok("ds-accent-secondary"));
  });

  it("the semantic generators expose action-secondary and the ink aliases in every scope", () => {
    const scopes = ["@theme {", ':root[data-theme="dark"],', ':root[data-theme="light"],'];
    for (const anchor of scopes) {
      const b = block(anchor);
      for (const gen of [
        "--color-action-secondary: var(--ds-accent-secondary)",
        "--color-ink: var(--ds-ink)",
        "--color-ink-muted: var(--ds-ink-muted)",
        "--color-ink-subtle: var(--ds-ink-subtle)",
      ]) {
        expect(b, `${anchor} ${gen}`).toContain(gen);
      }
    }
  });

  it("legacy near-white brand-ink tokens are documented graphic-only (they are NOT light text)", () => {
    expect(contrastRatio(theme.get("color-brand-ink")!, "#ffffff")).toBeLessThan(AA_TEXT);
    expect(contrastRatio(theme.get("color-brand-cyan")!, "#ffffff")).toBeLessThan(AA_TEXT);
    const themeBlock = block("@theme {");
    expect(themeBlock).toMatch(/brand-ink \/ brand-ink-muted are LEGACY ON-NAVY-FILL/);
    expect(themeBlock).toMatch(/--color-brand-cyan: #22D3EE;\s*\/\*[^*]*GRAPHIC ONLY/);
  });
});

describe("G26 light palette — every text / surface pair clears its floor", () => {
  for (const [fg, bg, floor, why] of PAIRS) {
    it(`${why}: --${fg} on --${bg} ≥ ${floor}:1`, () => {
      const ratio = contrastRatio(tok(fg), tok(bg));
      expect(ratio, `${fg} ${tok(fg)} on ${bg} ${tok(bg)} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(floor);
    });
  }

  it("prints the token table (name · light value · contrast on white)", () => {
    const white = tok("ds-surface");
    const rows = (Object.keys(LIGHT_TOKENS) as LightToken[]).map(
      (n) => `${n.padEnd(22)} ${tok(n)}  ${contrastRatio(tok(n), white).toFixed(2).padStart(6)}:1  ${LIGHT_TOKENS[n][1]}`,
    );
    expect(rows.length).toBe(Object.keys(LIGHT_TOKENS).length);
    if (process.env.PALETTE_TABLE === "1") console.log(rows.join("\n"));
  });
});
