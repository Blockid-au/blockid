// src/lib/agents/grant-advisor-rules.ts
//
// Pure vocab, date and eligibility-gate helpers for the grant-advisor agent
// (T0240, plan §4c / §5d / §6f). No I/O, no LLM — everything here is
// deterministic so the scorer and timeline can be pinned by tests.
//
// Two seed-data realities this module encodes (see effectiveGrantStatus /
// effectiveProgramStatus):
//   * The seed's `status` answers "can you lodge today?", not "is the scheme
//     alive?". MVP Ventures (NSW), NIIF Innovation Booster (WA), Curtin
//     Ignition, Plus Eight Sprint … are `closed` between rounds but recur every
//     year. A 12-month funding plan must still surface them, so a recurring
//     row that is merely between rounds is normalised to `upcoming`
//     (timing = between_rounds) while permanently closed rows (Boosting Female
//     Founders, Accelerating Commercialisation, Techstars Sydney) stay out.
//   * `demographic_tags` on a row are NOT always a hard gate: MVP Ventures
//     lists women/regional/Aboriginal tags for its Stream 2 but Stream 1 is
//     open to everyone. A row is demographic-only when its `eligibility` jsonb
//     carries an explicit demographic gate key (women_owned_min_pct,
//     indigenous_owned_min_pct, age_max, …) or its name says so.

import type { AuGrantRow, AuProgramRow, FundingStatus } from "@/lib/funding/seed-map";

// ─── Vocab ───────────────────────────────────────────────────────────────────

export const FOUNDER_STAGES = [
  "idea",
  "pre_revenue_prototype",
  "mvp",
  "early_revenue",
  "scaling",
  "export_ready",
] as const;
export type FounderStage = (typeof FOUNDER_STAGES)[number];

/** Demographic taxonomy (§5d) plus the implications used for overlap checks. */
export const DEMOGRAPHIC_TAGS = [
  "women_owned_51",
  "women_led",
  "indigenous_owned_50",
  "indigenous_owned_51_controlled",
  "regional_founder",
  "young_founder_under_30",
  "migrant_refugee",
  "veteran",
  "disability",
  "jobseeker_recipient",
] as const;

const DEMOGRAPHIC_IMPLIES: Readonly<Record<string, readonly string[]>> = {
  women_owned_51: ["women_led"],
  indigenous_owned_51_controlled: ["indigenous_owned_50"],
};

/** Expand a founder's self-reported demographics with what they imply. */
export function expandDemographics(tags: readonly string[] | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const raw of tags ?? []) {
    const t = String(raw).trim();
    if (!t) continue;
    out.add(t);
    for (const implied of DEMOGRAPHIC_IMPLIES[t] ?? []) out.add(implied);
  }
  return out;
}

/**
 * eligibility jsonb keys that make a row demographic-only, mapped to the
 * founder tag(s) that satisfy them (any one is enough).
 */
export const DEMOGRAPHIC_GATE_KEYS: Readonly<Record<string, readonly string[]>> = {
  women_owned_min_pct: ["women_owned_51"],
  women_led: ["women_led"],
  women_founded: ["women_led"],
  women_or_culturally_diverse: ["women_led", "migrant_refugee"],
  indigenous_owned_min_pct: ["indigenous_owned_50"],
  indigenous_owned_controlled_min_pct: ["indigenous_owned_51_controlled"],
  aboriginal_or_tsi_founder: ["indigenous_owned_50"],
  aboriginal_business: ["indigenous_owned_50"],
  indigenous_business: ["indigenous_owned_50"],
  aboriginal_owned_nt_tourism: ["indigenous_owned_50"],
  regional_qld: ["regional_founder"],
  eligible_income_support: ["jobseeker_recipient"],
  age_max: ["young_founder_under_30"],
  migrant_or_refugee_cofounder: ["migrant_refugee"],
  migrant_refugee_or_intl_student: ["migrant_refugee"],
  disability_founder: ["disability"],
  veteran: ["veteran"],
};

const DEMOGRAPHIC_NAME_RE =
  /\b(female|women|woman|indigenous|aboriginal|first nations|deadly|youth|young founders?|migrant|refugee|veteran)\b/i;

