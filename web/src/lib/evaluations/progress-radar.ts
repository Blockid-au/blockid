// progress-radar — weekly Evaluator Progress Radar (T0273, G12 sprint S4;
// docs/plans/evaluator-traction-2026-09-10.md §3b Scout/Firm/Program, §3c-8,
// §9-pre G12-9/G12-10).
//
// For every `evaluations` row the user holds (keyed on
// `evaluations.project_id` — NOT the listing-keyed `watchlist`, G12-10):
//   • SVI now / previous / Δ from the latest two `svi_snapshots`, and a
//     stage change from the snapshot `stage` (falls back to
//     `analysis_json.current_phase` when a row carries it);
//   • new evidence this period: `evidence_items` is account-scoped
//     (`account_id` → `svi_accounts.project_id`, the same join
//     computeNextSteps / the founder digest use), so the count is per
//     project via that hop;
//   • the latest `evaluation_reports` row (date, SVI, full|rescore);
//   • the startup's money signals from `funding_matches` (T0245): the next
//     dated deadline, how many deadlines are ahead, and matches first seen
//     this period — keyed on the FOUNDER (projects.user_id) + project, not
//     the evaluator reading the radar (review #16);
//   • `scoreHistory` — the last 8 snapshot totals, oldest first, for the
//     inline sparkline on /workspace/evaluations.
//
// `movers` = the top 5 by |Δ| (non-zero, ties by name) and `deadlines` = the
// next 5 dated deadlines across all tracked startups. `digest_ready` is true
// when there is anything worth an email: a mover, a deadline ahead, a new
// match, new evidence or a report this period. A week with nothing is
// skipped by the cron (silent weeks beat empty emails).
//
// Idempotency: `claimProgressSend` inserts the `(user_id, period_start)` row
// into `evaluator_progress_sends` (migration 0321) BEFORE the send, exactly
// like `founder_digest_sends`; `releaseProgressSend` rolls it back when the
// email fails so the next tick can retry. `period_start` is the Monday
// 00:00 UTC of the ISO week containing `now`, so a retry on the same
// Sunday/Monday keys the same slot.
//
// Every read goes through `ProgressStore`; tests inject a fake, production
// builds one from Supabase (`createSupabaseProgressStore`).

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { insertNotification } from "@/lib/notifications";

export type {
  ProgressEvaluationRow,
  ProgressSnapshotRow,
  ProgressReportRow,
  ProgressMatchRow,
  ProgressRefMeta,
  ProgressDeadline,
  EvaluatorProgressItem,
  EvaluatorProgress,
  ProgressStore,
  BuildProgressOptions,
  SupabaseLike,
} from "./progress-shared";
export {
  SCORE_HISTORY_LEN,
  MOVERS_LIMIT,
  DEADLINES_LIMIT,
  periodStartFor,
  formatDelta,
  rankMovers,
  progressHeadline,
  progressDedupeKey,
  progressNotificationPayload,
  EVALUATOR_SEGMENTS,
  isEvaluatorPersona,
} from "./progress-shared";
import {
  SCORE_HISTORY_LEN,
  DEADLINES_LIMIT,
  periodStartFor,
  rankMovers,
  progressNotificationPayload,
  progressDedupeKey,
  startOfUtcDay,
  parseIsoDay,
  num,
  round1,
  type ProgressSnapshotRow,
  type ProgressReportRow,
  type ProgressMatchRow,
  type ProgressRefMeta,
  type ProgressDeadline,
  type EvaluatorProgressItem,
  type EvaluatorProgress,
  type ProgressStore,
  type BuildProgressOptions,
  type SupabaseLike,
} from "./progress-shared";

const DAY_MS = 86_400_000;

// ─── Core builder ────────────────────────────────────────────────────────────

