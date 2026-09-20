// Colocated vitest for lib/intake/submission-runner.ts (G14 S35).
//
// Runs the whole pipeline against the in-memory store with every
// collaborator stubbed. Pins: unknown slug → not_found; closed / full →
// closed (+ reason); duplicate email → duplicate (409); consent + deck
// gates (missing / 25 MB / MIME); malware fail-CLOSED; the happy path
// creates the evaluation (owner_kind founder_invited via founder_email),
// backlinks the intake, stays `received` when auto_report is OFF (F-4);
// auto_report ON + quota → scored via the library report path; auto_report
// ON but quota exhausted (credits / none) → received with a warning and NO
// report run; classify / evaluation failures never fail the submission
// (warnings); the webhook is enqueued to the OWNER only; IP is hashed.

import { describe, expect, it, vi } from "vitest";
import { createIntake, memoryIntakeStore } from "./program-intakes";
import {
  DECK_MAX_BYTES,
  SUBMISSION_HTTP_STATUS,
  hashIp,
  normaliseSubmission,
  runIntakeSubmission,
  telegramLine,
  validateDeck,
  type DeckInput,
  type RunnerDeps,
} from "./submission-runner";

const PDF: DeckInput = { buffer: Buffer.from("%PDF-1.4 hello"), filename: "deck.pdf", mimeType: "application/pdf", size: 14 };
const OWNER = { id: "owner-1", email: "eval@firm.com", plan: "investor_vc_small", displayName: "Firm" };

function coverage(level: "strong" | "partial" | "missing" = "partial") {
  return Object.fromEntries(["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"].map((k) => [k, { level, excerpt: "" }]));
}

function deps(overrides: Partial<RunnerDeps> = {}) {
  const calls = {
    scan: vi.fn(async () => ({ ok: true as const })),
    storeDeck: vi.fn(async (_d: DeckInput, intakeId: string) => `/tmp/intake-uploads/${intakeId}/x.pdf`),
    classify: vi.fn(async () => ({ ok: true as const, coverage: coverage(), textBytes: 100, text: "deck text", pitchdeckId: "pd-1", warnings: [] as string[] })),
    getOwner: vi.fn(async () => OWNER),
    createEvaluation: vi.fn(async (_o: unknown, input: { name: string; founder_email: string }) => ({
      ok: true as const,
      evaluation: { id: "ev-1", projectId: "proj-1", ownerKind: "founder_invited", founderEmail: input.founder_email, projectName: input.name } as never,
      inviteSent: true,
      used: 1,
      limit: 200,
    })),
    previewReportCharge: vi.fn(async () => ({ via: "quota" as const, credits: 0 })),
    runReport: vi.fn(async () => ({ reportId: "rep-1", shareToken: "tok", svi: 66.5 })),
    recordReport: vi.fn(async () => ({ id: "er-1" })),
    enqueueWebhook: vi.fn(async () => ({ queued: 1 })),
    notify: vi.fn(async () => true),
  };
  return { calls, d: { ...calls, ...overrides } as RunnerDeps & typeof calls };
}

async function seed(opts: { autoReport?: boolean; maxSubmissions?: number } = {}) {
  const store = memoryIntakeStore();
  const c = await createIntake("owner-1", { name: "Demo Program", auto_report: opts.autoReport === true, max_submissions: opts.maxSubmissions }, { store, suffix: () => "abcdefgh" });
  if (!c.ok) throw new Error("seed");
  return { store, intake: c.intake };
}

const base = (slug = "demo-program-abcdefgh") => ({
  slug,
  startupName: "Alpha Pty Ltd",
  founderName: "Ann",
  founderEmail: "Ann@Alpha.io",
  website: "alpha.io",
  consent: true,
  deck: PDF,
  ip: "203.0.113.9",
});

