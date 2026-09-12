// Data for the dashboard MoneyRadarTile (G11 plan §4i D-2, T0248).
//
//   getMoneyRadarTileData(user, project, preloaded?, keys?)  → MoneyRadarTileData
//   buildMoneyRadarTileData(sources)                          pure — the state machine
//
// Shared projects (S18-B review P2-7) — "the OWNER's project data, the
// CALLER's credits": `keys.ownerUserId` / `keys.dataEmail` (from
// `pageScopeKeys`) key the project's funding report, `funding_matches`,
// `dataroom_files` and the intake prefill on the owner, so a member sees the
// same radar the owner sees. The entitlement (`can`), and the calendar token
// stay on the caller — every CTA the tile offers is paid from the caller's
// own wallet (`creditNote` on the tile says so).
//
// Five states, decided in this order:
//   subscriber   `can(user, "money_radar")` (plan flag or timed grant) and at
//                least one matched deadline inside 30 days
//   nothing_due  money_radar but no deadline inside 30 days → next public
//                event for the founder's capital (never blank)
//   buyer        a ready `funding_reports` row (A$3 / credits / plan-included)
//   free_previewed  no report, but the profile (project_grant_profiles or the
//                intake prefill) is enough to run the free matcher server-side
//   no_profile   nothing known → live counts for {industry} in {state}
//
// Deadline chips reuse the RDStatus ladder via `deadlineStatus()`; the D-2
// thresholds (green > 30 d, amber ≤ 30 d, red ≤ 3 d) are mapped onto the
// rungs by `tileRung()` so the tile, the report cards and the R&D calendar
// share one palette. Dates render in the founder's zone (`formatDateAu`).
//
// Everything with I/O is in `getMoneyRadarTileData`; it never throws — a
// failed read degrades to the next state down, and the tile always shows at
// least counts + the next public event. Colocated tests: tile-data.test.ts.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { AppUser } from "@/lib/auth";
import type { Project } from "@/lib/projects";
import { can } from "@/lib/entitlements";
import { matchGrants, matchPrograms, type GrantProfile, type ScoredGrant, type ScoredProgram, type TimelineItem } from "@/lib/agents/grant-advisor";
import { FOUNDER_STAGES, type FounderStage } from "@/lib/agents/grant-advisor-rules";
import { computeNextSteps, type NudgeDataroomRow, type NudgePhaseProgressRow } from "@/lib/nudge/next-steps";
import { listGrants, listPrograms } from "./data";
import type { AuGrantRow, AuProgramRow } from "./seed-map";
import { capitalForCity } from "./seed-map";
import { INDUSTRY_OPTIONS, INTAKE_STAGES, INTAKE_STATES, NOT_INCORPORATED, parseFundingIntake } from "./intake";
import { intakePrefillFor, latestFundingReportForUser, CAPITAL_MAP_TYPES } from "./workspace";
import { deadlineStatus, daysUntil, formatDateAu, type DeadlineStatus } from "./deadline-status";
import { matchDeadline } from "./radar-sweep";
import { getOrMintCalendarToken } from "./calendar-token";
import { fill, FUNDING_COPY } from "./copy";
import type { FundingReportRow } from "./reports";
import type { FundingIntakePrefill } from "@/components/funding/funding-intake";

// ─── Types ───────────────────────────────────────────────────────────────────

export type MoneyRadarTileState = "no_profile" | "free_previewed" | "buyer" | "subscriber" | "nothing_due";

export interface TileTopMatch {
  ref_kind: "grant" | "program";
  ref_id: string;
  name: string;
  why: string;
  /** null = varies / unknown (programs). */
  amount_max_aud: number | null;
  closes_at: string | null;
  /** Chip for the buyer state (D-2 "A$ + deadline chips"); null = rolling / undated. */
  deadline: { days_until: number; status: DeadlineStatus; date_label: string } | null;
  url: string | null;
}

export interface TileDeadline {
  ref_kind: "grant" | "program";
  ref_id: string;
  name: string;
  closes_at: string;
  days_until: number;
  /** RDStatus rung after the D-2 threshold mapping — drives the chip colour. */
  status: DeadlineStatus;
  /** "30 Nov 2026 (AEST)" in the founder's zone. */
  date_label: string;
  url: string | null;
}

export interface TilePublicEvent {
  ref_id: string;
  name: string;
  city: string;
  /** ISO day the applications open / the event runs. */
  date: string;
  date_label: string;
  url: string | null;
}

