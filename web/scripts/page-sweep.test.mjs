// G20-F2 — page-sweep core (scripts/lib/page-sweep-core.mjs) + driver planning
// (scripts/page-sweep.mjs) pinned against a fake src/app tree. Guards:
//   - a route group `(founder)` leaking into the URL, an `api/` route or a
//     parallel slot `@modal` counted as a page;
//   - a dynamic segment swept without a fixture (it would 404 and look broken);
//   - the persona classifier sending an admin page to the founder sweep;
//   - the allow-list drifting from tests/live-qa/lib/console-guard.ts (every
//     replicated constant must appear verbatim in the TS source);
//   - a 402 gate card or a /pricing redirect judged as a defect, an anonymous
//     visit to a signed-in route NOT bouncing to /auth/login judged as fine;
//   - the summary's login column counting /auth/login itself.

import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CF_EMAIL_SCRIPT_RE,
  CF_EMAIL_SIGNATURES,
  CF_GTM_SIGNATURES,
  CSP_INLINE_SCRIPT_RE,
  FAILED_RESOURCE_RE,
  FEDCM_NOISE_RE,
  NOISE_URL_RE,
  PERSONAS,
  REACT_418_RE,
  classifyRoute,
  detectGate,
  enumerateRoutes,
  filterConsole,
  formatSummary,
  isReportableRequest,
  judge,
  parseArgs,
  personasFor,
  planVisits,
  resolveDynamic,
  summarize,
} from "./lib/page-sweep-core.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const GUARD_TS = resolve(HERE, "..", "tests", "live-qa", "lib", "console-guard.ts");

function fakeApp() {
  const root = mkdtempSync(join(tmpdir(), "page-sweep-"));
  const app = join(root, "app");
  const page = (rel, body = "export default function P(){return null}") => {
    mkdirSync(join(app, rel), { recursive: true });
    writeFileSync(join(app, rel, "page.tsx"), body);
  };
  page("");
  page("(marketing)/pricing");
  page("api/health"); // never a page
  page("(app)/(founder)/workspace/plan");
  page("(app)/(founder)/workspace/equity/cap-table", 'await requireTierForPage({ feature: "cap_table.access", minTier: "growth", fromPath: "/workspace/equity/cap-table" });');
  page("(app)/(founder)/workspace/investor/dealflow");
  page("(app)/(founder)/workspace/accelerator/cohort");
  page("(app)/(founder)/workspace/evaluations/[evaluationId]");
  page("(app)/(founder)/workspace/projects/[slug]/members");
  page("(app)/(founder)/dashboard/admin/usage", 'if (user.role !== "admin") redirect("/dashboard");');
  page("(app)/(admin)/admin/users/[id]");
  page("(app)/(reseller)/reseller/codes");
  page("(app)/@modal/(.)photo"); // intercepting route inside a slot — not a page
  page("docs/[[...slug]]");
  page("vi/pricing");
  return app;
}

describe("core stays importable from a Playwright spec", () => {
  it("scripts/lib/page-sweep-core.mjs never uses import.meta (Playwright's CJS transform refuses it — live run 2026-09-20 03:10 UTC failed on it)", () => {
    const src = readFileSync(resolve(HERE, "lib", "page-sweep-core.mjs"), "utf8");
    expect(src).not.toContain("import.meta");
    expect(src).not.toMatch(/from "\.\/ops-env\.mjs"|@playwright\/test/);
  });
});

describe("enumerateRoutes", () => {
  it("strips route groups, skips api/ + slots, keeps dynamic segments raw", () => {
    const routes = enumerateRoutes(fakeApp());
    const paths = routes.map((r) => r.route);
    expect(paths).toContain("/");
    expect(paths).toContain("/pricing");
    expect(paths).toContain("/workspace/equity/cap-table");
    expect(paths).toContain("/admin/users/[id]");
    expect(paths).toContain("/docs/[[...slug]]");
    expect(paths).not.toContain("/api/health");
    expect(paths.some((p) => p.includes("(") || p.includes("@"))).toBe(false);
    const cap = routes.find((r) => r.route === "/workspace/equity/cap-table");
    expect(cap.groups).toEqual(["(app)", "(founder)"]);
    expect(routes.find((r) => r.route === "/admin/users/[id]").dynamic).toEqual(["[id]"]);
    expect(paths).toEqual([...paths].sort());
  });

  it("the real src/app tree enumerates every page.tsx outside api/ (≥ 360 routes, none under /api)", () => {
    const routes = enumerateRoutes(resolve(HERE, "..", "src", "app"));
    expect(routes.length).toBeGreaterThanOrEqual(360);
    expect(routes.filter((r) => r.route.startsWith("/api/"))).toEqual([]);
    expect(routes.find((r) => r.route === "/workspace/plan")).toBeTruthy();
  });
});

