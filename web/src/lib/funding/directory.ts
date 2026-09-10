// Pure helpers behind the free /funding/grants and /funding/programs
// directories (T0241, G11). No I/O, no `server-only` — importable from the
// server pages, the server components in components/funding/, and vitest.
//
// Positioning (plan §5a): the lists and official links are free and
// indexable; what BlockID sells is the analysis. Every helper here therefore
// renders what the row says — counts, A$ ranges and dates come from the
// table, never from copy.
//
// Colocated tests: directory.test.ts.

import type { AuGrantRow, AuProgramRow, Capital, FundingStatus } from "./seed-map";
import { CAPITALS } from "./seed-map";

export const SITE_URL = "https://blockid.au";

// ─── Label maps (plan §5d taxonomy) ──────────────────────────────────────────

export const FUNDING_TYPE_LABELS: Readonly<Record<string, string>> = {
  grant: "Grant",
  matched_grant: "Matched grant",
  voucher: "Voucher",
  rebate: "Rebate",
  tax_offset_refundable: "Refundable tax offset",
  tax_offset_nonrefundable: "Non-refundable tax offset",
  tax_deduction: "Tax deduction",
  loan_concessional: "Concessional loan",
  loan_unsecured: "Unsecured loan",
  equity: "Equity",
  co_investment: "Co-investment",
  accelerator: "Accelerator",
  competition_showcase: "Competition / showcase",
  advisory_service: "Advisory service",
  wage_subsidy: "Wage subsidy",
  procurement_access: "Procurement access",
};

export const STAGE_LABELS: Readonly<Record<string, string>> = {
  idea: "Idea",
  pre_revenue_prototype: "Pre-revenue prototype",
  mvp: "MVP",
  early_revenue: "Early revenue",
  scaling: "Scaling",
  export_ready: "Export-ready",
  mature_sme: "Mature SME",
};

export const LEVEL_LABELS: Readonly<Record<string, string>> = {
  federal: "Federal",
  state: "State",
  territory: "Territory",
  local: "Local council",
  university: "University",
  private: "Private",
  rdc: "Research & development corporation",
};

export const PROGRAM_TYPE_LABELS: Readonly<Record<string, string>> = {
  accelerator: "Accelerator",
  pre_accelerator: "Pre-accelerator",
  incubator: "Incubator",
  university: "University program",
  competition: "Competition",
  community: "Community",
  corporate: "Corporate program",
  angel_group: "Angel group",
  event: "Event",
  government: "Government program",
  vc: "Venture capital",
  rd_advance_loan: "R&D advance loan",
  advisory: "Advisory",
};

export const STATE_LABELS: Readonly<Record<string, string>> = {
  national: "National",
  NSW: "New South Wales",
  VIC: "Victoria",
  QLD: "Queensland",
  WA: "Western Australia",
  SA: "South Australia",
  TAS: "Tasmania",
  ACT: "Australian Capital Territory",
  NT: "Northern Territory",
};

/** `snake_case_key` → "Snake case key". Used for any tag or key without a curated label. */
export function humanize(key: string): string {
  const s = key.replace(/[_-]+/g, " ").trim();
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function fundingTypeLabel(t: string): string {
  return FUNDING_TYPE_LABELS[t] ?? humanize(t);
}
export function stageLabel(t: string): string {
  return STAGE_LABELS[t] ?? humanize(t);
}
export function levelLabel(t: string): string {
  return LEVEL_LABELS[t] ?? humanize(t);
}
export function programTypeLabel(t: string): string {
  return PROGRAM_TYPE_LABELS[t] ?? humanize(t);
}
export function stateLabel(s: string): string {
  return STATE_LABELS[s] ?? s;
}

// ─── Status ──────────────────────────────────────────────────────────────────

export const STATUS_ORDER: readonly FundingStatus[] = ["open", "upcoming", "paused", "closed"];

export const STATUS_LABELS: Readonly<Record<FundingStatus, string>> = {
  open: "Open",
  upcoming: "Upcoming",
  paused: "Paused",
  closed: "Closed — do not apply",
};

export function statusRank(status: FundingStatus): number {
  const i = STATUS_ORDER.indexOf(status);
  return i === -1 ? STATUS_ORDER.length : i;
}

/** Secondary line for the chip: the close date or the next-round note. */
export function statusDetail(row: {
  status: FundingStatus;
  closes_at?: string | null;
  next_round_note?: string | null;
  applications_close?: string | null;
}): string | null {
  const closes = row.closes_at ?? row.applications_close ?? null;
  if (row.status === "open" && closes) return `closes ${formatLooseDate(closes)}`;
  if (row.status === "upcoming") {
    if (row.next_round_note) return row.next_round_note;
    if (closes) return `applications close ${formatLooseDate(closes)}`;
  }
  if (row.status === "paused" && row.next_round_note) return row.next_round_note;
  return null;
}

// ─── Money ───────────────────────────────────────────────────────────────────

const AUD = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 });