export interface MoneyRadarTileData {
  state: MoneyRadarTileState;
  counts: { grants: number; programs: number; capital: number };
  top3: TileTopMatch[];
  next_deadlines: TileDeadline[];
  new_matches_week: number;
  next_public_event: TilePublicEvent | null;
  /** One line — from `computeNextSteps`, or the nearest deadline when the nudge engine has nothing. */
  next_step: string;
  /** Tokens the copy needs. */
  industry_label: string;
  state_label: string;
  /** Founder's state code for AEST/AWST rendering; null = unknown. */
  user_state: string | null;
  report_id: string | null;
  /** `/api/funding/calendar.ics?token=…` for money_radar users; null otherwise. */
  calendar_href: string | null;
  /** ISO day the tile was computed for (report `meta.today` when reading a stored report). */
  today: string;
}

/** Everything the pure builder needs; the loader assembles it. */
export interface MoneyRadarTileSources {
  today: Date;
  hasMoneyRadar: boolean;
  profile: { state: string | null; stage: FounderStage | null; industry_tags: string[]; city: string | null } | null;
  report: {
    id: string;
    grants: ScoredGrant[];
    programs: ScoredProgram[];
    timeline: TimelineItem[];
    today: string | null;
  } | null;
  /** `funding_matches` rows for the user (+ project). */
  matches: Array<{ ref_kind: "grant" | "program"; ref_id: string; closes_at: string | null; first_seen_at: string; score: number }>;
  /** Live catalogue (open rows) for counts, names, amounts and the free matcher. */
  grants: AuGrantRow[];
  programs: AuProgramRow[];
  nextStepTitle: string | null;
  calendarToken: string | null;
}

export const TILE_DEADLINE_WINDOW_DAYS = 30;
export const TILE_NEW_MATCH_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Pure helpers ────────────────────────────────────────────────────────────

/**
 * D-2 colour thresholds mapped onto the RDStatus ladder: > 30 d → `open`
 * (green), 4–30 d → `closing_soon` (amber), ≤ 3 d → `last_call` (red),
 * past → `overdue`. Undated rows keep whatever `deadlineStatus()` said.
 */
export function tileRung(days: number | null, fallback: DeadlineStatus): DeadlineStatus {
  if (days === null) return fallback;
  if (days < 0) return "overdue";
  if (days <= 3) return "last_call";
  if (days <= TILE_DEADLINE_WINDOW_DAYS) return "closing_soon";
  return "open";
}

export function industryLabelFor(tags: readonly string[] | null | undefined): string {
  const first = tags?.[0];
  const hit = first ? INDUSTRY_OPTIONS.find((o) => o.value === first) : null;
  return hit ? hit.label : "Australian";
}

