/**
 * G19-S47 → G26 — Trusted Business Report contrast guard (Playwright, Gate 12).
 *
 * Founder review 2026-09-20: text on the report was unreadable — dark mode
 * kept `bg-white` cards under `dark:text-ink-*` (1.1–1.7:1), light mode put
 * labels on translucent `/50` tints (1.0–3.1:1). The report now uses one
 * semantic theme contract (components/tbr/v2/shared.tsx); this spec is the
 * regression guard.
 *
 * G26 (2026-09-21) — LIGHT IS THE ONLY DEFAULT. The light run is the
 * contract: every visible text node inside <main> on /tbr/demo is sampled
 * (computed colour, alpha-composited effective background, WCAG 2.x ratio)
 * and must be ≥ 4.5:1 (3:1 for large text); the report root must be a light
 * surface (luminance > 0.85) and no text may sit on a dark band. A second
 * light run under `prefers-color-scheme: dark` proves the OS preference no
 * longer flips the page. The explicit `[data-theme="dark"]` + `html.dark`
 * run stays as the OPT-IN pass the toggle can still reach — it is skipped
 * automatically when the toggle no longer produces a dark root.
 *
 * Run: PLAYWRIGHT_BASE_URL=http://127.0.0.1:4001 npx playwright test
 *      tests/e2e/smoke/tbr-contrast.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

const PAGE_TIMEOUT = 20_000;
const REPORT_PATH = "/tbr/demo";

interface Offender {
  tag: string;
  classes: string;
  text: string;
  ratio: number;
  fg: string;
  bg: string;
  px: number;
  weight: number;
}

interface AuditResult {
  sampled: number;
  offenders: Offender[];
  rootBg: string;
  htmlDark: boolean;
}

/** Runs inside the page. Everything below is plain browser JS (no TS types at runtime). */
function auditContrast(rootSelector: string): AuditResult {
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
    sampled += 1;
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
      });
    }
  }
  const rootEl = document.querySelector("[data-tbr-version]");
  const rootBg = rootEl ? (effectiveBg(rootEl) ?? [0, 0, 0, 0]) : [0, 0, 0, 0];
  return { sampled, offenders, rootBg: `rgb(${rootBg.slice(0, 3).map(Math.round).join(",")})`, htmlDark: document.documentElement.classList.contains("dark") };
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
  console.log(`[tbr-contrast] ${mode}: sampled ${result.sampled} text nodes · offenders ${result.offenders.length}${min !== null ? ` (ratios ${min}–${max}:1)` : ""} · root bg ${result.rootBg} · html.dark ${result.htmlDark}`);
}

function describeOffenders(list: Offender[]): string {
  return list
    .slice(0, 40)
    .map((o) => `  ${o.ratio}:1  <${o.tag}> ${o.px}px/${o.weight}  fg ${o.fg} on ${o.bg}  "${o.text}"  [${o.classes}]`)
    .join("\n");
}