/** "A$25,000" — no decimals, en-AU grouping. */
export function formatAudCompact(n: number): string {
  return `A$${AUD.format(Math.round(n))}`;
}

/** "A$10,000 – A$50,000" · "up to A$50,000" · "from A$10,000" · note or "Amount varies". */
export function formatAudRange(
  min: number | null | undefined,
  max: number | null | undefined,
  note?: string | null,
): string {
  const hasMin = typeof min === "number" && Number.isFinite(min) && min > 0;
  const hasMax = typeof max === "number" && Number.isFinite(max) && max > 0;
  if (hasMin && hasMax) {
    return min === max ? formatAudCompact(max!) : `${formatAudCompact(min!)} – ${formatAudCompact(max!)}`;
  }
  if (hasMax) return `up to ${formatAudCompact(max!)}`;
  if (hasMin) return `from ${formatAudCompact(min!)}`;
  return note?.trim() ? note.trim() : "Amount varies";
}

// ─── Grants: stats + filters ─────────────────────────────────────────────────

export interface GrantStats {
  total: number;
  open: number;
  /** Sum of `amount_max_aud` across open rows (rows without a max add 0). */
  openMaxAud: number;
}

export function grantStats(rows: ReadonlyArray<AuGrantRow>): GrantStats {
  let open = 0;
  let openMaxAud = 0;
  for (const r of rows) {
    if (r.exclude_from_matching) continue;
    if (r.status !== "open") continue;
    open += 1;
    if (typeof r.amount_max_aud === "number" && Number.isFinite(r.amount_max_aud)) {
      openMaxAud += r.amount_max_aud;
    }
  }
  return { total: rows.filter((r) => !r.exclude_from_matching).length, open, openMaxAud };
}

export interface GrantFilters {
  state: string | null;
  type: string | null;
  stage: string | null;
  status: FundingStatus | null;
}

export type SearchParamsLike = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  const t = (s ?? "").trim();
  return t.length ? t : null;
}

const SAFE_TOKEN = /^[A-Za-z0-9_-]{1,40}$/;

function token(v: string | string[] | undefined): string | null {
  const s = first(v);
  return s && SAFE_TOKEN.test(s) ? s : null;
}

function statusToken(v: string | string[] | undefined): FundingStatus | null {
  const s = token(v);
  return s && (STATUS_ORDER as readonly string[]).includes(s) ? (s as FundingStatus) : null;
}

/** `?state=NSW&type=grant&stage=mvp&status=open` → typed filters; junk is dropped. */
export function parseGrantFilters(sp: SearchParamsLike | null | undefined): GrantFilters {
  const p = sp ?? {};
  const rawState = token(p.state);
  const state = rawState ? (rawState.toLowerCase() === "national" ? "national" : rawState.toUpperCase()) : null;
  return { state, type: token(p.type), stage: token(p.stage), status: statusToken(p.status) };
}

export function applyGrantFilters(rows: ReadonlyArray<AuGrantRow>, f: GrantFilters): AuGrantRow[] {
  return rows.filter((r) => {
    if (r.exclude_from_matching) return false;
    if (f.state && f.state !== "national" && r.state !== f.state && r.state !== "national") return false;
    if (f.state === "national" && r.state !== "national") return false;
    if (f.type && r.funding_type !== f.type) return false;
    if (f.stage && !r.stage_tags.includes(f.stage)) return false;
    if (f.status && r.status !== f.status) return false;
    return true;
  });
}

