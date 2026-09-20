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
export const CSP_INLINE_SCRIPT_RE = /(Refused to execute inline script because it violates|Executing inline script violates) the following Content Security Policy directive/;
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
  const errorBoundary = !!document.querySelector('[data-testid="error-boundary"], [data-testid="app-error"], [data-error-boundary]');
  const bodyText = (document.body?.innerText || "").slice(0, 4000);
  const errorText = /Something went wrong|Application error|This page could not be found|Internal Server Error|Unhandled Runtime Error/.test(bodyText);
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
  if (req.url.includes("/_next/data/") || req.url.includes("?_rsc=")) return false;
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
export function filterConsole(entries, { htmlHasCfInjection = false, htmlHasCfEmail = false, allowedRequestUrls = new Set() } = {}) {
  const errors = [];
  const allowed = [];
  let csp = 0;
  for (const e of entries) {
    if (htmlHasCfInjection && e.type === "console" && CSP_INLINE_SCRIPT_RE.test(e.text) && csp < 2) {
      csp += 1;
      allowed.push(e);
      continue;
    }
    if (htmlHasCfEmail && ((e.type === "console" && CF_EMAIL_SCRIPT_RE.test(e.text)) || (e.type === "pageerror" && REACT_418_RE.test(e.text)))) {
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
export function judge(row, { exceptions = {} } = {}) {
  const defects = [];
  const ex = exceptions[row.route] ?? null;
  const finalPath = safePath(row.final_url);
  const redirected = finalPath !== null && finalPath !== row.path;
  const signedInRoute = row.persona_required !== "public";

  if (row.status === null) defects.push("no_response");
  else if (row.status >= 500) defects.push(`http_${row.status}`);
  else if (row.persona === "public" && signedInRoute) {
    if (!/^\/(auth\/login|login|signup|register)$/.test(finalPath ?? "")) defects.push(`anon_not_bounced_to_login (${finalPath ?? row.status})`);
  } else if (row.status === 404) {
    if (!(ex && ex.allow404)) defects.push("http_404");
  } else if (row.status === 402) {
    if (!row.gate_markers?.length && !row.has_main) defects.push("402_without_gate_card");
  } else if (redirected) {
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

export function summarize(rows, { skippedDynamic = [], skippedPersonas = [] } = {}) {
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
        [--all-personas] [--route /workspace/plan] [--report-only] [--concurrency 3]
  Personas without a --state file are skipped (public needs none).
  Fixtures map a dynamic segment to a value: {"[projectId]":"<uuid>","[slug]":"my-startup"}.
  Writes content/reports/page-sweep.jsonl + page-sweep-latest.json; exit 1 on any defect unless --report-only.`;
