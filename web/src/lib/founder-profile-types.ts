// Client-safe types + pure helpers for the founder profile.
//
// Split out of lib/founder-profile.ts so the client bundle never pulls in the
// supabase service-role client (which is server-only). The form UI imports
// from here; the server code (API route, /api/svi pipeline) imports the full
// lib/founder-profile.ts.

export interface CoFounder {
  name: string;
  role: string;
  linkedin?: string;
  bio?: string;
}

export interface Advisor {
  name: string;
  role: string;
  linkedin?: string;
}

// ── G14-S37 execution profile (migration 0408) ─────────────────────────────

export const EXIT_TYPES = ["acquisition", "ipo", "shutdown"] as const;
export type ExitType = (typeof EXIT_TYPES)[number];

export const VALUE_BANDS = ["undisclosed", "<1m", "1m-10m", "10m-50m", "50m+"] as const;
export type ValueBand = (typeof VALUE_BANDS)[number];

export const RAISE_ROUNDS = ["pre_seed", "seed", "series_a", "series_b_plus", "grant", "other"] as const;
export type RaiseRound = (typeof RAISE_ROUNDS)[number];

export const AMOUNT_BANDS = ["<250k", "250k-1m", "1m-5m", "5m-20m", "20m+"] as const;
export type AmountBand = (typeof AMOUNT_BANDS)[number];

export const ROLE_KEYS = ["ceo", "cto", "cpo", "cfo"] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const EXECUTION_SOURCES = ["founder", "linkedin_parser", "github", "evaluator"] as const;
export type ExecutionSource = (typeof EXECUTION_SOURCES)[number];

export interface PriorExit {
  company: string;
  year: number | null;
  type: ExitType;
  value_band: ValueBand;
}

export interface PriorRaise {
  company: string;
  round: RaiseRound;
  amount_aud_band: AmountBand;
  year: number | null;
}

export type FounderRoles = Record<RoleKey, string | null>;

/** The structured execution fields (0408). Every field is optional at the type level so pre-0408 rows still type-check. */
export interface FounderExecutionFields {
  prior_exits: PriorExit[];
  prior_raises: PriorRaise[];
  github_url: string | null;
  full_time_pct: number | null;
  worked_together_before: boolean | null;
  roles: FounderRoles;
  execution_score: number | null;
  execution_computed_at: string | null;
  /** per-field provenance: which source last wrote the field */
  execution_source: Partial<Record<string, ExecutionSource>>;
}

export const EMPTY_ROLES = (): FounderRoles => ({ ceo: null, cto: null, cpo: null, cfo: null });

export const EMPTY_EXECUTION_FIELDS = (): FounderExecutionFields => ({
  prior_exits: [],
  prior_raises: [],
  github_url: null,
  full_time_pct: null,
  worked_together_before: null,
  roles: EMPTY_ROLES(),
  execution_score: null,
  execution_computed_at: null,
  execution_source: {},
});

export interface FounderProfile extends FounderExecutionFields {
  id?: string;
  account_id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  linkedin_url: string | null;
  bio: string | null;
  prev_employers: string[];
  ship_history: string[];
  years_in_domain: number | null;
  domain_insight: string | null;
  ambition: string | null;
  co_founders: CoFounder[];
  advisors: Advisor[];
  notable_hires: Array<{ name: string; role: string; from?: string }>;
  public_visible: boolean;
  contactable_by_investors: boolean;
}

export const EMPTY_PROFILE = (accountId: string, email: string): FounderProfile => ({
  account_id: accountId,
  email,
  full_name: null,
  role: null,
  linkedin_url: null,
  bio: null,
  prev_employers: [],
  ship_history: [],
  years_in_domain: null,
  domain_insight: null,
  ambition: null,
  co_founders: [],
  advisors: [],
  notable_hires: [],
  public_visible: true,
  contactable_by_investors: false,
  ...EMPTY_EXECUTION_FIELDS(),
});

/** Number of the four leadership roles with a named person. */
export function rolesCovered(roles: Partial<FounderRoles> | null | undefined): number {
  if (!roles) return 0;
  return ROLE_KEYS.filter((k) => typeof roles[k] === "string" && roles[k]!.trim().length > 0).length;
}

/**
 * True when the founder has filled at least one STRUCTURED execution field
 * (0408). The regex fallback in svi-analysis only fills gaps when this is
 * false — a profile with structured data is canonical (G14-S37).
 */
