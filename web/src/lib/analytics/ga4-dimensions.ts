// GA4 custom-dimension registry + pure helpers (S23-B).
//
// Single declarative list of the event-scoped parameters the app sends via
// `trackEvent()` (src/lib/analytics.ts `AnalyticsEventMap`) and the server
// Measurement-Protocol registry (src/lib/analytics/events.ts) that GA4 must
// have registered as custom dimensions before they can be used in
// explorations / the Data API (`customEvent:<parameterName>`). Unregistered
// params are still collected by GA4 but are invisible to reports — which is
// why the hero one-liner A/B (money-finder §4i D-5 / T0250) needs `arm`
// registered before its exploration can be built.
//
// Consumers:
//   * scripts/ga4-register-dimensions.mjs        — CLI (Node 22 strips the types)
//   * src/lib/analytics/ga4-admin.ts             — Admin API registration
//   * src/app/api/admin/ga4/register-dimensions  — admin route
//   * src/lib/analytics/ga4-event-audit.ts       — weekly Data API audit
//
// KEEP THIS FILE DEPENDENCY-FREE and erasable-TypeScript only (no enums, no
// parameter properties, no `server-only`) — the .mjs script imports it
// directly through Node's type stripping, so it cannot pull in Next or
// googleapis at import time.

export type Ga4DimensionScope = "EVENT" | "USER";

export interface Ga4DimensionSpec {
  /** The event param (or user property) name exactly as the app sends it. */
  parameterName: string;
  /** Human label shown in the GA4 UI (≤ 82 chars). */
  displayName: string;
  scope: Ga4DimensionScope;
  /** ≤ 150 chars — GA4 caps the description. */
  description: string;
  /** Events that carry this param — informational; pinned by the test. */
  events: readonly string[];
}

/** GA4 limits (https://support.google.com/analytics/answer/9267744). */
export const GA4_LIMITS = Object.freeze({
  eventNameMax: 40,
  paramNameMax: 40,
  paramValueMax: 100,
  displayNameMax: 82,
  descriptionMax: 150,
  eventScopedDimensionsPerProperty: 50,
  userScopedDimensionsPerProperty: 25,
});

/** The GCP project the service account lives in (verified 2026-09-12). */
export const GA4_GCP_PROJECT_ID = "990415480608";

/**
 * The hero one-liner test dimension. The event `hero_variant_shown` (and
 * `svi_submitted`) send the arm as the `arm` param — see
 * docs/plans/hero-one-liner-test-protocol.md §3 — so the GA4 dimension's
 * *parameter* must be `arm`; "Hero variant" is only the display name.
 */
export const HERO_VARIANT_DIMENSION: Ga4DimensionSpec = Object.freeze({
  parameterName: "arm",
  displayName: "Hero variant",
  scope: "EVENT",
  description: "Homepage hero one-liner arm (F1/F2/F3) shown on mount; carried onto svi_submitted from the hero omnibox.",
  events: ["hero_variant_shown", "svi_submitted"],
});

/**
 * Event-scoped dimensions to register. `events` is derived from
 * `AnalyticsEventMap` (client) or `AnalyticsEvent` (server registry) and the
 * colocated test fails if a listed event stops carrying the param.
 */