/** eligibility keys that say "must be in this sector" (checked against industry_tags). */
export const SECTOR_GATE_KEYS = new Set([
  "nrf_priority_area",
  "renewable_nexus",
  "climate_tech",
  "nature_tech",
  "agrifood_tech",
  "medtech",
  "cyber",
  "deep_tech",
  "ai_native",
  "ai_product",
  "social_enterprise",
  "circular_economy",
  "disability_tech",
  "theme_fit",
  "impact",
]);

/** eligibility keys that mean "you must belong to a university / research org". */
export const AFFILIATION_ANY_KEYS = new Set([
  "university_student",
  "university_member",
  "early_career_researcher",
  "research_team",
  "darwin_student",
]);

/** eligibility keys that make a row *not* for founders at all. */
export const NOT_FOR_FOUNDERS_KEYS = new Set([
  "applicant_type",
  "applicant_is_provider",
  "applicant_is_incubator",
  "audience",
]);

/** Region strings on programs that mean "any Australian founder may apply". */
const NATIONAL_REGION_RE = /\b(AU|AU\/NZ|ANZ|across Australia|anywhere in Australia|national|Australia-wide|APAC)\b/i;

export function regionIsNational(region: unknown): boolean {
  return typeof region === "string" && NATIONAL_REGION_RE.test(region);
}

// ─── Dates (UTC, no DST drift) ───────────────────────────────────────────────

const ISO_DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH_RE = /^(\d{4})-(\d{2})$/;

export function utcDay(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function toMonthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

export function addMonths(d: Date, months: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate()));
}

export function firstOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfUtcDay(to).getTime() - startOfUtcDay(from).getTime()) / 86_400_000);
}

/**
 * Parse the loose date strings in the seed: `YYYY-MM-DD`, `YYYY-MM` (start or
 * end of month depending on `edge`). Anything else (rolling, "open", prose)
 * → null.
 */
export function parseSeedDate(v: unknown, edge: "start" | "end" = "start"): Date | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  let m = ISO_DAY_RE.exec(s);
  if (m) {
    const d = utcDay(+m[1], +m[2], +m[3]);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  m = ISO_MONTH_RE.exec(s);
  if (m) {
    const y = +m[1];
    const mo = +m[2];
    if (mo < 1 || mo > 12) return null;
    return edge === "start" ? utcDay(y, mo, 1) : utcDay(y, mo + 1, 0);
  }
  return null;
}

export function isRollingString(v: unknown): boolean {
  return typeof v === "string" && /^(rolling|open|always|eoi open|ongoing|periodic)/i.test(v.trim());
}

export function yearsBetween(from: Date, to: Date): number {
  return daysBetween(from, to) / 365.25;
}

// ─── Stage helpers ───────────────────────────────────────────────────────────

export function stageIndex(stage: string): number {
  const i = (FOUNDER_STAGES as readonly string[]).indexOf(stage);
  return i;
}

/**
 * Distance between the founder's stage and the closest stage a row targets.
 * `null` when the row has no stage tags (neutral). Unknown tag strings in the
 * seed (e.g. `mature_sme`) are ignored.
 */
export function stageDistance(stage: FounderStage, rowTags: readonly string[]): number | null {
  const me = stageIndex(stage);
  let best: number | null = null;
  for (const t of rowTags) {
    const i = stageIndex(t);
    if (i < 0) continue;
    const d = Math.abs(i - me);
    if (best === null || d < best) best = d;
  }
  return best;
}

export function stageAtLeast(stage: FounderStage, min: FounderStage): boolean {
  return stageIndex(stage) >= stageIndex(min);
}

// ─── Status normalisation ────────────────────────────────────────────────────

export type EffectiveStatus = "open" | "upcoming" | "closed" | "paused";

const RECURRING_WINDOWS = new Set([
  "annual",
  "annual_round",
  "multi_round",
  "biennial",
  "challenge_based",
  "rolling",
]);

/** How far back a "closed" recurring round may sit before we stop trusting it recurs. */
const BETWEEN_ROUNDS_LOOKBACK_DAYS = 548; // ~18 months

/**
 * Normalise a grant's seed `status` for matching. A `closed` row whose
 * `application_window` recurs, that has not been superseded, and whose last
 * close date is recent (or unknown) is "between rounds" → `upcoming`.
 */
