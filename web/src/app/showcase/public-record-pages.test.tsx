// Render guard for /showcase/airwallex and /showcase/culture-amp (G2 #6, S19-B).
//
// Rendered with react-dom/server (no JSDOM in this vitest config — same
// technique as atlassian-benchmark.test.ts). Pins, per page:
//   * the illustrative-SVI disclaimer renders above the company <h1>;
//   * every A$/US$ figure in the page sits inside an element carrying a
//     `data-source` URL (no invented / unsourced numbers);
//   * every data-source URL is listed in the Sources footer with a visible
//     publisher + date link;
//   * metadata obeys the S8-A rules (title core ≤ 47 so the rendered title
//     with " | BlockID.au" is ≤ 60; description 140–160; no brand token).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import AirwallexPage, { metadata as airwallexMeta } from "./airwallex/page";
import CultureAmpPage, { metadata as cultureAmpMeta } from "./culture-amp/page";
import {
  AIRWALLEX_CASE,
  CULTURE_AMP_CASE,
  ILLUSTRATIVE_SVI_DISCLAIMER,
  caseSources,
  moneyFigures,
  type PublicRecordCase,
} from "@/lib/showcase/public-record/cases";
import { BRAND_SUFFIX, DESCRIPTION_MAX, DESCRIPTION_MIN, TITLE_MAX } from "@/lib/seo/page-meta";

const VOID = new Set(["br", "img", "hr", "input", "meta", "link", "source", "wbr"]);

function decode(s: string): string {
  return s
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * Walk the static markup and return every monetary figure found in a text
 * node that has NO ancestor carrying `data-source`.
 */
function unsourcedFigures(html: string): string[] {
  const out: string[] = [];
  const stack: boolean[] = [];
  const re = /<\/([a-zA-Z0-9]+)\s*>|<([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) {
      stack.pop();
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      const attrs = m[3] ?? "";
      const selfClosing = attrs.trim().endsWith("/") || VOID.has(tag);
      const sourced = /\sdata-source="https?:\/\/[^"]+"/.test(attrs);
      if (!selfClosing) stack.push(sourced || stack.some(Boolean));
    } else if (m[4]) {
      const figures = moneyFigures(decode(m[4]));
      if (figures.length > 0 && !stack.some(Boolean)) out.push(...figures);
    }
  }
  return out;
}

function dataSourceUrls(html: string): string[] {
  return Array.from(html.matchAll(/data-source="([^"]+)"/g)).map((x) => decode(x[1]));
}

const PAGES: Array<[string, () => React.JSX.Element, { title?: unknown; description?: unknown }, PublicRecordCase]> = [
  ["airwallex", AirwallexPage, airwallexMeta, AIRWALLEX_CASE],
  ["culture-amp", CultureAmpPage, cultureAmpMeta, CULTURE_AMP_CASE],
];

describe.each(PAGES)("/showcase/%s", (slug, Page, meta, c) => {
  const html = renderToStaticMarkup(<Page />);

  it("renders the illustrative-SVI disclaimer above the company name", () => {
    expect(html).toContain('data-testid="illustrative-svi-notice"');
    expect(html).toContain("Illustrative SVI — not an assessment of the company");
    expect(decode(html)).toContain(ILLUSTRATIVE_SVI_DISCLAIMER);
    const notice = html.indexOf('data-testid="illustrative-svi-notice"');
    const h1 = html.indexOf("<h1");
    expect(notice).toBeGreaterThan(-1);
    expect(h1).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(h1);
    expect(html).toContain(`<h1 class="text-3xl font-semibold text-ink-900">${c.name}</h1>`);
    expect(html).toContain('data-testid="illustrative-svi-band"');
    expect(html).toContain(`data-canonical-stage="${c.illustrativeSvi.canonicalStage}"`);
  });

  it("attaches every A$/US$ figure on the page to a data-source link", () => {
    const all = moneyFigures(decode(html));
    expect(all.length, "page should carry sourced figures").toBeGreaterThan(5);
    expect(unsourcedFigures(html)).toEqual([]);
  });

  it("cites every source inline and lists it in the footer", () => {
    const urls = new Set(dataSourceUrls(html));
    const expected = new Set(caseSources(c).map((s) => s.url));
    for (const u of urls) expect(expected.has(u), `unexpected data-source ${u}`).toBe(true);
    for (const u of expected) expect(urls.has(u), `source ${u} never cited inline`).toBe(true);
    // Visible link per sourced element, naming publisher + date.
    const inlineLinks = html.match(/data-source-link/g) ?? [];
    expect(inlineLinks.length).toBeGreaterThanOrEqual(c.stats.length + c.milestones.length);
    for (const s of caseSources(c)) {
      expect(html).toContain(`${s.publisher}, ${s.date} →`);
      expect(html).toContain(`href="${s.url.replace(/&/g, "&amp;")}"`);
    }
    expect(html).toContain(`Sources (${caseSources(c).length})`);
    expect(html).toContain("omitted rather than estimated");
  });

  it("never renders a stat or badge the data does not carry a source for", () => {
    for (const s of c.stats) expect(html).toContain(s.value.replace(/>/g, "&gt;"));
    for (const m of c.milestones) {
      expect(html).toContain(m.headline);
      if (m.figure) expect(html).toContain(m.figure.replace(/>/g, "&gt;"));
    }
  });

  it("metadata follows the S8-A rules", () => {
    const title = String(meta.title);
    const description = String(meta.description);
    expect(title).toContain(slug === "airwallex" ? "Airwallex" : "Culture Amp");
    expect(title.length + BRAND_SUFFIX.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(title).not.toMatch(/BlockID/);
    expect(description.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
    expect(description.length).toBeLessThanOrEqual(DESCRIPTION_MAX);
  });
});
