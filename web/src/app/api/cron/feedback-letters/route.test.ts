// Colocated vitest for /api/cron/feedback-letters (G14-S34). Pins: the
// Bearer CRON_SECRET gate, 503 without Supabase, `table_missing` before
// 0406, the k-floor skip, `?dry=1` → per-project summaries with the
// subject and NO writes / sends, the live path (insert → stamp → notify →
// email → sent + message id → webhook to the founder only → server
// event), the nothing-new skip + draft-email retry, the dupe on a same-day
// re-run, the no-founder skip, and POST === GET.

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  supabaseAvailable: true,
  candidates: vi.fn(),
  readRows: vi.fn(),
  founder: vi.fn(),
  latest: vi.fn(),
  svi: vi.fn(),
  insert: vi.fn(),
  stamp: vi.fn(),
  markSent: vi.fn(),
  sendEmail: vi.fn(),
  notify: vi.fn(),
  webhook: vi.fn(),
  emit: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => (h.supabaseAvailable ? {} : null) }));
vi.mock("@/lib/evaluations/feedback-letter-store", () => ({
  listLetterCandidateProjects: () => h.candidates(),
  readProjectAssessments: (id: string) => h.readRows(id),
  resolveLetterFounder: (id: string) => h.founder(id),
  latestLetterForProject: (id: string) => h.latest(id),
  readLatestSviForProject: (...a: unknown[]) => h.svi(...a),
  insertLetter: (input: unknown) => h.insert(input),
  stampAssessmentsWithLetter: (...a: unknown[]) => h.stamp(...a),
  markLetterSent: (...a: unknown[]) => h.markSent(...a),
}));
vi.mock("@/lib/email", () => ({ sendFounderFeedbackLetter: (a: unknown) => h.sendEmail(a) }));
vi.mock("@/lib/notifications", () => ({ insertNotification: (a: unknown) => h.notify(a) }));
vi.mock("@/lib/webhooks/registry", () => ({ enqueueWebhook: (...a: unknown[]) => h.webhook(...a) }));
vi.mock("@/lib/analytics/server", () => ({ emitEventSafe: (a: unknown) => h.emit(a) }));

import type { EvaluationAssessment } from "@/lib/evaluations/assessments";
import { GET, POST, windowEndFor } from "./route";

const SECRET = "cron-secret-for-test";

let seq = 0;
function row(assessor: string, orgId: string | null, over: Partial<EvaluationAssessment> = {}): EvaluationAssessment {
  seq++;
  return {
    id: `a-${seq}`,
    evaluationId: `e-${assessor}`,
    projectId: "p-1",
    assessorUserId: assessor,
    orgId,
    snapshotId: null,
    version: 1,
    status: "submitted",
    decision: "proceed",
    conviction: 4,
    thesisFitPct: 50,
    dimensionRatings: { TRE: { rating: 2, stance: "disagree" }, FTV: { rating: 4, stance: "agree" } },
    criterionRatings: {},
    valuationView: null,
    risks: [{ title: "No recurring revenue", severity: "high", dimension: "TRE", source: "ai" }],
    questionsForFounder: [{ text: "What is your churn?" }],
    privateNotes: "SECRET",
    sharedNotes: "SECRET",
    sharedFields: ["dimension_ratings", "risks"],
    sharedWithFounderAt: "2026-09-10T00:00:00.000Z",
    submittedAt: "2026-09-12T00:00:00.000Z",
    createdAt: "c",
    updatedAt: "u",
    feedbackOptOut: false,
    feedbackLetterId: null,
    ...over,
  };
}
const ELIGIBLE = () => [row("u1", "org-a"), row("u2", "org-a"), row("u3", null)];
const FOUNDER = { userId: "u-f", email: "jo@acme.io", displayName: "Jo", projectName: "Acme", growthPhaseId: "customer_dev" };
const LETTER = { id: "l-1", projectId: "p-1", founderUserId: "u-f", evaluationIds: ["e-u1", "e-u2", "e-u3"], k: 3, orgCount: 2, windowStart: null, windowEnd: "2026-09-20T00:00:00.000Z", letterMd: "md", letterMdVi: "vi", nextActions: [], status: "draft", sentAt: null, openedAt: null, emailMessageId: null, createdAt: "c" };

const req = (dry = false, method: "GET" | "POST" = "GET", auth: string | null = `Bearer ${SECRET}`) =>
  new Request(`http://localhost/api/cron/feedback-letters${dry ? "?dry=1" : ""}`, { method, headers: auth ? { Authorization: auth } : {} });

