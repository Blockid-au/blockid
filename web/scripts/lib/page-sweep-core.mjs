// G20-F2 — signed-in page sweep core (spec docs/plans/g20-ready-for-sale-2026-09-20.md § 3 F2).
// Pure helpers shared by scripts/page-sweep.mjs (the CLI driver) and
// tests/live-qa/33-page-sweep.spec.ts (the live-qa lane): route enumeration
// from src/app, persona classification, the console/network allow-list that
// mirrors tests/live-qa/lib/console-guard.ts, the in-page probe, and the
// row/summary shapes. No Playwright import here — the driver injects it.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// ── Allow-list parity with tests/live-qa/lib/console-guard.ts ──────────
// The live-qa guard is TypeScript; the CLI is plain node, so the constants
// are replicated here and scripts/page-sweep.test.mjs pins every one of them
// against the TS source (a drift in either file fails the unit test).
export const CF_GTM_SIGNATURES = ["google_tags_first_party", "developer_id.dYzg1YT"];
export const CF_EMAIL_SIGNATURES = ["email-decode.min.js", "__cf_email__"];
export const CF_EMAIL_SCRIPT_RE = /cloudflare-static\/email-decode\.min\.js/;
export const REACT_418_RE = /Minified React error #418/;
/**
 * Google Identity Services (FedCM) on the sign-in pages logs these when the
 * browser has no Google account — always true in a headless sweep, never a
 * product error (G20-F2, seen on /auth/login and every /auth/login?next= bounce).
 */
export const FEDCM_NOISE_RE = /^(Provider's accounts list is empty|Not signed in with the identity provider)\.?$|^\[GSI_LOGGER\]: FedCM get\(\) rejects with NetworkError|^\[auth:google\] client one_tap (unknown_reason|opt_out_or_no_session)$/;
export const CSP_INLINE_SCRIPT_RE = /(Refused to execute inline script because it violates|Executing inline script violates) the following Content Security Policy directive/;
/**
 * Google Identity Services' OWN report-only CSP on the sign-in button iframe
 * (`frame-ancestors 'self'`): Chromium logs the violation in the embedding
 * page's console when blockid.au frames accounts.google.com, but a report-only
 * policy blocks nothing — the button renders and the popup flow works. It is
 * Google's header, not ours (our enforced `frame-src` already allows the
 * origin, release QA-1 #10), so it is never a page defect (G29-C, seen on
 * /auth/login, /ja/auth/login and every `?next=` bounce). Only the report-only
 * wording for accounts.google.com is tolerated — an ENFORCED "Framing …
 * violates" line still fails the sweep. Mirrored in
 * tests/live-qa/lib/console-guard.ts (parity pinned by scripts/page-sweep.test.mjs).
 */
export const GSI_REPORT_ONLY_FRAME_RE = /^Framing 'https:\/\/accounts\.google\.com\/[^']*' violates the following report-only Content Security Policy directive: "frame-ancestors [^"]*"\. The violation has been logged, but no further action has been taken\.$/;
export const NOISE_URL_RE = /google-analytics\.com|googletagmanager\.com|\/g\/collect|cloudflareinsights|stripe\.com\/b|r\.stripe\.com/;
export const FAILED_RESOURCE_RE = /Failed to load resource: the server responded with a status of (\d+)/;

export const PERSONAS = ["public", "founder", "evaluator", "accelerator", "reseller", "admin"];

/** Playwright's `pageerror` for an aborted RSC prefetch — never a defect. */
export const ABORTED_FAILURE = "net::ERR_ABORTED";

// ── Route enumeration ───────────────────────────────────────────────────

const DYNAMIC_RE = /^\[(?:\.\.\.)?[^\]]+\]$|^\[\[\.\.\.[^\]]+\]\]$/;

/**
 * Walk `appDir` for every page.tsx (skipping `api/`), returning
 * `{ file, route, groups[], dynamic[] }` per page. Route groups `(x)` are
 * stripped from the URL but kept in `groups` for the persona classifier;
 * `dynamic` lists the raw dynamic segments (`[projectId]`, `[...slug]`).
 */
