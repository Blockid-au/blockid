/**
 * G19-S47 → G27 — Trusted Business Report contrast + layout guard
 * (Playwright, Gate 12).
 *
 * Founder review 2026-09-20: text on the report was unreadable — dark mode
 * kept `bg-white` cards under `dark:text-ink-*` (1.1–1.7:1), light mode put
 * labels on translucent `/50` tints (1.0–3.1:1). The report now uses one
 * semantic theme contract (components/tbr/v2/shared.tsx); this spec is the
 * regression guard.
 *
 * G26 made the whole site light-only, so the dark-scheme pass is gone; G27
 * (docs/design/tbr-v3-investor-report-spec.md § 5) added the dashboard
 * tiles, callouts, band chips, the verdict band and the risk-matrix rows,
 * which are sampled here in their own buckets.
 *
 * For /tbr/demo (light) every visible text node inside <main> is sampled:
 * its computed colour, the effective background (walk up to the first
 * opaque background, alpha-composited), the WCAG 2.x ratio
 * `(L1 + 0.05) / (L2 + 0.05)`. Any colour syntax Chromium reports (rgb,
 * rgba, color(), oklab, oklch) is normalised by painting it on a 1×1
 * canvas. Threshold 4.5:1, or 3:1 for large text (≥ 24 px, or ≥ 18.66 px
 * bold). Zero offenders are allowed; a failure prints tag, classes, text
 * and the two colours. Each text node is also tagged with the v3 component
 * it sits in (`[data-tbr-tile]`, `[data-tbr-callout]`, `[data-tbr-band-chip]`,
 * `[data-tbr-verdict-band]`, `[data-tbr-risk-row]`) so the report says
 * which component failed; a selector that is absent on the page is
 * annotated, never a failure — the every-text-node sweep is the contract.
 *
 * A second pass opens /tbr/demo at 375 px and asserts no horizontal page
 * scroll (`document.documentElement.scrollWidth ≤ 376`).
 *
 * Run: PLAYWRIGHT_BASE_URL=http://127.0.0.1:4001 npx playwright test
 *      tests/e2e/smoke/tbr-contrast.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

const PAGE_TIMEOUT = 20_000;
const REPORT_PATH = "/tbr/demo";
const MOBILE_WIDTH = 375;

/** G27 components carrying their own data attribute (owned by components/tbr/v2). */
const V3_SELECTORS = ["[data-tbr-tile]", "[data-tbr-callout]", "[data-tbr-band-chip]", "[data-tbr-verdict-band]", "[data-tbr-risk-row]"] as const;

interface Offender {
  tag: string;
  classes: string;
  text: string;
  ratio: number;
  fg: string;
  bg: string;
  px: number;
  weight: number;
  /** The v3 component selector the node sits in, when any. */
  component: string | null;
}

interface AuditResult {
  sampled: number;
  offenders: Offender[];
  rootBg: string;
  htmlDark: boolean;
  /** Per v3 selector: elements on the page and text nodes sampled inside them. */
  components: Record<string, { elements: number; sampled: number }>;
}

