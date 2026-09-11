// S18-A — static guard: every project-scoped API route resolves the
// caller's ROLE + the OWNER's data key through `getProjectScope` (or its
// HTTP adapters), never through the legacy `getProjectIdFromRequest()` +
// `user.email` pair.
//
// Why a static test: the S17-A IDOR class was "cookie project id + caller
// email" — a member reads/writes THEIR OWN record keyed on the owner's
// project, or (worse, valuation/clevel) a body-supplied email. Colocated
// route tests pin each converted route; this guard stops a NEW route (or a
// merge) from re-introducing the pattern anywhere under src/app/api.
//
// Three rules, checked over every `src/app/api/**/route.ts`:
//   A. HARD — `getProjectIdFromRequest(` together with a caller-email data
//      key (`findOrCreateSVIAccount(user.email`, `.eq("email", user.email)`,
//      …) is never allowed. No allow-list.
//   B. `getProjectIdFromRequest(` at all must be allow-listed with a reason
//      (LEGACY_PROJECT_ID_ALLOW). Empty today — keep it that way.
//   C. A route that resolves a scope but still keys SVI data on the
//      CALLER's email must be a deliberately owner-only action, allow-listed
//      with a reason (OWNER_ONLY_ALLOW).

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const API_ROOT = join(__dirname, "..", "app", "api");

/** Routes still on `getProjectIdFromRequest()` — path → reason. */
const LEGACY_PROJECT_ID_ALLOW: Record<string, string> = {
  // (none) — every project-scoped route was converted in S18-A batches 1–4.
};

/**
 * Routes that resolve a scope AND key SVI data on the caller's own email.
 * Each entry is a deliberately owner-only action: the route refuses every
 * non-owner role first (`ownerOnlyDenied`), so `user.email` === the
 * owner's data key by construction.
 */
const OWNER_ONLY_ALLOW: Record<string, string> = {
  "blockchain/create-token/route.ts":
    "POST mints the project's equity token — owner-only via ownerOnlyDenied(); GET (viewer) uses scope.dataEmail",
};

const LEGACY_PROJECT_ID = /\bgetProjectIdFromRequest\s*\(/;
const SCOPE_RESOLVERS =
  /\b(getProjectScope|projectScopeOrDeny|projectScopeOrRedirect|assertProjectScope)\s*\(/;
const CALLER_EMAIL_KEY = [
  /findOrCreateSVIAccount\(\s*(user|auth|gate\.user)\.email/,
  /findSVIAccountWithFallback\(\s*(user|auth|gate\.user)\.email/,
  /findLatestAnalysisWithFallback\(\s*(user|auth|gate\.user)\.email/,
  /\.eq\(\s*["']email["']\s*,\s*(user|auth|gate\.user)\.email\s*\)/,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name === "route.ts") out.push(full);
  }
  return out;
}

function rel(file: string): string {
  return relative(API_ROOT, file).split(sep).join("/");
}

const routes = walk(API_ROOT).map((file) => ({
  path: rel(file),
  src: readFileSync(file, "utf8"),
}));

function usesCallerEmailKey(src: string): boolean {
  return CALLER_EMAIL_KEY.some((re) => re.test(src));
}

describe("S18-A scope guard — src/app/api/**/route.ts", () => {
  it("finds the API routes", () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it("A. no route pairs getProjectIdFromRequest() with a caller-email data key (S17-A IDOR class)", () => {
    const offenders = routes
      .filter((r) => LEGACY_PROJECT_ID.test(r.src) && usesCallerEmailKey(r.src))
      .map((r) => r.path);
    expect(offenders, "convert to getProjectScope(minRole) + scope.dataEmail").toEqual([]);
  });

  it("B. no route uses getProjectIdFromRequest() unless allow-listed with a reason", () => {
    const offenders = routes
      .filter((r) => LEGACY_PROJECT_ID.test(r.src) && !(r.path in LEGACY_PROJECT_ID_ALLOW))
      .map((r) => r.path);
    expect(
      offenders,
      "use projectScopeOrDeny(minRole) / getProjectScope(minRole); if the route is genuinely role-free, say so in LEGACY_PROJECT_ID_ALLOW",
    ).toEqual([]);
  });

  it("C. a scope-aware route keys SVI data on scope.dataEmail, not the caller's email, unless it is a deliberately owner-only action", () => {
    const offenders = routes
      .filter((r) => SCOPE_RESOLVERS.test(r.src) && usesCallerEmailKey(r.src) && !(r.path in OWNER_ONLY_ALLOW))
      .map((r) => r.path);
    expect(
      offenders,
      "pass scope?.dataEmail ?? user.email (and { callerEmail: user.email } to the *WithFallback readers), or add the route to OWNER_ONLY_ALLOW with a reason",
    ).toEqual([]);
  });

  it("allow-lists only name routes that exist and still match the pattern they excuse (no stale entries)", () => {
    const byPath = new Map(routes.map((r) => [r.path, r.src]));
    for (const path of Object.keys(LEGACY_PROJECT_ID_ALLOW)) {
      expect(byPath.has(path), `${path} is allow-listed but does not exist`).toBe(true);
      expect(LEGACY_PROJECT_ID.test(byPath.get(path)!), `${path} no longer uses getProjectIdFromRequest — drop the entry`).toBe(true);
    }
    for (const path of Object.keys(OWNER_ONLY_ALLOW)) {
      const src = byPath.get(path);
      expect(src, `${path} is allow-listed but does not exist`).toBeDefined();
      expect(usesCallerEmailKey(src!), `${path} no longer keys on the caller's email — drop the entry`).toBe(true);
      expect(
        /ownerOnlyDenied\s*\(/.test(src!),
        `${path} is excused as owner-only but never calls ownerOnlyDenied()`,
      ).toBe(true);
    }
  });
});
