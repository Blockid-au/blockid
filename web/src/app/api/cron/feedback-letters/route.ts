// GET|POST /api/cron/feedback-letters
//
// G14-S34 — founder feedback letter "What investors said". Sunday 22:00 UTC
// (Monday 08:00 AEST), one hour before the founder digest so the letter is
// the first thing in the founder's Monday inbox and the digest can point
// at it.
//
// Per candidate project (≥ 1 submitted, not-opted-out assessment that no
// letter has consumed — store.listLetterCandidateProjects):
//   1. read every assessment row on the project;
//   2. eligibleGroups → k ≥ 3 assessors from ≥ 2 orgs (D3 / F-5), else skip;
//   3. nothing new since the last letter → skip (or retry a draft's email);
//   4. resolve the claimed founder (evaluations.founder_user_id) — no
//      founder, no addressee → skip;
//   5. aggregateAssessments (forbidden-key walk inside) → renderLetter EN +
//      VI → letterToNextActions (weakest dim → recommender + CTO top 3);
//   6. insert `founder_feedback_letters` (UNIQUE (project_id, window_end) —
//      window_end = start of the run's UTC day, so a re-run is `dupe`);
//   7. stamp the consumed assessment rows (feedback_letter_id);
//   8. in-app `feedback_letter` notification, `sendFounderFeedbackLetter`
//      email (status → sent + message id), webhook `feedback_letter.sent`
//      to the founder's endpoints, server event `feedback_letter_sent`.
//
// Auth: `Authorization: Bearer ${CRON_SECRET}`. `?dry=1` computes
// everything (eligibility, aggregate, subject) and writes / sends nothing.
// Before migration 0406 the store answers `available: false` and the route
// returns `{ ok: true, reason: "table_missing" }`. cron-runner.sh POSTs;
// GET is kept for manual checks.

import { NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/security/cron-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendFounderFeedbackLetter } from "@/lib/email";
import { insertNotification } from "@/lib/notifications";
import { enqueueWebhook } from "@/lib/webhooks/registry";
import { emitEventSafe } from "@/lib/analytics/server";
import { aggregateAssessments, dimensionTitle, eligibleGroups, letterToNextActions, renderLetter, type FeedbackAggregate } from "@/lib/evaluations/feedback-letter";
import { FEEDBACK_LETTER_DASHBOARD_PATH } from "@/lib/evaluations/feedback-letter-email";
import {
  insertLetter,
  latestLetterForProject,
  listLetterCandidateProjects,
  markLetterSent,
  readLatestSviForProject,
  readProjectAssessments,
  resolveLetterFounder,
  stampAssessmentsWithLetter,
  type FeedbackLetterRow,
  type LetterFounder,
} from "@/lib/evaluations/feedback-letter-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BUDGET_MS = 240_000;
/** Projects per tick — the k-floor keeps the real number small; the rest waits a week. */
export const MAX_PROJECTS_PER_TICK = 50;

export type LetterOutcome =
  | "sent"
  | "would_send"
  | "sent_no_email"
  | "email_failed"
  | "skipped_below_floor"
  | "skipped_no_new"
  | "skipped_no_founder"
  | "skipped_dupe"
  | "skipped_unsubscribed"
  | "failed";

export interface ProjectSummary {
  project_id: string;
  k: number;
  org_count: number;
  new_rows: number;
  weakest_dim: string | null;
  subject?: string;
  letter_id?: string;
  outcome: LetterOutcome;
}