describe("pure helpers", () => {
  it("normaliseSubmission lower-cases email, prefixes https, rejects junk", () => {
    const r = normaliseSubmission({ startupName: " Alpha ", founderName: "", founderEmail: "A@B.co", website: "alpha.io/" });
    expect(r).toEqual({ ok: true, value: { startupName: "Alpha", founderName: null, founderEmail: "a@b.co", website: "https://alpha.io" } });
    expect(normaliseSubmission({ startupName: "", founderEmail: "a@b.co" })).toMatchObject({ ok: false });
    expect(normaliseSubmission({ startupName: "x", founderEmail: "nope" })).toMatchObject({ ok: false });
    expect(normaliseSubmission({ startupName: "x", founderEmail: "a@b.co", website: "javascript:alert(1)" })).toMatchObject({ ok: false });
  });

  it("validateDeck: required, 25 MB cap, PDF/DOCX only", () => {
    expect(validateDeck(null)).toMatchObject({ ok: false, error: "deck_required" });
    expect(validateDeck({ ...PDF, size: DECK_MAX_BYTES + 1 })).toMatchObject({ ok: false, error: "deck_too_large" });
    expect(validateDeck({ ...PDF, mimeType: "text/html" })).toMatchObject({ ok: false, error: "deck_type" });
    expect(validateDeck({ ...PDF, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })).toEqual({ ok: true });
    expect(SUBMISSION_HTTP_STATUS.deck_too_large).toBe(413);
    expect(SUBMISSION_HTTP_STATUS.duplicate).toBe(409);
    expect(SUBMISSION_HTTP_STATUS.closed).toBe(404);
  });

  it("hashIp is stable, 32 hex, never the raw IP; telegramLine has no email", () => {
    expect(hashIp("203.0.113.9")).toMatch(/^[0-9a-f]{32}$/);
    expect(hashIp("203.0.113.9")).toBe(hashIp("203.0.113.9"));
    expect(hashIp("")).toBeNull();
    const line = telegramLine({ name: "Demo", slug: "demo-x" }, { startupName: "Alpha" }, "received", null);
    expect(line).toContain("Alpha");
    expect(line).toContain("unscored");
    expect(line).not.toMatch(/@/);
  });
});

describe("runIntakeSubmission — gates", () => {
  it("unknown slug → not_found; not migrated → not_migrated (both 404)", async () => {
    const { d } = deps();
    expect(await runIntakeSubmission(base("nope-nope-nope"), { ...d, store: memoryIntakeStore() })).toMatchObject({ ok: false, error: "not_found" });
    expect(await runIntakeSubmission(base(), { ...d, store: memoryIntakeStore({ migrated: false }) })).toMatchObject({ ok: false, error: "not_migrated" });
    expect(await runIntakeSubmission(base(), { ...d, store: null })).toMatchObject({ ok: false, error: "service_unavailable" });
  });

  it("closed intake / full intake → closed with a reason; nothing stored", async () => {
    const { store, intake } = await seed({ maxSubmissions: 1 });
    const { d, calls } = deps();
    await store.insertSubmission({ intakeId: intake.id, founderEmail: "z@z.io", founderName: null, startupName: "Z", website: null, deckStoragePath: null, ipHash: null });
    expect(await runIntakeSubmission(base(), { ...d, store })).toMatchObject({ ok: false, error: "closed", reason: "full" });
    await store.updateIntake(intake.id, { status: "closed" });
    expect(await runIntakeSubmission({ ...base(), founderEmail: "q@q.io" }, { ...d, store })).toMatchObject({ ok: false, error: "closed", reason: "closed" });
    expect(calls.scan).not.toHaveBeenCalled();
    expect(store.submissions).toHaveLength(1);
  });

  it("consent, fields and deck are checked before the scan", async () => {
    const { store } = await seed();
    const { d, calls } = deps();
    expect(await runIntakeSubmission({ ...base(), consent: false }, { ...d, store })).toMatchObject({ ok: false, error: "consent_required" });
    expect(await runIntakeSubmission({ ...base(), founderEmail: "bad" }, { ...d, store })).toMatchObject({ ok: false, error: "invalid_input" });
    expect(await runIntakeSubmission({ ...base(), deck: null }, { ...d, store })).toMatchObject({ ok: false, error: "deck_required" });
    expect(await runIntakeSubmission({ ...base(), deck: { ...PDF, size: DECK_MAX_BYTES + 1 } }, { ...d, store })).toMatchObject({ ok: false, error: "deck_too_large" });
    expect(await runIntakeSubmission({ ...base(), deck: { ...PDF, mimeType: "image/svg+xml" } }, { ...d, store })).toMatchObject({ ok: false, error: "deck_type" });
    expect(calls.scan).not.toHaveBeenCalled();
    expect(store.submissions).toHaveLength(0);
  });

  it("duplicate founder email → duplicate (409); malware → infected / scanner error fail closed", async () => {
    const { store, intake } = await seed();
    await store.insertSubmission({ intakeId: intake.id, founderEmail: "ann@alpha.io", founderName: null, startupName: "A", website: null, deckStoragePath: null, ipHash: null });
    const { d, calls } = deps();
    expect(await runIntakeSubmission(base(), { ...d, store })).toMatchObject({ ok: false, error: "duplicate" });
    expect(calls.storeDeck).not.toHaveBeenCalled();

    const fresh = { ...base(), founderEmail: "new@alpha.io" };
    const infected = deps({ scan: async () => ({ ok: false, verdict: "infected", signature: "Eicar-Test" }) });
    expect(await runIntakeSubmission(fresh, { ...infected.d, store })).toMatchObject({ ok: false, error: "deck_infected" });
    expect(infected.calls.storeDeck).not.toHaveBeenCalled();
    const down = deps({ scan: async () => ({ ok: false, verdict: "scanner_error" }) });
    expect(await runIntakeSubmission(fresh, { ...down.d, store })).toMatchObject({ ok: false, error: "scanner_unavailable" });
    expect(store.submissions).toHaveLength(1);
  });
});

