// Pure mapping from the research seed files
// (web/content/data/grants-au.seed.json, web/content/data/programs-au.seed.json)
// to the au_grants / au_programs row shapes created by migration
// 0311_au_funding.sql.
//
// Shared by `web/scripts/seed-au-funding.mjs` (Node runs this file through
// its built-in type stripping, so keep it free of TS-only *runtime* syntax:
// no enums, no parameter properties, no `@/` aliases, no imports) and by the
// server helpers in ./data.ts. Colocated tests: seed-map.test.ts.
//
// G11-5 (plan §9-pre): seed `city` values include non-capitals (Gold Coast,
// Sunshine Coast, Regional QLD, Wollongong, Geelong, Launceston, Remote), so
// every program is also stamped with the `capital` whose page lists it.

export type AuState = "national" | "NSW" | "VIC" | "QLD" | "WA" | "SA" | "TAS" | "ACT" | "NT";

export type Capital =
  | "Sydney"
  | "Melbourne"
  | "Brisbane"
  | "Perth"
  | "Adelaide"
  | "Canberra"
  | "Hobart"
  | "Darwin"
  | "Remote";

export type FundingStatus = "open" | "closed" | "paused" | "upcoming";

/**
 * One application question for a grant (`au_grants.application_prompts[]`,
 * migration 0323, T0251) or a program (`au_programs.application_prompts[]`,
 * migration 0329, S16-A). `guidance` is a one-line hint from the official
 * guidelines ("generic" marks a fallback set); `max_words` caps the drafted
 * answer.
 */
export interface ApplicationPrompt {
  id: string;
  question: string;
  guidance?: string;
  max_words?: number;
}
export type VerifiedBy = "seed" | "cron" | "agent" | "human";
export type StatusConfidence = "high" | "medium" | "low";

export const AU_STATES: readonly AuState[] = ["national", "NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
export const CAPITALS: readonly Capital[] = [
  "Sydney",
  "Melbourne",
  "Brisbane",
  "Perth",
  "Adelaide",
  "Canberra",
  "Hobart",
  "Darwin",
  "Remote",
];
export const FUNDING_STATUSES: readonly FundingStatus[] = ["open", "closed", "paused", "upcoming"];
export const STATUS_CONFIDENCES: readonly StatusConfidence[] = ["high", "medium", "low"];

/** Non-capital seed cities → the capital page that lists them. */
const CITY_TO_CAPITAL: Readonly<Record<string, Capital>> = {
  sydney: "Sydney",
  wollongong: "Sydney",
  melbourne: "Melbourne",
  geelong: "Melbourne",
  brisbane: "Brisbane",
  "gold coast": "Brisbane",
  "sunshine coast": "Brisbane",
  "regional qld": "Brisbane",
  "regional queensland": "Brisbane",
  perth: "Perth",
  adelaide: "Adelaide",
  canberra: "Canberra",
  hobart: "Hobart",
  launceston: "Hobart",
  darwin: "Darwin",
  remote: "Remote",
  online: "Remote",
  national: "Remote",
  "australia-wide": "Remote",
};

/**
 * The non-capital cities each capital page lists, in display form (S8-A).
 * Rendered in the `/funding/programs/[capital]` copy and metadata so the
 * page ranks for "accelerator Gold Coast" / "startup incubator Geelong"
 * without a route per satellite. Every entry resolves back to its capital
 * through `capitalForCity` (pinned in seed-map.test.ts).
 */
export const CAPITAL_SATELLITES: Readonly<Record<Capital, readonly string[]>> = {
  Sydney: ["Wollongong"],
  Melbourne: ["Geelong"],
  Brisbane: ["Gold Coast", "Sunshine Coast", "Regional Queensland"],
  Perth: [],
  Adelaide: [],
  Canberra: [],
  Hobart: ["Launceston"],
  Darwin: [],
  Remote: [],
};

const STATE_TO_CAPITAL: Readonly<Record<string, Capital>> = {
  NSW: "Sydney",
  VIC: "Melbourne",
  QLD: "Brisbane",
  WA: "Perth",
  SA: "Adelaide",
  ACT: "Canberra",
  TAS: "Hobart",
  NT: "Darwin",
  national: "Remote",
};

/**
 * Resolve the capital page for a seed `city`. Known satellites map to their
 * capital; anything unknown falls back to the state's capital; a missing or
 * unknown state resolves to "Remote" (Australia-wide / online).
 */
export function capitalForCity(city: string | null | undefined, state?: string | null): Capital {
  const key = (city ?? "").trim().toLowerCase();
  if (key && CITY_TO_CAPITAL[key]) return CITY_TO_CAPITAL[key];
  const st = (state ?? "").trim();
  if (st && STATE_TO_CAPITAL[st]) return STATE_TO_CAPITAL[st];
  const upper = st.toUpperCase();
  if (upper && STATE_TO_CAPITAL[upper]) return STATE_TO_CAPITAL[upper];
  return "Remote";
}

// ─── Row shapes (mirror 0311 columns) ────────────────────────────────────────

export interface AuGrantRow {
  id: string;
  name: string;
  provider: string | null;
  level: string;
  state: AuState;
  funding_type: string;
  amount_min_aud: number | null;
  amount_max_aud: number | null;
  amount_note: string | null;
  co_contribution: string | null;
  stage_tags: string[];
  industry_tags: string[];
  demographic_tags: string[];
  eligibility: Record<string, unknown>;
  application_window: string | null;
  opens_at: string | null;
  closes_at: string | null;
  lodgement_deadline: string | null;
  next_round_note: string | null;
  status: FundingStatus;
  superseded_by: string | null;
  exclude_from_matching: boolean;
  official_url: string;
  source_url: string | null;
  summary: string | null;
  how_to_apply: string | null;
  evidence_needed: string[];
  last_verified_at: string | null;
  verified_by: VerifiedBy;
  status_confidence: StatusConfidence;
  sources: unknown[] | null;
  /** Per-grant application questions (0323). Optional so older fixtures / cached rows still type-check; the mapper always sets it. */
  application_prompts?: ApplicationPrompt[];
}

export interface AuProgramRow {
  id: string;
  name: string;
  operator: string | null;
  program_type: string;
  city: string;
  capital: Capital;
  state: AuState;
  venue: string | null;
  stage_tags: string[];
  industry_tags: string[];
  demographic_tags: string[];
  length_weeks: number | null;
  intake_months: number[];
  applications_open: string | null;
  applications_close: string | null;
  next_cohort_start: string | null;
  benefits: string[];
  funding_aud: number | null;
  equity_pct: string | null;
  cost_to_founder: string | null;
  eligibility: Record<string, unknown>;
  status: FundingStatus;
  official_url: string;
  summary: string | null;
  last_verified_at: string | null;
  verified_by: VerifiedBy;
  status_confidence: StatusConfidence;
  /** Per-program accelerator application questions (0329, S16-A). Optional so older fixtures / cached rows still type-check; the mapper always sets it. */
  application_prompts?: ApplicationPrompt[];
}

// ─── Coercion helpers ────────────────────────────────────────────────────────

type SeedRecord = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function strArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter((x) => x.length > 0);
}