function isDry(request: Request): boolean {
  try {
    const v = new URL(request.url).searchParams.get("dry");
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

/** UNIQUE (project_id, window_end): the run's UTC day, so a same-day re-run is a dupe. */
export function windowEndFor(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au").replace(/\/$/, "");
}

/** Notification + email + webhook + event for one stored letter. */
async function deliverLetter(letter: FeedbackLetterRow, founder: LetterFounder, aggregate: FeedbackAggregate): Promise<{ outcome: LetterOutcome; subject?: string }> {
  const weakest = aggregate.weakestDim;
  await insertNotification({
    userId: founder.userId,
    projectId: null,
    kind: "feedback_letter",
    payload: { letter_id: letter.id, k: letter.k, orgs: letter.orgCount, weakest_dim: weakest ? dimensionTitle(weakest, "en") : null, startup: founder.projectName },
    dedupeKey: `feedback_letter:${letter.id}`,
    throttleMs: 30 * 24 * 60 * 60 * 1000,
  });

  let outcome: LetterOutcome = "sent_no_email";
  let subject: string | undefined;
  if (founder.email) {
    const sent = await sendFounderFeedbackLetter({
      to: founder.email,
      displayName: founder.displayName,
      startupName: founder.projectName,
      aggregate,
      letterMd: letter.letterMd,
      nextActions: letter.nextActions,
    });
    subject = sent.subject;
    if (sent.ok) {
      await markLetterSent(letter.id, sent.id || null);
      outcome = "sent";
    } else if (sent.reason === "unsubscribed") {
      // The letter still lives on the dashboard; the row stays `draft` so
      // the status honestly says it was never emailed.
      outcome = "skipped_unsubscribed";
    } else {
      outcome = "email_failed";
    }
  }

  // Founder-side subscribers only — the project row belongs to the
  // evaluator who entered the startup, never fan out to their endpoints.
  await enqueueWebhook(
    "feedback_letter.sent",
    letter.projectId,
    {
      letter_id: letter.id,
      project_id: letter.projectId,
      k: letter.k,
      org_count: letter.orgCount,
      weakest_dim: weakest,
      window_end: letter.windowEnd,
      dashboard_url: `${siteUrl()}${FEEDBACK_LETTER_DASHBOARD_PATH}`,
    },
    { userIds: [founder.userId], projectEndpoints: false },
  );
  emitEventSafe({
    name: "feedback_letter_sent",
    params: { letter_id: letter.id, project_id: letter.projectId, k: letter.k, org_count: letter.orgCount, weakest_dim: weakest ?? "none", user_id: founder.userId, delivered: outcome === "sent" },
    userId: founder.userId,
    source: "cron:feedback-letters",
  });
  return { outcome, subject };
}

export async function GET(request: Request) {
  if (!isCronAuthorised(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!getSupabaseAdmin()) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }

  const dryRun = isDry(request);
  const startedAt = Date.now();
  const now = new Date();
  const windowEnd = windowEndFor(now);

  const candidates = await listLetterCandidateProjects();
  if (!candidates.available) {
    return NextResponse.json({ ok: true, dryRun, candidates: 0, sent: 0, reason: "table_missing" });
  }

  const summaries: ProjectSummary[] = [];
  const counts: Record<LetterOutcome, number> = {
    sent: 0,
    would_send: 0,
    sent_no_email: 0,
    email_failed: 0,
    skipped_below_floor: 0,
    skipped_no_new: 0,
    skipped_no_founder: 0,
    skipped_dupe: 0,
    skipped_unsubscribed: 0,
    failed: 0,
  };
  let budgetExceeded = false;
  const push = (s: ProjectSummary) => {
    counts[s.outcome]++;
    summaries.push(s);
  };

  for (const projectId of candidates.projectIds.slice(0, MAX_PROJECTS_PER_TICK)) {
    if (Date.now() - startedAt > BUDGET_MS) {
      budgetExceeded = true;
      break;
    }
    const base: Omit<ProjectSummary, "outcome"> = { project_id: projectId, k: 0, org_count: 0, new_rows: 0, weakest_dim: null };
    try {
      const { available, rows } = await readProjectAssessments(projectId);
      if (!available) {
        push({ ...base, outcome: "failed" });
        continue;
      }
      const group = eligibleGroups(rows);
      if (!group) {
        push({ ...base, outcome: "skipped_below_floor" });
        continue;
      }
      base.k = group.k;
      base.org_count = group.orgCount;
      base.new_rows = group.rows.filter((r) => !r.feedbackLetterId).length;

      const founder = await resolveLetterFounder(projectId);
      if (!founder) {
        push({ ...base, outcome: "skipped_no_founder" });
        continue;
      }

      const previous = await latestLetterForProject(projectId);
      if (base.new_rows === 0) {
        // Nothing new. A draft whose email failed last week gets one more try.
        if (previous && previous.status === "draft" && founder.email && !dryRun) {
          const delivered = await deliverLetter(previous, founder, previous.aggregate);
          push({ ...base, weakest_dim: previous.aggregate.weakestDim ?? null, letter_id: previous.id, subject: delivered.subject, outcome: delivered.outcome });
        } else {
          push({ ...base, outcome: "skipped_no_new" });
        }
        continue;
      }

      const aggregate = aggregateAssessments(rows, { now });
      base.weakest_dim = aggregate.weakestDim;
      const letterMd = renderLetter(aggregate, "en", { startupName: founder.projectName });
      const letterMdVi = renderLetter(aggregate, "vi", { startupName: founder.projectName });
      const svi = await readLatestSviForProject(projectId, founder.growthPhaseId);
      const next = letterToNextActions(aggregate, svi);

      if (dryRun) {
        push({ ...base, subject: `What ${aggregate.k} investors said about ${founder.projectName ?? "your startup"}`, outcome: "would_send" });
        continue;
      }

      const inserted = await insertLetter({
        projectId,
        founderUserId: founder.userId,
        evaluationIds: aggregate.evaluationIds,
        k: aggregate.k,
        orgCount: aggregate.orgCount,
        windowStart: previous?.windowEnd ?? null,
        windowEnd,
        aggregate,
        letterMd,
        letterMdVi,
        nextActions: next.actions,
      });
      if (!inserted.ok) {
        push({ ...base, outcome: inserted.error === "dupe" ? "skipped_dupe" : "failed" });
        continue;
      }
      await stampAssessmentsWithLetter(
        inserted.letter.id,
        group.rows.map((r) => r.id),
      );
      const delivered = await deliverLetter(inserted.letter, founder, aggregate);
      push({ ...base, letter_id: inserted.letter.id, subject: delivered.subject, outcome: delivered.outcome });
    } catch (err) {
      console.warn("[feedback-letters] tick failed for", projectId, err instanceof Error ? err.message : err);
      push({ ...base, outcome: "failed" });
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    window_end: windowEnd,
    candidates: candidates.projectIds.length,
    processed: summaries.length,
    ...counts,
    budget_exceeded: budgetExceeded,
    duration_ms: Date.now() - startedAt,
    projects: summaries,
  });
}

// cron-runner.sh sends POST; GET is kept for manual `?dry=1` checks.
export { GET as POST };