/** Runs inside the page. Everything below is plain browser JS (no TS types at runtime). */
function auditContrast(arg: { root: string; selectors: readonly string[] }): AuditResult {
  const { root: rootSelector, selectors } = arg;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const toRgba = (css: string): [number, number, number, number] | null => {
    if (!ctx || !css || css === "transparent") return css === "transparent" ? [0, 0, 0, 0] : null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    if (typeof ctx.fillStyle !== "string") return null;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    // getImageData is straight alpha over a cleared (transparent) canvas.
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const lum = ([r, g, b]: [number, number, number, number]): number => {
    const f = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const over = (top: [number, number, number, number], bottom: [number, number, number, number]): [number, number, number, number] => {
    const a = top[3];
    return [top[0] * a + bottom[0] * (1 - a), top[1] * a + bottom[1] * (1 - a), top[2] * a + bottom[2] * (1 - a), 1];
  };
  const ratio = (fg: [number, number, number, number], bg: [number, number, number, number]): number => {
    const l1 = lum(fg);
    const l2 = lum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  /** Effective background behind `el`: composite every ancestor's background-color from the root down. */
  const effectiveBg = (el: Element): [number, number, number, number] | null => {
    const chain: Element[] = [];
    for (let e: Element | null = el; e; e = e.parentElement) chain.push(e);
    let acc: [number, number, number, number] = [255, 255, 255, 1];
    const htmlBg = toRgba(getComputedStyle(document.documentElement).backgroundColor);
    const bodyBg = toRgba(getComputedStyle(document.body).backgroundColor);
    if (htmlBg && htmlBg[3] > 0) acc = over(htmlBg, acc);
    if (bodyBg && bodyBg[3] > 0) acc = over(bodyBg, acc);
    for (let i = chain.length - 1; i >= 0; i--) {
      const cs = getComputedStyle(chain[i]);
      if (cs.backgroundImage && cs.backgroundImage !== "none") return null; // gradients: not judged
      const bg = toRgba(cs.backgroundColor);
      if (!bg) return null;
      if (bg[3] > 0) acc = over(bg, acc);
    }
    return acc;
  };
  const components: Record<string, { elements: number; sampled: number }> = {};
  for (const sel of selectors) components[sel] = { elements: document.querySelectorAll(sel).length, sampled: 0 };
  const componentOf = (el: Element): string | null => {
    for (const sel of selectors) if (el.closest(sel)) return sel;
    return null;
  };
  const root = document.querySelector(rootSelector) ?? document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const offenders: Offender[] = [];
  let sampled = 0;
  const seen = new Set<Element>();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.textContent ?? "").trim();
    if (!text) continue;
    const el = node.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    if (el.closest("svg, script, style, noscript, template, [aria-hidden='true'], .sr-only")) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    if (el.getClientRects().length === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    // Hidden by an ancestor (collapsed <details>, overflow-clipped 0×0 wrappers).
    let hidden = false;
    for (let a: Element | null = el; a && a !== document.body; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (acs.display === "none" || acs.visibility === "hidden" || Number(acs.opacity) === 0) {
        hidden = true;
        break;
      }
    }
    if (hidden) continue;
    const fgRaw = toRgba(cs.color);
    const bg = effectiveBg(el);
    if (!fgRaw || !bg) continue;
    const fg = fgRaw[3] < 1 ? over(fgRaw, bg) : fgRaw;
    const px = parseFloat(cs.fontSize) || 16;
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = px >= 24 || (px >= 18.66 && weight >= 700);
    const r = ratio(fg, bg);
    const component = componentOf(el);
    sampled += 1;
    if (component) components[component].sampled += 1;
    if (r < (large ? 3 : 4.5)) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        classes: el.getAttribute("class") ?? "",
        text: text.slice(0, 60),
        ratio: Math.round(r * 100) / 100,
        fg: `rgb(${fg.slice(0, 3).map(Math.round).join(",")})`,
        bg: `rgb(${bg.slice(0, 3).map(Math.round).join(",")})`,
        px,
        weight,
        component,
      });
    }
  }
  const rootEl = document.querySelector("[data-tbr-version]");
  const rootBg = rootEl ? (effectiveBg(rootEl) ?? [0, 0, 0, 0]) : [0, 0, 0, 0];
  return { sampled, offenders, rootBg: `rgb(${rootBg.slice(0, 3).map(Math.round).join(",")})`, htmlDark: document.documentElement.classList.contains("dark"), components };
}

async function openReport(page: Page): Promise<void> {
  await page.goto(REPORT_PATH, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT });
  await expect(page.locator("[data-tbr-version]")).toBeVisible({ timeout: PAGE_TIMEOUT });
  // Fonts + theme class settle before sampling colours.
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
}

/** One summary line per run (always printed — the Gate 12 log keeps the numbers). */
function summarise(mode: string, result: AuditResult): void {
  const ratios = result.offenders.map((o) => o.ratio);
  const min = ratios.length ? Math.min(...ratios) : null;
  const max = ratios.length ? Math.max(...ratios) : null;
  const comps = Object.entries(result.components)
    .map(([sel, c]) => `${sel} ${c.elements > 0 ? `${c.elements} el / ${c.sampled} nodes` : "absent"}`)
    .join(" · ");
  console.log(`[tbr-contrast] ${mode}: sampled ${result.sampled} text nodes · offenders ${result.offenders.length}${min !== null ? ` (ratios ${min}–${max}:1)` : ""} · root bg ${result.rootBg} · html.dark ${result.htmlDark}\n[tbr-contrast] components: ${comps}`);
}