export function effectiveGrantStatus(row: AuGrantRow, today: Date): EffectiveStatus {
  const status: FundingStatus = row.status;
  if (status === "paused") return "paused";
  if (status === "open" || status === "upcoming") return status;
  if (row.superseded_by) return "closed";
  const win = (row.application_window ?? "").toLowerCase();
  if (!RECURRING_WINDOWS.has(win)) return "closed";
  const closes = parseSeedDate(row.closes_at, "end");
  if (closes && daysBetween(closes, today) > BETWEEN_ROUNDS_LOOKBACK_DAYS) return "closed";
  return "upcoming";
}

/**
 * Programs: a `closed` row with any future application/cohort date is between
 * intakes → `upcoming`. Rows with no future date (Techstars Sydney, SXSW
 * Sydney, River City Labs …) stay closed.
 */
export function effectiveProgramStatus(row: AuProgramRow, today: Date): EffectiveStatus {
  const status: FundingStatus = row.status;
  if (status === "paused") return "paused";
  if (status === "open" || status === "upcoming") return status;
  const future = [
    parseSeedDate(row.applications_open, "start"),
    parseSeedDate(row.applications_close, "end"),
    parseSeedDate(row.next_cohort_start, "start"),
  ].some((d) => d !== null && daysBetween(today, d) >= 0);
  return future ? "upcoming" : "closed";
}

// ─── Demographic gating ──────────────────────────────────────────────────────

export interface DemographicGate {
  /** True when the row is only for founders matching `required` (any of). */
  restricted: boolean;
  required: string[];
}

export function demographicGate(
  name: string,
  demographicTags: readonly string[],
  eligibility: Record<string, unknown>,
  /** Also treat a demographic-flavoured name + tags (no gate key) as restricted. */
  nameHeuristic = true,
): DemographicGate {
  const required = new Set<string>();
  for (const key of Object.keys(eligibility)) {
    const v = eligibility[key];
    if (v === false || v === null || v === undefined) continue;
    for (const tag of DEMOGRAPHIC_GATE_KEYS[key] ?? []) required.add(tag);
  }
  // `individual` + `eligible_income_support` (Self-Employment Assistance) is
  // covered by eligible_income_support above. A demographic-flavoured *name*
  // with tags but no gate key (Boosting Female Founders, First Nations
  // Economics — Women) is treated as restricted to its tags. Parentheticals
  // are ignored so "Startup Weekend (incl. Women edition)" stays open to all.
  const bareName = name.replace(/\(.*?\)/g, " ");
  if (nameHeuristic && required.size === 0 && demographicTags.length > 0 && DEMOGRAPHIC_NAME_RE.test(bareName)) {
    for (const t of demographicTags) required.add(t);
  }
  return { restricted: required.size > 0, required: [...required] };
}

/** True when the founder satisfies at least one required demographic tag. */
export function demographicOverlap(required: readonly string[], founder: Set<string>): boolean {
  return required.some((t) => founder.has(t));
}

// ─── Misc ────────────────────────────────────────────────────────────────────

export function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export function overlap(a: readonly string[], b: readonly string[]): string[] {
  const set = new Set(b);
  return a.filter((x) => set.has(x));
}

/** Normalise "UNSW", "UNSW Sydney", "Curtin (alumni/staff/student/Ignition grad)" → "unsw" / "curtin". */
export function affiliationKey(v: unknown): string {
  const s = asString(v) ?? "";
  return s
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(university|uni|of|the)\b/gi, " ")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase()
    .split(/\s+/)[0] ?? "";
}

/** Known aliases so "University of Melbourne" matches the seed's "UoM". */
const AFFILIATION_ALIASES: Readonly<Record<string, string>> = {
  melbourne: "uom",
  sydney: "usyd",
  queensland: "uq",
  "western": "uwa",
  "new": "unsw",
};

export function affiliationMatches(required: unknown, founderAffiliations: readonly string[]): boolean {
  const want = affiliationKey(required);
  if (!want) return true;
  for (const a of founderAffiliations) {
    const have = affiliationKey(a);
    if (!have) continue;
    if (have === want) return true;
    if ((AFFILIATION_ALIASES[have] ?? have) === want) return true;
    if (have.startsWith(want) || want.startsWith(have)) return true;
  }
  return false;
}

export function formatAud(n: number): string {
  return `A$${Math.round(n).toLocaleString("en-AU")}`;
}