export function enumerateRoutes(appDir) {
  const out = [];
  const walk = (dir, rel) => {
    let entries;
    try {
      entries = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (name === "api" && rel.length === 0) continue;
        if (name.startsWith("_") || name === "node_modules") continue;
        walk(full, [...rel, name]);
      } else if (name === "page.tsx" || name === "page.ts" || name === "page.jsx" || name === "page.js") {
        const groups = rel.filter((s) => /^\(.+\)$/.test(s));
        const segments = rel.filter((s) => !/^\(.+\)$/.test(s) && !/^@/.test(s));
        // Parallel-route slots (`@modal`) and intercepting routes (`(.)x`) are not pages.
        if (rel.some((s) => /^\(\.{1,3}\)/.test(s) || /^\(\.\.\.\)/.test(s))) continue;
        const dynamic = segments.filter((s) => DYNAMIC_RE.test(s));
        out.push({ file: path.relative(appDir, full).split(path.sep).join("/"), route: "/" + segments.join("/"), groups, dynamic });
      }
    }
  };
  walk(appDir, []);
  // Stable order: by route, so the jsonl diff between runs is readable.
  return out.sort((a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : 0));
}

/**
 * Replace dynamic segments with fixture values. `fixtures` maps the raw
 * segment (`"[projectId]"`) — or its bare name (`"projectId"`) — to a value.
 * Returns `null` when any segment is unresolved (the route is then skipped
 * and listed under `skipped_dynamic`).
 */