/** Sort open → upcoming → paused → closed, then A–Z. */
export function sortByStatusThenName<T extends { status: FundingStatus; name: string }>(rows: ReadonlyArray<T>): T[] {
  return [...rows].sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.name.localeCompare(b.name, "en-AU"));
}

// ─── Programs: filters ───────────────────────────────────────────────────────

export interface ProgramFilters {
  capital: Capital | null;
  type: string | null;
  stage: string | null;
  status: FundingStatus | null;
}

export function parseProgramFilters(sp: SearchParamsLike | null | undefined): ProgramFilters {
  const p = sp ?? {};
  return {
    capital: capitalFromSlug(token(p.capital)),
    type: token(p.type),
    stage: token(p.stage),
    status: statusToken(p.status),
  };
}

export function applyProgramFilters(rows: ReadonlyArray<AuProgramRow>, f: ProgramFilters): AuProgramRow[] {
  return rows.filter((r) => {
    if (f.capital && r.capital !== f.capital) return false;
    if (f.type && r.program_type !== f.type) return false;
    if (f.stage && !r.stage_tags.includes(f.stage)) return false;
    if (f.status && r.status !== f.status) return false;
    return true;
  });
}

/** Distinct values in first-seen order, for building filter chips off the data. */
export function distinct(values: ReadonlyArray<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/**
 * Build a chip href: `base` plus the current filters with `patch` applied.
 * `null` in the patch removes the key. Keys with null values are omitted.
 */
export function filterHref(
  base: string,
  current: Record<string, string | null>,
  patch: Record<string, string | null> = {},
): string {
  const merged: Record<string, string | null> = { ...current, ...patch };
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (v) qs.set(k, v);
  }
  const s = qs.toString();
  return s ? `${base}?${s}` : base;
}

// ─── Capitals ────────────────────────────────────────────────────────────────

export function capitalSlug(c: Capital | string): string {
  return c.toLowerCase();
}

/** "sydney" / "Sydney" / "SYDNEY" → "Sydney"; anything else → null. */
export function capitalFromSlug(slug: string | null | undefined): Capital | null {
  const key = (slug ?? "").trim().toLowerCase();
  if (!key) return null;
  return CAPITALS.find((c) => c.toLowerCase() === key) ?? null;
}

/** Display name; Remote reads as "Australia-wide / online" (G11-5). */
export function capitalDisplayName(c: Capital): string {
  return c === "Remote" ? "Australia-wide / online" : c;
}

export function countByCapital(rows: ReadonlyArray<AuProgramRow>): Record<Capital, { total: number; open: number }> {
  const out = Object.fromEntries(CAPITALS.map((c) => [c, { total: 0, open: 0 }])) as Record<
    Capital,
    { total: number; open: number }
  >;
  for (const r of rows) {
    const slot = out[r.capital];
    if (!slot) continue;
    slot.total += 1;
    if (r.status === "open") slot.open += 1;
  }
  return out;
}

// ─── Eligibility → checklist ─────────────────────────────────────────────────

export interface EligibilityRequirement {
  key: string;
  label: string;
  /** Rendered value ("Yes", "A$20,000,000", "3 years", free text). */
  value: string;
}

type ValueKind = "bool" | "aud" | "years" | "pct" | "count" | "months" | "weeks" | "text";

interface EligibilityLabel {
  label: string;
  kind: ValueKind;
}