describe("runIntakeSubmission — pipeline", () => {
  it("auto_report OFF (default): classify + evaluation + backlink + webhook, row stays received", async () => {
    const { store, intake } = await seed();
    const { d, calls } = deps();
    const r = await runIntakeSubmission(base(), { ...d, store });
    expect(r).toMatchObject({ ok: true, status: "received", evaluationId: "ev-1", projectId: "proj-1", sviTotal: null, warnings: [] });

    expect(calls.createEvaluation).toHaveBeenCalledWith(OWNER, { name: "Alpha Pty Ltd", website: "https://alpha.io", founder_email: "ann@alpha.io", description: "deck text" }, { consentText: null });
    expect(calls.classify).toHaveBeenCalledWith({ filepath: `/tmp/intake-uploads/${intake.id}/x.pdf`, filename: "deck.pdf", userId: "owner-1", projectId: null });
    expect(calls.previewReportCharge).not.toHaveBeenCalled();
    expect(calls.runReport).not.toHaveBeenCalled();
    expect(store.links).toEqual([{ evaluationId: "ev-1", intakeId: intake.id }]);

    const row = store.submissions[0]!;
    expect(row).toMatchObject({ founderEmail: "ann@alpha.io", founderName: "Ann", status: "received", evaluationId: "ev-1", projectId: "proj-1", pitchdeckAnalysisId: "pd-1", deckStoragePath: `/tmp/intake-uploads/${intake.id}/x.pdf` });
    expect(row.coverage).toEqual(coverage());

    expect(calls.enqueueWebhook).toHaveBeenCalledTimes(1);
    const [projectId, payload, userIds] = calls.enqueueWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>, string[]];
    expect(projectId).toBe("proj-1");
    expect(userIds).toEqual(["owner-1"]);
    expect(payload).toEqual({
      intake_id: intake.id,
      submission_id: row.id,
      evaluation_id: "ev-1",
      project_id: "proj-1",
      startup_name: "Alpha Pty Ltd",
      status: "received",
      svi_total: null,
      coverage_summary: { strong: 0, partial: 8, missing: 0 },
    });
    expect(JSON.stringify(payload)).not.toContain("alpha.io");
    expect(calls.notify).toHaveBeenCalledTimes(1);
  });

  it("auto_report ON + quota → scored via the library report path, recorded paid_via quota", async () => {
    const { store } = await seed({ autoReport: true });
    const { d, calls } = deps();
    const r = await runIntakeSubmission(base(), { ...d, store });
    expect(r).toMatchObject({ ok: true, status: "scored", sviTotal: 66.5, warnings: [] });
    expect(calls.runReport).toHaveBeenCalledWith({ projectId: "proj-1", requestedByUserId: "owner-1" });
    expect(calls.recordReport).toHaveBeenCalledWith({ evaluationId: "ev-1", projectId: "proj-1", userId: "owner-1", reportRef: "rep-1", shareToken: "tok", sviTotal: 66.5 });
    expect(store.submissions[0]).toMatchObject({ status: "scored", sviTotal: 66.5 });
    const payload = (calls.enqueueWebhook.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    expect(payload).toMatchObject({ status: "scored", svi_total: 66.5 });
  });

  it("auto_report ON but quota exhausted → received, no report, warning; credits are never spent", async () => {
    const { store } = await seed({ autoReport: true });
    for (const via of ["credits", "none"] as const) {
      const { d, calls } = deps({ previewReportCharge: async () => ({ via, credits: 10 }) });
      const r = await runIntakeSubmission({ ...base(), founderEmail: `${via}@alpha.io` }, { ...d, store });
      expect(r).toMatchObject({ ok: true, status: "received", sviTotal: null });
      expect(r.ok && r.warnings).toEqual([`auto_report_skipped: quota_${via}`]);
      expect(calls.runReport).not.toHaveBeenCalled();
      expect(calls.recordReport).not.toHaveBeenCalled();
    }
  });

  it("optional steps never fail the submission: classify error, evaluation limit, webhook throw → warnings", async () => {
    const { store } = await seed({ autoReport: true });
    const { d, calls } = deps({
      classify: async () => ({ ok: false as const, error: "extraction_failed" as const }),
      createEvaluation: async () => ({ ok: false as const, error: "evaluation_limit_reached" as const, limit: 1, used: 1, message: "full" }),
      enqueueWebhook: async () => {
        throw new Error("store down");
      },
      notify: async () => {
        throw new Error("telegram down");
      },
    });
    const r = await runIntakeSubmission(base(), { ...d, store });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe("received");
    expect(r.evaluationId).toBeNull();
    expect(r.warnings).toEqual(["classify_failed: extraction_failed", "evaluation_not_created: evaluation_limit_reached"]);
    expect(calls.runReport).not.toHaveBeenCalled();
    expect(store.submissions[0]).toMatchObject({ status: "received", evaluationId: null, warnings: r.warnings });
  });

  it("invite not sent + missing backlink column are warnings; IP is hashed on the row", async () => {
    const { store } = await seed();
    const { d } = deps({
      createEvaluation: async (_o, input) => ({ ok: true, evaluation: { id: "ev-9", projectId: "proj-9", projectName: input.name } as never, inviteSent: false, used: 1, limit: 5 }),
    });
    store.linkEvaluationToIntake = async () => false;
    const r = await runIntakeSubmission(base(), { ...d, store });
    expect(r.ok && r.warnings).toEqual(["invite_email_not_sent", "intake_backlink_skipped"]);
    const row = store.submissions[0]!;
    expect(row.evaluationId).toBe("ev-9");
    expect(JSON.stringify(row)).not.toContain("203.0.113.9");
  });
});

