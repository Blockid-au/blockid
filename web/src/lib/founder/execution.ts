// Founder execution rubric — G14-S37 (docs/plans/g14-investor-feedback-
// 2026-09-16.md §5 row S37; judge question C6 "How do you take execution
// capability of the founder team into account?").
//
// Before S37, FTV (15 % of the index) came from regex over prose: the
// founder profile was flattened to a sentence and re-scanned for "serial" /
// "co-founder" / "advisor". This module scores the STRUCTURED profile
// (migration 0408) with a fixed, published rubric and hands the four founder
// signals to computeSVI — the profile is canonical, the regex only fills
// gaps the profile leaves open.
//
//   Rubric (max 100)                     points
//   ─────────────────────────────────────────────
//   prior exits                           30   acquisition / IPO 15 each, shutdown 5 (honest learning), capped
//   prior raises                          15   by round: pre-seed 5 · seed 8 · series A 12 · series B+ 15 · grant / other 4, capped
//   years in domain                       20   2 / year, capped at 10 years
//   role coverage (CEO CTO CPO CFO)       15   CEO 5 · CTO 5 · CPO 3 · CFO 2
//   full-time %                           10   pro rata
//   worked together before                 5
//   GitHub activity                        5   connector snapshot ≥ 10 commits / 30 d = 5, ≥ 1 = 3; URL only = 1
//
//   Cap: 70 while EVERY input is self-reported (execution_source = founder)
//   — lifted when an evaluator ticked `references_checked` on a submitted
//   assessment OR the LinkedIn parser (S-R5) agrees with the profile on
//   years in domain / a prior employer. `capped` + `capReason` are exposed
//   so the report and the founder UI say so.
//
// Pure + deterministic: same inputs → same output (execution.test.ts).
// Client-safe (no I/O, no server-only imports); the loaders live in
// lib/founder/execution-load.ts.

import {
  hasStructuredExecution,
  ROLE_KEYS,
  type ExecutionSource,
  type FounderExecutionFields,
  type FounderProfile,
  type PriorExit,
  type PriorRaise,
  type RoleKey,
} from "@/lib/founder-profile-types";
import type { SVIExtractedSignals } from "@/lib/svi-analysis";

export const EXECUTION_CAP_SELF_REPORTED = 70;
export const EXECUTION_RUBRIC_VERSION = "1.0";

export type ExecutionBreakdownKey = "exits" | "raises" | "years_in_domain" | "roles" | "full_time" | "worked_together" | "github";

export interface ExecutionBreakdownRow {
  key: ExecutionBreakdownKey;
  label: string;
  points: number;
  max: number;
  evidence: string;
  /** Who last wrote the field(s) behind this row. */
  source: ExecutionSource;
}

/** The four founder flags computeSVI scores (svi-analysis.ts FTV block). */
export interface FounderSignalFlags {
  founderExperience: SVIExtractedSignals["founderExperience"];
  hasCoFounder: boolean;
  founderSectorFit: boolean;
  hasAdvisors: boolean;
}

export interface EvaluatorExecutionFlags {
  key_person_risk?: boolean;
  full_time?: boolean;
  complementary_skills?: boolean;
  references_checked?: boolean;
}

/** What the LinkedIn parser (connectors/linkedin-upload.ts) said, if a founder_signals row exists. */
export interface LinkedInAgreementInput {
  yearsInDomain: number | null;
  priorCompanies: string[];
  exits: number;
}

/** GitHub connector snapshot (svi_signals provider = github), if synced. */
export interface GitHubActivityInput {
  recentCommits30d: number | null;
  publicRepos?: number | null;
}

export interface FounderExecutionOptions {
  /** Submitted evaluator assessments' FTV flags for this project (any seat). */
  evaluatorFlags?: EvaluatorExecutionFlags | null;
  linkedin?: LinkedInAgreementInput | null;
  github?: GitHubActivityInput | null;
}

export interface FounderExecutionSignals extends FounderSignalFlags {
  /** false when no profile row exists — the caller keeps the regex signals untouched. */
  hasProfile: boolean;
  /** ≥ 1 structured execution field filled (0408) — the profile overrides the regex. */
  structured: boolean;
  executionScore: number;
  /** The rubric total before the self-reported cap. */
  rawScore: number;
  breakdown: ExecutionBreakdownRow[];
  capped: boolean;
  capReason?: string;
  /** Why the cap was lifted (when it was). */
  capLiftedBy?: "references_checked" | "linkedin_parser";
  /** Sources seen across the scored fields. */
  sources: ExecutionSource[];
  rubricVersion: string;
}