/** Curated labels for the gates the seed actually carries (plan §5d + observed keys). */
export const ELIGIBILITY_LABELS: Readonly<Record<string, EligibilityLabel>> = {
  has_abn: { label: "Holds an ABN", kind: "bool" },
  gst_registered: { label: "Registered for GST", kind: "bool" },
  is_company_acn: { label: "Incorporated company (ACN)", kind: "bool" },
  au_incorporated: { label: "Incorporated in Australia", kind: "bool" },
  au_entity: { label: "Australian entity", kind: "bool" },
  au_based_project: { label: "Project carried out in Australia", kind: "bool" },
  not_foreign_subsidiary: { label: "Not a subsidiary of a foreign company", kind: "bool" },
  not_listed: { label: "Not listed on a stock exchange", kind: "bool" },
  not_tax_exempt: { label: "Not tax-exempt", kind: "bool" },
  not_bankrupt: { label: "Not bankrupt or insolvent", kind: "bool" },
  turnover_max: { label: "Annual turnover at most", kind: "aud" },
  turnover_min: { label: "Annual turnover at least", kind: "aud" },
  turnover_max_for_refundable: { label: "Turnover cap for the refundable offset", kind: "aud" },
  turnover_min_tier3: { label: "Turnover threshold (tier 3)", kind: "aud" },
  turnover_and_opex_max: { label: "Turnover and operating expenses at most", kind: "aud" },
  rd_spend_min: { label: "Eligible R&D spend at least", kind: "aud" },
  revenue_max: { label: "Revenue at most", kind: "aud" },
  revenue_range_aud: { label: "Revenue range", kind: "text" },
  prior_year_expenses_max: { label: "Prior-year expenses at most", kind: "aud" },
  prior_year_income_max: { label: "Prior-year assessable income at most", kind: "aud" },
  prior_raise_max: { label: "Capital raised so far at most", kind: "aud" },
  export_spend_capacity_min: { label: "Eligible export spend at least", kind: "aud" },
  fte_max: { label: "Full-time employees at most", kind: "count" },
  team_max: { label: "Team size at most", kind: "count" },
  team_size: { label: "Team size", kind: "text" },
  min_industry_partners: { label: "Industry partners at least", kind: "count" },
  trading_years_max: { label: "Trading for at most", kind: "years" },
  trading_years_min: { label: "Trading for at least", kind: "years" },
  or_trading_years_max: { label: "Or trading for at most", kind: "years" },
  incorporated_years_max: { label: "Incorporated within the last", kind: "years" },
  company_age_max_years: { label: "Company age at most", kind: "years" },
  startup_age_max_years: { label: "Startup age at most", kind: "years" },
  project_years_max: { label: "Project length at most", kind: "years" },
  age_max: { label: "Founder age at most", kind: "text" },
  runway_months_min: { label: "Runway at least", kind: "months" },
  growth_3yr_min_pct: { label: "Three-year growth at least", kind: "pct" },
  owns_ip: { label: "Owns or controls the IP", kind: "bool" },
  has_product: { label: "Has a product", kind: "bool" },
  has_revenue: { label: "Has revenue", kind: "bool" },
  mvp_or_beyond: { label: "MVP or later", kind: "bool" },
  customer_validated: { label: "Customer-validated", kind: "bool" },
  traction_required: { label: "Traction required", kind: "bool" },
  has_lead_investor: { label: "Has a lead investor", kind: "bool" },
  requires_investor_lead: { label: "Requires a lead investor", kind: "bool" },
  requires_research_partner: { label: "Requires a research partner", kind: "bool" },
  requires_export_training: { label: "Requires export training", kind: "bool" },
  export_intent: { label: "Intends to export", kind: "bool" },
  has_export_contract: { label: "Has an export contract", kind: "bool" },
  repayment_capacity: { label: "Can demonstrate repayment capacity", kind: "bool" },
  cannot_get_commercial_finance: { label: "Unable to obtain commercial finance", kind: "bool" },
  freehold_security_lvr_max: { label: "Freehold security LVR at most", kind: "pct" },
  hq_required: { label: "Headquartered in", kind: "text" },
  hq_or_rd_in: { label: "HQ or R&D located in", kind: "text" },
  region: { label: "Region", kind: "text" },
  lga: { label: "Local government area", kind: "text" },
  regional_qld: { label: "Regional Queensland", kind: "bool" },
  northern_australia_relevance: { label: "Relevant to Northern Australia", kind: "bool" },
  nrf_priority_area: { label: "National Reconstruction Fund priority area", kind: "text" },
  trl_range: { label: "Technology readiness level", kind: "text" },
  innovation_test: { label: "Innovation test", kind: "text" },
  streams: { label: "Streams", kind: "text" },
  stage: { label: "Stage", kind: "text" },
  one_of: { label: "One of", kind: "text" },
  prerequisite: { label: "Prerequisite", kind: "text" },
  applicant_type: { label: "Applicant type", kind: "text" },
  audience: { label: "Audience", kind: "text" },
  theme_fit: { label: "Theme fit", kind: "text" },
  women_founded: { label: "Women-founded", kind: "bool" },
  women_led: { label: "Women-led", kind: "bool" },
  women_owned_min_pct: { label: "Women ownership at least", kind: "pct" },
  women_or_culturally_diverse: { label: "Women or culturally diverse founders", kind: "bool" },
  indigenous_owned_min_pct: { label: "Indigenous ownership at least", kind: "pct" },
  indigenous_owned_controlled_min_pct: { label: "Indigenous owned and controlled at least", kind: "pct" },
  indigenous_business: { label: "Indigenous business", kind: "bool" },
  aboriginal_business: { label: "Aboriginal business", kind: "bool" },
  aboriginal_or_tsi_founder: { label: "Aboriginal or Torres Strait Islander founder", kind: "bool" },
  aboriginal_owned_nt_tourism: { label: "Aboriginal-owned NT tourism business", kind: "bool" },
  migrant_or_refugee_cofounder: { label: "Migrant or refugee co-founder", kind: "bool" },
  migrant_refugee_or_intl_student: { label: "Migrant, refugee or international student", kind: "bool" },
  overseas_national: { label: "Overseas national", kind: "bool" },
  individual: { label: "Applies as an individual", kind: "bool" },
  individuals_pre_team: { label: "Individuals welcome (pre-team)", kind: "bool" },
  open_to_anyone: { label: "Open to anyone", kind: "bool" },
  no_abn_needed: { label: "No ABN needed", kind: "bool" },
  full_time_founders: { label: "Full-time founders", kind: "bool" },
  eligible_income_support: { label: "Receiving eligible income support", kind: "bool" },
  hires_apprentice_priority_list: { label: "Hires an apprentice from the priority list", kind: "bool" },
  university_affiliation: { label: "University affiliation", kind: "text" },
  university_member: { label: "University member", kind: "bool" },
  university_student: { label: "University student", kind: "bool" },
  university_entry: { label: "University entry", kind: "text" },
  darwin_student: { label: "Darwin student", kind: "bool" },
  early_career_researcher: { label: "Early-career researcher", kind: "bool" },
  research_team: { label: "Research team", kind: "bool" },
  research_commercialisation: { label: "Research commercialisation", kind: "bool" },
  lead_is_sme: { label: "Lead applicant is an SME", kind: "bool" },
  applicant_is_incubator: { label: "Applicant is an incubator", kind: "bool" },
  applicant_is_provider: { label: "Applicant is a service provider", kind: "bool" },
  invitation_only: { label: "Invitation only", kind: "bool" },
  intro_meeting_required: { label: "Introductory meeting required", kind: "bool" },
  cluster_based: { label: "Cluster-based", kind: "bool" },
  specialised_equipment: { label: "Specialised equipment", kind: "bool" },
  high_growth: { label: "High-growth", kind: "bool" },
  scaleup: { label: "Scale-up", kind: "bool" },
  pre_seed: { label: "Pre-seed", kind: "bool" },
  private: { label: "Private company", kind: "bool" },
  parent_entity: { label: "Parent entity", kind: "text" },
  us_operations_required: { label: "US operations required", kind: "bool" },
  rdti_eligible: { label: "R&D Tax Incentive eligible", kind: "bool" },
  ignite_ideas_recipient_or_selected: { label: "Ignite Ideas recipient or selected", kind: "bool" },
  thinclab_community: { label: "ThincLab community member", kind: "bool" },
  responds_to_challenge: { label: "Responds to a published challenge", kind: "bool" },
  demonstration_stage: { label: "Demonstration stage", kind: "bool" },
  renewable_nexus: { label: "Renewable-energy nexus", kind: "bool" },
  climate_tech: { label: "Climate tech", kind: "bool" },
  agrifood_tech: { label: "Agrifood tech", kind: "bool" },
  deep_tech: { label: "Deep tech", kind: "bool" },
  medtech: { label: "Medtech", kind: "bool" },
  cyber: { label: "Cyber security", kind: "bool" },
  ai_native: { label: "AI-native", kind: "bool" },
  ai_product: { label: "AI product", kind: "bool" },
  nature_tech: { label: "Nature tech", kind: "bool" },
  circular_economy: { label: "Circular economy", kind: "bool" },
  disability_tech: { label: "Disability tech", kind: "bool" },
  social_enterprise: { label: "Social enterprise", kind: "bool" },
  impact: { label: "Impact focus", kind: "bool" },
};

