// feedback-letter-batch — preview → confirm for one cohort's non-selected
// applicants (G21 P2-C). Pins: preview writes and sends NOTHING; the k ≥ 3
// / ≥ 2 orgs floor is applied on preview and re-checked on send; already
// sent / no founder / unavailable are reported, never sent; send stores the
// letter, stamps the rows, notifies and e-mails only with an address.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EvaluationAssessment } from "./assessments";
import type { FeedbackLetterRow } from "./feedback-letter-store";
import { excerptOf, previewFeedbackLetters, sendFeedbackLetters, subjectFor, windowEndFor, type FeedbackBatchDeps } from "./feedback-letter-batch";

let seq = 0;
function row(over: Partial<EvaluationAssessment> & { assessorUserId: string }): EvaluationAssessment {
  seq++;
  return {
    id: over.id ?? `a-${seq}`,
    evaluationId: over.evaluationId ?? `e-${over.assessorUserId}`,
    projectId: "p-1",
    orgId: null,
    snapshotId: null,
    version: 1,
    status: "submitted",
    decision: "pass",
    conviction: 3,
    thesisFitPct: 40,
    dimensionRatings: { FTV: { rating: 4, stance: "agree", note: "n" }, TRE: { rating: 2, stance: "disagree", note: "n" } },
    criterionRatings: {},
    valuationView: null,
    risks: [{ title: "no recurring revenue", severity: "high", dimension: "TRE", note: "n", source: "evaluator" }],
    questionsForFounder: [{ text: "What is your churn?", dimension: "TRE" }],
    privateNotes: "SECRET",
    sharedNotes: null,
    sharedFields: ["dimension_ratings", "risks", "questions_for_founder"],
    sharedWithFounderAt: "2026-09-10T00:00:00.000Z",
    submittedAt: `2026-09-1${seq % 9}T00:00:00.000Z`,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  } as EvaluationAssessment;
}

const THREE = () => [row({ assessorUserId: "u1", orgId: "org-a" }), row({ assessorUserId: "u2", orgId: "org-a" }), row({ assessorUserId: "u3", orgId: "org-b" })];

function deps(over: Partial<FeedbackBatchDeps> = {}): FeedbackBatchDeps & { spies: Record<string, ReturnType<typeof vi.fn>> } {
  const spies = {
    insertLetter: vi.fn(async (input: { projectId: string; k: number; orgCount: number; letterMd: string; windowEnd: string }) => ({ ok: true as const, letter: { id: "L-1", projectId: input.projectId, k: input.k, orgCount: input.orgCount, letterMd: input.letterMd, windowEnd: input.windowEnd, status: "draft" } as unknown as FeedbackLetterRow })),
    stampAssessmentsWithLetter: vi.fn(async () => true),
    sendFounderFeedbackLetter: vi.fn(async () => ({ ok: true, id: "msg-1", subject: "s" })),
    markLetterSent: vi.fn(async () => true),
    insertNotification: vi.fn(async () => true),
  };
  return {
    spies,
    readProjectAssessments: async () => ({ available: true, rows: THREE() }),
    resolveLetterFounder: async () => ({ userId: "f-1", email: "founder@example.com", displayName: "Ann", projectName: "Alpha", growthPhaseId: null }),
    latestLetterForProject: async () => null,
    readLatestSviForProject: async () => null,
    ...spies,
    now: () => new Date("2026-09-20T10:00:00Z"),
    ...over,
  };
}

const CANDIDATE = { projectId: "p-1", evaluationId: "e-1", name: "Alpha" };

beforeEach(() => {
  seq = 0;
});

describe("helpers", () => {
  it("subject, excerpt and the UTC-midnight window key", () => {
    expect(subjectFor(3, "Alpha")).toBe("What 3 investors said about Alpha");
    expect(subjectFor(3, null)).toBe("What 3 investors said about your startup");
    expect(excerptOf("short")).toBe("short");
    expect(excerptOf("word ".repeat(200), 40).endsWith("…")).toBe(true);
    expect(windowEndFor(new Date("2026-09-20T23:59:00Z"))).toBe("2026-09-20T00:00:00.000Z");
  });
});