export async function buildEvaluatorProgress(opts: BuildProgressOptions): Promise<EvaluatorProgress> {
  const now = opts.now ?? new Date();
  const periodStartDate = periodStartFor(now);
  const periodStart = periodStartDate.toISOString();
  const periodEnd = now.toISOString();
  const today = startOfUtcDay(now);

  const empty: EvaluatorProgress = {
    userId: opts.userId,
    periodStart,
    periodEnd,
    items: [],
    movers: [],
    deadlines: [],
    newMatches: 0,
    newEvidence: 0,
    digest_ready: false,
  };

  const store = opts.store ?? (() => {
    const db = opts.db ?? getSupabaseAdmin();
    return db ? createSupabaseProgressStore(db) : null;
  })();
  if (!store) return empty;

  const evaluations = await store.listEvaluations(opts.userId);
  if (evaluations.length === 0) return empty;
  const projectIds = evaluations.map((e) => e.projectId);

  const [snapshots, evidence, reports, matches] = await Promise.all([
    store.listSnapshots(projectIds).catch(() => [] as ProgressSnapshotRow[]),
    store.countEvidenceSince(projectIds, periodStart).catch(() => new Map<string, number>()),
    store.listReports(opts.userId).catch(() => [] as ProgressReportRow[]),
    store.listMatches(opts.userId, projectIds).catch(() => [] as ProgressMatchRow[]),
  ]);

  // Snapshots newest-first per project.
  const snapsByProject = new Map<string, ProgressSnapshotRow[]>();
  for (const s of snapshots) {
    if (!s.project_id) continue;
    const arr = snapsByProject.get(s.project_id) ?? [];
    arr.push(s);
    snapsByProject.set(s.project_id, arr);
  }
  for (const arr of snapsByProject.values()) {
    arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  // Latest report per evaluation.
  const reportByEval = new Map<string, ProgressReportRow>();
  for (const r of reports) {
    if (!reportByEval.has(r.evaluation_id)) reportByEval.set(r.evaluation_id, r);
  }

  // Matches per project + names for the dated ones.
  const matchesByProject = new Map<string, ProgressMatchRow[]>();
  for (const m of matches) {
    if (!m.project_id) continue;
    const arr = matchesByProject.get(m.project_id) ?? [];
    arr.push(m);
    matchesByProject.set(m.project_id, arr);
  }
  const datedRefs = matches
    .filter((m) => m.project_id && parseIsoDay(m.closes_at))
    .map((m) => ({ ref_kind: m.ref_kind, ref_id: m.ref_id }));
  const refMeta = new Map<string, ProgressRefMeta>();
  if (datedRefs.length > 0) {
    const seen = new Set<string>();
    const unique = datedRefs.filter((r) => {
      const k = `${r.ref_kind}:${r.ref_id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const metas = await store.resolveRefs(unique).catch(() => [] as ProgressRefMeta[]);
    for (const m of metas) refMeta.set(`${m.ref_kind}:${m.ref_id}`, m);
  }

  const periodStartMs = periodStartDate.getTime();
  const items: EvaluatorProgressItem[] = [];
  const allDeadlines: ProgressDeadline[] = [];

  for (const ev of evaluations) {
    const snaps = snapsByProject.get(ev.projectId) ?? [];
    const latest = snaps[0] ?? null;
    const prev = snaps[1] ?? null;
    const sviNow = latest ? num(latest.svi_total) : null;
    const sviPrev = prev ? num(prev.svi_total) : null;
    const delta = sviNow != null && sviPrev != null ? round1(sviNow - sviPrev) : null;
    const stageOf = (s: ProgressSnapshotRow | null): number | null =>
      s ? (num(s.stage) ?? num(s.current_phase)) : null;
    const stageNow = stageOf(latest) ?? ev.projectStage ?? null;
    const stagePrev = stageOf(prev);
    const stageChanged = stageNow != null && stagePrev != null && stageNow !== stagePrev;

    const scoreHistory = snaps
      .slice(0, SCORE_HISTORY_LEN)
      .map((s) => num(s.svi_total))
      .filter((n): n is number => n != null)
      .reverse();

    const report = reportByEval.get(ev.id) ?? null;

    const projMatches = matchesByProject.get(ev.projectId) ?? [];
    let newMatches = 0;
    const deadlines: ProgressDeadline[] = [];
    for (const m of projMatches) {
      const firstSeen = new Date(m.first_seen_at).getTime();
      if (Number.isFinite(firstSeen) && firstSeen >= periodStartMs) newMatches++;
      const closes = parseIsoDay(m.closes_at);
      if (!closes) continue;
      const daysLeft = Math.round((closes.getTime() - today.getTime()) / DAY_MS);
      if (daysLeft < 0) continue;
      if (m.status_at_match === "closed" || m.status_at_match === "paused") continue;
      const meta = refMeta.get(`${m.ref_kind}:${m.ref_id}`);
      deadlines.push({
        evaluationId: ev.id,
        projectId: ev.projectId,
        startup: ev.projectName,
        refKind: m.ref_kind,
        refId: m.ref_id,
        name: meta?.name ?? m.ref_id,
        closesAt: (m.closes_at as string).slice(0, 10),
        daysLeft,
        url: meta?.url ?? null,
      });
    }
    deadlines.sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
    allDeadlines.push(...deadlines);

    items.push({
      evaluationId: ev.id,
      projectId: ev.projectId,
      projectSlug: ev.projectSlug,
      name: ev.projectName,
      label: ev.label,
      sviNow,
      sviPrev,
      delta,
      stageNow,
      stagePrev,
      stageChanged,
      newEvidence: evidence.get(ev.projectId) ?? 0,
      lastReport: report ? { at: report.created_at, svi: num(report.svi_total), kind: report.kind } : null,
      money: { nextDeadline: deadlines[0] ?? null, deadlinesAhead: deadlines.length, newMatches },
      scoreHistory,
    });
  }

  allDeadlines.sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
  const movers = rankMovers(items);
  const totalNewMatches = items.reduce((n, i) => n + i.money.newMatches, 0);
  const totalNewEvidence = items.reduce((n, i) => n + i.newEvidence, 0);
  const reportThisPeriod = items.some((i) => i.lastReport && new Date(i.lastReport.at).getTime() >= periodStartMs);
  const stageMoved = items.some((i) => i.stageChanged);

  return {
    userId: opts.userId,
    periodStart,
    periodEnd,
    items,
    movers,
    deadlines: allDeadlines.slice(0, DEADLINES_LIMIT),
    newMatches: totalNewMatches,
    newEvidence: totalNewEvidence,
    digest_ready:
      movers.length > 0 || allDeadlines.length > 0 || totalNewMatches > 0 || totalNewEvidence > 0 || reportThisPeriod || stageMoved,
  };
}

// ─── Idempotency + in-app fan-out ────────────────────────────────────────────

export async function claimProgressSend(
  p: EvaluatorProgress,
  store?: ProgressStore | null,
): Promise<"claimed" | "dupe" | "error"> {
  const s = store ?? (() => {
    const db = getSupabaseAdmin();
    return db ? createSupabaseProgressStore(db) : null;
  })();
  if (!s) return "error";
  return s.claimSend({
    userId: p.userId,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    payload: progressNotificationPayload(p),
  });
}

export async function releaseProgressSend(p: EvaluatorProgress, store?: ProgressStore | null): Promise<void> {
  const s = store ?? (() => {
    const db = getSupabaseAdmin();
    return db ? createSupabaseProgressStore(db) : null;
  })();
  if (!s) return;
  await s.releaseSend({ userId: p.userId, periodStart: p.periodStart });
}

/**
 * In-app row (`weekly_next_step`, dedupe `evaluator_progress:<user>:<period>`,
 * 6-day throttle so a retried cron never doubles the feed entry).
 */
export async function notifyEvaluatorProgress(
  p: EvaluatorProgress,
  notify: (args: Parameters<typeof insertNotification>[0]) => Promise<unknown> = insertNotification,
): Promise<void> {
  await notify({
    userId: p.userId,
    projectId: null,
    kind: "weekly_next_step",
    payload: progressNotificationPayload(p),
    dedupeKey: progressDedupeKey(p.userId, p.periodStart),
    throttleMs: 6 * DAY_MS,
  });
}

// ─── Supabase store ──────────────────────────────────────────────────────────

type Row = Record<string, unknown>;

export function createSupabaseProgressStore(db: SupabaseLike): ProgressStore {
  return {
    async listEvaluations(userId) {
      const { data, error } = await db
        .from("evaluations")
        .select("id, project_id, label, projects:project_id (name, slug, stage)")
        .eq("evaluator_user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error || !data) return [];
      return (data as Array<Row & { projects?: Row | Row[] | null }>).map((r) => {
        const p = (Array.isArray(r.projects) ? r.projects[0] : r.projects) ?? {};
        return {
          id: String(r.id),
          projectId: String(r.project_id),
          projectName: String(p.name ?? "Untitled startup"),
          projectSlug: String(p.slug ?? ""),
          projectStage: num(p.stage),
          label: r.label == null ? null : String(r.label),
        };
      });
    },

    async listSnapshots(projectIds) {
      if (projectIds.length === 0) return [];
      const { data, error } = await db
        .from("svi_snapshots")
        .select("project_id, svi_total, stage, analysis_json, created_at")
        .in("project_id", projectIds)
        .order("created_at", { ascending: false })
        .limit(projectIds.length * SCORE_HISTORY_LEN * 2);
      if (error || !data) return [];
      return (data as Row[]).map((r) => {
        const aj = (r.analysis_json ?? null) as Row | null;
        return {
          project_id: String(r.project_id ?? ""),
          svi_total: num(r.svi_total),
          stage: num(r.stage),
          current_phase: aj ? num(aj.current_phase) : null,
          created_at: String(r.created_at ?? ""),
        };
      });
    },

    async countEvidenceSince(projectIds, sinceIso) {
      const out = new Map<string, number>();
      if (projectIds.length === 0) return out;
      const { data: accounts } = await db.from("svi_accounts").select("id, project_id").in("project_id", projectIds);
      const accToProject = new Map<string, string>();
      for (const a of (accounts ?? []) as Row[]) {
        if (a.id && a.project_id) accToProject.set(String(a.id), String(a.project_id));
      }
      if (accToProject.size === 0) return out;
      const { data: items } = await db
        .from("evidence_items")
        .select("account_id, created_at")
        .in("account_id", Array.from(accToProject.keys()))
        .gte("created_at", sinceIso)
        .limit(5000);
      for (const it of (items ?? []) as Row[]) {
        const pid = accToProject.get(String(it.account_id ?? ""));
        if (!pid) continue;
        out.set(pid, (out.get(pid) ?? 0) + 1);
      }
      return out;
    },

    async listReports(userId) {
      const { data, error } = await db
        .from("evaluation_reports")
        .select("evaluation_id, kind, svi_total, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error || !data) return [];
      return (data as Row[]).map((r) => ({
        evaluation_id: String(r.evaluation_id),
        kind: r.kind === "rescore" ? "rescore" : "full",
        svi_total: num(r.svi_total),
        created_at: String(r.created_at ?? ""),
      }));
    },

    async listMatches(_userId, projectIds) {
      if (projectIds.length === 0) return [];
      // funding_matches rows are keyed to the user the radar sweep ran FOR —
      // the project's owner (projects.user_id), never the evaluator reading
      // the radar (review #16). Resolve each evaluation's project owner and
      // query by (owner, project) so a founder's matches surface.
      const { data: projRows, error: projErr } = await db.from("projects").select("id, user_id").in("id", projectIds);
      if (projErr || !projRows) return [];
      const ownerIds = Array.from(
        new Set((projRows as Row[]).map((p) => (p.user_id == null ? "" : String(p.user_id))).filter(Boolean)),
      );
      if (ownerIds.length === 0) return [];
      const { data, error } = await db
        .from("funding_matches")
        .select("project_id, ref_kind, ref_id, closes_at, first_seen_at, score, status_at_match")
        .in("user_id", ownerIds)
        .in("project_id", projectIds)
        .limit(2000);
      if (error || !data) return [];
      return (data as Row[]).map((r) => ({
        project_id: r.project_id == null ? null : String(r.project_id),
        ref_kind: r.ref_kind === "program" ? "program" : "grant",
        ref_id: String(r.ref_id),
        closes_at: r.closes_at == null ? null : String(r.closes_at),
        first_seen_at: String(r.first_seen_at ?? ""),
        score: num(r.score) ?? 0,
        status_at_match: r.status_at_match == null ? null : String(r.status_at_match),
      }));
    },

    async resolveRefs(refs) {
      const grantIds = refs.filter((r) => r.ref_kind === "grant").map((r) => r.ref_id);
      const programIds = refs.filter((r) => r.ref_kind === "program").map((r) => r.ref_id);
      const out: ProgressRefMeta[] = [];
      if (grantIds.length > 0) {
        const { data } = await db.from("au_grants").select("id, name, official_url").in("id", grantIds);
        for (const g of (data ?? []) as Row[]) {
          out.push({ ref_kind: "grant", ref_id: String(g.id), name: String(g.name ?? g.id), url: g.official_url ? String(g.official_url) : null });
        }
      }
      if (programIds.length > 0) {
        const { data } = await db.from("au_programs").select("id, name, official_url").in("id", programIds);
        for (const p of (data ?? []) as Row[]) {
          out.push({ ref_kind: "program", ref_id: String(p.id), name: String(p.name ?? p.id), url: p.official_url ? String(p.official_url) : null });
        }
      }
      return out;
    },

    async claimSend({ userId, periodStart, periodEnd, payload }) {
      const { error } = await db
        .from("evaluator_progress_sends")
        .insert({ user_id: userId, period_start: periodStart, period_end: periodEnd, payload });
      if (!error) return "claimed";
      const code = (error as { code?: string }).code;
      // 23505 = unique_violation → this week was already sent.
      if (code === "23505") return "dupe";
      console.warn("[blockid:evaluator-progress] claim failed", error);
      return "error";
    },

    async releaseSend({ userId, periodStart }) {
      await db.from("evaluator_progress_sends").delete().eq("user_id", userId).eq("period_start", periodStart);
    },
  };
}