describe("resolveDynamic", () => {
  it("fills fixtures by raw segment or bare name; unresolved → null; optional catch-all drops", () => {
    expect(resolveDynamic("/workspace/evaluations/[evaluationId]", ["[evaluationId]"], { "[evaluationId]": "abc" })).toBe("/workspace/evaluations/abc");
    expect(resolveDynamic("/workspace/projects/[slug]/members", ["[slug]"], { slug: "acme" })).toBe("/workspace/projects/acme/members");
    expect(resolveDynamic("/admin/users/[id]", ["[id]"], {})).toBeNull();
    expect(resolveDynamic("/docs/[[...slug]]", ["[[...slug]]"], {})).toBe("/docs");
    expect(resolveDynamic("/pricing", [], {})).toBe("/pricing");
  });
});

describe("classifyRoute / detectGate", () => {
  const entry = (route, groups = ["(app)", "(founder)"]) => ({ route, groups, dynamic: [] });
  it("maps prefixes + groups to personas", () => {
    expect(classifyRoute(entry("/admin/users", ["(app)", "(admin)"])).persona).toBe("admin");
    expect(classifyRoute(entry("/dashboard/admin/usage")).persona).toBe("admin");
    expect(classifyRoute(entry("/reseller/codes", ["(app)", "(reseller)"])).persona).toBe("reseller");
    expect(classifyRoute(entry("/workspace/accelerator/cohort")).persona).toBe("accelerator");
    expect(classifyRoute(entry("/workspace/lp-report")).persona).toBe("accelerator");
    expect(classifyRoute(entry("/workspace/investor/dealflow")).persona).toBe("evaluator");
    expect(classifyRoute(entry("/workspace/evaluations/[id]")).persona).toBe("evaluator");
    expect(classifyRoute(entry("/workspace/plan")).persona).toBe("founder");
    expect(classifyRoute(entry("/onboarding", ["(app)"])).persona).toBe("founder");
    expect(classifyRoute(entry("/pricing", ["(marketing)"])).persona).toBe("public");
    expect(classifyRoute(entry("/vi/pricing", [])).persona).toBe("public");
  });
  it("reads requireTierForPage feature/minTier and an admin role check", () => {
    expect(detectGate('await requireTierForPage({ feature: "cap_table.access", minTier: "growth", fromPath: "/x" });')).toEqual({ feature: "cap_table.access", minTier: "growth" });
    expect(detectGate('if (user.role !== "admin") redirect("/dashboard");')).toEqual({ adminRole: true, redirects: true });
    expect(detectGate("")).toBeNull();
    // A founder-group page with an admin role check is swept as admin.
    expect(classifyRoute(entry("/workspace/tools"), 'if (user.role !== "admin") redirect("/")').persona).toBe("admin");
  });
  it("personasFor: own persona by default; --all-personas adds public + founder for evaluator/accelerator routes", () => {
    expect(personasFor("founder")).toEqual(["founder"]);
    expect(personasFor("public", "all")).toEqual(["public"]);
    expect(personasFor("evaluator", "all").sort()).toEqual(["evaluator", "founder", "public"]);
    expect(personasFor("admin", "all").sort()).toEqual(["admin", "public"]);
    for (const p of PERSONAS) expect(personasFor(p, "all")).toContain(p);
  });
});