// G21 P2-A — intake templates: the linked template's questions are validated
// before anything is stored, the answers land on the submission row and the
// template's consent text rides on the founder invite.
describe("runIntakeSubmission — template (G21 P2-A)", () => {
  const TEMPLATE = {
    id: "tpl-1",
    ownerUserId: "owner-1",
    name: "Round 1",
    description: null,
    questions: [
      { key: "team_size", label: "Team size", type: "number" as const, required: true },
      { key: "stage", label: "Stage", type: "select" as const, required: false, options: ["Seed", "Series A"] },
    ],
    rubricWeights: { ftv: 12.5, mpc: 12.5, ptd: 12.5, tre: 12.5, cgh: 12.5, iri: 12.5, lco: 12.5, svm: 12.5 },
    consentText: "The Round 1 team reads your evidence.",
    createdAt: "2026-09-20T00:00:00Z",
    updatedAt: "2026-09-20T00:00:00Z",
  };

  async function seedWithTemplate() {
    const store = memoryIntakeStore();
    const c = await createIntake("owner-1", { name: "Templated", template_id: "11111111-2222-4333-8444-555555555555" }, { store, suffix: () => "tmpltmpl" });
    if (!c.ok) throw new Error("seed");
    return { store, intake: c.intake };
  }

  it("rejects a submission whose required template answer is missing (nothing stored)", async () => {
    const { store } = await seedWithTemplate();
    const { d } = deps({ getTemplate: async () => TEMPLATE });
    const r = await runIntakeSubmission({ ...base("templated-tmpltmpl"), answers: { stage: "Seed" } }, { ...d, store });
    expect(r).toMatchObject({ ok: false, error: "invalid_input", reason: "team_size" });
    expect(store.submissions).toHaveLength(0);
  });

  it("stores the validated answers and passes the consent text to the invite", async () => {
    const { store } = await seedWithTemplate();
    const { calls, d } = deps({ getTemplate: async () => TEMPLATE });
    const r = await runIntakeSubmission({ ...base("templated-tmpltmpl"), answers: { team_size: "4", stage: "Seed", junk: "x" } }, { ...d, store });
    expect(r).toMatchObject({ ok: true, status: "received" });
    expect(store.submissions[0]?.answers).toEqual({ team_size: 4, stage: "Seed" });
    expect(calls.createEvaluation).toHaveBeenCalledWith(OWNER, expect.objectContaining({ name: "Alpha Pty Ltd" }), { consentText: "The Round 1 team reads your evidence." });
  });

  it("a template that cannot be loaded means the fixed form (no answers required)", async () => {
    const { store } = await seedWithTemplate();
    const { d } = deps({ getTemplate: async () => null });
    const r = await runIntakeSubmission({ ...base("templated-tmpltmpl") }, { ...d, store });
    expect(r).toMatchObject({ ok: true });
    expect(store.submissions[0]?.answers).toEqual({});
  });
});
