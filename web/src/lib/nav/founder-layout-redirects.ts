// Pre-stream redirects for the `(founder)` route group — G20 sweep fix.
//
// `dashboard/loading.tsx` and `workspace/loading.tsx` put every page under
// them behind a Suspense boundary. A `redirect()` thrown by such a page
// arrives AFTER the shell streamed, so Next downgrades it to
// `<meta http-equiv="refresh">` plus two nonce-less inline scripts that the
// nonce CSP refuses (2 console errors per visit, the skeleton on screen for
// a second, `h1_count_0` in the page sweep — the G13 `/dashboard` lesson).
//
// `(founder)/layout.tsx` sits ABOVE both boundaries, reads the request path
// from `x-pathname` (stamped by `src/proxy.ts`) and asks this module for the
// redirect the page would otherwise throw. A hit is a real 307. Every page
// keeps its own `redirect()` as the fallback (a request with no `x-pathname`
// header still ends up on the right URL, just via the meta refresh).
//
// Rules, in order — the first hit wins:
//   /dashboard                          → the evaluator persona landing
//   /workspace                          → /dashboard
//   /workspace/equity/setup             → /workspace/equity/cap-table when a cap table exists
//   /workspace/investor/startup/[id]    → the dossier when the caller holds an evaluation
//   FOUNDER_TIER_GATES[path]            → /pricing?feature=&from= (or login) when gated
//
// The lookups a page repeats (cap-table probe, dossier lookup, tier gate)
// are React `cache`d, so the page's own call re-uses this request's promise.

import { cache } from "react";
import type { AppUser } from "@/lib/auth";
import type { Feature } from "@/lib/entitlements";
import type { PlanTier } from "@/lib/segments";
import { resolveTierGate } from "@/lib/entitlements/require-tier-for-page";
import { landingHrefFor, personaLandingEnabled } from "@/lib/auth/post-login";
import { resolvePersonaForUser } from "@/lib/nav/persona-server";
import { isEvaluatorPersona } from "@/lib/nav/persona";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DOSSIER_PATH, findEvaluationIdForProject } from "@/lib/evaluations/dossier";

/**
 * Every `(founder)` page that calls `requireTierForPage` — the same options,
 * keyed on the page path. `founder-layout-redirects.test.ts` reads each
 * page's call and fails when this table drifts.
 */
export const FOUNDER_TIER_GATES: Readonly<Record<string, { feature?: Feature; minTier?: PlanTier }>> = Object.freeze({
  "/workspace/accelerator/quarterly-report": { feature: "accelerator.cohort" as Feature, minTier: "accel_starter" },
  "/workspace/documents/data-room": { feature: "data_room.access" },
  "/workspace/equity/cap-table": { feature: "cap_table.write" },
  "/workspace/esop": { feature: "esop.manage" },
  "/workspace/esop/manage": { feature: "esop.manage" },
  "/workspace/esop/vesting": { feature: "vesting.read" },
  "/workspace/exit/benchmark": { minTier: "growth" },
  "/workspace/exit/clean-room": { minTier: "growth" },
  "/workspace/exit/listing": { minTier: "growth" },
});

export const CAP_TABLE_PATH = "/workspace/equity/cap-table";
const INVESTOR_STARTUP_RE = /^\/workspace\/investor\/startup\/([A-Za-z0-9_-]{1,64})$/;

/** Path only — `x-pathname` carries `path + search`; a trailing slash is dropped. */
export function normalizePathname(raw: string | null | undefined): string {
  const path = (raw ?? "").split("?")[0] ?? "";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

/** `shareholders` rows under the caller's account → the wizard is done (equity/setup → cap table). */
export const hasCapTable = cache(async function hasCapTable(userId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  try {
    const { data } = await supabase.from("shareholders").select("id").eq("account_id", userId).limit(1);
    return Boolean(data && data.length > 0);
  } catch {
    return false;
  }
});

/** Per-request memo of the dossier lookup the alias page repeats. */
export const findEvaluationIdForProjectCached = cache(findEvaluationIdForProject);

export interface FounderRedirectDeps {
  personaLandingEnabled: () => boolean;
  resolvePersonaForUser: typeof resolvePersonaForUser;
  hasCapTable: (userId: string) => Promise<boolean>;
  findEvaluationIdForProject: (userId: string, projectId: string) => Promise<string | null>;
  resolveTierGate: (feature: Feature | null, minTier: PlanTier | null, fromPath: string) => Promise<string | null>;
}

const defaultDeps: FounderRedirectDeps = {
  personaLandingEnabled,
  resolvePersonaForUser,
  hasCapTable,
  findEvaluationIdForProject: findEvaluationIdForProjectCached,
  resolveTierGate,
};

/**
 * The redirect the page at `pathname` would throw, resolved before anything
 * streams — or `null` to render. `user` is the signed-in caller (the `(app)`
 * layout already bounced anonymous visitors). Never throws: any lookup
 * failure means "render the page", which then falls back to its own redirect.
 */
export async function resolveFounderLayoutRedirect(
  rawPathname: string | null | undefined,
  user: Pick<AppUser, "id" | "role"> | null,
  deps: FounderRedirectDeps = defaultDeps,
): Promise<string | null> {
  const pathname = normalizePathname(rawPathname);
  if (!pathname || !user) return null;
  try {
    if (pathname === "/dashboard") {
      if (!deps.personaLandingEnabled()) return null;
      const persona = await deps.resolvePersonaForUser(user);
      return isEvaluatorPersona(persona) ? landingHrefFor(persona) : null;
    }
    if (pathname === "/workspace") return "/dashboard";
    if (pathname === "/workspace/equity/setup") {
      return (await deps.hasCapTable(user.id)) ? CAP_TABLE_PATH : null;
    }
    const alias = INVESTOR_STARTUP_RE.exec(pathname);
    if (alias) {
      const evaluationId = await deps.findEvaluationIdForProject(user.id, alias[1]!);
      return evaluationId ? DOSSIER_PATH(evaluationId) : null;
    }
    const gate = FOUNDER_TIER_GATES[pathname];
    if (gate) return deps.resolveTierGate(gate.feature ?? null, gate.minTier ?? null, pathname);
  } catch {
    // Render the page; its own redirect() still lands the user where it should.
  }
  return null;
}