beforeEach(() => {
  process.env.CRON_SECRET = SECRET;
  h.supabaseAvailable = true;
  for (const m of [h.candidates, h.readRows, h.founder, h.latest, h.svi, h.insert, h.stamp, h.markSent, h.sendEmail, h.notify, h.webhook, h.emit]) m.mockReset();
  h.candidates.mockResolvedValue({ available: true, projectIds: ["p-1"] });
  h.readRows.mockResolvedValue({ available: true, rows: ELIGIBLE() });
  h.founder.mockResolvedValue(FOUNDER);
  h.latest.mockResolvedValue(null);
  h.svi.mockResolvedValue({ totalSVI: 60, stage: 2, subs: { tre: 30 }, growthPhaseId: "customer_dev" });
  h.insert.mockImplementation(async (input: { aggregate: unknown; nextActions: unknown; letterMd: string; letterMdVi: string | null }) => ({
    ok: true,
    letter: { ...LETTER, aggregate: input.aggregate, nextActions: input.nextActions, letterMd: input.letterMd, letterMdVi: input.letterMdVi },
  }));
  h.stamp.mockResolvedValue(true);
  h.markSent.mockResolvedValue(true);
  h.sendEmail.mockResolvedValue({ ok: true, id: "<msg-1>", subject: "What 3 investors said about Acme" });
  h.notify.mockResolvedValue(true);
  h.webhook.mockResolvedValue({ queued: 1, endpoints: ["ep"], envelopeId: "env" });
});

describe("gates", () => {
  it("401 without / with a wrong bearer; 503 without Supabase; POST is GET", async () => {
    expect((await GET(req(false, "GET", null))).status).toBe(401);
    expect((await GET(req(false, "GET", "Bearer nope"))).status).toBe(401);
    h.supabaseAvailable = false;
    expect((await GET(req())).status).toBe(503);
    expect(POST).toBe(GET);
    expect(h.candidates).not.toHaveBeenCalled();
  });

  it("before 0406 (store unavailable) → ok:true reason table_missing, nothing else read", async () => {
    h.candidates.mockResolvedValue({ available: false, projectIds: [] });
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({ ok: true, reason: "table_missing", sent: 0 });
    expect(h.readRows).not.toHaveBeenCalled();
  });

  it("windowEndFor is the run's UTC midnight (same-day re-run = dupe)", () => {
    expect(windowEndFor(new Date("2026-09-20T22:00:00Z"))).toBe("2026-09-20T00:00:00.000Z");
    expect(windowEndFor(new Date("2026-09-20T23:59:59Z"))).toBe(windowEndFor(new Date("2026-09-20T00:00:01Z")));
  });
});

describe("eligibility", () => {
  it("k < 3 or one org → skipped_below_floor, no founder read, no insert", async () => {
    h.readRows.mockResolvedValue({ available: true, rows: [row("u1", "org-a"), row("u2", "org-a"), row("u3", "org-a")] });
    const body = await (await GET(req(true))).json();
    expect(body.projects[0]).toMatchObject({ project_id: "p-1", k: 0, outcome: "skipped_below_floor" });
    expect(body.skipped_below_floor).toBe(1);
    expect(h.founder).not.toHaveBeenCalled();
    expect(h.insert).not.toHaveBeenCalled();
  });

  it("no claimed founder → skipped_no_founder", async () => {
    h.founder.mockResolvedValue(null);
    const body = await (await GET(req())).json();
    expect(body.projects[0]).toMatchObject({ k: 3, org_count: 2, outcome: "skipped_no_founder" });
    expect(h.insert).not.toHaveBeenCalled();
  });

  it("every eligible row already lettered → skipped_no_new; a draft with an email address is retried instead", async () => {
    h.readRows.mockResolvedValue({ available: true, rows: ELIGIBLE().map((r) => ({ ...r, feedbackLetterId: "l-0" })) });
    let body = await (await GET(req())).json();
    expect(body.projects[0]).toMatchObject({ new_rows: 0, outcome: "skipped_no_new" });
    expect(h.insert).not.toHaveBeenCalled();
    // draft letter (email failed last week) → retry the delivery, no new insert
    h.latest.mockResolvedValue({ ...LETTER, aggregate: { k: 3, orgCount: 2, weakestDim: "TRE", dimensions: [], risks: [], questions: [], evaluationIds: [], generatedAt: "g" } });
    body = await (await GET(req())).json();
    expect(body.projects[0]).toMatchObject({ letter_id: "l-1", outcome: "sent" });
    expect(h.insert).not.toHaveBeenCalled();
    expect(h.sendEmail).toHaveBeenCalledTimes(1);
    expect(h.markSent).toHaveBeenCalledWith("l-1", "<msg-1>");
  });
});

describe("?dry=1", () => {
  it("reports the project as eligible with k / org_count / weakest / subject and writes + sends nothing", async () => {
    const body = await (await GET(req(true))).json();
    expect(body).toMatchObject({ ok: true, dryRun: true, candidates: 1, processed: 1, would_send: 1, sent: 0 });
    expect(body.projects[0]).toMatchObject({ project_id: "p-1", k: 3, org_count: 2, new_rows: 3, weakest_dim: "TRE", subject: "What 3 investors said about Acme", outcome: "would_send" });
    for (const m of [h.insert, h.stamp, h.markSent, h.sendEmail, h.notify, h.webhook, h.emit]) expect(m).not.toHaveBeenCalled();
  });
});

