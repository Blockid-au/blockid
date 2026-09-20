// feedback-letter-batch — "Send feedback letters to non-selected applicants"
// from the Selection tab of the BlockID Cohort journey (G21 P2-C).
//
// The letter itself is the existing founder feedback letter (G14-S34:
// feedback-letter.ts aggregate → renderLetter → letterToNextActions, stored
// in founder_feedback_letters, delivered by sendFounderFeedbackLetter). This
// module only scopes it to one cohort's non-selected applicants and splits
// it into PREVIEW (nothing written, nothing sent) and SEND (after the
// program's explicit confirm click). The k ≥ 3 assessors from ≥ 2 orgs
// anonymity floor (`eligibleGroups`) is applied unchanged — a startup below
// the floor is listed as "below floor" and never receives a letter.
//
// Every store / mail call is injectable (`FeedbackBatchDeps`) so the
// colocated test runs without Supabase or an SMTP relay.

import { aggregateAssessments, eligibleGroups, letterToNextActions, renderLetter, type FeedbackAggregate, type LatestSviForFeedback } from "./feedback-letter";
import type { EvaluationAssessment } from "./assessments";
import type { FeedbackLetterRow, LetterFounder } from "./feedback-letter-store";

export interface FeedbackCandidate {
  projectId: string;
  evaluationId: string;
  name: string;
}

export type FeedbackPreviewReason = "eligible" | "below_floor" | "no_founder" | "already_sent" | "unavailable";

export interface FeedbackLetterPreview {
  projectId: string;
  evaluationId: string;
  name: string;
  reason: FeedbackPreviewReason;
  k: number;
  orgCount: number;
  weakestDim: string | null;
  subject: string | null;
  /** First ~600 characters of the rendered letter (markdown) — the preview card. */
  excerpt: string | null;
  founderEmail: string | null;
}

export type FeedbackSendOutcome = "sent" | "sent_no_email" | "email_failed" | "skipped_below_floor" | "skipped_no_founder" | "skipped_already_sent" | "skipped_dupe" | "failed";

export interface FeedbackSendResult {
  projectId: string;
  name: string;
  outcome: FeedbackSendOutcome;
  letterId: string | null;
}

export interface FeedbackBatchDeps {
  readProjectAssessments(projectId: string): Promise<{ available: boolean; rows: EvaluationAssessment[] }>;
  resolveLetterFounder(projectId: string): Promise<LetterFounder | null>;
  latestLetterForProject(projectId: string): Promise<FeedbackLetterRow | null>;
  readLatestSviForProject(projectId: string, growthPhaseId: string | null): Promise<LatestSviForFeedback | null>;
  insertLetter(input: {
    projectId: string;
    founderUserId: string;
    evaluationIds: string[];
    k: number;
    orgCount: number;
    windowStart: string | null;
    windowEnd: string;
    aggregate: FeedbackAggregate;
    letterMd: string;
    letterMdVi: string;
    nextActions: unknown[];
  }): Promise<{ ok: true; letter: FeedbackLetterRow } | { ok: false; error: "dupe" | "unavailable" | "db_error"; message: string }>;
  stampAssessmentsWithLetter(letterId: string, assessmentIds: readonly string[]): Promise<boolean>;
  sendFounderFeedbackLetter(input: { to: string; displayName: string | null; startupName: string | null; aggregate: FeedbackAggregate; letterMd: string; nextActions: unknown[] }): Promise<{ ok: boolean; id?: string | null; subject?: string; reason?: string }>;
  markLetterSent(letterId: string, emailMessageId: string | null): Promise<boolean>;
  insertNotification(input: { userId: string; projectId: string | null; kind: string; payload: Record<string, unknown>; dedupeKey: string; throttleMs: number }): Promise<unknown>;
  now?: () => Date;
}

/** Service-role defaults (lazy imports keep the module test-friendly and out of the client bundle). */
export async function defaultFeedbackBatchDeps(): Promise<FeedbackBatchDeps> {
  const store = await import("./feedback-letter-store");
  const email = await import("@/lib/email");
  const notifications = await import("@/lib/notifications");
  return {
    readProjectAssessments: store.readProjectAssessments,
    resolveLetterFounder: store.resolveLetterFounder,
    latestLetterForProject: store.latestLetterForProject,
    readLatestSviForProject: store.readLatestSviForProject,
    insertLetter: (input) => store.insertLetter(input as Parameters<typeof store.insertLetter>[0]),
    stampAssessmentsWithLetter: store.stampAssessmentsWithLetter,
    sendFounderFeedbackLetter: (input) => email.sendFounderFeedbackLetter(input as Parameters<typeof email.sendFounderFeedbackLetter>[0]),
    markLetterSent: store.markLetterSent,
    insertNotification: (input) => notifications.insertNotification(input as Parameters<typeof notifications.insertNotification>[0]),
  };
}

export function subjectFor(k: number, name: string | null): string {
  return `What ${k} investors said about ${name ?? "your startup"}`;
}

export function excerptOf(md: string, max = 600): string {
  const s = md.replace(/\r/g, "").trim();
  return s.length <= max ? s : `${s.slice(0, max).replace(/\s+\S*$/, "")}…`;
}