export const GA4_CUSTOM_DIMENSIONS: readonly Ga4DimensionSpec[] = Object.freeze([
  HERO_VARIANT_DIMENSION,
  {
    parameterName: "variant",
    displayName: "Page / copy variant",
    scope: "EVENT",
    description: "compare_viewed page variant (all/chatgpt/valuers) and radar_upsell_view copy variant (timeline/generic).",
    events: ["compare_viewed", "radar_upsell_view"],
  },
  {
    parameterName: "plan",
    displayName: "Plan",
    scope: "EVENT",
    description: "Plan code on pricing CTA / checkout events and the server subscribe, trial and cancel events.",
    events: ["plan_cta_clicked", "checkout_started", "checkout_completed", "reseller_create_startup_started", "reseller_create_startup_completed"],
  },
  {
    parameterName: "segment",
    displayName: "User segment",
    scope: "EVENT",
    description: "founder / investor / advisor / enterprise on the server-side sign_up, trial_start, dashboard_view and session_start events.",
    events: ["sign_up", "trial_start", "dashboard_view", "equity_offer_request", "investor_view_deal", "session_start"],
  },
  {
    parameterName: "kind",
    displayName: "Funding directory kind",
    scope: "EVENT",
    description: "grants or programs on funding_directory_viewed (/funding/grants, /funding/programs, /funding/programs/[capital]).",
    events: ["funding_directory_viewed"],
  },
  {
    parameterName: "step",
    displayName: "Checklist / form step",
    scope: "EVENT",
    description: "Evaluator activation checklist step (1-4), score-form step and TBR onboarding step.",
    events: ["evaluator_checklist_step", "score_form_step", "tbr_onboard_step_clicked"],
  },
  {
    parameterName: "capital",
    displayName: "Funding capital city",
    scope: "EVENT",
    description: "Display name of the capital on /funding/programs/[capital] (e.g. Sydney, Remote).",
    events: ["funding_directory_viewed"],
  },
  {
    parameterName: "intent",
    displayName: "Lead intent",
    scope: "EVENT",
    description: "Optional intent on lead_form_submitted (why the visitor left their details).",
    events: ["lead_form_submitted"],
  },
  // User-scoped `plan_tier` is deliberately NOT registered: the user-property
  // setter in src/lib/analytics.ts has no call sites, so GA4 would receive nothing.
  // `ga4-dimensions.test.ts` re-checks that and fails if a caller appears
  // without a USER-scoped row being added here.
]);

/**
 * The events S23-B must see arriving (all shipped in G11/G12 and the hero
 * test). The weekly audit reports `missing:<list>` when any are absent from
 * the last 7 days.
 */
export const GA4_AUDIT_EVENTS: readonly string[] = Object.freeze([
  "hero_variant_shown",
  "funding_preview",
  "funding_paywall_hit",
  "funding_report_paid",
  "evaluator_pricing_viewed",
  "evaluator_checklist_viewed",
  "compare_viewed",
  "funding_directory_viewed",
]);

// ── Operator steps when the Admin / Data API is blocked ─────────────────

export const GA4_ADMIN_API_ENABLE_URL = `https://console.developers.google.com/apis/api/analyticsadmin.googleapis.com/overview?project=${GA4_GCP_PROJECT_ID}`;
export const GA4_DATA_API_ENABLE_URL = `https://console.developers.google.com/apis/api/analyticsdata.googleapis.com/overview?project=${GA4_GCP_PROJECT_ID}`;

export type Ga4BlockedReason =
  | "api_disabled"
  | "permission_denied"
  | "unauthenticated"
  | "insufficient_scope"
  | "not_configured";

export interface Ga4Blocked {
  reason: Ga4BlockedReason;
  /** The two operator actions, in order. Printed verbatim by the CLI and the admin panel. */
  steps: string[];
  /** Upstream message (truncated) for the log. */
  message: string;
}

export interface OperatorStepOptions {
  /** Service-account email to name in step 2 (falls back to the env var name). */
  serviceAccountEmail?: string | null;
  /** Numeric GA4 property id, for the Admin console hint. */
  propertyId?: string | null;
  /** Which API the caller hit — the console URL differs. */
  api?: "admin" | "data";
}

/** The exact two operator steps the service account cannot perform itself. */
export function operatorSteps(opts: OperatorStepOptions = {}): string[] {
  const api = opts.api ?? "admin";
  const apiName = api === "data" ? "Google Analytics Data API (analyticsdata.googleapis.com)" : "Google Analytics Admin API (analyticsadmin.googleapis.com)";
  const url = api === "data" ? GA4_DATA_API_ENABLE_URL : GA4_ADMIN_API_ENABLE_URL;
  const sa = opts.serviceAccountEmail?.trim() || "$GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL";
  const prop = opts.propertyId?.trim() ? ` (property ${opts.propertyId.trim()})` : "";
  return [
    `1. Enable the ${apiName} in GCP project ${GA4_GCP_PROJECT_ID}: open ${url} and click "Enable" (a project Owner/Editor must do this — the service account cannot enable services). Wait ~2 minutes for propagation.`,
    `2. In GA4 → Admin → Property access management${prop}, add ${sa} with the Editor role (Viewer is enough for the weekly event audit, but creating custom dimensions needs Editor). Then re-run: node scripts/ga4-register-dimensions.mjs --apply`,
  ];
}

/** Loose shape of a googleapis GaxiosError — enough to classify without importing gaxios. */
export interface GaxiosLikeError {
  code?: number | string;
  status?: number;
  message?: string;
  errors?: Array<{ reason?: string; message?: string }>;
  response?: { status?: number; data?: { error?: { status?: string; message?: string; errors?: Array<{ reason?: string }> } } };
}