describe("allow-list parity with tests/live-qa/lib/console-guard.ts", () => {
  const ts = readFileSync(GUARD_TS, "utf8");
  it("every replicated constant appears verbatim in the TS guard", () => {
    expect(ts).toContain(`CF_GTM_SIGNATURES = ${JSON.stringify(CF_GTM_SIGNATURES).replace(/,/g, ", ")}`);
    expect(ts).toContain(`CF_EMAIL_SIGNATURES = ${JSON.stringify(CF_EMAIL_SIGNATURES).replace(/,/g, ", ")}`);
    expect(ts).toContain(`CF_EMAIL_SCRIPT_RE = ${CF_EMAIL_SCRIPT_RE.toString()}`);
    expect(ts).toContain(`REACT_418_RE = ${REACT_418_RE.toString()}`);
    expect(ts).toContain(`CSP_INLINE_SCRIPT_RE = ${CSP_INLINE_SCRIPT_RE.toString()}`);
    expect(ts).toContain(NOISE_URL_RE.toString());
    expect(ts).toContain(FAILED_RESOURCE_RE.toString());
    expect(ts).toContain(`FEDCM_NOISE_RE = ${FEDCM_NOISE_RE.toString()}`);
    expect(ts).toContain("/[?&]_rsc=/.test(req.url())");
  });
  it("FedCM 'no Google account' console lines are allowed (headless browsers never have one)", () => {
    const fedcm = { type: "console", text: "Not signed in with the identity provider." };
    const fedcm2 = { type: "console", text: "Provider's accounts list is empty." };
    const fedcm3 = { type: "console", text: "[GSI_LOGGER]: FedCM get() rejects with NetworkError: Error retrieving a token." };
    const fedcm4 = { type: "console", text: "[auth:google] client one_tap unknown_reason" };
    const other = { type: "console", text: "Not signed in with the identity provider. Also something else" };
    const realGis = { type: "console", text: "[auth:google] client one_tap unregistered_origin" };
    expect(filterConsole([fedcm, fedcm2, fedcm3, fedcm4, other, realGis]).errors).toEqual([other, realGis]);
  });
  it("filterConsole applies the guard rules (≤ 2 CSP refusals with the CF tag, #418 with email obfuscation, allowed-request echoes)", () => {
    const csp = { type: "console", text: "Executing inline script violates the following Content Security Policy directive 'script-src'" };
    const r418 = { type: "pageerror", text: "Minified React error #418; visit https://react.dev" };
    const real = { type: "pageerror", text: "TypeError: Cannot read properties of null" };
    const echo = { type: "console", text: "Failed to load resource: the server responded with a status of 402 ()", url: "https://blockid.au/api/x" };
    expect(filterConsole([csp, csp, csp, real], { htmlHasCfInjection: true }).errors).toEqual([csp, real]);
    expect(filterConsole([csp], { htmlHasCfInjection: false }).errors).toEqual([csp]);
    expect(filterConsole([r418], { htmlHasCfEmail: true }).errors).toEqual([]);
    expect(filterConsole([r418], { htmlHasCfEmail: false }).errors).toEqual([r418]);
    expect(filterConsole([echo], { allowedRequestUrls: new Set(["https://blockid.au/api/x"]) }).errors).toEqual([]);
    expect(filterConsole([echo]).errors).toEqual([echo]);
  });
  it("isReportableRequest: same-origin ≥ 400 or failed, minus noise / RSC / cross-origin", () => {
    const o = "https://blockid.au";
    expect(isReportableRequest({ url: `${o}/api/credits`, status: 500 }, o)).toBe(true);
    expect(isReportableRequest({ url: `${o}/api/credits`, status: null, failure: "net::ERR_FAILED" }, o)).toBe(true);
    expect(isReportableRequest({ url: `${o}/api/credits`, status: null, failure: "net::ERR_ABORTED" }, o)).toBe(false);
    expect(isReportableRequest({ url: `${o}/workspace?_rsc=abc`, status: 404 }, o)).toBe(false);
    expect(isReportableRequest({ url: `${o}/api/index/svi?bucket=overall&_rsc=abc`, status: 400 }, o)).toBe(false);
    expect(isReportableRequest({ url: "https://www.google-analytics.com/g/collect", status: 500 }, o)).toBe(false);
    expect(isReportableRequest({ url: "https://cdn.example.com/x.js", status: 404 }, o)).toBe(false);
    expect(isReportableRequest({ url: `${o}/api/ok`, status: 200 }, o)).toBe(false);
  });
});