function formatEligibilityValue(kind: ValueKind, raw: unknown): string {
  if (typeof raw === "boolean") return raw ? "Yes" : "No";
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "number") {
    switch (kind) {
      case "aud":
        return formatAudCompact(raw);
      case "years":
        return `${raw} year${raw === 1 ? "" : "s"}`;
      case "months":
        return `${raw} month${raw === 1 ? "" : "s"}`;
      case "weeks":
        return `${raw} week${raw === 1 ? "" : "s"}`;
      case "pct":
        return `${raw}%`;
      default:
        return String(raw);
    }
  }
  if (Array.isArray(raw)) return raw.map((x) => (typeof x === "string" ? humanize(x) : String(x))).join(", ");
  if (typeof raw === "object") return JSON.stringify(raw);
  return String(raw);
}

/**
 * `eligibility` jsonb → ordered checklist rows. Curated keys get their
 * label and value formatting; unknown keys fall back to `humanize(key)`.
 * Keys whose value is `false` are kept ("No") so a reader sees the gate.
 */
export function eligibilityRequirements(elig: Record<string, unknown> | null | undefined): EligibilityRequirement[] {
  if (!elig || typeof elig !== "object") return [];
  const out: EligibilityRequirement[] = [];
  for (const [key, raw] of Object.entries(elig)) {
    if (raw === null || raw === undefined || raw === "") continue;
    const curated = ELIGIBILITY_LABELS[key];
    const label = curated?.label ?? humanize(key);
    const value = formatEligibilityValue(curated?.kind ?? "text", raw);
    out.push({ key, label, value });
  }
  return out;
}