/** The compact summary carried on SVIExtractedSignals / the analysis JSON. */
export interface FounderExecutionSummary {
  score: number;
  rawScore: number;
  capped: boolean;
  capReason?: string;
  breakdown: Array<{ key: ExecutionBreakdownKey; points: number; max: number; evidence: string }>;
  sources: ExecutionSource[];
  rubricVersion: string;
}

const EXIT_POINTS: Record<PriorExit["type"], number> = { acquisition: 15, ipo: 15, shutdown: 5 };
const RAISE_POINTS: Record<PriorRaise["round"], number> = { pre_seed: 5, seed: 8, series_a: 12, series_b_plus: 15, grant: 4, other: 4 };
const ROLE_POINTS: Record<RoleKey, number> = { ceo: 5, cto: 5, cpo: 3, cfo: 2 };
const ROLE_LABEL: Record<RoleKey, string> = { ceo: "CEO", cto: "CTO", cpo: "CPO", cfo: "CFO" };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function sourceOf(p: Partial<FounderExecutionFields>, field: string): ExecutionSource {
  const s = p.execution_source?.[field];
  return s === "linkedin_parser" || s === "github" || s === "evaluator" ? s : "founder";
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Does the LinkedIn parse agree with the profile on years in domain (±1 y) or on a prior employer? */
export function linkedinAgrees(profile: Pick<FounderProfile, "years_in_domain" | "prev_employers">, li: LinkedInAgreementInput | null | undefined): boolean {
  if (!li) return false;
  if (li.yearsInDomain != null && profile.years_in_domain != null && Math.abs(li.yearsInDomain - profile.years_in_domain) <= 1) return true;
  const mine = new Set((profile.prev_employers ?? []).map(norm).filter(Boolean));
  if (mine.size === 0) return false;
  return (li.priorCompanies ?? []).some((c) => {
    const n = norm(c);
    if (!n) return false;
    if (mine.has(n)) return true;
    for (const m of mine) if (m.length >= 4 && (n.includes(m) || m.includes(n))) return true;
    return false;
  });
}

function experienceFrom(p: FounderProfile, exits: PriorExit[], raises: PriorRaise[]): SVIExtractedSignals["founderExperience"] | null {
  const realExits = exits.filter((e) => e.type === "acquisition" || e.type === "ipo").length;
  if (realExits > 0) return "serial";
  const years = typeof p.years_in_domain === "number" ? p.years_in_domain : null;
  if ((years != null && years >= 10) || raises.length > 0 || exits.length > 0) return "experienced";
  if (years != null) return "first-time";
  return null;
}

/**
 * Score a founder profile. `profile` null → `hasProfile: false`, score 0 and
 * regex-neutral flags (the caller must not override anything).
 */
export function founderExecutionSignals(profile: FounderProfile | null | undefined, opts: FounderExecutionOptions = {}): FounderExecutionSignals {
  if (!profile) {
    return {
      hasProfile: false,
      structured: false,
      founderExperience: "first-time",
      hasCoFounder: false,
      founderSectorFit: false,
      hasAdvisors: false,
      executionScore: 0,
      rawScore: 0,
      breakdown: [],
      capped: false,
      sources: [],
      rubricVersion: EXECUTION_RUBRIC_VERSION,
    };
  }

  const exits = (Array.isArray(profile.prior_exits) ? profile.prior_exits : []).filter((e) => e && typeof e.company === "string" && e.company.trim());
  const raises = (Array.isArray(profile.prior_raises) ? profile.prior_raises : []).filter((r) => r && typeof r.company === "string" && r.company.trim());
  const roles = profile.roles ?? { ceo: null, cto: null, cpo: null, cfo: null };
  const years = typeof profile.years_in_domain === "number" && Number.isFinite(profile.years_in_domain) ? Math.max(0, profile.years_in_domain) : null;
  const fullTime = typeof profile.full_time_pct === "number" && Number.isFinite(profile.full_time_pct) ? clamp(Math.round(profile.full_time_pct), 0, 100) : null;

  const breakdown: ExecutionBreakdownRow[] = [];

  // 1. Prior exits — 30
  {
    const pts = clamp(exits.reduce((s, e) => s + (EXIT_POINTS[e.type] ?? 0), 0), 0, 30);
    const evidence = exits.length
      ? exits.map((e) => `${e.company.trim()} (${e.type}${e.year ? ` ${e.year}` : ""}${e.value_band && e.value_band !== "undisclosed" ? `, ${e.value_band}` : ""})`).join("; ")
      : "no prior exit declared";
    breakdown.push({ key: "exits", label: "Prior exits", points: pts, max: 30, evidence, source: sourceOf(profile, "prior_exits") });
  }
  // 2. Prior raises — 15
  {
    const pts = clamp(raises.reduce((s, r) => s + (RAISE_POINTS[r.round] ?? 0), 0), 0, 15);
    const evidence = raises.length
      ? raises.map((r) => `${r.company.trim()} ${r.round.replace(/_/g, " ")}${r.amount_aud_band ? ` ${r.amount_aud_band}` : ""}${r.year ? ` ${r.year}` : ""}`).join("; ")
      : "no prior raise declared";
    breakdown.push({ key: "raises", label: "Prior raises", points: pts, max: 15, evidence, source: sourceOf(profile, "prior_raises") });
  }
  // 3. Years in domain — 20 (cap 10 y)
  {
    const pts = years == null ? 0 : clamp(Math.round(Math.min(years, 10) * 2), 0, 20);
    breakdown.push({ key: "years_in_domain", label: "Years in domain", points: pts, max: 20, evidence: years == null ? "not stated" : `${years} year${years === 1 ? "" : "s"} in domain${years > 10 ? " (scored at the 10-year cap)" : ""}`, source: sourceOf(profile, "years_in_domain") });
  }
  // 4. Role coverage — 15
  {
    const named = ROLE_KEYS.filter((k) => typeof roles[k] === "string" && roles[k]!.trim().length > 0);
    const pts = clamp(named.reduce((s, k) => s + ROLE_POINTS[k], 0), 0, 15);
    breakdown.push({ key: "roles", label: "Role coverage", points: pts, max: 15, evidence: named.length ? named.map((k) => `${ROLE_LABEL[k]}: ${roles[k]!.trim()}`).join(", ") : "no leadership role named", source: sourceOf(profile, "roles") });
  }
  // 5. Full-time — 10
  {
    const pts = fullTime == null ? 0 : clamp(Math.round(fullTime / 10), 0, 10);
    breakdown.push({ key: "full_time", label: "Full-time commitment", points: pts, max: 10, evidence: fullTime == null ? "not stated" : `${fullTime}% full-time`, source: sourceOf(profile, "full_time_pct") });
  }
  // 6. Worked together — 5
  {
    const wt = profile.worked_together_before;
    breakdown.push({ key: "worked_together", label: "Worked together before", points: wt === true ? 5 : 0, max: 5, evidence: wt === true ? "founders have worked together before" : wt === false ? "first time working together" : "not stated", source: sourceOf(profile, "worked_together_before") });
  }
  // 7. GitHub activity — 5
  {
    const gh = opts.github ?? null;
    const commits = gh && typeof gh.recentCommits30d === "number" && Number.isFinite(gh.recentCommits30d) ? gh.recentCommits30d : null;
    let pts = 0;
    let evidence = "no GitHub URL or connector";
    let source: ExecutionSource = sourceOf(profile, "github_url");
    if (commits != null) {
      pts = commits >= 10 ? 5 : commits >= 1 ? 3 : 0;
      evidence = `GitHub connector: ${commits} commit${commits === 1 ? "" : "s"} in the last 30 days${gh?.publicRepos != null ? `, ${gh.publicRepos} public repos` : ""}`;
      source = "github";
    } else if (profile.github_url) {
      pts = 1;
      evidence = `GitHub URL only (${profile.github_url}) — connect GitHub to score activity`;
    }
    breakdown.push({ key: "github", label: "GitHub activity", points: pts, max: 5, evidence, source });
  }

  const rawScore = clamp(breakdown.reduce((s, r) => s + r.points, 0), 0, 100);
  const sources = [...new Set(breakdown.map((r) => r.source))];

  // Cap while every input is self-reported.
  const referencesChecked = opts.evaluatorFlags?.references_checked === true;
  const parserConfirmed =
    linkedinAgrees(profile, opts.linkedin) ||
    sourceOf(profile, "years_in_domain") === "linkedin_parser" ||
    sourceOf(profile, "prev_employers") === "linkedin_parser";
  let capped = false;
  let capReason: string | undefined;
  let capLiftedBy: FounderExecutionSignals["capLiftedBy"];
  if (referencesChecked) capLiftedBy = "references_checked";
  else if (parserConfirmed) capLiftedBy = "linkedin_parser";
  else if (rawScore > EXECUTION_CAP_SELF_REPORTED) {
    capped = true;
    capReason = `Self-reported profile — capped at ${EXECUTION_CAP_SELF_REPORTED} until an evaluator checks references or the LinkedIn export confirms years / employers.`;
  }
  const executionScore = capped ? EXECUTION_CAP_SELF_REPORTED : rawScore;

  const structured = hasStructuredExecution(profile);
  const exp = experienceFrom(profile, exits, raises);
  const coFounders = Array.isArray(profile.co_founders) ? profile.co_founders.filter((c) => c && c.name && c.name.trim()) : [];
  const distinctRoleNames = new Set(ROLE_KEYS.map((k) => (typeof roles[k] === "string" ? norm(roles[k]!) : "")).filter(Boolean));
  const advisors = Array.isArray(profile.advisors) ? profile.advisors.filter((a) => a && a.name && a.name.trim()) : [];

  return {
    hasProfile: true,
    structured,
    founderExperience: exp ?? "first-time",
    hasCoFounder: coFounders.length > 0 || distinctRoleNames.size >= 2,
    founderSectorFit: (years != null && years >= 2) || Boolean(profile.domain_insight && profile.domain_insight.trim().length > 40),
    hasAdvisors: advisors.length > 0,
    executionScore,
    rawScore,
    breakdown,
    capped,
    ...(capReason ? { capReason } : {}),
    ...(capLiftedBy ? { capLiftedBy } : {}),
    sources,
    rubricVersion: EXECUTION_RUBRIC_VERSION,
  };
}

export function toExecutionSummary(exec: FounderExecutionSignals): FounderExecutionSummary {
  return {
    score: exec.executionScore,
    rawScore: exec.rawScore,
    capped: exec.capped,
    ...(exec.capReason ? { capReason: exec.capReason } : {}),
    breakdown: exec.breakdown.map((r) => ({ key: r.key, points: r.points, max: r.max, evidence: r.evidence })),
    sources: exec.sources,
    rubricVersion: exec.rubricVersion,
  };
}

/**
 * Merge the rubric into the regex-extracted signals.
 *
 *   - no profile                → the signals object is returned unchanged
 *   - profile, nothing structured (pre-S37 row: prose fields only) → the
 *     profile's flags fill gaps (true wins, false keeps the regex) and the
 *     summary is attached; founderExperience stays regex unless the profile
 *     states years / exits / raises
 *   - profile with ≥ 1 structured field → the profile is canonical:
 *     founderExperience is overridden whenever the profile can say (years /
 *     exits / raises known); the three booleans are overridden to true when
 *     the profile shows them and keep the regex value only where the profile
 *     is silent (no co-founders / roles / advisors listed)
 */
export function mergeExecutionIntoSignals<T extends SVIExtractedSignals>(signals: T, exec: FounderExecutionSignals | null | undefined, profile?: FounderProfile | null): T {
  if (!exec || !exec.hasProfile) return signals;
  const next: T = { ...signals };
  const canSayExperience = profile
    ? typeof profile.years_in_domain === "number" || (profile.prior_exits?.length ?? 0) > 0 || (profile.prior_raises?.length ?? 0) > 0
    : exec.structured;
  if (canSayExperience) next.founderExperience = exec.founderExperience;
  if (exec.hasCoFounder) next.hasCoFounder = true;
  if (exec.founderSectorFit) next.founderSectorFit = true;
  if (exec.hasAdvisors) next.hasAdvisors = true;
  next.founderExecution = toExecutionSummary(exec);
  return next;
}
