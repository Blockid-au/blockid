/**
 * G26 — light template pin for rendered marketing HTML.
 *
 * Every public page renders on the light template (docs/plans/g26-light-
 * template-redesign-2026-09-21.md § 1): no dark bands, no `data-theme="dark"`
 * wrappers, no raw dark hex in `className` or `style`. The colocated page
 * tests call `expectLightSurfaces(html)` on the rendered output so a dark
 * band cannot come back through a page-local edit. Lane T's
 * `design/light-template.guard.test.ts` walks the source trees; this one
 * pins the rendered tree of one page family.
 */

/** Tailwind utilities that paint a dark surface (page-level or band-level). */
export const DARK_SURFACE_CLASS =
  /(?:^|[\s"'`])(?:bg-brand-navy(?:-[a-z0-9-]+)?|bg-(?:slate|gray|zinc|neutral|stone|ink)-9\d\d(?:\/\d+)?|bg-black(?:\/\d+)?|bg-\[#0[0-9a-f]{5}\]|bg-\[#1[0-9a-f]{5}\]|from-(?:slate|gray|zinc|ink)-9\d\d|to-(?:slate|gray|zinc|ink)-9\d\d|from-brand-navy(?:-[a-z-]+)?|to-brand-navy(?:-[a-z-]+)?)(?=[\s"'`]|$)/;

/** Inline `style` colours that paint a dark ground. */
export const DARK_INLINE_STYLE = /background(?:-color)?:\s*#(?:0[0-9a-f]|1[0-9a-f])[0-9a-f]{4}\b/i;

export function findDarkSurfaces(html: string): string[] {
  const hits: string[] = [];
  const themed = html.match(/<[a-z][^>]*data-theme="dark"[^>]*>/g) ?? [];
  for (const tag of themed) hits.push(`data-theme="dark" on ${tag.slice(0, 80)}`);
  const classAttrs = html.match(/class="[^"]*"/g) ?? [];
  for (const attr of classAttrs) {
    const m = attr.match(DARK_SURFACE_CLASS);
    if (m) hits.push(`${m[1] ?? m[0].trim()} in ${attr.slice(0, 100)}`);
  }
  const styles = html.match(/style="[^"]*"/g) ?? [];
  for (const attr of styles) {
    if (DARK_INLINE_STYLE.test(attr)) hits.push(`dark inline ${attr.slice(0, 80)}`);
  }
  return hits;
}

/** The `<main>` subtree of a rendered page — the part a page lane owns (nav + footer are the chrome lane's). */
export function mainOf(html: string): string {
  const start = html.search(/<main\b/);
  if (start < 0) return html;
  const end = html.indexOf("</main>", start);
  return end < 0 ? html.slice(start) : html.slice(start, end + 7);
}

/**
 * Throws with the first offending tags when the page's `<main>` paints a dark
 * surface anywhere (bands, cards, wrappers). Code samples (`<pre>`) are
 * included on purpose — they sit on `bg-surface-sunken` on the light template.
 * Pass `{ whole: true }` to include the chrome once the light nav + footer land.
 */
export function expectLightSurfaces(html: string, label = "page", opts: { whole?: boolean } = {}): void {
  const hits = findDarkSurfaces(opts.whole ? html : mainOf(html));
  if (hits.length) {
    throw new Error(`${label} paints ${hits.length} dark surface(s) on the light template:\n  ${hits.slice(0, 8).join("\n  ")}`);
  }
}