export function hasStructuredExecution(p: Partial<FounderExecutionFields> | null | undefined): boolean {
  if (!p) return false;
  return (
    (Array.isArray(p.prior_exits) && p.prior_exits.length > 0) ||
    (Array.isArray(p.prior_raises) && p.prior_raises.length > 0) ||
    Boolean(p.github_url) ||
    (typeof p.full_time_pct === "number" && Number.isFinite(p.full_time_pct)) ||
    typeof p.worked_together_before === "boolean" ||
    rolesCovered(p.roles) > 0
  );
}

/**
 * 0-100. Drives the dashboard nag + visibility of the Team-signal boost in
 * the SVI report. Pure function — safe to call on client. 12 checks since
 * G14-S37 (the two execution checks: track record, roles / commitment).
 */
export function profileCompletionPct(p: FounderProfile | null): number {
  if (!p) return 0;
  const checks: Array<boolean> = [
    Boolean(p.full_name && p.full_name.trim().length > 1),
    Boolean(p.role && p.role.trim().length > 1),
    Boolean(p.linkedin_url),
    Boolean(p.bio && p.bio.length > 80),
    Boolean(p.prev_employers.length > 0),
    Boolean(p.ship_history.length > 0),
    Boolean(p.years_in_domain != null && p.years_in_domain > 0),
    Boolean(p.domain_insight && p.domain_insight.length > 40),
    Boolean(p.ambition && p.ambition.length > 40),
    Boolean(p.co_founders.length > 0 || p.advisors.length > 0),
    // G14-S37 execution fields (0408): track record + commitment
    Boolean((p.prior_exits?.length ?? 0) > 0 || (p.prior_raises?.length ?? 0) > 0 || p.github_url),
    Boolean(rolesCovered(p.roles) > 0 || (typeof p.full_time_pct === "number" && p.full_time_pct > 0)),
  ];
  const done = checks.filter(Boolean).length;
  return Math.round((done / checks.length) * 100);
}

/**
 * Projects the profile to a single text blob the SVI engine can scan.
 * Pure function — used by both server (api/svi route) and tests.
 */
export function profileToSviInputText(p: FounderProfile | null): string {
  if (!p) return "";
  const parts: string[] = [];
  if (p.full_name) parts.push(`Founder: ${p.full_name}${p.role ? `, ${p.role}` : ""}.`);
  if (p.years_in_domain) parts.push(`${p.years_in_domain} years in domain.`);
  if (p.prev_employers.length > 0) parts.push(`Previously at ${p.prev_employers.join(", ")}.`);
  if (p.ship_history.length > 0) parts.push(`Ship history: ${p.ship_history.join(" · ")}.`);
  if (p.domain_insight) parts.push(p.domain_insight);
  if (p.ambition) parts.push(p.ambition);
  if (p.co_founders.length > 0) {
    parts.push(`Co-founders: ${p.co_founders.map((c) => `${c.name} (${c.role})`).join(", ")}.`);
  }
  if (p.advisors.length > 0) {
    parts.push(`Advisors: ${p.advisors.map((a) => `${a.name} (${a.role})`).join(", ")}.`);
  }
  if (p.notable_hires.length > 0) {
    parts.push(`Notable hires: ${p.notable_hires.map((h) => `${h.name} (${h.role}${h.from ? ` ex-${h.from}` : ""})`).join(", ")}.`);
  }
  // G14-S37: structured execution fields, as prose for the narrative agents
  // (the score itself no longer comes from this text — see lib/founder/execution.ts).
  const exits = Array.isArray(p.prior_exits) ? p.prior_exits.filter((e) => e && e.company) : [];
  if (exits.length > 0) {
    parts.push(`Prior exits: ${exits.map((e) => `${e.company} (${e.type}${e.year ? ` ${e.year}` : ""})`).join(", ")}.`);
  }
  const raises = Array.isArray(p.prior_raises) ? p.prior_raises.filter((r) => r && r.company) : [];
  if (raises.length > 0) {
    parts.push(`Prior raises: ${raises.map((r) => `${r.company} ${r.round.replace(/_/g, " ")}${r.year ? ` ${r.year}` : ""}`).join(", ")}.`);
  }
  return parts.join(" ");
}
