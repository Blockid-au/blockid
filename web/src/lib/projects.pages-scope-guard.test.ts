// S18-B — static guard: every SERVER PAGE under `src/app/(app)/(founder)`
// that touches the project-scoped startup record resolves the caller's
// role + the OWNER's data key through `getProjectScope`, never through the
// legacy `getProjectIdFromRequest()` + `user.email` / `user.id` pair.
//
// Why: S18-A converted the API routes, but the pages kept rendering EMPTY
// for an accepted member (founder-feature reads keyed on `user.id`) and —
// worse — INSERTED a split `svi_accounts(memberEmail, ownerProjectId)` row
// on first render via `findOrCreateSVIAccount(user.email, projectId)`
// (review P2-3). Colocated page tests pin each converted page; this guard
// stops a NEW page (or a merge) from re-introducing the pattern.
//
// Rules, checked over every `(founder)/**/page.tsx`:
//   A. HARD — no page calls `findOrCreateSVIAccount(user.email` (or any
//      caller-email spelling). A member render must never create an
//      account row under the member. Use `resolveSVIAccountIdForPage()`.
//      No allow-list.
//   B. No page uses `getProjectIdFromRequest(` / `getActiveProjectIdOrNull(`
//      unless allow-listed with a reason.
//   C. No page keys a founder-feature read on the caller: the five
//      `founder-features` readers take a `FounderFeatureScope`, so any
//      `(user, projectId)` / `(user.id` call shape is a regression.
//   D. A page that keys svi_analyses / startup_metrics on the caller's
//      email (`.eq("email", user.email)`) must be allow-listed as
//      deliberately caller-scoped.
//   E. A page that resolves a scope must read its keys through
//      `scope?.dataEmail` / `scope?.ownerUserId` or `pageScopeKeys()` —
//      never `findSVIAccountWithFallback(user.email` etc.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const FOUNDER_ROOT = join(__dirname, "..", "app", "(app)", "(founder)");

/** Pages still on the role-free project resolver — path → reason. */
const LEGACY_PROJECT_ID_ALLOW: Record<string, string> = {
  // (none) — every page was converted in S18-B.
};

/**
 * Pages that key svi_analyses / startup_metrics / scores on the CALLER's
 * email on purpose (per-user, not per-project data) — path → reason.
 */
const CALLER_EMAIL_ALLOW: Record<string, string> = {
  "dashboard/page.tsx":
    "svi_analyses count for the onboarding redirect is per caller (has this user ever run an analysis); scores + user_actions are the caller's own share links / completed actions. Project record reads use dataEmail.",
  "dashboard/svi/page.tsx":
    "scores + user_actions are the caller's own share links / completed actions. Project record reads use dataEmail.",
};