function describeOffenders(list: Offender[]): string {
  return list
    .slice(0, 40)
    .map((o) => `  ${o.ratio}:1  <${o.tag}> ${o.px}px/${o.weight}  fg ${o.fg} on ${o.bg}  "${o.text}"  [${o.classes}]${o.component ? `  in ${o.component}` : ""}`)
    .join("\n");
}

test.describe("Trusted Business Report — contrast + layout guard (G19-S47 / G27)", () => {
  test.setTimeout(60_000);

  test.describe("light (the only template after G26)", () => {
    test.use({ colorScheme: "light" });

    test("/tbr/demo — every visible text node in <main> is ≥ 4.5:1 (3:1 for large text); v3 tiles / callouts / chips / verdict band / risk rows sampled in their own buckets", async ({ page }, testInfo) => {
      await openReport(page);
      const result = await page.evaluate(auditContrast, { root: "main", selectors: V3_SELECTORS });
      summarise("light", result);
      expect(result.htmlDark, "light run must not carry html.dark").toBe(false);
      // The report root must be a light surface (no dark band, G26).
      const [r, g, b] = result.rootBg.match(/\d+/g)!.map(Number);
      expect(0.2126 * r + 0.7152 * g + 0.0722 * b, `report root background ${result.rootBg} should be light`).toBeGreaterThan(200);
      expect(result.sampled, "sampled text nodes").toBeGreaterThan(300);

      // G27 components: a bucket is asserted only when the selector is on the
      // page (the web components land with the parent lane); an absent one is
      // annotated and the every-text-node sweep below stays the contract.
      const absent = V3_SELECTORS.filter((sel) => result.components[sel].elements === 0);
      if (absent.length) testInfo.annotations.push({ type: "fail-soft", description: `v3 selectors absent on /tbr/demo (every-text-node sweep still applies): ${absent.join(", ")}` });
      for (const sel of V3_SELECTORS) {
        const c = result.components[sel];
        if (c.elements === 0) continue;
        expect(c.sampled, `${sel} carries visible text`).toBeGreaterThan(0);
        const inComponent = result.offenders.filter((o) => o.component === sel);
        expect(inComponent, `${sel} contrast offenders:\n${describeOffenders(inComponent)}`).toEqual([]);
      }

      expect(result.offenders, `light-mode contrast offenders:\n${describeOffenders(result.offenders)}`).toEqual([]);
    });
  });

  test.describe(`${MOBILE_WIDTH} px`, () => {
    test.use({ colorScheme: "light", viewport: { width: MOBILE_WIDTH, height: 812 }, isMobile: true, hasTouch: true });

    test(`/tbr/demo at ${MOBILE_WIDTH} px — no horizontal page scroll; text still ≥ 4.5:1`, async ({ page }, testInfo) => {
      await openReport(page);
      const layout = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        innerWidth: window.innerWidth,
      }));
      console.log(`[tbr-contrast] ${MOBILE_WIDTH}px: scrollWidth ${layout.scrollWidth} · clientWidth ${layout.clientWidth} · innerWidth ${layout.innerWidth}`);
      expect(layout.scrollWidth, `no horizontal page scroll at ${MOBILE_WIDTH} px (scrollWidth ${layout.scrollWidth})`).toBeLessThanOrEqual(MOBILE_WIDTH + 1);

      // Spec § 5: tiles stack, tables scroll inside their wrapper — text stays readable.
      const result = await page.evaluate(auditContrast, { root: "main", selectors: V3_SELECTORS });
      summarise(`${MOBILE_WIDTH}px`, result);
      const absent = V3_SELECTORS.filter((sel) => result.components[sel].elements === 0);
      if (absent.length) testInfo.annotations.push({ type: "fail-soft", description: `v3 selectors absent on /tbr/demo at ${MOBILE_WIDTH} px: ${absent.join(", ")}` });
      expect(result.sampled, "sampled text nodes").toBeGreaterThan(100);
      expect(result.offenders, `${MOBILE_WIDTH}px contrast offenders:\n${describeOffenders(result.offenders)}`).toEqual([]);
    });
  });
});