// ─── Dates ───────────────────────────────────────────────────────────────────

export interface LooseDate {
  year: number;
  /** 1–12 */
  month: number;
  /** 1–31, or null when the source only gave a month. */
  day: number | null;
}

/** Accepts "2026-11-08" and "2026-11"; anything else → null. */
export function parseLooseDate(v: string | null | undefined): LooseDate | null {
  const s = (v ?? "").trim();
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = m[3] ? Number(m[3]) : null;
  if (month < 1 || month > 12) return null;
  if (day !== null && (day < 1 || day > 31)) return null;
  return { year, month, day };
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function monthShort(month: number): string {
  return MONTHS_SHORT[month - 1] ?? "";
}
export function monthLong(month: number): string {
  return MONTHS_LONG[month - 1] ?? "";
}

/** "8 Nov 2026" · "Nov 2026" · original text when it is not a date. */
export function formatLooseDate(v: string | null | undefined): string {
  const d = parseLooseDate(v);
  if (!d) return (v ?? "").trim();
  return d.day === null ? `${monthShort(d.month)} ${d.year}` : `${d.day} ${monthShort(d.month)} ${d.year}`;
}

/** Full ISO YYYY-MM-DD only (for `dateModified` / `Event.startDate`). */
export function isoDateOrNull(v: string | null | undefined): string | null {
  const d = parseLooseDate(v);
  if (!d || d.day === null) return null;
  return `${d.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`;
}

/** YYYY-MM key for calendar grouping. */
export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

// ─── Intake calendar ─────────────────────────────────────────────────────────

export type IntakeEventKind = "applications_close" | "cohort_start" | "usual_intake";

export interface IntakeEvent {
  programId: string;
  programName: string;
  capital: Capital;
  status: FundingStatus;
  kind: IntakeEventKind;
  /** Day of month when the source gave one. */
  day: number | null;
  /** Original text for display ("2026-11-08", "2026-08"). */
  raw: string | null;
}

export interface IntakeMonth {
  key: string;
  year: number;
  month: number;
  label: string;
  events: IntakeEvent[];
}

export const INTAKE_KIND_LABELS: Readonly<Record<IntakeEventKind, string>> = {
  applications_close: "Applications close",
  cohort_start: "Cohort starts",
  usual_intake: "Usual intake month",
};

/**
 * Twelve months starting at `now`'s month. Closed rows are skipped. A
 * program contributes:
 *   - `applications_close` in the window → "Applications close"
 *   - `next_cohort_start`  in the window → "Cohort starts"
 *   - each `intake_months` month in the window that has neither of the
 *     above → "Usual intake month" (so a concrete date is never doubled
 *     with the generic recurring one).
 * Events inside a month are ordered dated-first (by day), then by name.
 */
export function buildIntakeCalendar(
  rows: ReadonlyArray<AuProgramRow>,
  now: Date = new Date(),
  monthsAhead = 12,
): IntakeMonth[] {
  const startYear = now.getUTCFullYear();
  const startMonth = now.getUTCMonth() + 1;
  const months: IntakeMonth[] = [];
  const byKey = new Map<string, IntakeMonth>();
  for (let i = 0; i < monthsAhead; i += 1) {
    const idx = startMonth - 1 + i;
    const year = startYear + Math.floor(idx / 12);
    const month = (idx % 12) + 1;
    const key = monthKey(year, month);
    const m: IntakeMonth = { key, year, month, label: `${monthLong(month)} ${year}`, events: [] };
    months.push(m);
    byKey.set(key, m);
  }

  const push = (key: string, ev: IntakeEvent) => {
    byKey.get(key)?.events.push(ev);
  };

  for (const r of rows) {
    if (r.status === "closed") continue;
    const dated = new Set<string>();
    const base = { programId: r.id, programName: r.name, capital: r.capital, status: r.status };

    const close = parseLooseDate(r.applications_close);
    if (close) {
      const key = monthKey(close.year, close.month);
      dated.add(key);
      push(key, { ...base, kind: "applications_close", day: close.day, raw: r.applications_close });
    }
    const start = parseLooseDate(r.next_cohort_start);
    if (start) {
      const key = monthKey(start.year, start.month);
      dated.add(key);
      push(key, { ...base, kind: "cohort_start", day: start.day, raw: r.next_cohort_start });
    }
    for (const m of months) {
      if (dated.has(m.key)) continue;
      if (r.intake_months.includes(m.month)) {
        push(m.key, { ...base, kind: "usual_intake", day: null, raw: null });
      }
    }
  }

  for (const m of months) {
    m.events.sort((a, b) => {
      const ad = a.day ?? 99;
      const bd = b.day ?? 99;
      return ad - bd || a.programName.localeCompare(b.programName, "en-AU");
    });
  }
  return months;
}

// ─── JSON-LD builders ────────────────────────────────────────────────────────

export function grantUrl(id: string): string {
  return `${SITE_URL}/funding/grants/${encodeURIComponent(id)}`;
}
export function programUrl(capital: Capital, id: string): string {
  return `${SITE_URL}/funding/programs/${capitalSlug(capital)}/${encodeURIComponent(id)}`;
}
export function capitalUrl(capital: Capital): string {
  return `${SITE_URL}/funding/programs/${capitalSlug(capital)}`;
}

/**
 * A grant is a service offered by a government (or RDC / council) — the
 * closest schema.org fit is `GovernmentService`. Amounts ride on an
 * `offers.priceSpecification` so the A$ range is machine-readable.
 */
export function buildGrantJsonLd(g: AuGrantRow): Record<string, unknown> {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "GovernmentService",
    name: g.name,
    url: grantUrl(g.id),
    sameAs: g.official_url,
    description: g.summary ?? undefined,
    serviceType: fundingTypeLabel(g.funding_type),
    areaServed: { "@type": "Country", name: "Australia" },
    audience: { "@type": "BusinessAudience", name: "Australian startups" },
    provider: g.provider ? { "@type": "GovernmentOrganization", name: g.provider } : undefined,
    isPartOf: { "@type": "WebSite", name: "BlockID.au", url: SITE_URL },
  };
  if (g.state !== "national") {
    data.areaServed = { "@type": "State", name: stateLabel(g.state), containedInPlace: { "@type": "Country", name: "Australia" } };
  }
  if (g.amount_max_aud || g.amount_min_aud) {
    data.offers = {
      "@type": "Offer",
      priceCurrency: "AUD",
      priceSpecification: {
        "@type": "PriceSpecification",
        priceCurrency: "AUD",
        minPrice: g.amount_min_aud ?? undefined,
        maxPrice: g.amount_max_aud ?? undefined,
      },
      availability: g.status === "open" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      validThrough: isoDateOrNull(g.closes_at) ?? undefined,
    };
  }
  if (g.last_verified_at) data.dateModified = g.last_verified_at;
  return stripUndefined(data);
}