describe("live path", () => {
  it("insert → stamp the consumed rows → notification → email (sent + message id) → webhook to the founder only → server event; the letter carries no forbidden field", async () => {
    const body = await (await GET(req())).json();
    expect(body).toMatchObject({ ok: true, dryRun: false, sent: 1, processed: 1 });
    expect(body.projects[0]).toMatchObject({ letter_id: "l-1", outcome: "sent", subject: "What 3 investors said about Acme" });

    const input = h.insert.mock.calls[0][0];
    expect(input).toMatchObject({ projectId: "p-1", founderUserId: "u-f", k: 3, orgCount: 2, windowStart: null });
    expect(input.windowEnd).toBe(windowEndFor(new Date()));
    expect(input.evaluationIds.sort()).toEqual(["e-u1", "e-u2", "e-u3"]);
    expect(input.letterMd).toContain("## What investors said");
    expect(input.letterMdVi).toContain("## Nhà đầu tư nói gì");
    expect(input.aggregate.weakestDim).toBe("TRE");
    expect(input.nextActions.length).toBeGreaterThan(0);
    expect(input.nextActions.every((a: { dimension: string }) => a.dimension === "TRE")).toBe(true);
    expect(JSON.stringify(input)).not.toMatch(/SECRET|"decision"|"conviction"|assessorUserId|"u1"|org-a/);

    // the three consumed assessment rows (one per seat) are stamped with the letter id
    const stamped = h.stamp.mock.calls[0];
    expect(stamped[0]).toBe("l-1");
    expect((stamped[1] as string[]).length).toBe(3);
    expect((stamped[1] as string[]).every((id) => /^a-\d+$/.test(id))).toBe(true);
    expect(h.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "u-f", kind: "feedback_letter", dedupeKey: "feedback_letter:l-1", payload: expect.objectContaining({ letter_id: "l-1", k: 3, orgs: 2, startup: "Acme" }) }));
    expect(h.sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "jo@acme.io", displayName: "Jo", startupName: "Acme", letterMd: input.letterMd }));
    expect(h.markSent).toHaveBeenCalledWith("l-1", "<msg-1>");
    expect(h.webhook).toHaveBeenCalledWith(
      "feedback_letter.sent",
      "p-1",
      expect.objectContaining({ letter_id: "l-1", project_id: "p-1", k: 3, org_count: 2, weakest_dim: "TRE", dashboard_url: expect.stringMatching(/\/dashboard#what-investors-said$/) }),
      { userIds: ["u-f"], projectEndpoints: false },
    );
    expect(h.emit).toHaveBeenCalledWith(expect.objectContaining({ name: "feedback_letter_sent", userId: "u-f", params: expect.objectContaining({ letter_id: "l-1", k: 3, org_count: 2, weakest_dim: "TRE", delivered: true }) }));
  });

  it("a second run the same day → skipped_dupe (23505) and nothing is delivered", async () => {
    h.insert.mockResolvedValue({ ok: false, error: "dupe", message: "exists" });
    const body = await (await GET(req())).json();
    expect(body.projects[0].outcome).toBe("skipped_dupe");
    expect(body.skipped_dupe).toBe(1);
    for (const m of [h.stamp, h.sendEmail, h.notify, h.webhook, h.emit]) expect(m).not.toHaveBeenCalled();
  });

  it("email failure keeps the row draft (email_failed) so next week retries; unsubscribed → skipped_unsubscribed; no address → sent_no_email; webhook + event still fire", async () => {
    h.sendEmail.mockResolvedValue({ ok: false, reason: "send_error" });
    let body = await (await GET(req())).json();
    expect(body.projects[0].outcome).toBe("email_failed");
    expect(h.markSent).not.toHaveBeenCalled();
    expect(h.webhook).toHaveBeenCalledTimes(1);
    h.sendEmail.mockResolvedValue({ ok: false, reason: "unsubscribed" });
    body = await (await GET(req())).json();
    expect(body.projects[0].outcome).toBe("skipped_unsubscribed");
    h.founder.mockResolvedValue({ ...FOUNDER, email: null });
    body = await (await GET(req())).json();
    expect(body.projects[0].outcome).toBe("sent_no_email");
    expect(h.sendEmail).toHaveBeenCalledTimes(2);
    expect(h.emit).toHaveBeenLastCalledWith(expect.objectContaining({ params: expect.objectContaining({ delivered: false }) }));
  });

  it("a throwing project is counted as failed and the tick continues", async () => {
    h.candidates.mockResolvedValue({ available: true, projectIds: ["p-boom", "p-1"] });
    h.readRows.mockImplementation(async (id: string) => {
      if (id === "p-boom") throw new Error("boom");
      return { available: true, rows: ELIGIBLE() };
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const body = await (await GET(req())).json();
    expect(body.failed).toBe(1);
    expect(body.sent).toBe(1);
    expect(body.projects.map((p: { outcome: string }) => p.outcome)).toEqual(["failed", "sent"]);
    warn.mockRestore();
  });
});
