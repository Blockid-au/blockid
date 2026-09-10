// Money Radar weekly sweep (T0245, plan docs/plans/money-finder-2026-09-10.md
// §4h reuse map + §4i D-1). Runs Sunday 05:00 UTC, one hour after
// `refresh-funding-sources` has updated `au_grants` / `au_programs`.
//
//   subscribers  = every user whose plan (or per-user grant) carries
//                  `money_radar`  → channels in-app + email + ics
//                + every user with a paid `funding_reports` row in the last
//                  90 days                              → channel in-app only
//   targets      = per subscriber, one (user, project|null) pair per
//                  `project_grant_profiles` row and per report intake
//   per target   : GrantProfile → screenGrants / screenPrograms against the
//                  live catalogue → upsert `funding_matches` → diff → events
//   events       : new_match · deadline_t30 / t14 / t3 · status_changed
//                  (open|upcoming → paused|closed) · new_round_opened
//                  (upcoming → open)
//   fan-out      : in-app via insertNotification() — kinds `new_matches`
//                  (one batched row per target per sweep), `grant_deadline`,
//                  `program_intake`, `event_match` (program_type=event).
//                  Frequency cap: dedupeKey `<kind>:<ref>:<tier>` +
//                  throttleMs 24 h → ≤ 1 in-app row per kind per ref per day,
//                  and `last_notified` makes each deadline tier exactly-once.
//
// ── Contract for T0246 (radar drips / digest money block) ────────────────────
// Email fan-out is NOT done here. Every event is (a) returned in
// `SweepSummary.events` and (b) persisted compactly on the matched row:
//
//   funding_matches.last_notified = {
//     "t30": "2026-09-10",              // ISO day each deadline tier fired
//     "t14": "…", "t3": "…",
//     "status_changed": "closed",       // last status we alerted on
//     "new_round_opened": "2026-09-10",
//     "radar_events": [                 // ring buffer, newest last, ≤ 8
//       { "event": "deadline_t14", "at": "2026-09-10", "channels": ["inapp","email","ics"] }
//     ],
//     "pending_email": [                // deadline tiers only, and ONLY when the
//       { "event": "deadline_t14", "at": "2026-09-10" }   // subscriber has the email channel
//     ]
//   }
//
// T0246 enqueues `radar_t30/t14/t3` drips from rows where
// `last_notified ? 'pending_email'` (partial index in migration 0318) and
// removes the key once claimed. In-app buyers (A$3, no plan) never get
// `pending_email`, so the drip worker cannot email them by accident;
// `canSendEmail(email, "money_radar")` still gates the actual send.
//
// ── Deadline tiers vs the weekly cadence ─────────────────────────────────────
// The sweep is weekly, so "closes_at − today == 30" would fire for ~1 in 7
// deadlines. Tiers are therefore buckets: t30 when 14 < days ≤ 30, t14 when
// 3 < days ≤ 14, t3 when 0 ≤ days ≤ 3 — the tightest applicable tier fires,
// once, and `last_notified.<tier>` stops a repeat. Run daily and the same
// code fires each tier on (or just after) the exact day.
//
// Everything with side effects goes through `RadarStore`; tests pass a fake.
// `dryRun` computes everything and writes nothing. Colocated tests:
// radar-sweep.test.ts.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { insertNotification } from "@/lib/notifications";
import type { NotificationKind } from "@/lib/notification-kinds";
import {
  screenGrants,
  screenPrograms,
  type GrantProfile,
  type ScoredGrant,
  type ScoredProgram,
  FOUNDER_STAGES,
  type FounderStage,
} from "@/lib/agents/grant-advisor";
import {
  effectiveGrantStatus,
  effectiveProgramStatus,
  daysBetween,
  startOfUtcDay,
  toIsoDate,
  type EffectiveStatus,
} from "@/lib/agents/grant-advisor-rules";
import type { AuGrantRow, AuProgramRow } from "./seed-map";
import { listGrants, listPrograms } from "./data";
import { intakeToGrantProfile, locationUnknown, parseFundingIntake, type FundingIntake } from "./intake";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RadarChannel = "inapp" | "email" | "ics";

export type RadarEventType =
  | "new_match"
  | "deadline_t30"
  | "deadline_t14"
  | "deadline_t3"
  | "status_changed"
  | "new_round_opened";