function statusOf(err: GaxiosLikeError): number {
  const c = typeof err.code === "string" ? Number(err.code) : err.code;
  return err.response?.status ?? err.status ?? (Number.isFinite(c) ? (c as number) : 0);
}

/**
 * Map a Google API failure to a `Ga4Blocked` (with the operator steps) or
 * `null` when it is not an access problem (network, 400, 5xx…). Pure.
 */
export function classifyGa4Error(err: unknown, opts: OperatorStepOptions = {}): Ga4Blocked | null {
  const e = (err ?? {}) as GaxiosLikeError;
  const status = statusOf(e);
  const message = String(e.message ?? e.response?.data?.error?.message ?? "").slice(0, 400);
  const reasons = [
    ...(e.errors ?? []).map((x) => x.reason ?? ""),
    ...(e.response?.data?.error?.errors ?? []).map((x) => x.reason ?? ""),
  ];
  const lower = message.toLowerCase();
  const steps = operatorSteps(opts);

  if (status === 403 && (reasons.includes("accessNotConfigured") || /has not been used in project|is disabled/.test(lower))) {
    return { reason: "api_disabled", steps, message };
  }
  if (status === 403 && /insufficient authentication scopes/.test(lower)) {
    return { reason: "insufficient_scope", steps, message };
  }
  if (status === 403) return { reason: "permission_denied", steps, message };
  if (status === 401) return { reason: "unauthenticated", steps, message };
  return null;
}

// ── Diff (pure) ─────────────────────────────────────────────────────────

export interface ExistingDimension {
  parameterName?: string | null;
  displayName?: string | null;
  scope?: string | null;
  name?: string | null;
}

export interface DimensionDiff {
  /** Specs with no matching (parameterName, scope) on the property → to create. */
  missing: Ga4DimensionSpec[];
  /** Specs already registered (matched by parameterName + scope, case-sensitive). */
  existing: Ga4DimensionSpec[];
  /** Dimensions on the property that are not in our list (never touched). */
  unmanaged: string[];
}

export function diffDimensions(
  existing: readonly ExistingDimension[],
  wanted: readonly Ga4DimensionSpec[] = GA4_CUSTOM_DIMENSIONS,
): DimensionDiff {
  const key = (p: string | null | undefined, s: string | null | undefined) => `${(s ?? "EVENT").toUpperCase()}:${p ?? ""}`;
  const have = new Set(existing.map((d) => key(d.parameterName, d.scope)));
  const missing: Ga4DimensionSpec[] = [];
  const found: Ga4DimensionSpec[] = [];
  for (const spec of wanted) (have.has(key(spec.parameterName, spec.scope)) ? found : missing).push(spec);
  const managed = new Set(wanted.map((w) => key(w.parameterName, w.scope)));
  const unmanaged = existing
    .filter((d) => d.parameterName && !managed.has(key(d.parameterName, d.scope)))
    .map((d) => `${d.parameterName}${d.scope && d.scope !== "EVENT" ? ` (${d.scope})` : ""}`);
  return { missing, existing: found, unmanaged };
}

/** Validate a spec against the GA4 limits — returns problems (empty = ok). */
export function validateDimensionSpec(spec: Ga4DimensionSpec): string[] {
  const problems: string[] = [];
  if (!/^[a-z][a-z0-9_]*$/.test(spec.parameterName)) problems.push(`${spec.parameterName}: parameterName must be snake_case`);
  if (spec.parameterName.length > GA4_LIMITS.paramNameMax) problems.push(`${spec.parameterName}: parameterName > ${GA4_LIMITS.paramNameMax}`);
  if (!spec.displayName || spec.displayName.length > GA4_LIMITS.displayNameMax) problems.push(`${spec.parameterName}: displayName empty or > ${GA4_LIMITS.displayNameMax}`);
  if (spec.description.length > GA4_LIMITS.descriptionMax) problems.push(`${spec.parameterName}: description > ${GA4_LIMITS.descriptionMax}`);
  if (spec.scope !== "EVENT" && spec.scope !== "USER") problems.push(`${spec.parameterName}: scope must be EVENT or USER`);
  if (spec.events.length === 0) problems.push(`${spec.parameterName}: no events listed`);
  return problems;
}
