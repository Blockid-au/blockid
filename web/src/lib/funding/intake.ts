// /funding intake → GrantProfile (T0242, plan §4a / §4e).
//
// One parser shared by the three routes that accept the 3-question intake
// (POST /api/funding/preview, /checkout, /report) and by the client form, so
// the vocabulary (states, stages, industry tags, demographic toggles) lives in
// exactly one place. Pure — no I/O, no `server-only` — importable from the
// client component, the API routes and vitest.
//
// The parser is forgiving on optional fields (unknown → null, never a 400)
// and strict on the three required answers: description, state, stage.
//
// Colocated tests: intake.test.ts.

import {
  FOUNDER_STAGES,
  type FounderStage,
  type GrantProfile,
  type ProfileState,
} from "@/lib/agents/grant-advisor";

// ─── Vocab ───────────────────────────────────────────────────────────────────

export const INTAKE_STATES: readonly ProfileState[] = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

/** 9th option in the state select — "not incorporated yet" (plan §4f). */
export const NOT_INCORPORATED = "not_incorporated" as const;
export type IntakeState = ProfileState | typeof NOT_INCORPORATED;

export const STATE_OPTIONS: ReadonlyArray<{ value: IntakeState; label: string }> = [
  { value: "NSW", label: "New South Wales" },
  { value: "VIC", label: "Victoria" },
  { value: "QLD", label: "Queensland" },
  { value: "WA", label: "Western Australia" },
  { value: "SA", label: "South Australia" },
  { value: "TAS", label: "Tasmania" },
  { value: "ACT", label: "Australian Capital Territory" },
  { value: "NT", label: "Northern Territory" },
  { value: NOT_INCORPORATED, label: "Not incorporated yet" },
];

/** The five stages the intake offers (plan §4a). `export_ready` is accepted on input but not offered. */
export const INTAKE_STAGES: ReadonlyArray<{ value: FounderStage; label: string; hint: string }> = [
  { value: "idea", label: "Idea", hint: "Nothing built yet" },
  { value: "pre_revenue_prototype", label: "Pre-revenue prototype", hint: "Something works, nobody pays" },
  { value: "mvp", label: "MVP", hint: "First users, first feedback" },
  { value: "early_revenue", label: "Early revenue", hint: "Paying customers, not yet repeatable" },
  { value: "scaling", label: "Scaling", hint: "Repeatable sales, hiring to grow" },
];

/** §5d industry taxonomy with the labels the multi-select shows. */
export const INDUSTRY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "software_saas", label: "Software / SaaS" },
  { value: "ai_ml", label: "AI / machine learning" },
  { value: "fintech", label: "Fintech" },
  { value: "healthtech_medtech", label: "Healthtech / medtech" },
  { value: "biotech_pharma", label: "Biotech / pharma" },
  { value: "cleantech_renewables", label: "Cleantech / renewables" },
  { value: "climate", label: "Climate" },
  { value: "agtech_food", label: "Agtech / food" },
  { value: "advanced_manufacturing", label: "Advanced manufacturing" },
  { value: "defence_dualuse", label: "Defence / dual-use" },
  { value: "space", label: "Space" },
  { value: "quantum", label: "Quantum" },
  { value: "mining_resources_tech", label: "Mining / resources tech" },
  { value: "edtech", label: "Edtech" },
  { value: "proptech", label: "Proptech" },
  { value: "retail_ecommerce", label: "Retail / e-commerce" },
  { value: "creative_media", label: "Creative / media" },
  { value: "tourism_hospitality", label: "Tourism / hospitality" },
  { value: "construction", label: "Construction" },
  { value: "transport_logistics", label: "Transport / logistics" },
  { value: "professional_services", label: "Professional services" },
  { value: "social_enterprise", label: "Social enterprise" },
];

const INDUSTRY_SET = new Set(INDUSTRY_OPTIONS.map((o) => o.value));