export type DeadlineTier = "t30" | "t14" | "t3";

export interface RadarSubscriber {
  userId: string;
  email: string | null;
  plan: string | null;
  /** `inapp` always; `email` + `ics` only with the `money_radar` flag. */
  channels: RadarChannel[];
}

export interface RadarTarget {
  userId: string;
  projectId: string | null;
  /** Startup name for the "N new matches match {startup}" copy. */
  startup: string | null;
  profile: GrantProfile;
  /** Founder gave no location → national / remote rows only (preview.ts rule). */
  locationUnknown: boolean;
  /** Latest report for the "See matches" link. */
  reportId: string | null;
}

/** Mirror of `funding_matches` (migration 0318). `id` null = not yet inserted. */
export interface FundingMatchRow {
  id: string | null;
  user_id: string;
  project_id: string | null;
  ref_kind: "grant" | "program";
  ref_id: string;
  score: number;
  status_at_match: string;
  closes_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_notified: Record<string, unknown>;
}

export interface RadarEvent {
  type: RadarEventType;
  userId: string;
  projectId: string | null;
  ref_kind: "grant" | "program";
  ref_id: string;
  name: string;
  score: number;
  closes_at: string | null;
  days_left: number | null;
  /** For status_changed / new_round_opened: the status now. */
  status?: EffectiveStatus;
  program_type?: string | null;
  url: string | null;
  channels: RadarChannel[];
  /** ISO day the event was raised. */
  at: string;
}

export interface NotifyArgs {
  userId: string;
  projectId?: string | null;
  kind: NotificationKind;
  payload?: Record<string, unknown>;
  dedupeKey?: string;
  throttleMs?: number;
}

/** Every side effect the sweep performs. Tests inject a fake. */
export interface RadarStore {
  listSubscribers(now: Date): Promise<RadarSubscriber[]>;
  listTargets(sub: RadarSubscriber): Promise<RadarTarget[]>;
  listCatalogue(): Promise<{ grants: AuGrantRow[]; programs: AuProgramRow[] }>;
  listMatches(userId: string, projectId: string | null): Promise<FundingMatchRow[]>;
  insertMatches(rows: FundingMatchRow[]): Promise<void>;
  updateMatch(id: string, patch: Partial<FundingMatchRow>): Promise<void>;
  notify(args: NotifyArgs): Promise<void>;
}

export interface SweepOptions {
  now?: Date;
  dryRun?: boolean;
  /** Full store override (tests). */
  store?: RadarStore | null;
  /** Raw Supabase-like client used to build the default store. Defaults to getSupabaseAdmin(). */
  db?: SupabaseLike | null;
  /** Stop starting new targets after this many ms (cron cap is 300 s). Default 240 s. */
  budgetMs?: number;
}