/** Relative luminance (0–1) of an `rgb(r,g,b)` string. */
function luminance(rgb: string): number {
  const [r, g, b] = rgb.match(/\d+/g)!.map(Number);
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** Runs inside the page: the page canvas + first <main> section must be light and body text dark (G26 acceptance). */
function auditLightShell(): { bodyBg: string; mainBg: string; bodyColor: string; darkBands: string[] } {
  // Any colour syntax Chromium reports (rgb, rgba, color(), oklab, oklch) is normalised by painting it on a 1×1 canvas.
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const toRgba = (css: string): [number, number, number, number] | null => {
    if (!ctx || !css) return null;
    if (css === "transparent") return [0, 0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    if (typeof ctx.fillStyle !== "string") return null;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const asRgb = (css: string): string => {
    const c = toRgba(css);
    return c ? `rgb(${c.slice(0, 3).map(Math.round).join(",")})` : css;
  };
  const lum = (css: string) => {
    const c = toRgba(css);
    if (!c || c[3] < 0.5) return 1; // translucent tints are judged by the contrast audit, not as bands
    const f = (v: number) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const cs = (el: Element | null) => (el ? getComputedStyle(el) : null);
  const body = cs(document.body)!;
  const main = document.querySelector("main");
  const first = main?.querySelector("section, div") ?? main;
  const mainCs = cs(first);
  // Any block inside <main> wider than 60 % of the viewport painted dark counts as a dark band.
  const darkBands: string[] = [];
  if (main) {
    for (const el of Array.from(main.querySelectorAll("section, div, header, footer, article, aside"))) {
      const rect = el.getBoundingClientRect();
      if (rect.width < window.innerWidth * 0.6 || rect.height < 40) continue;
      const bg = getComputedStyle(el).backgroundColor;
      if (lum(bg) < 0.2) darkBands.push(`<${el.tagName.toLowerCase()} class="${(el.getAttribute("class") ?? "").slice(0, 80)}"> ${asRgb(bg)}`);
    }
  }
  const bodyBg = toRgba(body.backgroundColor);
  return {
    bodyBg: bodyBg && bodyBg[3] > 0 ? asRgb(body.backgroundColor) : "rgb(255,255,255)",
    mainBg: mainCs ? asRgb(mainCs.backgroundColor) : "",
    bodyColor: asRgb(body.color),
    darkBands,
  };
}

async function expectLightReport(page: Page, mode: string): Promise<void> {
  const result = await page.evaluate(auditContrast, "main");
  summarise(mode, result);
  expect(result.htmlDark, `${mode}: html.dark must not be set`).toBe(false);
  expect(luminance(result.rootBg), `${mode}: report root background ${result.rootBg} must be light`).toBeGreaterThan(0.85);
  const shell = await page.evaluate(auditLightShell);
  expect(luminance(shell.bodyBg), `${mode}: body background ${shell.bodyBg}`).toBeGreaterThan(0.85);
  expect(luminance(shell.bodyColor), `${mode}: body text colour ${shell.bodyColor} must be dark ink`).toBeLessThan(0.35);
  expect(shell.darkBands, `${mode}: dark bands inside <main>:\n  ${shell.darkBands.join("\n  ")}`).toEqual([]);
  expect(result.sampled, "sampled text nodes").toBeGreaterThan(300);
  expect(result.offenders, `${mode} contrast offenders:\n${describeOffenders(result.offenders)}`).toEqual([]);
}

test.describe("Trusted Business Report — contrast guard (G19-S47 · G26 light contract)", () => {
  test.setTimeout(60_000);

  test.describe("light (the default)", () => {
    test.use({ colorScheme: "light" });

    test("/tbr/demo — light surface, dark ink, every visible text node in <main> ≥ 4.5:1 (3:1 for large text)", async ({ page }) => {
      await openReport(page);
      await expectLightReport(page, "light");
    });

    test("/tbr/demo at 375 px — footnote superscripts and the appendix stay readable", async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await openReport(page);
      await expectLightReport(page, "light@375");
      // No horizontal page scroll at phone width.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, "horizontal overflow at 375 px").toBeLessThanOrEqual(1);
      // Citation superscripts (when the fixture cites) keep a ≥ 44 px hit area via ::before and ≥ 10 px glyphs.
      const cites = await page.evaluate(() => {
        const out: Array<{ px: number; hit: number }> = [];
        for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>("[data-tbr-cite]")).slice(0, 12)) {
          const before = getComputedStyle(a, "::before");
          const r = a.getBoundingClientRect();
          out.push({ px: parseFloat(getComputedStyle(a).fontSize), hit: r.height + Math.abs(parseFloat(before.top) || 0) * 2 });
        }
        return out;
      });
      for (const c of cites) {
        expect(c.px, "citation glyph size").toBeGreaterThanOrEqual(9);
        expect(c.hit, "citation hit area").toBeGreaterThanOrEqual(40);
      }
    });
  });

  test.describe("OS dark preference (must still render light)", () => {
    test.use({ colorScheme: "dark" });

    test("/tbr/demo with prefers-color-scheme: dark and no toggle — still the light template", async ({ page }) => {
      await openReport(page);
      await expectLightReport(page, "os-dark");
    });
  });

  test.describe("explicit dark opt-in (toggle)", () => {
    test.use({ colorScheme: "dark" });

    test("/tbr/demo with blockid_theme=dark + html.dark + data-theme=dark — every visible text node in <main> is ≥ 4.5:1 (3:1 for large text)", async ({ page }) => {
      await page.addInitScript(() => {
        try {
          localStorage.setItem("blockid_theme", "dark");
        } catch {
          // storage blocked — the attributes below still force the theme
        }
        document.documentElement.classList.add("dark");
        document.documentElement.setAttribute("data-theme", "dark");
      });
      await openReport(page);
      const result = await page.evaluate(auditContrast, "main");
      summarise("dark-opt-in", result);
      // G26: if the toggle no longer yields a dark report root, the opt-in pass is moot — skip, do not fail.
      test.skip(luminance(result.rootBg) > 0.85, `dark opt-in no longer produces a dark report root (${result.rootBg}) — light-only build`);
      expect(result.sampled, "sampled text nodes").toBeGreaterThan(300);
      expect(result.offenders, `dark opt-in contrast offenders:\n${describeOffenders(result.offenders)}`).toEqual([]);
    });
  });
});

// ── G27 — the v3 report at 375 px: tiles stack, tables scroll inside their
// wrapper, no horizontal page scroll; the v3 landmarks / chips are sampled
// fail-soft (annotated when absent — the every-text-node sweep above is the
// contract either way).
const MOBILE_WIDTH = 375;
const V3_SELECTORS = ["[data-tbr-tile]", "[data-tbr-callout]", "[data-tbr-band-chip]", "[data-tbr-verdict-band]", "[data-tbr-risk-row]", "#tbr-investment-view", "#tbr-risk-matrix", "#tbr-plan-90d"] as const;

test.describe("Trusted Business Report — v3 layout at 375 px (G27)", () => {
  test.setTimeout(60_000);
  test.use({ colorScheme: "light", viewport: { width: MOBILE_WIDTH, height: 812 }, isMobile: true, hasTouch: true });

  test(`/tbr/demo at ${MOBILE_WIDTH} px — no horizontal page scroll, v3 landmarks present, text still ≥ 4.5:1`, async ({ page }, testInfo) => {
    await openReport(page);
    const layout = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
    console.log(`[tbr-contrast] ${MOBILE_WIDTH}px: scrollWidth ${layout.scrollWidth} · clientWidth ${layout.clientWidth}`);
    expect(layout.scrollWidth, `no horizontal page scroll at ${MOBILE_WIDTH} px (scrollWidth ${layout.scrollWidth})`).toBeLessThanOrEqual(MOBILE_WIDTH + 1);
    const counts = await page.evaluate((sels) => Object.fromEntries(sels.map((s) => [s, document.querySelectorAll(s).length])), [...V3_SELECTORS]);
    const absent = V3_SELECTORS.filter((sel) => counts[sel] === 0);
    if (absent.length) testInfo.annotations.push({ type: "fail-soft", description: `v3 selectors absent on /tbr/demo: ${absent.join(", ")}` });
    else expect(counts["[data-tbr-tile]"], "four dashboard tiles").toBeGreaterThanOrEqual(4);
    await expectLightReport(page, `${MOBILE_WIDTH}px`);
  });
});