/** Toggle → §5d demographic tag. */
export const DEMOGRAPHIC_TOGGLES: ReadonlyArray<{ key: DemographicToggle; tag: string; label: string }> = [
  { key: "women_led", tag: "women_led", label: "Women-led" },
  { key: "indigenous_owned", tag: "indigenous_owned_50", label: "Indigenous-owned (50%+)" },
  { key: "regional", tag: "regional_founder", label: "Regional / outside a capital" },
  { key: "under_30", tag: "young_founder_under_30", label: "Founder under 30" },
];
export type DemographicToggle = "women_led" | "indigenous_owned" | "regional" | "under_30";

export const DESCRIPTION_MIN = 10;
export const DESCRIPTION_MAX = 2000;

// ─── Shape ───────────────────────────────────────────────────────────────────

/** What the /funding form posts. Optional block = the "improve my match" drawer. */
export interface FundingIntake {
  description: string;
  state: IntakeState;
  /** When `state === "not_incorporated"`: where the founder is based, if they said. */
  based_state?: ProfileState | null;
  stage: FounderStage;
  city?: string | null;
  industry_tags?: string[];
  women_led?: boolean;
  indigenous_owned?: boolean;
  regional?: boolean;
  under_30?: boolean;
  turnover_aud?: number | null;
  rd_spend_aud?: number | null;
  incorporated_year?: number | null;
  headcount?: number | null;
  export_intent?: boolean | null;
  funding_need_aud?: number | null;
}

export type IntakeParse =
  | { ok: true; intake: FundingIntake }
  | { ok: false; error: string; field: keyof FundingIntake };

// ─── Parse ───────────────────────────────────────────────────────────────────

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function bool(v: unknown): boolean {
  return v === true || v === "true" || v === "on" || v === 1 || v === "1";
}

function optBool(v: unknown): boolean | null {
  if (v === null || v === undefined || v === "") return null;
  return bool(v);
}

/** Non-negative finite number or null. Accepts "12,000" and "A$12000". */
function money(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function intOrNull(v: unknown, min: number, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9]/g, ""));
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function isProfileState(v: string): v is ProfileState {
  return (INTAKE_STATES as readonly string[]).includes(v);
}

function isStage(v: string): v is FounderStage {
  return (FOUNDER_STAGES as readonly string[]).includes(v);
}

/**
 * Validate an untrusted body into a `FundingIntake`. The three required
 * answers return a 400-able error with the offending field; everything else
 * degrades to null / [] / false.
 */
export function parseFundingIntake(body: unknown): IntakeParse {
  const raw = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const description = str(raw.description);
  if (description.length < DESCRIPTION_MIN) {
    return { ok: false, field: "description", error: `Tell us what you are building (at least ${DESCRIPTION_MIN} characters).` };
  }
  if (description.length > DESCRIPTION_MAX) {
    return { ok: false, field: "description", error: `Keep the description under ${DESCRIPTION_MAX} characters.` };
  }

  const stateRaw = str(raw.state).toUpperCase() === NOT_INCORPORATED.toUpperCase() ? NOT_INCORPORATED : str(raw.state).toUpperCase();
  let state: IntakeState;
  if (stateRaw === NOT_INCORPORATED) state = NOT_INCORPORATED;
  else if (isProfileState(stateRaw)) state = stateRaw;
  else return { ok: false, field: "state", error: "Pick your state, or “Not incorporated yet”." };

  const basedRaw = str(raw.based_state).toUpperCase();
  const based_state = isProfileState(basedRaw) ? basedRaw : null;

  const stageRaw = str(raw.stage).toLowerCase();
  if (!isStage(stageRaw)) {
    return { ok: false, field: "stage", error: "Pick the stage that best describes you." };
  }

  const tags = Array.isArray(raw.industry_tags)
    ? Array.from(new Set(raw.industry_tags.map((t) => str(t).toLowerCase()).filter((t) => INDUSTRY_SET.has(t)))).slice(0, 6)
    : [];

  const city = str(raw.city).slice(0, 80) || null;
  const currentYear = new Date().getUTCFullYear();

  return {
    ok: true,
    intake: {
      description,
      state,
      based_state,
      stage: stageRaw,
      city,
      industry_tags: tags,
      women_led: bool(raw.women_led),
      indigenous_owned: bool(raw.indigenous_owned),
      regional: bool(raw.regional),
      under_30: bool(raw.under_30),
      turnover_aud: money(raw.turnover_aud),
      rd_spend_aud: money(raw.rd_spend_aud),
      incorporated_year: intOrNull(raw.incorporated_year, 1950, currentYear),
      headcount: intOrNull(raw.headcount, 0, 100_000),
      export_intent: optBool(raw.export_intent),
      funding_need_aud: money(raw.funding_need_aud),
    },
  };
}

