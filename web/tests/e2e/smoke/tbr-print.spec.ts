/**
 * G28-D — Trusted Business Report print probe (Playwright, Gate 12 optional).
 *
 * The web report prints through `@page` + `@media print` in globals.css
 * (tbr-v3 spec § 5): A4 / 16 mm, every numbered section on a fresh page,
 * no orphan headings, whole table rows, none of the screen chrome. This
 * probe is deliberately cheap — one page, print media emulated, computed
 * styles read in the browser, then one `page.pdf()` for a page-count
 * sanity check:
 *
 *   • `/tbr/demo?band=D` renders band D (the proxy rewrite → static variant);
 *   • under print media the header / nav / footer / unlock rail / consent
 *     banner are `display: none`;
 *   • every section after the first has `break-before: page`, every h2 / h3
 *     `break-after: avoid`, every table row `break-inside: avoid`, every
 *     `<thead>` is `table-header-group`;
 *   • nothing is clipped: no scroll container inside the report keeps an
 *     overflow smaller than its content, and no section is wider than the
 *     print viewport;
 *   • the PDF has a plausible page count (≥ 12: sections 1–2, 4–16 each on
 *     a fresh sheet, plus the 8 chapters; ≤ 120: nothing exploded).
 *
 * Run: PLAYWRIGHT_BASE_URL=http://127.0.0.1:4001 npx playwright test
 *      tests/e2e/smoke/tbr-print.spec.ts
 */

import { test, expect } from "@playwright/test";

const PAGE_TIMEOUT = 30_000;
const REPORT_PATH = "/tbr/demo?band=D";

interface PrintAudit {
  band: string | null;
  hiddenChrome: Record<string, boolean>;
  sections: number;
  sectionsWithoutBreak: string[];
  headingsWithoutAvoid: number;
  headings: number;
  rowsWithoutAvoid: number;
  rows: number;
  theadNotHeaderGroup: number;
  clipped: string[];
  overflowing: string[];
  supTooSmall: number;
}

/** Runs inside the page under `emulateMedia({ media: "print" })`. Plain browser JS. */
function auditPrint(): PrintAudit {
  const root = document.querySelector("[data-tbr-version]");
  const cs = (el: Element) => getComputedStyle(el);
  const hidden = (sel: string) => {
    const els = Array.from(document.querySelectorAll(sel));
    return els.length === 0 || els.every((el) => cs(el).display === "none");
  };
  const hiddenChrome: Record<string, boolean> = {
    header: hidden("header"),
    nav: hidden("nav"),
    footer: hidden("footer"),
    unlockRail: hidden('[data-testid="tbr-unlock-rail"]'),
    consent: hidden('[aria-label="Analytics consent"]'),
  };
  if (!root) {
    return { band: null, hiddenChrome, sections: 0, sectionsWithoutBreak: [], headingsWithoutAvoid: 0, headings: 0, rowsWithoutAvoid: 0, rows: 0, theadNotHeaderGroup: 0, clipped: [], overflowing: [], supTooSmall: 0 };
  }
  const sections = Array.from(root.querySelectorAll(':scope > section[id^="tbr-"]'));
  // Spec § 5: sections 4–16 + the 8 chapters start a sheet; the dashboard is
  // page 1 and the key points (3) flow after the investment view (pages 1–3).
  const flowsWithPrevious = new Set(["tbr-key-points"]);
  const sectionsWithoutBreak: string[] = [];
  sections.forEach((s, i) => {
    if (i === 0 || flowsWithPrevious.has(s.id)) return;
    const bb = cs(s).breakBefore;
    if (bb !== "page") sectionsWithoutBreak.push(`${s.id}:${bb}`);
  });
  const headings = Array.from(root.querySelectorAll("h2, h3"));
  const headingsWithoutAvoid = headings.filter((h) => cs(h).breakAfter !== "avoid" && cs(h).breakAfter !== "avoid-page").length;
  const rows = Array.from(root.querySelectorAll("tr"));
  const rowsWithoutAvoid = rows.filter((r) => cs(r).breakInside !== "avoid" && cs(r).breakInside !== "avoid-page").length;
  const theadNotHeaderGroup = Array.from(root.querySelectorAll("thead")).filter((t) => cs(t).display !== "table-header-group").length;
  // Clipped = an element whose content is taller / wider than its box while overflow is not visible.
  const clipped: string[] = [];
  for (const el of Array.from(root.querySelectorAll("div, section, table, figure, details"))) {
    const s = cs(el);
    if (s.display === "none") continue;
    const ox = s.overflowX;
    const oy = s.overflowY;
    if ((ox !== "visible" && el.scrollWidth > el.clientWidth + 2) || (oy !== "visible" && el.scrollHeight > el.clientHeight + 2)) {
      clipped.push(`<${el.tagName.toLowerCase()} id="${el.id}" class="${(el.getAttribute("class") ?? "").slice(0, 60)}"> ${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight} (${ox}/${oy})`);
    }
  }
  const pageWidth = document.documentElement.clientWidth;
  const overflowing = sections.filter((s) => s.getBoundingClientRect().right > pageWidth + 2).map((s) => s.id);
  const supTooSmall = Array.from(root.querySelectorAll("sup")).filter((s) => parseFloat(cs(s).fontSize) < 8).length;
  return {
    band: root.getAttribute("data-tbr-band"),
    hiddenChrome,
    sections: sections.length,
    sectionsWithoutBreak,
    headingsWithoutAvoid,
    headings: headings.length,
    rowsWithoutAvoid,
    rows: rows.length,
    theadNotHeaderGroup,
    clipped,
    overflowing,
    supTooSmall,
  };
}

