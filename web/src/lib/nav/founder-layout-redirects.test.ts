// G20-sweep — the pre-stream redirect table for the (founder) layout.
//
// Pins (1) the pure resolver against injected deps and (2) that
// FOUNDER_TIER_GATES mirrors every `requireTierForPage({...})` call under
// src/app/(app)/(founder): a page that gains, loses or changes a gate without
// the table drifts back to a streamed redirect (2 CSP refusals per visit).
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("@/lib/evaluations/dossier", () => ({
  DOSSIER_PATH: (id: string) => `/workspace/evaluations/${id}`,
  findEvaluationIdForProject: async () => null,
}));
vi.mock("@/lib/entitlements/require-tier-for-page", () => ({ resolveTierGate: async () => null }));
vi.mock("@/lib/nav/persona-server", () => ({ resolvePersonaForUser: async () => "founder" }));

import { FOUNDER_TIER_GATES, normalizePathname, resolveFounderLayoutRedirect, type FounderRedirectDeps } from "./founder-layout-redirects";

function deps(over: Partial<FounderRedirectDeps> = {}): FounderRedirectDeps {
  return {
    personaLandingEnabled: () => true,
    resolvePersonaForUser: async () => "founder",
    hasCapTable: async () => false,
    findEvaluationIdForProject: async () => null,
    resolveTierGate: async () => null,
    ...over,
  };
}
const user = { id: "u-1", role: "user" };

describe("normalizePathname", () => {
  it("drops the search and a trailing slash", () => {
    expect(normalizePathname("/workspace/?x=1")).toBe("/workspace");
    expect(normalizePathname("/dashboard?welcome=1")).toBe("/dashboard");
    expect(normalizePathname("/")).toBe("/");
    expect(normalizePathname(null)).toBe("");
  });
});

describe("resolveFounderLayoutRedirect", () => {
  it("renders (null) for an anonymous caller or an unknown path", async () => {
    expect(await resolveFounderLayoutRedirect("/workspace", null, deps())).toBeNull();
    expect(await resolveFounderLayoutRedirect("/workspace/plan", user, deps())).toBeNull();
    expect(await resolveFounderLayoutRedirect("", user, deps())).toBeNull();
  });

  it("/dashboard → the evaluator landing only for an evaluator persona with the flag on", async () => {
    expect(await resolveFounderLayoutRedirect("/dashboard", user, deps({ resolvePersonaForUser: async () => "investor_angel" }))).toBe("/workspace/investor");
    expect(await resolveFounderLayoutRedirect("/dashboard", user, deps())).toBeNull();
    expect(await resolveFounderLayoutRedirect("/dashboard", user, deps({ personaLandingEnabled: () => false, resolvePersonaForUser: async () => "investor_angel" }))).toBeNull();
  });

  it("/workspace → /dashboard", async () => {
    expect(await resolveFounderLayoutRedirect("/workspace", user, deps())).toBe("/dashboard");
    expect(await resolveFounderLayoutRedirect("/workspace/", user, deps())).toBe("/dashboard");
  });

  it("/workspace/equity/setup → the cap table only once shareholders exist", async () => {
    expect(await resolveFounderLayoutRedirect("/workspace/equity/setup", user, deps())).toBeNull();
    expect(await resolveFounderLayoutRedirect("/workspace/equity/setup", user, deps({ hasCapTable: async () => true }))).toBe("/workspace/equity/cap-table");
  });

  it("the dossier alias → the evaluation the caller holds; malformed ids are left to the page (404)", async () => {
    const find = vi.fn(async (_u: string, p: string) => (p === "p-1" ? "ev-1" : null));
    expect(await resolveFounderLayoutRedirect("/workspace/investor/startup/p-1", user, deps({ findEvaluationIdForProject: find }))).toBe("/workspace/evaluations/ev-1");
    expect(await resolveFounderLayoutRedirect("/workspace/investor/startup/p-2", user, deps({ findEvaluationIdForProject: find }))).toBeNull();
    expect(await resolveFounderLayoutRedirect("/workspace/investor/startup/p%201", user, deps({ findEvaluationIdForProject: find }))).toBeNull();
    expect(find).toHaveBeenCalledWith("u-1", "p-1");
  });

  it("a tier-gated path asks the gate with the page's own options and returns its target", async () => {
    const gate = vi.fn(async () => "/pricing?feature=esop.manage&from=%2Fworkspace%2Fesop");
    expect(await resolveFounderLayoutRedirect("/workspace/esop", user, deps({ resolveTierGate: gate }))).toBe("/pricing?feature=esop.manage&from=%2Fworkspace%2Fesop");
    expect(gate).toHaveBeenCalledWith("esop.manage", null, "/workspace/esop");
    const quarterly = vi.fn(async () => null);
    expect(await resolveFounderLayoutRedirect("/workspace/accelerator/quarterly-report", user, deps({ resolveTierGate: quarterly }))).toBeNull();
    expect(quarterly).toHaveBeenCalledWith("accelerator.cohort", "accel_starter", "/workspace/accelerator/quarterly-report");
  });

  it("a failing lookup renders the page (the page's own redirect is the fallback)", async () => {
    expect(await resolveFounderLayoutRedirect("/workspace/equity/setup", user, deps({ hasCapTable: async () => { throw new Error("db"); } }))).toBeNull();
  });
});

// ── Table drift guard ──────────────────────────────────────────────────────
function pages(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) pages(full, out);
    else if (name === "page.tsx") out.push(full);
  }
  return out;
}

describe("FOUNDER_TIER_GATES mirrors every requireTierForPage() call under (founder)", () => {
  const root = join(process.cwd(), "src", "app", "(app)", "(founder)");
  const found: Record<string, { feature?: string; minTier?: string }> = {};
  for (const file of pages(root)) {
    const src = readFileSync(file, "utf8");
    const call = /requireTierForPage\(\{([\s\S]*?)\}\)/.exec(src);
    if (!call) continue;
    const body = call[1]!;
    const fromPath = /fromPath:\s*"([^"]+)"/.exec(body)?.[1];
    expect(fromPath, `${file}: fromPath must be a string literal`).toBeTruthy();
    const featureLit = /feature:\s*"([^"]+)"/.exec(body)?.[1];
    const featureConst = /feature:\s*([A-Z_]+)\b/.exec(body)?.[1];
    const feature = featureLit ?? (featureConst ? new RegExp(`const ${featureConst} = "([^"]+)"`).exec(src)?.[1] : undefined);
    const minTier = /minTier:\s*"([^"]+)"/.exec(body)?.[1];
    found[fromPath!] = { ...(feature ? { feature } : {}), ...(minTier ? { minTier } : {}) };
  }
  it("finds the gated pages", () => {
    expect(Object.keys(found).length).toBeGreaterThanOrEqual(9);
  });
  it("table == pages", () => {
    expect(FOUNDER_TIER_GATES).toEqual(found);
  });
});
