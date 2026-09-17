// G14-S38 — API key scopes (pure; shared by the server routes, the
// settings UI and the docs registry — no `server-only`, no Supabase).
//
//   analyze            POST /api/v1/analyze — every key (pre-S38 behaviour).
//   evaluations:read   GET /api/v1/evaluations · /[id]/dossier · /[id]/assessment
//   evaluations:write  POST|PUT /api/v1/evaluations/[id]/assessment
//
// A key's scopes live in `api_keys.scopes` (0409, default '{analyze}').
// `evaluations:*` may be granted only on an evaluator account (the
// settings page + POST /api/keys enforce it with `isEvaluatorUser`); the
// v1 routes still 404 a key whose owner is not the evaluator on the row,
// so the scope is a ceiling, never a grant of data.

export const API_SCOPES = ["analyze", "evaluations:read", "evaluations:write"] as const;
export type ApiScope = (typeof API_SCOPES)[number];

/** What a brand-new key gets when the caller sends no `scopes`. */
export const DEFAULT_KEY_SCOPES: readonly ApiScope[] = ["analyze"];

/** Scopes only an evaluator account may hold. */
export const EVALUATOR_ONLY_SCOPES: ReadonlySet<ApiScope> = new Set<ApiScope>(["evaluations:read", "evaluations:write"]);

export const API_SCOPE_LABELS: Record<ApiScope, { label: string; description: string }> = {
  analyze: { label: "Analyze", description: "POST /api/v1/analyze — score a startup description (spends a credit)." },
  "evaluations:read": { label: "Evaluations: read", description: "List the startups you evaluate, read a dossier (ReportV2) and your latest assessment." },
  "evaluations:write": { label: "Evaluations: write", description: "Create or update your assessment on a startup you evaluate (same validation + versioning as the workspace)." },
};

export function isApiScope(v: unknown): v is ApiScope {
  return typeof v === "string" && (API_SCOPES as readonly string[]).includes(v);
}

/** Does `held` grant `required`? `evaluations:write` implies `evaluations:read`. */
export function hasScope(held: readonly string[] | null | undefined, required: ApiScope): boolean {
  const set = new Set(held ?? []);
  if (set.has(required)) return true;
  if (required === "evaluations:read" && set.has("evaluations:write")) return true;
  return false;
}

/** Row value → catalogue order, unknown strings dropped, `analyze` always present. */
export function normaliseScopes(v: unknown): ApiScope[] {
  const set = new Set<ApiScope>(["analyze"]);
  if (Array.isArray(v)) for (const s of v) if (isApiScope(s)) set.add(s);
  return API_SCOPES.filter((s) => set.has(s));
}

export type ScopesInput = { ok: true; scopes: ApiScope[] } | { ok: false; error: "invalid_scopes" | "unknown_scope" | "evaluator_scope_requires_evaluator_account"; detail?: string };

/**
 * Validate the `scopes` body of POST /api/keys. Absent → the default.
 * Unknown names are refused (not silently dropped — a typo must not
 * silently mint a weaker key than the caller believes they hold).
 */
export function parseScopesInput(v: unknown, opts: { evaluator: boolean }): ScopesInput {
  if (v === undefined || v === null) return { ok: true, scopes: [...DEFAULT_KEY_SCOPES] };
  if (!Array.isArray(v)) return { ok: false, error: "invalid_scopes" };
  const set = new Set<ApiScope>(["analyze"]);
  for (const s of v) {
    if (!isApiScope(s)) return { ok: false, error: "unknown_scope", detail: typeof s === "string" ? s.slice(0, 40) : typeof s };
    set.add(s);
  }
  for (const s of set) {
    if (EVALUATOR_ONLY_SCOPES.has(s) && !opts.evaluator) return { ok: false, error: "evaluator_scope_requires_evaluator_account", detail: s };
  }
  return { ok: true, scopes: API_SCOPES.filter((s) => set.has(s)) };
}
