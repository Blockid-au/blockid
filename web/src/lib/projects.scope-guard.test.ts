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
//   B. `getProjectIdFromRequest(` — or any wrapper of it, today
//      `getActiveProjectIdOrNull(` (S18-A review P2-2) — at all must be
//      allow-listed with a reason (LEGACY_PROJECT_ID_ALLOW). Empty today —
//      keep it that way.
//   C. A route that resolves a scope but still keys SVI data on the
//      CALLER's email must be a deliberately owner-only action, allow-listed
//      with a reason (OWNER_ONLY_ALLOW).
//   C2. (S18-A review P2-2) A route that resolves a scope but keys a
//      project table on the CALLER's id — `.eq("user_id", user.id)` /
//      `.eq("account_id", user.id)` — must be allow-listed with a reason
//      (CALLER_ID_ALLOW): those rows are deliberately the caller's own
//      (their paid reports / analyses), never the project's shared data.

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

/**
 * Routes that resolve a scope AND key a project table on the caller's own
 * id (`.eq("user_id", user.id)` / `.eq("account_id", user.id)`). Each entry
 * names rows that are the CALLER's by design — paid by / minted for them —
 * not the project's shared data a member should see through the owner.
 */
const CALLER_ID_ALLOW: Record<string, string> = {
  "term-sheet/route.ts":
    "term_sheet_analyses rows are caller-owned (caller-paid analysis, documented in the route); DELETE scopes to the caller so a session can only remove its own rows",
  "term-sheet/compare/route.ts":
    "S26-B: compares 2–4 term_sheet_analyses rows by (id, user_id = caller) — the caller's own paid analyses, same ownership as term-sheet/route.ts; the scope is resolved only for the credit-spend project metadata, no project data is read",
  "svi/docx/route.ts":
    "assembled_reports by (id, user_id = caller): the DOCX export renders a report the caller generated and paid for; project data comes through scope.dataEmail",
  "svi/full-report/route.ts":
    "report_sections by (analysis_id, user_id = caller): previously purchased sections are the caller's own paid content; the analysis itself is resolved via scope.dataEmail",
};

// Rule B — the legacy reader and every thin wrapper of it (a wrapper hides
// the literal call from this regex, which is how competitive-positioning
// slipped through pre-review).
const LEGACY_PROJECT_ID = /\b(getProjectIdFromRequest|getActiveProjectIdOrNull)\s*\(/;
const SCOPE_RESOLVERS =
  /\b(getProjectScope|projectScopeOrDeny|projectScopeOrDenyFor|projectScopeOrRedirect|assertProjectScope)\s*\(/;
const CALLER_ID_KEY =
  /\.eq\(\s*["'](user_id|account_id)["']\s*,\s*(user|auth|gate\.user)\.id\s*\)/;
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

  it("C2. a scope-aware route keys project tables on scope.ownerUserId, not the caller's id, unless the rows are deliberately the caller's own", () => {
    const offenders = routes
      .filter((r) => SCOPE_RESOLVERS.test(r.src) && CALLER_ID_KEY.test(r.src) && !(r.path in CALLER_ID_ALLOW))
      .map((r) => r.path);
    expect(
      offenders,
      "key on scope?.ownerUserId ?? user.id, or add the route to CALLER_ID_ALLOW with a reason (rows that are the caller's own paid content)",
    ).toEqual([]);
  });

  it("wrappers of getProjectIdFromRequest are caught by rule B (getActiveProjectIdOrNull)", () => {
    expect(LEGACY_PROJECT_ID.test("const p = await getActiveProjectIdOrNull();")).toBe(true);
    expect(LEGACY_PROJECT_ID.test("const p = await getProjectIdFromRequest();")).toBe(true);
    expect(LEGACY_PROJECT_ID.test("const p = await getProjectScope('viewer');")).toBe(false);
  });

  it("rule C2 matches caller-id keys on project tables and ignores owner-keyed ones", () => {
    expect(CALLER_ID_KEY.test('.eq("user_id", user.id)')).toBe(true);
    expect(CALLER_ID_KEY.test(".eq('account_id', gate.user.id)")).toBe(true);
    expect(CALLER_ID_KEY.test('.eq("user_id", scope?.ownerUserId ?? user.id)')).toBe(false);
    expect(CALLER_ID_KEY.test('.eq("account_id", accountId)')).toBe(false);
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
    for (const path of Object.keys(CALLER_ID_ALLOW)) {
      const src = byPath.get(path);
      expect(src, `${path} is allow-listed but does not exist`).toBeDefined();
      expect(CALLER_ID_KEY.test(src!), `${path} no longer keys on the caller's id — drop the entry`).toBe(true);
      expect(SCOPE_RESOLVERS.test(src!), `${path} no longer resolves a scope — drop the entry`).toBe(true);
    }
  });
});