describe("previewFeedbackLetters", () => {
  it("eligible: k / orgs / subject / excerpt — and writes or sends nothing", async () => {
    const d = deps();
    const out = await previewFeedbackLetters([CANDIDATE], d);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ reason: "eligible", k: 3, orgCount: 2, subject: "What 3 investors said about Alpha", founderEmail: "founder@example.com" });
    expect(out[0].excerpt).toBeTruthy();
    expect(out[0].excerpt).not.toContain("SECRET");
    expect(d.spies.insertLetter).not.toHaveBeenCalled();
    expect(d.spies.sendFounderFeedbackLetter).not.toHaveBeenCalled();
  });

  it("below the floor (2 assessors), no founder, already sent, unavailable", async () => {
    const below = await previewFeedbackLetters([CANDIDATE], deps({ readProjectAssessments: async () => ({ available: true, rows: THREE().slice(0, 2) }) }));
    expect(below[0].reason).toBe("below_floor");
    const noFounder = await previewFeedbackLetters([CANDIDATE], deps({ resolveLetterFounder: async () => null }));
    expect(noFounder[0].reason).toBe("no_founder");
    const stamped = THREE().map((r) => ({ ...r, feedbackLetterId: "L-0" }));
    const already = await previewFeedbackLetters([CANDIDATE], deps({ readProjectAssessments: async () => ({ available: true, rows: stamped }), latestLetterForProject: async () => ({ id: "L-0", k: 3, windowEnd: "2026-09-13T00:00:00.000Z", aggregate: { weakestDim: "TRE" } } as unknown as FeedbackLetterRow) }));
    expect(already[0].reason).toBe("already_sent");
    const unavailable = await previewFeedbackLetters([CANDIDATE], deps({ readProjectAssessments: async () => ({ available: false, rows: [] }) }));
    expect(unavailable[0].reason).toBe("unavailable");
  });
});

describe("sendFeedbackLetters", () => {
  it("stores, stamps, notifies and e-mails the eligible project; the floor is re-checked", async () => {
    const d = deps();
    const out = await sendFeedbackLetters([CANDIDATE], d);
    expect(out).toEqual([{ projectId: "p-1", name: "Alpha", outcome: "sent", letterId: "L-1" }]);
    expect(d.spies.insertLetter).toHaveBeenCalledTimes(1);
    expect(d.spies.insertLetter.mock.calls[0][0]).toMatchObject({ projectId: "p-1", founderUserId: "f-1", k: 3, orgCount: 2, windowEnd: "2026-09-20T00:00:00.000Z" });
    expect(d.spies.stampAssessmentsWithLetter).toHaveBeenCalledWith("L-1", ["a-1", "a-2", "a-3"]);
    expect(d.spies.insertNotification).toHaveBeenCalledTimes(1);
    expect(d.spies.sendFounderFeedbackLetter.mock.calls[0][0]).toMatchObject({ to: "founder@example.com", startupName: "Alpha" });
    expect(d.spies.markLetterSent).toHaveBeenCalledWith("L-1", "msg-1");
    const below = deps({ readProjectAssessments: async () => ({ available: true, rows: THREE().slice(0, 2) }) });
    expect((await sendFeedbackLetters([CANDIDATE], below))[0].outcome).toBe("skipped_below_floor");
    expect(below.spies.insertLetter).not.toHaveBeenCalled();
  });

  it("no e-mail on file → stored, not sent; dupe insert → skipped_dupe; e-mail failure → email_failed", async () => {
    const noMail = deps({ resolveLetterFounder: async () => ({ userId: "f-1", email: null, displayName: null, projectName: "Alpha", growthPhaseId: null }) });
    expect((await sendFeedbackLetters([CANDIDATE], noMail))[0].outcome).toBe("sent_no_email");
    expect(noMail.spies.sendFounderFeedbackLetter).not.toHaveBeenCalled();
    const dupe = deps({ insertLetter: vi.fn(async () => ({ ok: false as const, error: "dupe" as const, message: "exists" })) });
    expect((await sendFeedbackLetters([CANDIDATE], dupe))[0].outcome).toBe("skipped_dupe");
    const failed = deps({ sendFounderFeedbackLetter: vi.fn(async () => ({ ok: false, reason: "smtp" })) });
    expect((await sendFeedbackLetters([CANDIDATE], failed))[0].outcome).toBe("email_failed");
    expect(failed.spies.markLetterSent).not.toHaveBeenCalled();
  });
});
