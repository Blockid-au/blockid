/**
 * G26 lane R — e-mail templates use only EMAIL_THEME colours.
 *
 * Inline e-mail CSS cannot read `--ds-*`, so the theme constant carries the
 * same hex values. This test walks every HTML e-mail template and fails on
 * a hex literal that is not one of them (HTML entities like `&#128274;` are
 * not colours). It also pins the token parity with `lib/pdf/theme.ts` and
 * the light-template invariants: no dark canvas, navy buttons, ink text.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { EMAIL_BUTTON_STYLE, EMAIL_CARD_STYLE, EMAIL_THEME, EMAIL_THEME_HEX } from "./theme";
import { PDF_THEME } from "@/lib/pdf/theme";

const ROOT = path.resolve(__dirname, "..", "..");

const TEMPLATES = [
  "lib/email.ts",
  "lib/email/founder-digest.ts",
  "lib/email/investor-digest.ts",
  "lib/svi/email-report.ts",
  "lib/digest/email-template.ts",
  "lib/email-enhanced.ts",
  "lib/email-drip.ts",
  "emails/lifecycle/render.ts",
  "lib/evaluations/progress-email.ts",
  "lib/evaluations/feedback-letter-email.ts",
  "lib/pilots/emails.ts",
  "lib/reseller/email-footer.ts",
  "lib/privacy/erasure-emails.ts",
];

/** Dark hex values the templates used before G26 — none may come back. */
const DARK_CANVAS = ["#0b1220", "#0f172a", "#1f2a44", "#0b0f2a", "#131938", "#1a2247", "#1a1a2e", "#0f1d35", "#1a2744"];

function hexes(src: string): string[] {
  // strip HTML entities (&#128274;) before matching colours
  return Array.from(src.replace(/&#\d+;/g, "").matchAll(/#[0-9a-fA-F]{6}\b/g)).map((m) => m[0].toLowerCase());
}

describe("EMAIL_THEME", () => {
  it("mirrors the --ds-* light tokens through PDF_THEME (one palette for web, PDF and e-mail)", () => {
    expect(EMAIL_THEME.surface).toBe(PDF_THEME.paper);
    expect(EMAIL_THEME.sunken).toBe(PDF_THEME.sunken);
    expect(EMAIL_THEME.border).toBe(PDF_THEME.border);
    expect(EMAIL_THEME.ink).toBe(PDF_THEME.ink);
    expect(EMAIL_THEME.inkMuted).toBe(PDF_THEME.inkMuted);
    expect(EMAIL_THEME.inkSubtle).toBe(PDF_THEME.inkSubtle);
    expect(EMAIL_THEME.navy).toBe(PDF_THEME.navy);
    expect(EMAIL_THEME.cyan).toBe(PDF_THEME.cyan);
    expect(EMAIL_THEME.success).toBe(PDF_THEME.success);
    expect(EMAIL_THEME.warn).toBe(PDF_THEME.warn);
    expect(EMAIL_THEME.danger).toBe(PDF_THEME.danger);
  });

  it("is light: the canvas and card are light, text is dark ink, the button is navy with white text", () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
    expect(lum(EMAIL_THEME.page)).toBeGreaterThan(0.85);
    expect(lum(EMAIL_THEME.surface)).toBeGreaterThan(0.85);
    expect(lum(EMAIL_THEME.ink)).toBeLessThan(0.05);
    for (const k of ["ink", "inkMuted", "inkSubtle", "inkTertiary", "navy", "action", "success", "warn", "danger"] as const) {
      expect(ratio(EMAIL_THEME[k], EMAIL_THEME.surface), `${k} on surface`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(EMAIL_THEME[k], EMAIL_THEME.sunken), `${k} on sunken`).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(EMAIL_THEME.ink, EMAIL_THEME.surface)).toBeGreaterThanOrEqual(7);
    expect(ratio(EMAIL_THEME.navy, EMAIL_THEME.surface)).toBeGreaterThanOrEqual(7);
    expect(ratio(EMAIL_THEME.onNavy, EMAIL_THEME.navy)).toBeGreaterThanOrEqual(4.5);
    expect(EMAIL_BUTTON_STYLE).toContain(`background:${EMAIL_THEME.navy}`);
    expect(EMAIL_BUTTON_STYLE).toContain(`color:${EMAIL_THEME.onNavy}`);
    expect(EMAIL_CARD_STYLE).toContain(`background:${EMAIL_THEME.surface}`);
  });

  it.each(TEMPLATES)("%s uses only EMAIL_THEME hex values and no dark canvas", (rel) => {
    const src = readFileSync(path.join(ROOT, rel), "utf8");
    const found = Array.from(new Set(hexes(src)));
    const foreign = found.filter((h) => !EMAIL_THEME_HEX.has(h));
    expect(foreign, `hex literals outside EMAIL_THEME in ${rel}`).toEqual([]);
    const dark = found.filter((h) => DARK_CANVAS.includes(h));
    expect(dark, `dark canvas colour in ${rel}`).toEqual([]);
  });
});