describe("judge", () => {
  const base = { route: "/workspace/plan", path: "/workspace/plan", persona: "founder", persona_required: "founder", status: 200, final_url: "https://blockid.au/workspace/plan", h1_count: 1, has_main: true, missing_alt: [], overflow_375: false, console_errors: [], failed_requests: [], gate_markers: [], error_boundary: false };
  it("a clean 200 has no defects; each check names its defect", () => {
    expect(judge(base)).toEqual([]);
    expect(judge({ ...base, h1_count: 2 })).toEqual(["h1_count_2"]);
    expect(judge({ ...base, h1_count: 0 })).toEqual(["h1_count_0"]);
    expect(judge({ ...base, has_main: false })).toEqual(["no_main"]);
    expect(judge({ ...base, missing_alt: ["/a.png"] })).toEqual(["missing_alt_1"]);
    expect(judge({ ...base, overflow_375: true })).toEqual(["overflow_375"]);
    expect(judge({ ...base, error_boundary: true })).toEqual(["error_boundary"]);
    expect(judge({ ...base, console_errors: [{ type: "pageerror", text: "x" }] })).toEqual(["console_errors_1"]);
    expect(judge({ ...base, failed_requests: [{ url: "x", status: 500 }] })).toEqual(["failed_requests_1"]);
    expect(judge({ ...base, status: 500 })).toContain("http_500");
    expect(judge({ ...base, status: 404 })).toContain("http_404");
    expect(judge({ ...base, status: null })).toContain("no_response");
  });
  it("gates: 402 with a card, a /pricing redirect and a documented exception are fine", () => {
    expect(judge({ ...base, status: 402, gate_markers: ["feature-gate-card"] })).toEqual([]);
    expect(judge({ ...base, status: 402, gate_markers: [], has_main: false })).toEqual(["402_without_gate_card"]);
    expect(judge({ ...base, final_url: "https://blockid.au/pricing?feature=x&from=/workspace/plan" })).toEqual([]);
    expect(judge({ ...base, final_url: "https://blockid.au/somewhere-else" })).toEqual(["unexpected_redirect (/somewhere-else)"]);
    // A public route redirecting to another public page is the legacy-redirect table at work, judged on what rendered.
    expect(judge({ ...base, route: "/register", path: "/register", persona: "public", persona_required: "public", final_url: "https://blockid.au/signup" })).toEqual([]);
    expect(judge({ ...base, final_url: "https://blockid.au/samples" }, { exceptions: { "/workspace/plan": { redirectTo: "/samples" } } })).toEqual([]);
    expect(judge({ ...base, h1_count: 2 }, { exceptions: { "/workspace/plan": { h1: 2, reason: "documented" } } })).toEqual([]);
    expect(judge({ ...base, status: 404 }, { exceptions: { "/workspace/plan": { allow404: true } } })).toEqual([]);
  });
  it("anonymous on a signed-in route must land on /auth/login; anonymous on a public route is judged normally", () => {
    expect(judge({ ...base, persona: "public", status: 200, final_url: "https://blockid.au/auth/login?next=%2Fworkspace%2Fplan", h1_count: 1 })).toEqual([]);
    expect(judge({ ...base, persona: "public", status: 200 })).toEqual(["anon_not_bounced_to_login (/workspace/plan)"]);
    expect(judge({ ...base, route: "/pricing", path: "/pricing", persona: "public", persona_required: "public", final_url: "https://blockid.au/pricing" })).toEqual([]);
  });
});

