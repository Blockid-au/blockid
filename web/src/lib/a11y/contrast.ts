// WCAG 2.x contrast helpers (release QA-1 #7, 2026-09-12).
//
// Pure functions over hex colours so the design tokens in `app/globals.css`
// can be unit-tested for AA contrast without a browser. Formula per WCAG
// 2.1 §1.4.3 / "relative luminance" definition.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** `#abc`, `#aabbcc` (case-insensitive) → RGB 0–255. Throws on anything else. */
export function hexToRgb(hex: string): Rgb {
  const h = hex.trim().replace(/^#/, "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`not a hex colour: ${hex}`);
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance 0 (black) – 1 (white). */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio 1–21 between two colours (order-independent). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA for normal text. */
export const AA_TEXT = 4.5;
/** WCAG AA for large text (≥ 18pt / 14pt bold) and UI components. */
export const AA_LARGE = 3;

export function meetsAA(fg: string, bg: string, large = false): boolean {
  return contrastRatio(fg, bg) >= (large ? AA_LARGE : AA_TEXT);
}

/**
 * Read `--name: #hex;` declarations from a CSS block. Returns the LAST value
 * declared for each name inside `css` — call it on a sliced block (one scope)
 * to get that scope's tokens.
 */
export function cssHexTokens(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of css.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\b/g)) out.set(m[1]!, m[2]!.toLowerCase());
  return out;
}