const LEGACY_PROJECT_ID = /\b(getProjectIdFromRequest|getActiveProjectIdOrNull)\s*\(/;
const SCOPE_RESOLVERS = /\b(getProjectScope|projectScopeOrDeny|assertProjectScope)\s*\(/;
const CALLER_EMAIL_ACCOUNT_CREATE = /findOrCreateSVIAccount\(\s*(user|auth|me|caller)\.email/;
const CALLER_EMAIL_KEY = [
  /findSVIAccountWithFallback\(\s*(user|auth|me|caller)\.email/,
  /findLatestAnalysisWithFallback\(\s*(user|auth|me|caller)\.email/,
  /\.eq\(\s*["']email["']\s*,\s*(user|auth|me|caller)\.email\s*\)/,
];
const FOUNDER_FEATURE_READERS =
  /\b(getGtmStrategy|listCompetitors|listTeamMembers|listPricingTiers|listRoadmapMilestones)\s*\(\s*(user\b|\{\s*ownerUserId\s*:\s*user\.id)/;
const FOUNDER_FEATURES_IMPORT = /from\s+["']@\/lib\/founder-features["']/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name === "page.tsx") out.push(full);
  }
  return out;
}

function rel(file: string): string {
  return relative(FOUNDER_ROOT, file).split(sep).join("/");
}

const pages = walk(FOUNDER_ROOT).map((file) => ({
  path: rel(file),
  src: readFileSync(file, "utf8"),
}));

function usesCallerEmailKey(src: string): boolean {
  return CALLER_EMAIL_KEY.some((re) => re.test(src));
}

describe("S18-B pages scope guard — src/app/(app)/(founder)/**/page.tsx", () => {
  it("finds the founder pages", () => {
    expect(pages.length).toBeGreaterThan(50);
  });

  it("A. no page find-or-creates an svi_accounts row under the caller's email (split-account class, review P2-3)", () => {
    const offenders = pages
      .filter((p) => CALLER_EMAIL_ACCOUNT_CREATE.test(p.src))
      .map((p) => p.path);
    expect(
      offenders,
      "use resolveSVIAccountIdForPage(scope, user) from @/lib/project-members/page-scope — owner find-or-creates, member reads only",
    ).toEqual([]);
  });

  it("B. no page uses the role-free project resolver unless allow-listed with a reason", () => {
    const offenders = pages
      .filter((p) => LEGACY_PROJECT_ID.test(p.src) && !(p.path in LEGACY_PROJECT_ID_ALLOW))
      .map((p) => p.path);
    expect(
      offenders,
      "resolve `const scope = await getProjectScope(\"viewer\")` and derive keys with pageScopeKeys(scope, user)",
    ).toEqual([]);
  });

  it("C. founder-feature readers are keyed on the project scope, never on the caller", () => {
    const offenders = pages
      .filter((p) => FOUNDER_FEATURES_IMPORT.test(p.src) && FOUNDER_FEATURE_READERS.test(p.src))
      .map((p) => p.path);
    expect(offenders, "pass founderFeatureScope(scope, user) to the reader").toEqual([]);
  });

  it("D. a page that keys startup data on the caller's email is deliberately caller-scoped (allow-listed)", () => {
    const offenders = pages
      .filter((p) => usesCallerEmailKey(p.src) && !(p.path in CALLER_EMAIL_ALLOW))
      .map((p) => p.path);
    expect(
      offenders,
      "read the project record with scope?.dataEmail ?? user.email (pageScopeKeys().dataEmail), or add the page to CALLER_EMAIL_ALLOW with a reason",
    ).toEqual([]);
  });

  it("E. every page that imports founder-features or page-scope resolves a scope", () => {
    const offenders = pages
      .filter(
        (p) =>
          (FOUNDER_FEATURES_IMPORT.test(p.src) || /@\/lib\/project-members\/page-scope/.test(p.src)) &&
          !SCOPE_RESOLVERS.test(p.src),
      )
      .map((p) => p.path);
    expect(offenders, "call getProjectScope(\"viewer\") before deriving keys").toEqual([]);
  });

  it("allow-lists only name pages that exist and still match the pattern they excuse (no stale entries)", () => {
    const byPath = new Map(pages.map((p) => [p.path, p.src]));
    for (const path of Object.keys(LEGACY_PROJECT_ID_ALLOW)) {
      expect(byPath.has(path), `${path} is allow-listed but does not exist`).toBe(true);
      expect(LEGACY_PROJECT_ID.test(byPath.get(path)!), `${path} no longer uses the legacy resolver — drop the entry`).toBe(true);
    }
    for (const path of Object.keys(CALLER_EMAIL_ALLOW)) {
      const src = byPath.get(path);
      expect(src, `${path} is allow-listed but does not exist`).toBeDefined();
      expect(usesCallerEmailKey(src!), `${path} no longer keys on the caller's email — drop the entry`).toBe(true);
      // An excused page must still read the PROJECT record through the scope.
      expect(SCOPE_RESOLVERS.test(src!), `${path} is excused but never resolves a scope`).toBe(true);
      expect(/\bdataEmail\b/.test(src!), `${path} is excused but never uses dataEmail for the project record`).toBe(true);
    }
  });
});