describe("summarize / formatSummary", () => {
  it("counts 200 / gate / redirect / login per persona and lists defect rows; /auth/login itself is not a 'login' bounce", () => {
    const rows = [
      { route: "/workspace/plan", path: "/workspace/plan", persona: "founder", persona_required: "founder", status: 200, final_url: "https://b/workspace/plan", defects: [], ms: 100 },
      { route: "/workspace/equity/cap-table", path: "/workspace/equity/cap-table", persona: "founder", persona_required: "founder", status: 200, final_url: "https://b/pricing?from=x", defects: [], ms: 100 },
      { route: "/workspace/x", path: "/workspace/x", persona: "founder", persona_required: "founder", status: 402, final_url: "https://b/workspace/x", gate_markers: ["feature-gate-card"], defects: [], ms: 100 },
      { route: "/workspace/plan", path: "/workspace/plan", persona: "public", persona_required: "founder", status: 200, final_url: "https://b/auth/login?next=x", defects: [], ms: 50 },
      { route: "/auth/login", path: "/auth/login", persona: "public", persona_required: "public", status: 200, final_url: "https://b/auth/login", defects: [], ms: 50 },
      { route: "/tools/x", path: "/tools/x", persona: "public", persona_required: "public", status: 500, final_url: "https://b/tools/x", defects: ["http_500"], ms: 50 },
    ];
    const s = summarize(rows, { skippedDynamic: ["/a/[id]"], skippedPersonas: ["admin"] });
    expect(s.pages).toBe(6);
    expect(s.defects).toBe(1);
    expect(s.by_persona.founder).toMatchObject({ pages: 3, ok: 1, gate: 1, redirect: 1, login: 0, defects: 0 });
    expect(s.by_persona.public).toMatchObject({ pages: 3, ok: 1, login: 1, defects: 1 });
    expect(s.defect_rows).toEqual([{ route: "/tools/x", path: "/tools/x", persona: "public", status: 500, final_url: "https://b/tools/x", defects: ["http_500"] }]);
    const text = formatSummary(s);
    expect(text).toContain("6 visits · 1 with defects");
    expect(text).toContain("skipped (dynamic, no fixture): 1");
    expect(text).toContain("skipped personas (no storage state): admin");
    expect(text).toContain("✗ public      /tools/x → 500 http_500");
  });
});

describe("parseArgs / planVisits", () => {
  it("parses the CLI flags and reads a fixtures file", () => {
    const dir = mkdtempSync(join(tmpdir(), "page-sweep-args-"));
    const fx = join(dir, "fx.json");
    writeFileSync(fx, JSON.stringify({ "[projectId]": "p1" }));
    const o = parseArgs(["--base", "https://x.test/", "--persona", "founder", "--limit", "5", "--fixtures", fx, "--state", "founder=/tmp/a.json", "--state", "evaluator=/tmp/b=c.json", "--report-only", "--all-personas", "--route", "/workspace"]);
    expect(o).toMatchObject({ base: "https://x.test", persona: "founder", limit: 5, fixtures: { "[projectId]": "p1" }, states: { founder: "/tmp/a.json", evaluator: "/tmp/b=c.json" }, reportOnly: true, mode: "all", routeFilter: "/workspace" });
    expect(() => parseArgs(["--bogus"])).toThrow(/unknown argument/);
  });
  it("plans one visit per (route, persona), skipping unresolved dynamic routes and honouring --persona / --route / --limit", () => {
    const app = fakeApp();
    const routes = enumerateRoutes(app).map((e) => ({ ...e, ...classifyRoute(e, readFileSync(join(app, e.file), "utf8")) }));
    const all = planVisits(routes, { fixtures: { "[evaluationId]": "e1" }, mode: "own", persona: null, limit: Infinity, routeFilter: null });
    expect(all.skippedDynamic).toEqual(["/admin/users/[id]", "/workspace/projects/[slug]/members"]);
    expect(all.visits.find((v) => v.route === "/workspace/evaluations/[evaluationId]")).toMatchObject({ path: "/workspace/evaluations/e1", persona: "evaluator" });
    expect(all.visits.find((v) => v.route === "/docs/[[...slug]]")).toMatchObject({ path: "/docs", persona: "public" });
    const founders = planVisits(routes, { fixtures: {}, mode: "all", persona: "founder", limit: Infinity, routeFilter: "/workspace" });
    expect(founders.visits.map((v) => v.path).sort()).toEqual(["/workspace/accelerator/cohort", "/workspace/equity/cap-table", "/workspace/investor/dealflow", "/workspace/plan"]);
    expect(founders.visits.find((v) => v.path === "/workspace/equity/cap-table").gate).toEqual({ feature: "cap_table.access", minTier: "growth" });
    expect(planVisits(routes, { fixtures: {}, mode: "own", persona: null, limit: 2, routeFilter: null }).visits).toHaveLength(2);
  });
});