/** Page objects in a Chromium PDF are written uncompressed: count `/Type /Page` (not `/Pages`). */
function pdfPageCount(pdf: Buffer): number {
  const text = pdf.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page(?![s\w])/g);
  return matches ? matches.length : 0;
}

test.describe("TBR print (G28-D)", () => {
  test("/tbr/demo?band=D under print media: chrome hidden, section breaks, whole rows, nothing clipped, sane PDF page count", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "page.pdf() is Chromium-only");
    await page.setViewportSize({ width: 794, height: 1123 }); // A4 at 96 dpi
    await page.goto(REPORT_PATH, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT });
    await expect(page.locator("[data-tbr-version]")).toBeVisible({ timeout: PAGE_TIMEOUT });
    await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());

    await page.emulateMedia({ media: "print" });
    const audit = await page.evaluate(auditPrint);
    console.log(`[tbr-print] band ${audit.band} · sections ${audit.sections} · headings ${audit.headings} · rows ${audit.rows} · clipped ${audit.clipped.length} · overflowing ${audit.overflowing.length}`);

    // Collect every defect first so one run reports the whole picture.
    const problems: string[] = [];
    if (audit.band !== "D") problems.push(`band: expected D (proxy rewrite → static variant), got ${audit.band}`);
    if (audit.sections < 15) problems.push(`sections: expected the 16-section sequence, got ${audit.sections}`);
    for (const [k, v] of Object.entries(audit.hiddenChrome)) if (!v) problems.push(`chrome still visible on paper: ${k}`);
    if (audit.sectionsWithoutBreak.length) problems.push(`sections without break-before: page (spec § 5): ${audit.sectionsWithoutBreak.join(", ")}`);
    if (audit.headingsWithoutAvoid) problems.push(`orphan-able headings (break-after ≠ avoid): ${audit.headingsWithoutAvoid}/${audit.headings}`);
    if (audit.rowsWithoutAvoid) problems.push(`table rows that may split: ${audit.rowsWithoutAvoid}/${audit.rows}`);
    if (audit.theadNotHeaderGroup) problems.push(`theads not table-header-group: ${audit.theadNotHeaderGroup}`);
    if (audit.clipped.length) problems.push(`clipped scroll regions:\n  ${audit.clipped.join("\n  ")}`);
    if (audit.overflowing.length) problems.push(`sections wider than the sheet: ${audit.overflowing.join(", ")}`);
    if (audit.supTooSmall) problems.push(`footnote superscripts < 8 px: ${audit.supTooSmall}`);

    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    const pages = pdfPageCount(pdf);
    console.log(`[tbr-print] pdf ${Math.round(pdf.byteLength / 1024)} KB · ${pages} pages`);
    if (pages < 12 || pages > 120) problems.push(`pdf page count out of range (12–120): ${pages}`);

    expect(problems, problems.join("\n")).toEqual([]);
  });
});