function intArr(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => Number(x)).filter((n) => Number.isInteger(n));
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Only pass ISO `YYYY-MM-DD` through to a `date` column; anything else → null. */
function isoDate(v: unknown): string | null {
  const s = str(v);
  return s && ISO_DATE.test(s) ? s : null;
}

/**
 * Coerce a raw `application_prompts` value to a clean list: drops entries
 * without an id + question, trims strings, keeps `max_words` only when it is
 * a positive integer, and de-duplicates ids (first wins).
 */
export function parseApplicationPrompts(v: unknown): ApplicationPrompt[] {
  if (!Array.isArray(v)) return [];
  const out: ApplicationPrompt[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    const id = str(r.id);
    const question = str(r.question);
    if (!id || !question || seen.has(id)) continue;
    seen.add(id);
    const p: ApplicationPrompt = { id, question };
    const guidance = str(r.guidance);
    if (guidance) p.guidance = guidance;
    const mw = num(r.max_words);
    if (mw !== null && Number.isInteger(mw) && mw > 0) p.max_words = mw;
    out.push(p);
  }
  return out;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  const s = str(v);
  return s && (allowed as readonly string[]).includes(s) ? (s as T) : fallback;
}

function auState(v: unknown): AuState {
  const s = str(v);
  if (!s) return "national";
  if (s.toLowerCase() === "national") return "national";
  return oneOf(s.toUpperCase(), AU_STATES, "national");
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

const VERIFIED_BY: readonly VerifiedBy[] = ["seed", "cron", "agent", "human"];

/** Map one `grants[]` seed entry to an au_grants row. Throws on a missing id/name/url. */
export function mapGrantSeed(raw: SeedRecord): AuGrantRow {
  const id = str(raw.id);
  const name = str(raw.name);
  const officialUrl = str(raw.official_url);
  if (!id) throw new Error("grant seed row is missing id");
  if (!name) throw new Error(`grant seed ${id} is missing name`);
  if (!officialUrl) throw new Error(`grant seed ${id} is missing official_url`);

  const excluded = raw.exclude_from_matching === true || name === "__data_sources__";

  return {
    id,
    name,
    provider: str(raw.provider),
    level: str(raw.level) ?? "federal",
    state: auState(raw.state),
    funding_type: str(raw.funding_type) ?? "grant",
    amount_min_aud: num(raw.amount_min_aud),
    amount_max_aud: num(raw.amount_max_aud),
    amount_note: str(raw.amount_note),
    co_contribution: str(raw.co_contribution),
    stage_tags: strArr(raw.stage_tags),
    industry_tags: strArr(raw.industry_tags),
    demographic_tags: strArr(raw.demographic_tags),
    eligibility: obj(raw.eligibility),
    application_window: str(raw.application_window),
    opens_at: isoDate(raw.opens_at),
    closes_at: isoDate(raw.closes_at),
    lodgement_deadline: str(raw.lodgement_deadline),
    next_round_note: str(raw.next_round_note),
    status: oneOf(raw.status, FUNDING_STATUSES, "open"),
    superseded_by: str(raw.superseded_by),
    exclude_from_matching: excluded,
    official_url: officialUrl,
    source_url: str(raw.source_url),
    summary: str(raw.summary),
    how_to_apply: str(raw.how_to_apply),
    evidence_needed: strArr(raw.evidence_needed),
    last_verified_at: isoDate(raw.last_verified_at),
    verified_by: oneOf(raw.verified_by, VERIFIED_BY, "seed"),
    status_confidence: oneOf(raw.status_confidence, STATUS_CONFIDENCES, "medium"),
    sources: Array.isArray(raw.sources) ? (raw.sources as unknown[]) : null,
    application_prompts: parseApplicationPrompts(raw.application_prompts),
  };
}

/** Map one `programs[]` seed entry to an au_programs row (derives `capital`). */
export function mapProgramSeed(raw: SeedRecord): AuProgramRow {
  const id = str(raw.id);
  const name = str(raw.name);
  const officialUrl = str(raw.official_url);
  if (!id) throw new Error("program seed row is missing id");
  if (!name) throw new Error(`program seed ${id} is missing name`);
  if (!officialUrl) throw new Error(`program seed ${id} is missing official_url`);

  const state = auState(raw.state);
  const city = str(raw.city) ?? (state === "national" ? "Remote" : STATE_TO_CAPITAL[state]);

  return {
    id,
    name,
    operator: str(raw.operator),
    program_type: str(raw.program_type) ?? "community",
    city,
    capital: capitalForCity(city, state),
    state,
    venue: str(raw.venue),
    stage_tags: strArr(raw.stage_tags),
    industry_tags: strArr(raw.industry_tags),
    demographic_tags: strArr(raw.demographic_tags),
    length_weeks: num(raw.length_weeks),
    intake_months: intArr(raw.intake_months),
    applications_open: str(raw.applications_open),
    applications_close: str(raw.applications_close),
    next_cohort_start: str(raw.next_cohort_start),
    benefits: strArr(raw.benefits),
    funding_aud: num(raw.funding_aud),
    equity_pct: str(raw.equity_pct),
    cost_to_founder: str(raw.cost_to_founder),
    eligibility: obj(raw.eligibility),
    status: oneOf(raw.status, FUNDING_STATUSES, "open"),
    official_url: officialUrl,
    summary: str(raw.summary),
    last_verified_at: isoDate(raw.last_verified_at),
    verified_by: oneOf(raw.verified_by, VERIFIED_BY, "seed"),
    status_confidence: oneOf(raw.status_confidence, STATUS_CONFIDENCES, "medium"),
    application_prompts: parseApplicationPrompts(raw.application_prompts),
  };
}

/** Map a whole seed file's `grants[]`; duplicate ids throw so a bad merge fails loudly. */
export function mapGrantSeeds(rows: unknown): AuGrantRow[] {
  return dedupe(Array.isArray(rows) ? rows.map((r) => mapGrantSeed(obj(r))) : [], "grant");
}

/** Map a whole seed file's `programs[]`. */
export function mapProgramSeeds(rows: unknown): AuProgramRow[] {
  return dedupe(Array.isArray(rows) ? rows.map((r) => mapProgramSeed(obj(r))) : [], "program");
}

function dedupe<T extends { id: string }>(rows: T[], kind: string): T[] {
  const seen = new Set<string>();
  for (const r of rows) {
    if (seen.has(r.id)) throw new Error(`duplicate ${kind} seed id: ${r.id}`);
    seen.add(r.id);
  }
  return rows;
}
