/**
 * G26 — assertion helper for rendered HTML: the markup carries no dark
 * surface, no `dark:` variant, no raw grey palette and no raw hex in a
 * `class` attribute. Used by the colocated page tests of the signed-in
 * surfaces (lane W2) on the string `renderToReadableStream` produces.
 *
 * Pure — no DOM, no React — so it runs in the unit project without jsdom.
 */

export const DARK_SURFACE_RE =
  /\b(?:bg-(?:slate|gray|neutral|zinc|stone)-(?:8|9)\d{2}|bg-black(?!\/)|bg-black\/\d+|bg-ink-(?:8|9)\d{2}(?!\/40)|bg-\[#0[0-9a-f]{2,5}\]|bg-brand-navy-deep|from-brand-navy|to-brand-navy)\b/;
export const RAW_GREY_RE = /\b(?:bg|text|border|divide|ring|placeholder)-(?:gray|slate|neutral|zinc|stone)-\d{2,3}\b/;
export const DARK_VARIANT_RE = /\bdark:[a-z]/;

/** Every `class="…"` value in an HTML string. */
export function classAttrs(html: string): string[] {
  const out: string[] = [];
  const re = /\sclass="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

/**
 * Offending class lists (empty = light template holds). Each entry names the
 * rule and the class list so a failure reads without a debugger.
 */
export function darkSurfaceOffences(html: string): string[] {
  const out: string[] = [];
  if (/data-theme="dark"/.test(html)) out.push('data-theme="dark" wrapper');
  for (const cls of classAttrs(html)) {
    if (DARK_SURFACE_RE.test(cls)) out.push(`dark surface: ${cls}`);
    else if (RAW_GREY_RE.test(cls)) out.push(`raw grey: ${cls}`);
    else if (DARK_VARIANT_RE.test(cls)) out.push(`dark: variant: ${cls}`);
    else if (/#[0-9a-f]{3,8}\b/i.test(cls)) out.push(`raw hex: ${cls}`);
  }
  return out;
}