export function resolveDynamic(route, dynamic, fixtures = {}) {
  if (!dynamic.length) return route;
  let out = route;
  for (const seg of dynamic) {
    const bare = seg.replace(/^\[\[?(?:\.\.\.)?/, "").replace(/\]\]?$/, "");
    const value = fixtures[seg] ?? fixtures[bare];
    if (value === undefined || value === null || value === "") {
      // Optional catch-all `[[...x]]` renders at its parent — drop the segment.
      if (/^\[\[\.\.\./.test(seg)) {
        out = out.replace(`/${seg}`, "");
        continue;
      }
      return null;
    }
    out = out.replace(seg, String(value));
  }
  return out;
}

// ── Persona classification ─────────────────────────────────────────────

/**
 * Persona a route REQUIRES (the lowest persona that reaches it), derived from
 * the route group + the URL prefix; `gate` is the visible page-level
 * entitlement (`requireTierForPage({ feature, minTier })`) or an admin-role
 * check in the page source so the sweep can accept a 302 → /pricing or a
 * redirect home instead of a 200 for a persona that is not entitled.
 *
 *   /admin/**, /dashboard/admin/**             → admin
 *   (reseller) /reseller/**                    → reseller
 *   /workspace/accelerator(s)/**, /lp-report   → accelerator
 *   /workspace/investor/**, /evaluations/**,
 *   /workspace/advisor/**                      → evaluator
 *   every other (app) route                    → founder
 *   everything else                            → public
 */
export function classifyRoute(entry, source = "") {
  const { route, groups } = entry;
  const g = new Set(groups);
  let persona = "public";
  if (route === "/admin" || route.startsWith("/admin/") || route === "/dashboard/admin" || route.startsWith("/dashboard/admin/") || g.has("(admin)")) persona = "admin";
  else if (route === "/reseller" || route.startsWith("/reseller/") || g.has("(reseller)")) persona = "reseller";
  else if (/^\/workspace\/(accelerator|accelerators|lp-report)(\/|$)/.test(route)) persona = "accelerator";
  else if (/^\/workspace\/(investor|evaluations|advisor)(\/|$)/.test(route)) persona = "evaluator";
  else if (g.has("(app)") || route === "/onboarding" || route.startsWith("/workspace") || route.startsWith("/dashboard") || route.startsWith("/checkout")) persona = "founder";

  const gate = detectGate(source);
  if (gate?.adminRole && persona !== "admin") persona = "admin";
  return { persona, gate };
}

/**
 * Parse the visible gate calls out of a page.tsx source. Returns null when
 * none is visible (the page may still gate inside a shared loader).
 */
export function detectGate(source) {
  if (!source) return null;
  const gate = {};
  const m = /requireTierForPage\(\s*\{([\s\S]*?)\}\s*\)/.exec(source);
  if (m) {
    const feature = /feature:\s*["']([^"']+)["']/.exec(m[1]);
    const minTier = /minTier:\s*["']([^"']+)["']/.exec(m[1]);
    if (feature) gate.feature = feature[1];
    if (minTier) gate.minTier = minTier[1];
  }
  if (/role\s*!==?\s*["']admin["']|isAdmin\b|requireAdmin\b|assertAdmin\b|adminGate\b|requireSiteAdmin\b/.test(source)) gate.adminRole = true;
  if (/requireResellerAdmin|requireReseller\b/.test(source)) gate.reseller = true;
  if (/redirect\(/.test(source)) gate.redirects = true;
  return Object.keys(gate).length ? gate : null;
}

/**
 * Personas that should VISIT a route: its own persona, plus the founder for
 * evaluator/accelerator routes (they must answer a clean redirect / card, not
 * a crash) and the public (anonymous) persona for every signed-in route (307
 * → /auth/login is the contract). `--persona` narrows this list.
 */
export function personasFor(persona, mode = "own") {
  if (mode === "own") return [persona];
  if (persona === "public") return ["public"];
  const set = new Set([persona, "public"]);
  if (persona === "evaluator" || persona === "accelerator") set.add("founder");
  return [...set];
}

// ── In-page probe ───────────────────────────────────────────────────────

/**
 * Serialised into `page.evaluate` — no closures over node scope. Returns the
 * DOM facts the sweep asserts on. `overflow` is measured by the caller at
 * 375 px (see measureOverflow) so this stays viewport-independent.
 */
export function probeScript() {
  const h1s = Array.from(document.querySelectorAll("h1"));
  const imgs = Array.from(document.querySelectorAll("img"));
  const missingAlt = imgs.filter((img) => !img.hasAttribute("alt")).map((img) => (img.getAttribute("src") || "").slice(0, 120));
  const gateMarkers = Array.from(document.querySelectorAll("[data-testid]"))
    .map((el) => el.getAttribute("data-testid") || "")
    .filter((id) => /gate|locked|paywall|not-offered|upgrade/.test(id));
  // Every route error.tsx marks its rendered branch (src/app/error-boundaries.test.ts).
  const errorBoundary = !!document.querySelector('[data-testid="error-boundary"], [data-error-boundary]');
  const bodyText = (document.body?.innerText || "").slice(0, 4000);
  // Next.js' built-in client-exception page (no app boundary mounted). Prose
  // such as "Application errors (1 h)" on /status is legitimate copy.
  const errorText = /Application error: a client-side exception has occurred|Unhandled Runtime Error/.test(bodyText);
  return {
    title: document.title,
    h1_count: h1s.length,
    h1: h1s.map((h) => (h.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120)),
    has_main: !!document.querySelector("main, [role='main']"),
    img_count: imgs.length,
    missing_alt: missingAlt,
    gate_markers: [...new Set(gateMarkers)],
    error_boundary: errorBoundary || errorText,
    body_chars: (document.body?.innerText || "").length,
  };
}

/** Serialised into `page.evaluate` after the viewport is set to 375 px. */
export function overflowScript() {
  const se = document.scrollingElement || document.documentElement;
  const inScroller = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") return true;
    }
    return false;
  };
  const wide = Array.from(document.querySelectorAll("body *"))
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.right > window.innerWidth + 1 && getComputedStyle(el).position !== "fixed" && !inScroller(el);
    })
    .slice(0, 6)
    .map((el) => ({ tag: el.tagName.toLowerCase(), testid: el.getAttribute("data-testid"), cls: String(el.className || "").slice(0, 80), right: Math.round(el.getBoundingClientRect().right) }));
  return { innerWidth: window.innerWidth, scrollWidth: se.scrollWidth, wide };
}

// ── G26 light-template check ────────────────────────────────────────────
// docs/plans/g26-light-template-redesign-2026-09-21.md § 3: every page renders
// light — the computed background of <body> and of the first `main > section`
// (or <main>) must have relative luminance > LIGHT_MIN_BG and the body text
// colour < LIGHT_MAX_TEXT. Measured in the browser (lightScript), judged here.

export const LIGHT_MIN_BG = 0.85;
export const LIGHT_MAX_TEXT = 0.35;

/**
 * Serialised into `page.evaluate`. Every colour is normalised through a 1×1
 * canvas so `color-mix(in oklab …)` / `oklch()` values (Tailwind v4 opacity
 * modifiers — the G26-R lesson) come back as sRGB + alpha, then composited
 * over the ancestor chain down to the white canvas, so a `bg-surface/95`
 * band or a transparent <main> reads as what the eye sees.
 */
export function lightScript() {
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const parse = (css) => {
    if (!ctx || !css || css === "transparent") return [0, 0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, under) => {
    const a = top[3];
    return [Math.round(top[0] * a + under[0] * (1 - a)), Math.round(top[1] * a + under[1] * (1 - a)), Math.round(top[2] * a + under[2] * (1 - a)), 1];
  };
  // Composite the element's background over its ancestors (outermost first) on the white canvas.
  const bgOf = (el) => {
    const chain = [];
    for (let n = el; n; n = n.parentElement) chain.push(n);
    let out = [255, 255, 255, 1];
    let imageOn = null;
    for (const n of chain.reverse()) {
      const cs = getComputedStyle(n);
      out = over(parse(cs.backgroundColor), out);
      if (cs.backgroundImage && cs.backgroundImage !== "none") imageOn = n.tagName.toLowerCase();
    }
    return { rgb: out.slice(0, 3), image: imageOn };
  };
  const body = document.body;
  const section = document.querySelector("main > section") || document.querySelector("main, [role='main']") || body;
  const bodyBg = bgOf(body);
  const sectionBg = bgOf(section);
  const text = over(parse(getComputedStyle(body).color), [...bodyBg.rgb, 1]).slice(0, 3);
  return {
    body_bg: bodyBg.rgb,
    section_bg: sectionBg.rgb,
    section: section === body ? "body" : section.tagName.toLowerCase() + (section.id ? `#${section.id}` : ""),
    body_color: text,
    bg_image: bodyBg.image || sectionBg.image,
  };
}

/** WCAG 2.x relative luminance of an sRGB triplet (0–255 each) → 0 (black) … 1 (white). */
export function relativeLuminance(rgb) {
  if (!Array.isArray(rgb) || rgb.length < 3) return null;
  const lin = (c) => {
    const v = Math.min(255, Math.max(0, Number(c))) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

/**
 * Judge one lightScript() result → defect names (empty = light template holds).
 * `light_body_bg (0.12)` / `light_section_bg (0.12)` when a ground is darker
 * than LIGHT_MIN_BG; `light_text (0.80)` when the body text is lighter than
 * LIGHT_MAX_TEXT (white-on-something, or grey-on-grey).
 */
export function judgeLight(light, { minBg = LIGHT_MIN_BG, maxText = LIGHT_MAX_TEXT } = {}) {
  if (!light) return [];
  const out = [];
  const fmt = (n) => n.toFixed(2);
  const bodyBg = relativeLuminance(light.body_bg);
  const sectionBg = relativeLuminance(light.section_bg);
  const text = relativeLuminance(light.body_color);
  if (bodyBg !== null && bodyBg <= minBg) out.push(`light_body_bg (${fmt(bodyBg)})`);
  if (sectionBg !== null && sectionBg <= minBg) out.push(`light_section_bg (${fmt(sectionBg)})`);
  if (text !== null && text >= maxText) out.push(`light_text (${fmt(text)})`);
  return out;
}

// ── Console / request filtering ─────────────────────────────────────────

/** Requests that never count: analytics beacons, favicon, cancelled prefetches. */
export function isNoiseRequest(url, failureText = "") {
  if (NOISE_URL_RE.test(url)) return true;
  if (/\/favicon\.ico$/.test(url)) return true;
  if (failureText === ABORTED_FAILURE) return true;
  return false;
}

/** Same-origin ≥ 400 or network-failed requests, minus noise and RSC data fetches. */
export function isReportableRequest(req, siteOrigin) {
  if (isNoiseRequest(req.url, req.failure ?? "")) return false;
  if (req.url.includes("/_next/data/") || /[?&]_rsc=/.test(req.url)) return false;
  let origin;
  try {
    origin = new URL(req.url).origin;
  } catch {
    return false;
  }
  if (siteOrigin && origin !== siteOrigin) return false;
  return req.status === null || req.status >= 400;
}

/**
 * Split console entries into `{errors, allowed}` with the console-guard
 * rules: ≤ 2 CSP inline-script refusals while the HTML carries the
 * Cloudflare tag gateway; the email-decode script refusal + React #418 while
 * the HTML carries email obfuscation; a "Failed to load resource" echo whose
 * request is itself allowed.
 */
export function filterConsole(entries, { htmlHasCfInjection = false, htmlHasCfEmail = false, allowedRequestUrls = new Set(), streamedRedirect = false } = {}) {
  const errors = [];
  const allowed = [];
  let csp = 0;
  for (const e of entries) {
    // Streamed redirect (redirect() after loading.tsx flushed): Next's
    // <meta http-equiv=refresh> works, but the two inline scripts it emits
    // alongside are nonce-less and refused — a documented framework artefact
    // (docs/ops/page-sweep.md § 6), not a page defect.
    if ((htmlHasCfInjection || streamedRedirect) && e.type === "console" && CSP_INLINE_SCRIPT_RE.test(e.text) && csp < 2) {
      csp += 1;
      allowed.push(e);
      continue;
    }
    if (htmlHasCfEmail && ((e.type === "console" && CF_EMAIL_SCRIPT_RE.test(e.text)) || (e.type === "pageerror" && REACT_418_RE.test(e.text)))) {
      allowed.push(e);
      continue;
    }
    if (e.type === "console" && FEDCM_NOISE_RE.test(e.text.trim())) {
      allowed.push(e);
      continue;
    }
    if (e.type === "console" && GSI_REPORT_ONLY_FRAME_RE.test(e.text.trim())) {
      allowed.push(e);
      continue;
    }
    const m = FAILED_RESOURCE_RE.exec(e.text);
    if (e.type === "console" && m && e.url && (allowedRequestUrls.has(e.url) || isNoiseRequest(e.url))) {
      allowed.push(e);
      continue;
    }
    errors.push(e);
  }
  return { errors, allowed };
}

// ── Expectations ────────────────────────────────────────────────────────

/**
 * What a visit must satisfy for it to be defect-free. The status contract:
 *   public persona on a signed-in route → the final URL is /auth/login (307)
 *   entitled persona → 200 on the route itself (or a documented redirect)
 *   un-entitled persona (founder on an evaluator route, Free on a gated page)
 *     → 200 with a gate marker, a 402, or a redirect to /pricing|/workspace|/dashboard|/onboarding
 */
export function judge(row, { exceptions = {}, light = true } = {}) {
  const defects = [];
  const ex = exceptions[row.route] ?? null;
  const finalPath = safePath(row.final_url);
  // A `visit` override carries a query string; compare pathnames only.
  const visitedPath = String(row.path ?? "").split("?")[0].replace(/\/+$/, "") || "/";
  const redirected = finalPath !== null && finalPath !== visitedPath;
  const signedInRoute = row.persona_required !== "public";

  if (row.status === null) defects.push("no_response");
  else if (row.status >= 500) defects.push(`http_${row.status}`);
  else if (row.persona === "public" && signedInRoute) {
    if (!/^\/(auth\/login|login|signup|register)$/.test(finalPath ?? "")) defects.push(`anon_not_bounced_to_login (${finalPath ?? row.status})`);
  } else if (row.status === 404) {
    if (!(ex && ex.allow404)) defects.push("http_404");
  } else if (row.status === 402) {
    if (!row.gate_markers?.length && !row.has_main) defects.push("402_without_gate_card");
  } else if (redirected && signedInRoute) {
    // A public route that redirects to another public page is the legacy
    // redirect table at work (/register → /signup, /svi → /startup-index) and
    // is judged on what finally rendered; a signed-in route may only bounce
    // to a shell landing / the pricing gate / login, or a documented target.
    const okRedirect = /^\/(pricing|workspace|dashboard|onboarding|auth\/login|login|reseller|admin|investor|accelerator)(\/|$)/.test(finalPath ?? "") || (ex && ex.redirectTo && finalPath === ex.redirectTo);
    if (!okRedirect) defects.push(`unexpected_redirect (${finalPath})`);
  }

  // Rendering checks apply to whatever finally rendered as a 200 page.
  if (row.status !== null && row.status < 400 && !(row.persona === "public" && signedInRoute)) {
    if (row.error_boundary) defects.push("error_boundary");
    if (!row.has_main) defects.push("no_main");
    if (row.h1_count !== 1 && !(ex && ex.h1 === row.h1_count)) defects.push(`h1_count_${row.h1_count}`);
    if (row.missing_alt?.length) defects.push(`missing_alt_${row.missing_alt.length}`);
    if (row.overflow_375) defects.push("overflow_375");
    // G26: light template — skipped for redirects (judged on the target's own
    // row), non-HTML documents and when the sweep ran with --no-light.
    if (light && !redirected && row.light && (row.content_type == null || /html/.test(row.content_type))) defects.push(...judgeLight(row.light));
  }
  if (row.console_errors?.length) defects.push(`console_errors_${row.console_errors.length}`);
  if (row.failed_requests?.length) defects.push(`failed_requests_${row.failed_requests.length}`);
  return defects;
}

export function safePath(url) {
  if (!url) return null;
  try {
    return new URL(url).pathname.replace(/\/+$/, "") || "/";
  } catch {
    return null;
  }
}

// ── Summary ─────────────────────────────────────────────────────────────

/**
 * @param {Array<Record<string, any>>} rows
 * @param {{ skippedDynamic?: string[], skippedPersonas?: string[] }} [opts]
 */
export function summarize(rows, { skippedDynamic = /** @type {string[]} */ ([]), skippedPersonas = /** @type {string[]} */ ([]) } = {}) {
  const byPersona = {};
  let defects = 0;
  for (const r of rows) {
    const p = (byPersona[r.persona] ??= { pages: 0, ok: 0, gate: 0, redirect: 0, login: 0, defects: 0, ms_total: 0 });
    p.pages += 1;
    p.ms_total += r.ms ?? 0;
    const finalPath = safePath(r.final_url);
    if (finalPath && /^\/(auth\/login|login)$/.test(finalPath) && r.persona === "public" && r.persona_required !== "public") p.login += 1;
    else if (r.status === 402 || (r.gate_markers?.length ?? 0) > 0) p.gate += 1;
    else if (finalPath && finalPath !== r.path) p.redirect += 1;
    else if (r.status === 200) p.ok += 1;
    if (r.defects?.length) {
      p.defects += 1;
      defects += 1;
    }
  }
  return {
    pages: rows.length,
    defects,
    by_persona: byPersona,
    skipped_dynamic: skippedDynamic,
    skipped_personas: skippedPersonas,
    defect_rows: rows.filter((r) => r.defects?.length).map((r) => ({ route: r.route, path: r.path, persona: r.persona, status: r.status, final_url: r.final_url, defects: r.defects })),
  };
}

export function formatSummary(summary) {
  const lines = [`page-sweep: ${summary.pages} visits · ${summary.defects} with defects`];
  for (const [persona, p] of Object.entries(summary.by_persona)) {
    lines.push(`  ${persona.padEnd(12)} pages ${String(p.pages).padStart(3)} · 200 ${String(p.ok).padStart(3)} · gate ${String(p.gate).padStart(3)} · redirect ${String(p.redirect).padStart(3)} · login ${String(p.login).padStart(3)} · defects ${String(p.defects).padStart(3)} · ${Math.round(p.ms_total / Math.max(1, p.pages))} ms/page`);
  }
  if (summary.skipped_dynamic?.length) lines.push(`  skipped (dynamic, no fixture): ${summary.skipped_dynamic.length} — ${summary.skipped_dynamic.slice(0, 6).join(", ")}${summary.skipped_dynamic.length > 6 ? ", …" : ""}`);
  if (summary.skipped_personas?.length) lines.push(`  skipped personas (no storage state): ${summary.skipped_personas.join(", ")}`);
  for (const d of summary.defect_rows) lines.push(`  ✗ ${d.persona.padEnd(11)} ${d.path} → ${d.status ?? "—"} ${d.final_url && safePath(d.final_url) !== d.path ? `(→ ${safePath(d.final_url)}) ` : ""}${d.defects.join(", ")}`);
  return lines.join("\n");
}

// ── CLI args ────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const opts = {
    base: "https://blockid.au",
    persona: null,
    limit: Infinity,
    fixtures: {},
    fixturesFile: null,
    states: {},
    reportOnly: false,
    outDir: null,
    concurrency: 3,
    settleMs: 700,
    timeoutMs: 45_000,
    mode: "own",
    routeFilter: null,
    light: true,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--base") opts.base = String(next()).replace(/\/+$/, "");
    else if (a === "--persona") opts.persona = String(next());
    else if (a === "--limit") opts.limit = Number(next());
    else if (a === "--fixtures") opts.fixturesFile = String(next());
    else if (a === "--state") {
      // --state founder=path/to/state.json (repeatable)
      const [k, ...rest] = String(next()).split("=");
      opts.states[k] = rest.join("=");
    } else if (a === "--report-only") opts.reportOnly = true;
    else if (a === "--out-dir") opts.outDir = String(next());
    else if (a === "--concurrency") opts.concurrency = Math.max(1, Number(next()) || 1);
    else if (a === "--settle") opts.settleMs = Number(next());
    else if (a === "--timeout") opts.timeoutMs = Number(next());
    else if (a === "--all-personas") opts.mode = "all";
    else if (a === "--route") opts.routeFilter = String(next());
    else if (a === "--no-light") opts.light = false;
    else if (a === "--help" || a === "-h") opts.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (opts.fixturesFile) {
    const raw = readFileSync(opts.fixturesFile, "utf8");
    opts.fixtures = JSON.parse(raw);
  }
  return opts;
}

export const USAGE = `page-sweep — render + console + a11y sweep of every page.tsx route, per persona
  node scripts/page-sweep.mjs [--base https://blockid.au] [--persona founder] [--limit 50]
        [--fixtures fixtures.json] [--state founder=state.json --state evaluator=…]
        [--all-personas] [--route /workspace/plan] [--report-only] [--concurrency 3] [--no-light]
  Personas without a --state file are skipped (public needs none).
  Fixtures map a dynamic segment to a value: {"[projectId]":"<uuid>","[slug]":"my-startup"}.
  --no-light skips the G26 light-template check (body / first main section luminance > 0.85, body text < 0.35).
  Writes content/reports/page-sweep.jsonl + page-sweep-latest.json; exit 1 on any defect unless --report-only.`;

// ── Driver: one visit / the visit plan (Playwright context injected) ────

/**
 * Visit one path in `context`, returning the sweep row. The console / request
 * listeners are attached before navigation and detached after the probes so
 * a long-lived page can be reused.
 */
export async function sweepOne(context, { route, path: urlPath, persona, personaRequired, gate }, opts) {
  const page = await context.newPage();
  const consoleEntries = [];
  const failed = [];
  let htmlHasCfInjection = false;
  let htmlHasCfEmail = false;
  const siteOrigin = new URL(opts.base).origin;
  const onConsole = (msg) => {
    if (msg.type() !== "error") return;
    consoleEntries.push({ type: "console", text: msg.text().slice(0, 400), url: msg.location()?.url });
  };
  const onPageError = (err) => consoleEntries.push({ type: "pageerror", text: String(err?.message ?? err).slice(0, 400) });
  const onRequestFailed = (req) => {
    const failure = req.failure()?.errorText ?? null;
    if (isNoiseRequest(req.url(), failure ?? "")) return;
    failed.push({ method: req.method(), url: req.url(), status: null, failure });
  };
  const onResponse = (res) => {
    const req = res.request();
    if (req.resourceType() === "document" && res.status() < 500) {
      void res
        .text()
        .then((body) => {
          if (CF_GTM_SIGNATURES.some((s) => body.includes(s))) htmlHasCfInjection = true;
          if (CF_EMAIL_SIGNATURES.some((s) => body.includes(s))) htmlHasCfEmail = true;
        })
        .catch(() => {});
    }
    if (res.status() < 400) return;
    failed.push({ method: req.method(), url: res.url(), status: res.status(), failure: null });
  };
  page.on("console", onConsole);
  page.on("pageerror", onPageError);
  page.on("requestfailed", onRequestFailed);
  page.on("response", onResponse);

  const t0 = Date.now();
  const row = { ts: new Date().toISOString(), route, path: urlPath, persona, persona_required: personaRequired, gate: gate ?? null, status: null, final_url: null, streamed_redirect: null, h1_count: 0, h1: [], console_errors: [], failed_requests: [], overflow_375: false, overflow_wide: [], missing_alt: [], has_main: false, gate_markers: [], error_boundary: false, title: null, content_type: null, light: null, ms: 0, defects: [] };
  try {
    let res = await page.goto(`${opts.base}${urlPath}`, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });
    if (res && (res.status() === 502 || res.status() === 503 || res.status() === 504)) {
      // Deploy swap — one retry after a pause, like tests/live-qa/lib/api.ts.
      await page.waitForTimeout(8_000);
      res = await page.goto(`${opts.base}${urlPath}`, { waitUntil: "domcontentloaded", timeout: opts.timeoutMs });
    }
    row.status = res ? res.status() : null;
    row.content_type = res ? (res.headers()["content-type"] ?? null) : null;
    await page.waitForTimeout(opts.settleMs);
    // A `redirect()` thrown after the route's loading.tsx shell streamed
    // cannot be a 307 any more — Next inserts <meta id="__next-page-redirect"
    // http-equiv="refresh" content="1;url=…"> (1 s for a temporary redirect).
    // Follow it so the row records the destination, not the skeleton.
    const streamedRedirect = await page.evaluate(() => document.querySelector("meta#__next-page-redirect")?.getAttribute("content") ?? null).catch(() => null);
    if (streamedRedirect) {
      row.streamed_redirect = streamedRedirect;
      const before = page.url();
      await page.waitForURL((u) => u.toString() !== before, { timeout: 6_000 }).catch(() => {});
      await page.waitForTimeout(opts.settleMs);
    }
    row.final_url = page.url();
    let probe = await page.evaluate(probeScript).catch(() => null);
    // A client-side FeatureGate renders nothing (not even the page heading)
    // until /api/entitlement/me answers — give it one more settle before
    // calling the page heading-less.
    if (probe && probe.h1_count === 0 && !probe.gate_markers.length && !probe.error_boundary) {
      await page.waitForTimeout(Math.max(1_500, opts.settleMs * 2));
      probe = (await page.evaluate(probeScript).catch(() => null)) ?? probe;
    }
    if (probe) Object.assign(row, { title: probe.title, h1_count: probe.h1_count, h1: probe.h1, has_main: probe.has_main, missing_alt: probe.missing_alt, gate_markers: probe.gate_markers, error_boundary: probe.error_boundary });
    if (row.status !== null && row.status < 400 && opts.light !== false) {
      row.light = await page.evaluate(lightScript).catch(() => null);
    }
    if (row.status !== null && row.status < 400) {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(150);
      const ov = await page.evaluate(overflowScript).catch(() => null);
      if (ov) {
        row.overflow_375 = ov.scrollWidth > ov.innerWidth + 1 || ov.wide.length > 0;
        row.overflow_wide = ov.wide;
      }
    }
  } catch (e) {
    consoleEntries.push({ type: "pageerror", text: `navigation: ${String(e?.message ?? e).slice(0, 300)}` });
  } finally {
    row.ms = Date.now() - t0;
    page.off("console", onConsole);
    page.off("pageerror", onPageError);
    page.off("requestfailed", onRequestFailed);
    page.off("response", onResponse);
    await page.close().catch(() => {});
  }
  const failedRequests = failed.filter((f) => isReportableRequest(f, siteOrigin) && !(htmlHasCfEmail && f.status === null && CF_EMAIL_SCRIPT_RE.test(f.url)));
  // The document's own 4xx (a 402 gate, a 404) is the status — not a failed request.
  // `opts.allowRequests`: [{ pathRe, status? }] the caller expects to fail on
  // this sweep (e.g. the lane's own rate — /api/svi/phase-progress 429 when one
  // seat opens > 20 workspace pages a minute, the `svi` bucket).
  const allowedByCaller = (f) => (opts.allowRequests ?? []).some((a) => a.pathRe.test(safePath(f.url) ?? "") && (a.status === undefined || a.status === f.status));
  row.failed_requests = failedRequests.filter((f) => !(f.url === `${opts.base}${urlPath}` || f.url === row.final_url) && !allowedByCaller(f));
  const allowedRequestUrls = new Set(failed.filter((f) => !failedRequests.includes(f)).map((f) => f.url));
  for (const f of failedRequests) if (!row.failed_requests.includes(f)) allowedRequestUrls.add(f.url);
  row.console_errors = filterConsole(consoleEntries, { htmlHasCfInjection, htmlHasCfEmail, allowedRequestUrls, streamedRedirect: !!row.streamed_redirect }).errors;
  row.defects = judge(row, { exceptions: opts.exceptions ?? {}, light: opts.light !== false });
  return row;
}

/** Plan the (path, persona) visits from the route table. */
export function planVisits(routes, opts) {
  const visits = [];
  const skippedDynamic = [];
  for (const entry of routes) {
    if (opts.routeFilter && !entry.route.includes(opts.routeFilter)) continue;
    // A route that needs a query string to render (e.g. /checkout/review?plan=…)
    // is visited at the documented `visit` path from the exceptions map.
    const visitOverride = opts.exceptions?.[entry.route]?.visit;
    const urlPath = typeof visitOverride === "string" ? visitOverride : resolveDynamic(entry.route, entry.dynamic, opts.fixtures);
    if (urlPath === null) {
      skippedDynamic.push(entry.route);
      continue;
    }
    for (const persona of personasFor(entry.persona, opts.mode)) {
      if (opts.persona && persona !== opts.persona) continue;
      visits.push({ route: entry.route, path: urlPath, persona, personaRequired: entry.persona, gate: entry.gate });
    }
  }
  return { visits: visits.slice(0, opts.limit), skippedDynamic };
}