/** UNIQUE (project_id, window_end): the day's UTC midnight, the same key the Sunday cron uses. */
export function windowEndFor(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

/** Preview — reads only; nothing is written or sent. */
export async function previewFeedbackLetters(candidates: readonly FeedbackCandidate[], deps: FeedbackBatchDeps): Promise<FeedbackLetterPreview[]> {
  const now = (deps.now ?? (() => new Date()))();
  const out: FeedbackLetterPreview[] = [];
  for (const c of candidates) {
    const base: FeedbackLetterPreview = { projectId: c.projectId, evaluationId: c.evaluationId, name: c.name, reason: "unavailable", k: 0, orgCount: 0, weakestDim: null, subject: null, excerpt: null, founderEmail: null };
    try {
      const { available, rows } = await deps.readProjectAssessments(c.projectId);
      if (!available) {
        out.push(base);
        continue;
      }
      const group = eligibleGroups(rows);
      if (!group) {
        out.push({ ...base, reason: "below_floor" });
        continue;
      }
      base.k = group.k;
      base.orgCount = group.orgCount;
      const founder = await deps.resolveLetterFounder(c.projectId);
      if (!founder) {
        out.push({ ...base, reason: "no_founder" });
        continue;
      }
      base.founderEmail = founder.email ?? null;
      const previous = await deps.latestLetterForProject(c.projectId);
      const newRows = group.rows.filter((r) => !r.feedbackLetterId).length;
      if (previous && newRows === 0) {
        out.push({ ...base, reason: "already_sent", subject: subjectFor(previous.k, founder.projectName), weakestDim: previous.aggregate.weakestDim ?? null });
        continue;
      }
      const aggregate = aggregateAssessments(rows, { now });
      const letterMd = renderLetter(aggregate, "en", { startupName: founder.projectName });
      out.push({ ...base, reason: "eligible", weakestDim: aggregate.weakestDim ?? null, subject: subjectFor(aggregate.k, founder.projectName), excerpt: excerptOf(letterMd) });
    } catch {
      out.push(base);
    }
  }
  return out;
}

/** Send — only after the program's confirm click; each project is one letter, k-floor re-checked here. */
export async function sendFeedbackLetters(candidates: readonly FeedbackCandidate[], deps: FeedbackBatchDeps): Promise<FeedbackSendResult[]> {
  const now = (deps.now ?? (() => new Date()))();
  const windowEnd = windowEndFor(now);
  const out: FeedbackSendResult[] = [];
  for (const c of candidates) {
    const base: FeedbackSendResult = { projectId: c.projectId, name: c.name, outcome: "failed", letterId: null };
    try {
      const { available, rows } = await deps.readProjectAssessments(c.projectId);
      if (!available) {
        out.push(base);
        continue;
      }
      const group = eligibleGroups(rows);
      if (!group) {
        out.push({ ...base, outcome: "skipped_below_floor" });
        continue;
      }
      const founder = await deps.resolveLetterFounder(c.projectId);
      if (!founder) {
        out.push({ ...base, outcome: "skipped_no_founder" });
        continue;
      }
      const previous = await deps.latestLetterForProject(c.projectId);
      if (previous && group.rows.filter((r) => !r.feedbackLetterId).length === 0) {
        out.push({ ...base, outcome: "skipped_already_sent", letterId: previous.id });
        continue;
      }
      const aggregate = aggregateAssessments(rows, { now });
      const letterMd = renderLetter(aggregate, "en", { startupName: founder.projectName });
      const letterMdVi = renderLetter(aggregate, "vi", { startupName: founder.projectName });
      const svi = await deps.readLatestSviForProject(c.projectId, founder.growthPhaseId);
      const next = letterToNextActions(aggregate, svi);
      const inserted = await deps.insertLetter({
        projectId: c.projectId,
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
        out.push({ ...base, outcome: inserted.error === "dupe" ? "skipped_dupe" : "failed" });
        continue;
      }
      await deps.stampAssessmentsWithLetter(
        inserted.letter.id,
        group.rows.map((r) => r.id),
      );
      await deps.insertNotification({
        userId: founder.userId,
        projectId: null,
        kind: "feedback_letter",
        payload: { letter_id: inserted.letter.id, k: inserted.letter.k, orgs: inserted.letter.orgCount, weakest_dim: aggregate.weakestDim, startup: founder.projectName, source: "program_selection" },
        dedupeKey: `feedback_letter:${inserted.letter.id}`,
        throttleMs: 30 * 24 * 60 * 60 * 1000,
      });
      let outcome: FeedbackSendOutcome = "sent_no_email";
      if (founder.email) {
        const sent = await deps.sendFounderFeedbackLetter({ to: founder.email, displayName: founder.displayName, startupName: founder.projectName, aggregate, letterMd, nextActions: next.actions });
        if (sent.ok) {
          await deps.markLetterSent(inserted.letter.id, sent.id ?? null);
          outcome = "sent";
        } else {
          outcome = "email_failed";
        }
      }
      out.push({ ...base, outcome, letterId: inserted.letter.id });
    } catch {
      out.push(base);
    }
  }
  return out;
}