export function stageLabelFor(stage: FounderStage | null | undefined): string {
  const hit = stage ? INTAKE_STAGES.find((s) => s.value === stage) : null;
  return hit ? hit.label.toLowerCase() : "early-stage";
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function catalogueRow(
  src: Pick<MoneyRadarTileSources, "grants" | "programs">,
  kind: "grant" | "program",
  id: string,
): { name: string; url: string | null; amount: number | null; closes_at: string | null; city: string | null } | null {
  if (kind === "grant") {
    const g = src.grants.find((r) => r.id === id);
    return g ? { name: g.name, url: g.official_url ?? null, amount: g.amount_max_aud ?? null, closes_at: g.closes_at ?? null, city: null } : null;
  }
  const p = src.programs.find((r) => r.id === id);
  if (!p) return null;
  const closes = p.program_type === "event" ? p.next_cohort_start ?? p.applications_close ?? null : p.applications_close ?? null;
  return { name: p.name, url: p.official_url ?? null, amount: p.funding_aud ?? null, closes_at: closes, city: p.city ?? null };
}

function toDeadline(
  src: MoneyRadarTileSources,
  kind: "grant" | "program",
  id: string,
  name: string,
  closes: string | null,
  url: string | null,
): TileDeadline | null {
  if (!closes) return null;
  const v = deadlineStatus({ closes_at: closes }, src.today);
  const days = v.days_until ?? daysUntil(closes, src.today);
  if (days === null || days < 0) return null;
  return {
    ref_kind: kind,
    ref_id: id,
    name,
    closes_at: closes,
    days_until: days,
    status: tileRung(days, v.status),
    date_label: formatDateAu(closes, src.profile?.state ?? null),
    url,
  };
}

/** Deadlines from `funding_matches` (subscriber) with names from the catalogue; falls back to the report timeline. */
export function collectDeadlines(src: MoneyRadarTileSources): TileDeadline[] {
  const out: TileDeadline[] = [];
  const seen = new Set<string>();
  for (const m of src.matches) {
    const row = catalogueRow(src, m.ref_kind, m.ref_id);
    const closes = m.closes_at ?? row?.closes_at ?? null;
    const d = toDeadline(src, m.ref_kind, m.ref_id, row?.name ?? m.ref_id, closes, row?.url ?? null);
    if (d && !seen.has(`${d.ref_kind}:${d.ref_id}`)) {
      seen.add(`${d.ref_kind}:${d.ref_id}`);
      out.push(d);
    }
  }
  if (out.length === 0 && src.report) {
    for (const m of [...src.report.grants, ...src.report.programs]) {
      const kind = m.kind;
      const url = kind === "grant" ? m.grant?.official_url ?? null : m.program?.official_url ?? null;
      const d = toDeadline(src, kind, m.ref_id, m.name, matchDeadline(m), url);
      if (d && !seen.has(`${kind}:${m.ref_id}`)) {
        seen.add(`${kind}:${m.ref_id}`);
        out.push(d);
      }
    }
    for (const t of src.report.timeline) {
      if ((t.kind !== "grant" && t.kind !== "program") || !t.deadline) continue;
      const d = toDeadline(src, t.kind, t.ref_id, t.name, t.deadline, null);
      if (d && !seen.has(`${t.kind}:${t.ref_id}`)) {
        seen.add(`${t.kind}:${t.ref_id}`);
        out.push(d);
      }
    }
  }
  return out.sort((a, b) => a.days_until - b.days_until);
}

/** Next public event (program_type = event) for the founder's capital, else anywhere; opens/runs on or after today. */
export function nextPublicEvent(src: MoneyRadarTileSources): TilePublicEvent | null {
  const state = src.profile?.state && src.profile.state !== NOT_INCORPORATED ? src.profile.state : null;
  const capital = state || src.profile?.city ? capitalForCity(src.profile?.city ?? null, state) : null;
  const candidates = src.programs
    .filter((p) => p.program_type === "event" && p.status !== "closed")
    .map((p) => {
      const date = p.applications_open ?? p.next_cohort_start ?? p.applications_close ?? null;
      const days = date ? daysUntil(date, src.today, "start") : null;
      return { p, date, days };
    })
    .filter((c): c is { p: AuProgramRow; date: string; days: number } => c.date !== null && c.days !== null && c.days >= 0)
    .sort((a, b) => a.days - b.days);
  const pick = (capital && candidates.find((c) => c.p.capital === capital)) || candidates[0] || null;
  if (!pick) return null;
  return {
    ref_id: pick.p.id,
    name: pick.p.name,
    city: pick.p.city,
    date: pick.date,
    date_label: formatDateAu(pick.date, state, { withZone: false }),
    url: pick.p.official_url ?? null,
  };
}

function countsFor(src: MoneyRadarTileSources): MoneyRadarTileData["counts"] {
  const state = src.profile?.state && src.profile.state !== NOT_INCORPORATED ? src.profile.state : null;
  const capital = state ? capitalForCity(null, state) : null;
  const tags = new Set(src.profile?.industry_tags ?? []);
  const openGrants = src.grants.filter((g) => g.status === "open" && !g.exclude_from_matching);
  const byState = state ? openGrants.filter((g) => g.state === "national" || g.state === state) : openGrants;
  const byIndustry = tags.size ? byState.filter((g) => g.industry_tags.length === 0 || g.industry_tags.some((t) => tags.has(t))) : byState;
  const capitalTypes = CAPITAL_MAP_TYPES as readonly string[];
  const openPrograms = src.programs.filter((p) => p.status === "open" && p.program_type !== "event" && !capitalTypes.includes(p.program_type));
  const programs = capital ? openPrograms.filter((p) => p.capital === capital || p.state === "national" || p.capital === "Remote") : openPrograms;
  const capitalRows = src.programs.filter((p) => capitalTypes.includes(p.program_type));
  return { grants: byIndustry.length, programs: programs.length, capital: capitalRows.length };
}

function chipFor(src: MoneyRadarTileSources, closes: string | null): TileTopMatch["deadline"] {
  if (!closes) return null;
  const v = deadlineStatus({ closes_at: closes }, src.today);
  const days = v.days_until ?? daysUntil(closes, src.today);
  if (days === null) return null;
  return { days_until: days, status: tileRung(days, v.status), date_label: formatDateAu(closes, src.profile?.state ?? null) };
}

function top3FromScored(src: MoneyRadarTileSources, grants: ScoredGrant[], programs: ScoredProgram[]): TileTopMatch[] {
  const merged: Array<{ score: number; m: TileTopMatch }> = [
    ...grants.map((g) => {
      const closes = matchDeadline(g);
      return {
        score: g.score,
        m: {
          ref_kind: "grant" as const,
          ref_id: g.ref_id,
          name: g.name,
          why: g.why.find((w) => w && w.trim()) ?? "Fits your stage and state.",
          amount_max_aud: g.grant?.amount_max_aud ?? null,
          closes_at: closes,
          deadline: chipFor(src, closes),
          url: g.grant?.official_url ?? null,
        },
      };
    }),
    ...programs.map((p) => {
      const closes = matchDeadline(p);
      return {
        score: p.score,
        m: {
          ref_kind: "program" as const,
          ref_id: p.ref_id,
          name: p.name,
          why: p.why.find((w) => w && w.trim()) ?? "Takes founders at your stage.",
          amount_max_aud: p.program?.funding_aud ?? null,
          closes_at: closes,
          deadline: chipFor(src, closes),
          url: p.program?.official_url ?? null,
        },
      };
    }),
  ];
  return merged.sort((a, b) => b.score - a.score).slice(0, 3).map((x) => x.m);
}

function profileForMatcher(src: MoneyRadarTileSources): GrantProfile | null {
  const p = src.profile;
  if (!p?.state || p.state === NOT_INCORPORATED || !(INTAKE_STATES as readonly string[]).includes(p.state)) return null;
  const stage = p.stage && (FOUNDER_STAGES as readonly string[]).includes(p.stage) ? p.stage : "mvp";
  return { state: p.state as GrantProfile["state"], stage, industry_tags: p.industry_tags, city: p.city };
}

function nextStepFor(src: MoneyRadarTileSources, deadlines: TileDeadline[]): string {
  if (src.nextStepTitle && src.nextStepTitle.trim()) return src.nextStepTitle.trim();
  const d = deadlines[0];
  if (d) return d.days_until <= 0 ? `Lodge your ${d.name} application today` : `Start your ${d.name} application — closes in ${d.days_until} days`;
  return "Answer 3 questions to match grants and programs";
}

// ─── Pure state machine ──────────────────────────────────────────────────────

export function buildMoneyRadarTileData(src: MoneyRadarTileSources): MoneyRadarTileData {
  const today = src.report?.today ?? isoDay(src.today);
  const stateCode = src.profile?.state && src.profile.state !== NOT_INCORPORATED ? src.profile.state : null;
  const base = {
    counts: countsFor(src),
    industry_label: industryLabelFor(src.profile?.industry_tags),
    state_label: stateCode ?? "Australia",
    user_state: stateCode,
    next_public_event: nextPublicEvent(src),
    calendar_href: src.hasMoneyRadar && src.calendarToken ? `/api/funding/calendar.ics?token=${encodeURIComponent(src.calendarToken)}` : null,
    today,
  };

  const weekAgo = src.today.getTime() - TILE_NEW_MATCH_WINDOW_DAYS * DAY_MS;
  const newThisWeek = src.matches.filter((m) => {
    const t = Date.parse(m.first_seen_at);
    return Number.isFinite(t) && t >= weekAgo;
  }).length;

  // 1 + 2. Radar subscriber (plan flag or timed grant).
  if (src.hasMoneyRadar) {
    const deadlines = collectDeadlines(src);
    const due = deadlines.filter((d) => d.days_until <= TILE_DEADLINE_WINDOW_DAYS);
    const top3 = src.report ? top3FromScored(src, src.report.grants, src.report.programs) : [];
    if (due.length > 0) {
      return {
        ...base,
        state: "subscriber",
        top3,
        next_deadlines: due.slice(0, 3),
        new_matches_week: newThisWeek,
        next_step: nextStepFor(src, due),
        report_id: src.report?.id ?? null,
      };
    }
    return {
      ...base,
      state: "nothing_due",
      top3,
      next_deadlines: deadlines.slice(0, 3),
      new_matches_week: newThisWeek,
      next_step: nextStepFor(src, []),
      report_id: src.report?.id ?? null,
    };
  }

  // 3. A$3 / credits / plan-included report on file.
  if (src.report) {
    const deadlines = collectDeadlines(src);
    return {
      ...base,
      state: "buyer",
      top3: top3FromScored(src, src.report.grants, src.report.programs),
      next_deadlines: deadlines.slice(0, 3),
      new_matches_week: newThisWeek,
      next_step: nextStepFor(src, deadlines),
      report_id: src.report.id,
    };
  }

  // 4. Enough profile to run the free matcher.
  const profile = profileForMatcher(src);
  if (profile) {
    const g = matchGrants(profile, src.grants.filter((r) => !r.exclude_from_matching), src.today);
    const p = matchPrograms(profile, src.programs, src.today);
    const top3 = top3FromScored(src, g, p);
    const deadlines = [...g, ...p]
      .map((m) => toDeadline(src, m.kind, m.ref_id, m.name, matchDeadline(m), null))
      .filter((d): d is TileDeadline => d !== null)
      .sort((a, b) => a.days_until - b.days_until);
    if (top3.length > 0) {
      return {
        ...base,
        state: "free_previewed",
        counts: { ...base.counts, grants: g.length, programs: p.length },
        top3,
        next_deadlines: deadlines.slice(0, 3),
        new_matches_week: 0,
        next_step: nextStepFor(src, deadlines),
        report_id: null,
      };
    }
  }

  // 5. Nothing known — counts + next event only.
  return {
    ...base,
    state: "no_profile",
    top3: [],
    next_deadlines: [],
    new_matches_week: 0,
    next_step: nextStepFor(src, []),
    report_id: null,
  };
}

/** The D-2 headline sentence for the state (exported for the tile + tests). */
export function tileHeadline(d: MoneyRadarTileData, messages?: Readonly<Record<string, string>> | null): string {
  const c = (key: keyof typeof FUNDING_COPY.tile, tokens: Record<string, string | number> = {}) =>
    fill(messages?.[`funding.copy.tile.${key}`] ?? FUNDING_COPY.tile[key], tokens);
  switch (d.state) {
    case "no_profile":
      return c("noProfile", { grants: d.counts.grants, programs: d.counts.programs, industry: d.industry_label, state: d.state_label });
    case "free_previewed":
      return c("previewed");
    case "buyer":
      return c("deadlinesMove");
    case "subscriber":
      return c("newMatches", { n: d.new_matches_week });
    case "nothing_due":
      return d.next_public_event
        ? c("nothingDue", { event: d.next_public_event.name, date: d.next_public_event.date_label })
        : c("nothingDueNoEvent");
  }
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export interface TilePreloaded {
  /** Skip the `can()` round-trip when the page already resolved it. */
  hasMoneyRadar?: boolean;
  /** Latest ready `funding_reports` row when the page already loaded it (`null` = known none). */
  report?: FundingReportRow | null;
  grants?: AuGrantRow[];
  programs?: AuProgramRow[];
  today?: Date;
}

/**
 * Whose project record the tile reads (S18-B review P2-7). Both default to
 * the caller — pass `pageScopeKeys(scope, user)` values for a shared project.
 */
export interface TileDataKeys {
  /** OWNER's app_users id — funding_reports / funding_matches / dataroom_files live under it. */
  ownerUserId?: string;
  /** OWNER's email — svi_snapshots stage for the intake prefill. */
  dataEmail?: string;
}

interface MatchRowLite {
  ref_kind: "grant" | "program";
  ref_id: string;
  closes_at: string | null;
  first_seen_at: string;
  score: number;
}

async function loadMatches(userId: string, projectId: string | null): Promise<MatchRowLite[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];
  try {
    let q = sb.from("funding_matches").select("ref_kind, ref_id, closes_at, first_seen_at, score").eq("user_id", userId);
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q.order("closes_at", { ascending: true, nullsFirst: false }).limit(200);
    if (error) {
      if (error.code !== "42P01") console.warn("[funding/tile] matches", error.message);
      return [];
    }
    return (data ?? []) as MatchRowLite[];
  } catch (err) {
    console.warn("[funding/tile] matches", err instanceof Error ? err.message : String(err));
    return [];
  }
}

/** `computeNextSteps` on the cheap inputs (phase progress + data room); null when the DB is off. */
async function loadNextStepTitle(user: Pick<AppUser, "id" | "email">, project: Project | null): Promise<string | null> {
  const sb = getSupabaseAdmin();
  if (!sb || !project) return null;
  try {
    const [{ data: progress }, { data: files }] = await Promise.all([
      sb.from("startup_phase_progress").select("phase_id, phase_order, status, completion_pct").eq("project_id", project.id),
      sb.from("dataroom_files").select("svi_dimension, file_name, status, mime_type").eq("user_id", user.id),
    ]);
    const result = computeNextSteps({
      user: { id: user.id, email: user.email ?? "" },
      project: { id: project.id, growth_phase_current: project.growth_phase_current ?? null },
      phaseProgress: (progress ?? []) as NudgePhaseProgressRow[],
      sviScores: [],
      dataroomRows: (files ?? []) as NudgeDataroomRow[],
      evidenceItems: [],
    });
    return result.next_action?.title ?? null;
  } catch (err) {
    console.warn("[funding/tile] next step", err instanceof Error ? err.message : String(err));
    return null;
  }
}

function reportToSource(row: FundingReportRow | null): MoneyRadarTileSources["report"] {
  if (!row || row.status !== "ready") return null;
  const meta = (row.meta ?? {}) as { today?: string };
  return {
    id: row.id,
    grants: Array.isArray(row.grant_matches) ? (row.grant_matches as ScoredGrant[]) : [],
    programs: Array.isArray(row.program_matches) ? (row.program_matches as ScoredProgram[]) : [],
    timeline: Array.isArray(row.timeline) ? (row.timeline as TimelineItem[]) : [],
    today: typeof meta.today === "string" ? meta.today : null,
  };
}

/**
 * Assemble the tile for a signed-in founder. Reads (all optional, all
 * non-fatal): entitlement, latest report, `funding_matches`, the live
 * catalogue, the intake prefill (`project_grant_profiles` + project), the
 * nudge inputs and — for money_radar users — the calendar token.
 */
export async function getMoneyRadarTileData(
  user: Pick<AppUser, "id" | "email" | "plan">,
  project: Project | null,
  pre: TilePreloaded = {},
  keys: TileDataKeys = {},
): Promise<MoneyRadarTileData> {
  const today = pre.today ?? new Date();
  // Project record → the OWNER (defaults to the caller); entitlement + calendar
  // token → the CALLER (S18-B review P2-7).
  const owner = { id: keys.ownerUserId ?? user.id, email: keys.dataEmail ?? user.email };
  const [hasMoneyRadar, reportRow, grants, programs, prefill, matches, nextStepTitle] = await Promise.all([
    pre.hasMoneyRadar !== undefined
      ? Promise.resolve(pre.hasMoneyRadar)
      : can({ id: user.id, plan: user.plan ?? "free", segment: "founder" }, "money_radar").catch(() => false),
    pre.report !== undefined ? Promise.resolve(pre.report) : latestFundingReportForUser(owner.id, project?.id ?? null).catch(() => null),
    pre.grants ? Promise.resolve(pre.grants) : listGrants({ status: "open" }).catch(() => [] as AuGrantRow[]),
    pre.programs ? Promise.resolve(pre.programs) : listPrograms({}).catch(() => [] as AuProgramRow[]),
    intakePrefillFor(owner, project).catch((): FundingIntakePrefill => ({})),
    loadMatches(owner.id, project?.id ?? null),
    loadNextStepTitle(owner, project),
  ]);

  // Profile: the stored report intake wins (it is what the matches were built
  // from), then the prefill (project_grant_profiles + projects + SVI stage).
  let profile: MoneyRadarTileSources["profile"] = null;
  const intake = reportRow ? parseFundingIntake(reportRow.intake) : null;
  if (intake?.ok) {
    const i = intake.intake;
    profile = {
      state: i.state === NOT_INCORPORATED ? i.based_state ?? null : i.state,
      stage: i.stage,
      industry_tags: i.industry_tags ?? [],
      city: i.city ?? null,
    };
  } else if (prefill.state || prefill.stage || prefill.industry_tags?.length) {
    profile = {
      state: prefill.state && prefill.state !== NOT_INCORPORATED ? prefill.state : null,
      stage: prefill.stage || null,
      industry_tags: prefill.industry_tags ?? [],
      city: null,
    };
  }

  const calendarToken = hasMoneyRadar ? await getOrMintCalendarToken(user.id).catch(() => null) : null;

  return buildMoneyRadarTileData({
    today,
    hasMoneyRadar,
    profile,
    report: reportToSource(reportRow ?? null),
    matches,
    grants,
    programs,
    nextStepTitle,
    calendarToken,
  });
}
