// sandbox-scope — shared helpers for the "sandbox vs live" filter on admin
// tables. Wired into iteration-9 fanout (D3-CISO-05 / D2-CFO-08).
//
// Domain concept
// --------------
// Reseller sandbox activity is bookkeeping-only (never touches
// credit_balances; grants land in reseller_credit_grants with
// kind='sandbox_spend'). Live activity is billed. Admins routinely need to
// disambiguate the two on cross-table reporting pages. Rather than duplicate
// query-string parsing + filter chip logic across every admin page, we
// centralise it here.
//
// Truth table
// -----------
// scope    | filter behaviour                                             |
// -------- | ------------------------------------------------------------ |
// 'all'    | no filter (default)                                          |
// 'sandbox'| where <column> = true                                        |
// 'live'   | where <column> = false                                       |
//
// Any page whose underlying table lacks a boolean sandbox column should
// render the chip in noop mode (`SandboxScopeChip note="…"`) so the UI
// stays honest — see plan-delta-2026-07-23.md § D3-CISO-05.

export const SANDBOX_SCOPE_VALUES = ["all", "live", "sandbox"] as const;
export type SandboxScope = (typeof SANDBOX_SCOPE_VALUES)[number];

export const DEFAULT_SANDBOX_SCOPE: SandboxScope = "all";
export const SANDBOX_SCOPE_PARAM = "scope";

// ---------------------------------------------------------------------------
// parseScope — normalise a raw searchParams value to SandboxScope.
// Accepts either the awaited Next.js searchParams object shape or a plain
// {scope?: string|string[]} bag. Anything unknown collapses to 'all'.
// ---------------------------------------------------------------------------

type ScopeInput =
  | string
  | string[]
  | null
  | undefined
  | { [SANDBOX_SCOPE_PARAM]?: string | string[] | undefined };

export function parseScope(input: ScopeInput): SandboxScope {
  const raw = extractRaw(input);
  if (raw === "sandbox" || raw === "live" || raw === "all") return raw;
  return DEFAULT_SANDBOX_SCOPE;
}

function extractRaw(input: ScopeInput): string | undefined {
  if (input == null) return undefined;
  if (typeof input === "string") return input.trim().toLowerCase();
  if (Array.isArray(input)) return input[0]?.trim().toLowerCase();
  const v = (input as Record<string, string | string[] | undefined>)[SANDBOX_SCOPE_PARAM];
  if (typeof v === "string") return v.trim().toLowerCase();
  if (Array.isArray(v)) return v[0]?.trim().toLowerCase();
  return undefined;
}

// ---------------------------------------------------------------------------
// applySandboxScopeToQuery — chain a WHERE clause onto a Supabase query
// builder when the caller has opted in to a sandbox/live view. When scope
// is 'all', returns the query unchanged (noop). The column name defaults
// to "sandbox" to match the naming used in D2-CFO-08.
// ---------------------------------------------------------------------------

// Minimal shape of a PostgrestFilterBuilder we care about. Using `unknown`
// generics keeps this file free of @supabase/supabase-js coupling so the
// tests can pass a fake with the same surface.
export interface SandboxScopeQueryLike {
  eq(column: string, value: unknown): SandboxScopeQueryLike;
}

export function applySandboxScopeToQuery<Q extends SandboxScopeQueryLike>(
  query: Q,
  scope: SandboxScope,
  column = "sandbox",
): Q {
  if (scope === "all") return query;
  return query.eq(column, scope === "sandbox") as Q;
}

// ---------------------------------------------------------------------------
// buildScopeSearch — mutate a URLSearchParams so the current scope is
// preserved on link builders. Passing `all` drops the param entirely so
// bookmarked URLs stay tidy.
// ---------------------------------------------------------------------------

export function buildScopeSearch(
  base: URLSearchParams,
  scope: SandboxScope,
): URLSearchParams {
  const next = new URLSearchParams(base);
  if (scope === DEFAULT_SANDBOX_SCOPE) {
    next.delete(SANDBOX_SCOPE_PARAM);
  } else {
    next.set(SANDBOX_SCOPE_PARAM, scope);
  }
  return next;
}

// ---------------------------------------------------------------------------
// makeScopeHrefBuilder — factory used by admin pages that already have a
// buildHref() helper; wraps the current pathname + search into a function
// that emits the same URL with only `scope` swapped.
// ---------------------------------------------------------------------------

export function makeScopeHrefBuilder(
  pathname: string,
  currentSearch: URLSearchParams,
): (scope: SandboxScope) => string {
  return (scope) => {
    const qs = buildScopeSearch(currentSearch, scope).toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };
}

// ---------------------------------------------------------------------------
// isSandboxRow — small helper for row-level UI badges. Callers pass the row
// (or a subset with a boolean flag) and the column name that carries the
// signal on that particular table. Undefined / null collapse to false so
// the badge never lies for rows loaded from tables without the column.
// ---------------------------------------------------------------------------

export function isSandboxRow(
  row: Record<string, unknown> | null | undefined,
  column = "sandbox",
): boolean {
  if (!row) return false;
  return row[column] === true;
}