export interface SweepSummary {
  ok: boolean;
  dryRun: boolean;
  runDate: string;
  subscribers: number;
  targets: number;
  /** Rows inserted (new matches) — "would insert" on dryRun. */
  inserted: number;
  /** Rows updated (score / last_seen / last_notified) — "would update" on dryRun. */
  updated: number;
  /** In-app notifications written — "would write" on dryRun. */
  notifications: number;
  events: RadarEvent[];
  byType: Record<RadarEventType, number>;
  errors: number;
  skipped: number;
  error?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const PAID_REPORT_LOOKBACK_DAYS = 90;
export const DEADLINE_TIERS: ReadonlyArray<{ tier: DeadlineTier; maxDays: number; minDaysExclusive: number }> = [
  { tier: "t3", maxDays: 3, minDaysExclusive: -1 },
  { tier: "t14", maxDays: 14, minDaysExclusive: 3 },
  { tier: "t30", maxDays: 30, minDaysExclusive: 14 },
];
/** ≤ 1 in-app row per kind per ref per day. */
export const INAPP_THROTTLE_MS = 24 * 60 * 60 * 1000;
const RADAR_EVENTS_KEEP = 8;
const PENDING_EMAIL_KEEP = 12;
const DEFAULT_BUDGET_MS = 240_000;

// ─── Pure: catalogue lookups ─────────────────────────────────────────────────

type CatalogueIndex = {
  grants: Map<string, AuGrantRow>;
  programs: Map<string, AuProgramRow>;
};

function indexCatalogue(c: { grants: AuGrantRow[]; programs: AuProgramRow[] }): CatalogueIndex {
  return {
    grants: new Map(c.grants.map((g) => [g.id, g])),
    programs: new Map(c.programs.map((p) => [p.id, p])),
  };
}

/** The date a deadline alert keys on: dated close for grants/programs, the edition date for events. */
export function matchDeadline(m: ScoredGrant | ScoredProgram): string | null {
  const w = m.next_window;
  if (m.kind === "program" && m.program.program_type === "event") {
    return w.kind === "dated" && w.cohort_start ? w.cohort_start : null;
  }
  if (w.kind === "dated" && w.closes_at) return w.closes_at;
  return null;
}

function refUrl(m: ScoredGrant | ScoredProgram): string | null {
  return m.kind === "grant" ? (m.grant.official_url ?? null) : (m.program.official_url ?? null);
}

function isoDay(d: Date): string {
  return toIsoDate(startOfUtcDay(d));
}

function parseIsoDay(s: string | null | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const d = new Date(`${s.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Which tier applies for `daysLeft`, or null when > 30 days out / already past. */
export function tierFor(daysLeft: number): DeadlineTier | null {
  for (const t of DEADLINE_TIERS) {
    if (daysLeft > t.minDaysExclusive && daysLeft <= t.maxDays) return t.tier;
  }
  return null;
}

// ─── Pure: diff one target ───────────────────────────────────────────────────

export interface DiffInput {
  target: RadarTarget;
  channels: RadarChannel[];
  prev: FundingMatchRow[];
  grants: ScoredGrant[];
  programs: ScoredProgram[];
  catalogue: { grants: AuGrantRow[]; programs: AuProgramRow[] };
  now: Date;
}

export interface DiffResult {
  inserts: FundingMatchRow[];
  updates: Array<{ id: string; patch: Partial<FundingMatchRow> }>;
  events: RadarEvent[];
}

function key(kind: string, id: string): string {
  return `${kind}:${id}`;
}

function pushRadarEvent(ln: Record<string, unknown>, ev: RadarEvent): Record<string, unknown> {
  const out: Record<string, unknown> = { ...ln };
  const ring = Array.isArray(out.radar_events) ? (out.radar_events as unknown[]).slice(-(RADAR_EVENTS_KEEP - 1)) : [];
  ring.push({ event: ev.type, at: ev.at, channels: ev.channels });
  out.radar_events = ring;
  // Only deadline tiers become drips (radar_t30/t14/t3). new_match /
  // status_changed / new_round_opened reach email through the weekly digest
  // money block, which reads funding_matches directly.
  if (ev.channels.includes("email") && ev.type.startsWith("deadline_")) {
    const pending = Array.isArray(out.pending_email) ? (out.pending_email as unknown[]).slice(-(PENDING_EMAIL_KEEP - 1)) : [];
    pending.push({ event: ev.type, at: ev.at });
    out.pending_email = pending;
  }
  return out;
}

/**
 * Diff the fresh match set against the stored rows for one target. Pure.
 * Returns the rows to insert / patch and the events raised, with
 * `last_notified` already advanced so a second run on the same day is a
 * no-op (exactly-once).
 */
export function diffTarget(input: DiffInput): DiffResult {
  const { target, channels, prev, grants, programs, now } = input;
  const today = startOfUtcDay(now);
  const at = isoDay(today);
  const nowIso = now.toISOString();
  const idx = indexCatalogue(input.catalogue);
  const prevByKey = new Map(prev.map((r) => [key(r.ref_kind, r.ref_id), r]));
  const inserts: FundingMatchRow[] = [];
  const updates: DiffResult["updates"] = [];
  const events: RadarEvent[] = [];
  const seen = new Set<string>();

  const matched: Array<ScoredGrant | ScoredProgram> = [...grants, ...programs];
  for (const m of matched) {
    const k = key(m.kind, m.ref_id);
    seen.add(k);
    const closes = matchDeadline(m);
    const closesDate = parseIsoDay(closes);
    const daysLeft = closesDate ? daysBetween(today, closesDate) : null;
    const programType = m.kind === "program" ? m.program.program_type : null;
    const base = {
      userId: target.userId,
      projectId: target.projectId,
      ref_kind: m.kind,
      ref_id: m.ref_id,
      name: m.name,
      score: m.score,
      closes_at: closes,
      days_left: daysLeft,
      program_type: programType,
      url: refUrl(m),
      channels,
      at,
    } as const;

    const existing = prevByKey.get(k);
    let ln: Record<string, unknown> = existing ? { ...existing.last_notified } : {};
    const rowEvents: RadarEvent[] = [];

    if (!existing) {
      rowEvents.push({ ...base, type: "new_match" });
    } else if (existing.status_at_match === "upcoming" && m.effective_status === "open" && ln.new_round_opened !== at) {
      rowEvents.push({ ...base, type: "new_round_opened", status: "open" });
      ln.new_round_opened = at;
    }

    // Deadline tiers — tightest applicable, once.
    if (daysLeft !== null && daysLeft >= 0) {
      const tier = tierFor(daysLeft);
      if (tier && typeof ln[tier] !== "string") {
        rowEvents.push({ ...base, type: `deadline_${tier}` as RadarEventType });
        ln[tier] = at;
      }
    }
    // A deadline moved into the future again (new round) → let tiers re-fire.
    if (existing && closes && existing.closes_at && closes > existing.closes_at) {
      for (const t of DEADLINE_TIERS) delete ln[t.tier];
      if (daysLeft !== null && daysLeft >= 0) {
        const tier = tierFor(daysLeft);
        if (tier && !rowEvents.some((e) => e.type === `deadline_${tier}`)) {
          rowEvents.push({ ...base, type: `deadline_${tier}` as RadarEventType });
          ln[tier] = at;
        }
      }
    }

    for (const ev of rowEvents) ln = pushRadarEvent(ln, ev);
    events.push(...rowEvents);

    if (!existing) {
      inserts.push({
        id: null,
        user_id: target.userId,
        project_id: target.projectId,
        ref_kind: m.kind,
        ref_id: m.ref_id,
        score: m.score,
        status_at_match: m.effective_status,
        closes_at: closes,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        last_notified: ln,
      });
    } else if (existing.id) {
      updates.push({
        id: existing.id,
        patch: {
          score: m.score,
          status_at_match: m.effective_status,
          closes_at: closes,
          last_seen_at: nowIso,
          last_notified: ln,
        },
      });
    }
  }

  // Rows that matched before but not now: status flips are events; anything
  // else (profile change, eligibility) just stops being refreshed.
  for (const r of prev) {
    const k = key(r.ref_kind, r.ref_id);
    if (seen.has(k) || !r.id) continue;
    const row = r.ref_kind === "grant" ? idx.grants.get(r.ref_id) : idx.programs.get(r.ref_id);
    if (!row) continue;
    const status: EffectiveStatus =
      r.ref_kind === "grant"
        ? effectiveGrantStatus(row as AuGrantRow, today)
        : effectiveProgramStatus(row as AuProgramRow, today);
    if ((status === "closed" || status === "paused") && r.status_at_match !== status && r.last_notified.status_changed !== status) {
      const ev: RadarEvent = {
        type: "status_changed",
        userId: target.userId,
        projectId: target.projectId,
        ref_kind: r.ref_kind,
        ref_id: r.ref_id,
        name: row.name,
        score: r.score,
        closes_at: r.closes_at,
        days_left: null,
        status,
        program_type: r.ref_kind === "program" ? (row as AuProgramRow).program_type : null,
        url: row.official_url ?? null,
        channels,
        at,
      };
      events.push(ev);
      updates.push({
        id: r.id,
        patch: {
          status_at_match: status,
          last_notified: pushRadarEvent({ ...r.last_notified, status_changed: status }, ev),
        },
      });
    }
  }

  return { inserts, updates, events };
}

// ─── Pure: events → in-app notifications ─────────────────────────────────────

function kindFor(ev: RadarEvent): NotificationKind {
  if (ev.ref_kind === "grant") return "grant_deadline";
  return ev.program_type === "event" ? "event_match" : "program_intake";
}

/**
 * Batch `new_match` into one `new_matches` row per target; everything else
 * is one row per event. dedupeKey + 24 h throttle = the frequency cap.
 */
export function planNotifications(target: RadarTarget, events: RadarEvent[]): NotifyArgs[] {
  const out: NotifyArgs[] = [];
  const fresh = events.filter((e) => e.type === "new_match");
  if (fresh.length > 0) {
    const at = fresh[0].at;
    const grantsNew = fresh.filter((e) => e.ref_kind === "grant");
    const programsNew = fresh.filter((e) => e.ref_kind === "program");
    out.push({
      userId: target.userId,
      projectId: target.projectId,
      kind: "new_matches",
      dedupeKey: `new_matches:${target.projectId ?? "user"}:${at}`,
      throttleMs: INAPP_THROTTLE_MS,
      payload: {
        event: "new_match",
        count: fresh.length,
        grant_count: grantsNew.length,
        program_count: programsNew.length,
        startup: target.startup,
        report_id: target.reportId,
        grants: grantsNew.slice(0, 5).map((e) => ({ id: e.ref_id, name: e.name, closes_at: e.closes_at })),
        programs: programsNew.slice(0, 5).map((e) => ({ id: e.ref_id, name: e.name, closes_at: e.closes_at })),
        at,
      },
    });
  }
  for (const ev of events) {
    if (ev.type === "new_match") continue;
    const tier = ev.type.startsWith("deadline_") ? ev.type.slice("deadline_".length) : ev.type;
    out.push({
      userId: ev.userId,
      projectId: ev.projectId,
      kind: kindFor(ev),
      dedupeKey: `${ev.ref_kind}:${ev.ref_id}:${tier}`,
      throttleMs: INAPP_THROTTLE_MS,
      payload: {
        event: ev.type,
        ref_kind: ev.ref_kind,
        ref_id: ev.ref_id,
        name: ev.name,
        closes_at: ev.closes_at,
        days_left: ev.days_left,
        status: ev.status ?? null,
        url: ev.url,
        startup: target.startup,
        at: ev.at,
      },
    });
  }
  return out;
}

// ─── Profile assembly (shared by the Supabase store and tests) ───────────────

/** Overlay non-null `project_grant_profiles` columns on an intake-derived profile. */
export function mergeGrantProfile(
  base: GrantProfile | null,
  row: Record<string, unknown> | null,
  fallback: { stage?: string | number | null; industry?: string | null; description?: string | null } = {},
): GrantProfile | null {
  const r = row ?? {};
  const state = (typeof r.state === "string" && r.state) || base?.state || null;
  if (!state) return null;
  const stage = base?.stage ?? stageFromLoose(fallback.stage);
  const arr = (v: unknown): string[] | null => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : null);
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
  const demographics = arr(r.founder_demographics) ?? [];
  const profile: GrantProfile = {
    ...(base ?? { stage }),
    state: state as GrantProfile["state"],
    stage,
    city: (typeof r.city === "string" ? r.city : null) ?? base?.city ?? null,
    entity_type: (r.entity_type as GrantProfile["entity_type"]) ?? base?.entity_type ?? null,
    incorporated_at: (typeof r.incorporated_at === "string" ? r.incorporated_at.slice(0, 10) : null) ?? base?.incorporated_at ?? null,
    turnover_aud: num(r.turnover_aud) ?? base?.turnover_aud ?? null,
    prior_year_expenses_aud: num(r.prior_year_expenses_aud) ?? base?.prior_year_expenses_aud ?? null,
    prior_year_income_aud: num(r.prior_year_income_aud) ?? base?.prior_year_income_aud ?? null,
    rd_spend_aud: num(r.rd_spend_aud) ?? base?.rd_spend_aud ?? null,
    headcount: num(r.headcount) ?? base?.headcount ?? null,
    founder_demographics: demographics.length > 0 ? demographics : (base?.founder_demographics ?? []),
    university_affiliations: arr(r.university_affiliations) ?? base?.university_affiliations ?? [],
    export_intent: typeof r.export_intent === "boolean" ? r.export_intent : (base?.export_intent ?? null),
    listed: typeof r.listed === "boolean" ? r.listed : (base?.listed ?? null),
    prior_raise_aud: num(r.prior_raise_aud) ?? base?.prior_raise_aud ?? null,
    industry_tags: base?.industry_tags?.length ? base.industry_tags : fallback.industry ? [fallback.industry] : [],
    funding_need_aud: base?.funding_need_aud ?? null,
    description: base?.description ?? fallback.description ?? null,
  };
  return profile;
}

/** `app_users.startup_stage` / `projects.stage` are loose; map to the matcher's stage. */
export function stageFromLoose(v: unknown): FounderStage {
  if (typeof v === "string") {
    const s = v.toLowerCase().trim();
    if ((FOUNDER_STAGES as readonly string[]).includes(s)) return s as FounderStage;
    if (/idea|concept/.test(s)) return "idea";
    if (/proto|pre.?rev/.test(s)) return "pre_revenue_prototype";
    if (/mvp|beta|launch/.test(s)) return "mvp";
    if (/early|first.?rev|seed/.test(s)) return "early_revenue";
    if (/scal|growth|series/.test(s)) return "scaling";
  }
  if (typeof v === "number") {
    if (v <= 1) return "idea";
    if (v === 2) return "pre_revenue_prototype";
    if (v === 3) return "mvp";
    if (v === 4) return "early_revenue";
    return "scaling";
  }
  return "mvp";
}

// ─── Supabase store ──────────────────────────────────────────────────────────

/** Minimal Supabase surface the default store uses (so tests can also fake the raw client). */
export interface SupabaseLike {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

interface PlanRow {
  id: string;
  feature_flags: unknown;
}
interface UserRow {
  id: string;
  email: string | null;
  plan: string | null;
  startup_name?: string | null;
  startup_stage?: string | null;
  industry?: string | null;
}
interface ReportRow {
  id: string;
  user_id: string | null;
  project_id: string | null;
  intake: unknown;
  status: string;
  created_at: string;
}
interface ProjectRow {
  id: string;
  name: string | null;
  stage: number | null;
  industry: string | null;
  description?: string | null;
}

export function createSupabaseRadarStore(db: SupabaseLike): RadarStore {
  return {
    async listSubscribers(now) {
      const since = new Date(now.getTime() - PAID_REPORT_LOOKBACK_DAYS * 86_400_000).toISOString();
      const { data: plans } = await db.from("plans").select("id, feature_flags");
      const radarPlans = ((plans ?? []) as PlanRow[])
        .filter((p) => Array.isArray(p.feature_flags) && (p.feature_flags as unknown[]).includes("money_radar"))
        .map((p) => p.id);

      const radarUsers = new Map<string, UserRow>();
      if (radarPlans.length > 0) {
        const { data } = await db.from("app_users").select("id, email, plan").in("plan", radarPlans).limit(10_000);
        for (const u of (data ?? []) as UserRow[]) radarUsers.set(u.id, u);
      }
      // Per-user grants (add-on / support override) widen the plan layer.
      const { data: grants } = await db
        .from("entitlements")
        .select("user_id, expires_at")
        .eq("feature", "money_radar")
        .eq("allowed", true);
      const grantIds = ((grants ?? []) as Array<{ user_id: string; expires_at: string | null }>)
        .filter((g) => !g.expires_at || new Date(g.expires_at).getTime() > now.getTime())
        .map((g) => g.user_id)
        .filter((id) => !radarUsers.has(id));
      if (grantIds.length > 0) {
        const { data } = await db.from("app_users").select("id, email, plan").in("id", grantIds);
        for (const u of (data ?? []) as UserRow[]) radarUsers.set(u.id, u);
      }

      // A$3 / credit buyers in the last 90 days → in-app only.
      const { data: reports } = await db
        .from("funding_reports")
        .select("user_id")
        .not("user_id", "is", null)
        .eq("status", "ready")
        .gte("created_at", since)
        .limit(10_000);
      const buyerIds = Array.from(
        new Set(((reports ?? []) as Array<{ user_id: string }>).map((r) => r.user_id).filter((id) => id && !radarUsers.has(id))),
      );
      const buyers: UserRow[] = [];
      if (buyerIds.length > 0) {
        const { data } = await db.from("app_users").select("id, email, plan").in("id", buyerIds);
        buyers.push(...((data ?? []) as UserRow[]));
      }

      return [
        ...Array.from(radarUsers.values()).map<RadarSubscriber>((u) => ({
          userId: u.id,
          email: u.email,
          plan: u.plan,
          channels: ["inapp", "email", "ics"],
        })),
        ...buyers.map<RadarSubscriber>((u) => ({ userId: u.id, email: u.email, plan: u.plan, channels: ["inapp"] })),
      ];
    },

    async listTargets(sub) {
      const { data: userRow } = await db
        .from("app_users")
        .select("id, email, plan, startup_name, startup_stage, industry")
        .eq("id", sub.userId)
        .maybeSingle();
      const user = (userRow ?? null) as UserRow | null;

      const { data: projRows } = await db.from("projects").select("id, name, stage, industry, description").eq("user_id", sub.userId);
      const projects = ((projRows ?? []) as ProjectRow[]).filter((p) => p.id);
      const projectIds = projects.map((p) => p.id);

      const profiles = new Map<string, Record<string, unknown>>();
      if (projectIds.length > 0) {
        const { data } = await db.from("project_grant_profiles").select("*").in("project_id", projectIds);
        for (const r of (data ?? []) as Array<Record<string, unknown>>) {
          if (typeof r.project_id === "string") profiles.set(r.project_id, r);
        }
      }

      const { data: repRows } = await db
        .from("funding_reports")
        .select("id, user_id, project_id, intake, status, created_at")
        .eq("user_id", sub.userId)
        .order("created_at", { ascending: false })
        .limit(20);
      const reports = ((repRows ?? []) as ReportRow[]).filter((r) => r.status === "ready" || r.status === "generating" || r.status === "paid");

      // Latest valid intake per project (and the latest with no project).
      const intakeByProject = new Map<string | null, { intake: FundingIntake; reportId: string }>();
      for (const r of reports) {
        const parsed = parseFundingIntake(r.intake);
        if (!parsed.ok) continue;
        const pk = r.project_id ?? null;
        if (!intakeByProject.has(pk)) intakeByProject.set(pk, { intake: parsed.intake, reportId: r.id });
      }
      const latestAny = reports.map((r) => intakeByProject.get(r.project_id ?? null)).find(Boolean) ?? null;

      const targets: RadarTarget[] = [];
      for (const p of projects) {
        const profRow = profiles.get(p.id) ?? null;
        const intakeHit = intakeByProject.get(p.id) ?? (profRow ? latestAny : null);
        if (!profRow && !intakeHit) continue;
        const base = intakeHit ? intakeToGrantProfile(intakeHit.intake) : null;
        const profile = mergeGrantProfile(base, profRow, {
          stage: user?.startup_stage ?? p.stage,
          industry: p.industry ?? user?.industry ?? null,
          description: p.description ?? null,
        });
        if (!profile) continue;
        targets.push({
          userId: sub.userId,
          projectId: p.id,
          startup: p.name ?? user?.startup_name ?? null,
          profile,
          // Unknown only when neither the intake nor the profile row names a state.
          locationUnknown: intakeHit ? locationUnknown(intakeHit.intake) && typeof profRow?.state !== "string" : false,
          reportId: intakeHit?.reportId ?? null,
        });
      }
      // Reports without a project (or whose project no longer exists) → one user-level target.
      if (targets.length === 0) {
        const loose = intakeByProject.get(null) ?? latestAny;
        if (loose) {
          const profile = mergeGrantProfile(intakeToGrantProfile(loose.intake), null, {});
          if (profile) {
            targets.push({
              userId: sub.userId,
              projectId: null,
              startup: user?.startup_name ?? null,
              profile,
              locationUnknown: locationUnknown(loose.intake),
              reportId: loose.reportId,
            });
          }
        }
      }
      return targets;
    },

    async listCatalogue() {
      const [grants, programs] = await Promise.all([listGrants({ excludeNonMatching: true }), listPrograms({})]);
      return { grants, programs };
    },

    async listMatches(userId, projectId) {
      let q = db.from("funding_matches").select("*").eq("user_id", userId);
      q = projectId ? q.eq("project_id", projectId) : q.is("project_id", null);
      const { data, error } = await q;
      if (error) {
        if (error.code !== "42P01") console.warn("[radar-sweep] listMatches", error.message);
        return [];
      }
      return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        user_id: String(r.user_id),
        project_id: (r.project_id as string | null) ?? null,
        ref_kind: r.ref_kind as "grant" | "program",
        ref_id: String(r.ref_id),
        score: Number(r.score ?? 0),
        status_at_match: String(r.status_at_match ?? "open"),
        closes_at: (r.closes_at as string | null) ?? null,
        first_seen_at: String(r.first_seen_at ?? ""),
        last_seen_at: String(r.last_seen_at ?? ""),
        last_notified: (r.last_notified && typeof r.last_notified === "object" ? (r.last_notified as Record<string, unknown>) : {}),
      }));
    },

    async insertMatches(rows) {
      if (rows.length === 0) return;
      const { error } = await db.from("funding_matches").insert(
        rows.map((r) => ({
          user_id: r.user_id,
          project_id: r.project_id,
          ref_kind: r.ref_kind,
          ref_id: r.ref_id,
          score: r.score,
          status_at_match: r.status_at_match,
          closes_at: r.closes_at,
          first_seen_at: r.first_seen_at,
          last_seen_at: r.last_seen_at,
          last_notified: r.last_notified,
        })),
      );
      if (error) throw new Error(`funding_matches insert: ${error.message}`);
    },

    async updateMatch(id, patch) {
      const { error } = await db.from("funding_matches").update(patch).eq("id", id);
      if (error) throw new Error(`funding_matches update: ${error.message}`);
    },

    async notify(args) {
      await insertNotification(args);
    },
  };
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

const EMPTY_BY_TYPE = (): Record<RadarEventType, number> => ({
  new_match: 0,
  deadline_t30: 0,
  deadline_t14: 0,
  deadline_t3: 0,
  status_changed: 0,
  new_round_opened: 0,
});

export async function runMoneyRadarSweep(opts: SweepOptions = {}): Promise<SweepSummary> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun ?? false;
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const startedAt = Date.now();
  const summary: SweepSummary = {
    ok: true,
    dryRun,
    runDate: isoDay(now),
    subscribers: 0,
    targets: 0,
    inserted: 0,
    updated: 0,
    notifications: 0,
    events: [],
    byType: EMPTY_BY_TYPE(),
    errors: 0,
    skipped: 0,
  };

  let store = opts.store ?? null;
  if (!store) {
    const db = opts.db === undefined ? getSupabaseAdmin() : opts.db;
    if (!db) return { ...summary, ok: false, error: "supabase_unavailable" };
    store = createSupabaseRadarStore(db);
  }

  let subscribers: RadarSubscriber[];
  let catalogue: { grants: AuGrantRow[]; programs: AuProgramRow[] };
  try {
    [subscribers, catalogue] = await Promise.all([store.listSubscribers(now), store.listCatalogue()]);
  } catch (err) {
    return { ...summary, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  summary.subscribers = subscribers.length;
  if (catalogue.grants.length === 0 && catalogue.programs.length === 0) {
    return { ...summary, ok: false, error: "empty_catalogue" };
  }

  for (const sub of subscribers) {
    if (Date.now() - startedAt > budgetMs) {
      summary.skipped++;
      continue;
    }
    let targets: RadarTarget[];
    try {
      targets = await store.listTargets(sub);
    } catch (err) {
      summary.errors++;
      console.warn("[radar-sweep] listTargets failed", sub.userId, err instanceof Error ? err.message : String(err));
      continue;
    }
    for (const target of targets) {
      summary.targets++;
      try {
        const cat = target.locationUnknown
          ? {
              grants: catalogue.grants.filter((g) => g.state === "national"),
              programs: catalogue.programs.filter((p) => p.state === "national" || p.capital === "Remote"),
            }
          : catalogue;
        const grants = screenGrants(target.profile, cat.grants, now).matched;
        const programs = screenPrograms(target.profile, cat.programs, now).matched;
        const prev = await store.listMatches(target.userId, target.projectId);
        const diff = diffTarget({ target, channels: sub.channels, prev, grants, programs, catalogue, now });
        summary.events.push(...diff.events);
        for (const ev of diff.events) summary.byType[ev.type]++;

        const planned = planNotifications(target, diff.events);
        if (dryRun) {
          // Report what a real run would write; touch nothing.
          summary.inserted += diff.inserts.length;
          summary.updated += diff.updates.length;
          summary.notifications += planned.length;
          continue;
        }
        await store.insertMatches(diff.inserts);
        summary.inserted += diff.inserts.length;
        for (const u of diff.updates) {
          await store.updateMatch(u.id, u.patch);
          summary.updated++;
        }
        for (const n of planned) {
          await store.notify(n);
          summary.notifications++;
        }
      } catch (err) {
        summary.errors++;
        console.warn("[radar-sweep] target failed", target.userId, target.projectId, err instanceof Error ? err.message : String(err));
      }
    }
  }

  return summary;
}