// ─── Intake → GrantProfile ───────────────────────────────────────────────────

/**
 * True when the founder gave us no location at all ("not incorporated yet"
 * and no based-in state). The matcher then sees only national rows so the
 * preview is never empty and never claims a state grant they cannot get.
 */
export function locationUnknown(intake: FundingIntake): boolean {
  return intake.state === NOT_INCORPORATED && !intake.based_state;
}

/** The state the matcher uses. Falls back to NSW only when location is unknown — see `locationUnknown`. */
export function effectiveState(intake: FundingIntake): ProfileState {
  if (intake.state !== NOT_INCORPORATED) return intake.state;
  return intake.based_state ?? "NSW";
}

export function intakeToGrantProfile(intake: FundingIntake): GrantProfile {
  const demographics = DEMOGRAPHIC_TOGGLES.filter((t) => intake[t.key] === true).map((t) => t.tag);
  return {
    state: effectiveState(intake),
    city: intake.city ?? null,
    // A founder who is not incorporated has no entity yet → unknown, so the
    // "incorporated company" checklist item renders as "?" not "✗".
    entity_type: intake.state === NOT_INCORPORATED ? null : "pty_ltd",
    incorporated_at:
      intake.state !== NOT_INCORPORATED && intake.incorporated_year ? `${intake.incorporated_year}-01-01` : null,
    turnover_aud: intake.turnover_aud ?? null,
    rd_spend_aud: intake.rd_spend_aud ?? null,
    headcount: intake.headcount ?? null,
    founder_demographics: demographics,
    export_intent: intake.export_intent ?? null,
    stage: intake.stage,
    industry_tags: intake.industry_tags ?? [],
    funding_need_aud: intake.funding_need_aud ?? null,
    description: intake.description,
  };
}

/** Mirror of `project_grant_profiles` columns for the signed-in upsert (§4b). */
export function intakeToProjectGrantProfile(intake: FundingIntake): Record<string, unknown> {
  const p = intakeToGrantProfile(intake);
  return {
    state: intake.state === NOT_INCORPORATED ? (intake.based_state ?? null) : intake.state,
    city: p.city,
    entity_type: p.entity_type,
    incorporated_at: p.incorporated_at,
    turnover_aud: p.turnover_aud,
    rd_spend_aud: p.rd_spend_aud,
    headcount: p.headcount,
    founder_demographics: p.founder_demographics ?? [],
    export_intent: p.export_intent ?? false,
    updated_at: new Date().toISOString(),
  };
}

/** Human line for the report header ("NSW · MVP · fintech, ai_ml"). */
export function describeIntake(intake: FundingIntake): string {
  const where =
    intake.state === NOT_INCORPORATED
      ? intake.based_state
        ? `Not incorporated yet · based in ${intake.based_state}`
        : "Not incorporated yet"
      : intake.state;
  const stage = INTAKE_STAGES.find((s) => s.value === intake.stage)?.label ?? intake.stage;
  const tags = (intake.industry_tags ?? []).map((t) => INDUSTRY_OPTIONS.find((o) => o.value === t)?.label ?? t);
  return [where, stage, tags.length ? tags.join(", ") : null].filter(Boolean).join(" · ");
}