export function buildProgramJsonLd(p: AuProgramRow): Record<string, unknown> {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: p.name,
    url: programUrl(p.capital, p.id),
    sameAs: p.official_url,
    description: p.summary ?? undefined,
    serviceType: programTypeLabel(p.program_type),
    provider: p.operator ? { "@type": "Organization", name: p.operator } : undefined,
    areaServed: { "@type": "City", name: p.city, containedInPlace: { "@type": "Country", name: "Australia" } },
    audience: { "@type": "BusinessAudience", name: "Australian startups" },
  };
  if (typeof p.funding_aud === "number" && p.funding_aud > 0) {
    data.offers = {
      "@type": "Offer",
      priceCurrency: "AUD",
      description: `Up to ${formatAudCompact(p.funding_aud)} in funding${p.equity_pct ? ` for ${p.equity_pct} equity` : ""}`,
    };
  }
  if (p.last_verified_at) data.dateModified = p.last_verified_at;
  return stripUndefined(data);
}

/** `Event` for every row with a concrete (day-level) `next_cohort_start`. */
export function buildProgramEventsJsonLd(rows: ReadonlyArray<AuProgramRow>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const p of rows) {
    if (p.status === "closed") continue;
    const start = isoDateOrNull(p.next_cohort_start);
    if (!start) continue;
    out.push(
      stripUndefined({
        "@context": "https://schema.org",
        "@type": "Event",
        name: `${p.name} — next cohort`,
        startDate: start,
        eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode:
          p.capital === "Remote"
            ? "https://schema.org/OnlineEventAttendanceMode"
            : "https://schema.org/MixedEventAttendanceMode",
        location:
          p.capital === "Remote"
            ? { "@type": "VirtualLocation", url: p.official_url }
            : { "@type": "Place", name: p.venue ?? p.city, address: { "@type": "PostalAddress", addressLocality: p.city, addressCountry: "AU" } },
        organizer: p.operator ? { "@type": "Organization", name: p.operator } : undefined,
        url: programUrl(p.capital, p.id),
        description: p.summary ?? undefined,
      }),
    );
  }
  return out;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k];
  }
  return obj;
}

// ─── Attribution / verification copy ─────────────────────────────────────────

export const ATTRIBUTION_LINE =
  "Commonwealth-sourced descriptions © Commonwealth of Australia, CC BY 3.0 AU; state sources CC BY 4.0.";

/** Most recent `last_verified_at` across rows, ISO date or null. */
export function latestVerifiedAt(rows: ReadonlyArray<{ last_verified_at: string | null }>): string | null {
  let best: string | null = null;
  for (const r of rows) {
    if (r.last_verified_at && (!best || r.last_verified_at > best)) best = r.last_verified_at;
  }
  return best;
}
