// Route tests for POST /api/evaluations/batch/[id]/import.csv (G21 P2-A).
// Pins: 401 / 403 (same gate as batch creation) / 404 (not my batch, bad id)
// / 400 invalid_csv / 413 over the cap / 409 cap_reached with counts and
// nothing created / the happy path (createEvaluation called per valid row
// with stage / notes / abn + the template consent text, addEvaluationsToBatch
// with the new ids, startup_added_to_cohort per row, skipped rows carry
// their line) / a plan-limit mid-import keeps the earlier rows / multipart
// and raw text bodies.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const getEntitlementsMock = vi.fn();
const recordGateHitMock = vi.fn();
vi.mock("@/lib/entitlements", () => ({
  getEntitlements: (plan: string, id: string) => getEntitlementsMock(plan, id),
  recordGateHit: (...args: unknown[]) => recordGateHitMock(...args),
}));

const getBatchForUserMock = vi.fn();
const countBatchItemsMock = vi.fn();
const loadDedupeMock = vi.fn();
const addToBatchMock = vi.fn();
vi.mock("@/lib/evaluations/batch", () => ({
  getBatchForUser: (u: string, id: string) => getBatchForUserMock(u, id),
  countBatchItems: (id: string) => countBatchItemsMock(id),
  loadBatchDedupeSources: (id: string) => loadDedupeMock(id),
  addEvaluationsToBatch: (b: unknown, ids: string[]) => addToBatchMock(b, ids),
}));

const createEvaluationMock = vi.fn();
vi.mock("@/lib/evaluations", () => ({ createEvaluation: (...args: unknown[]) => createEvaluationMock(...args) }));

const getTemplateByIdMock = vi.fn();
vi.mock("@/lib/intake/templates", () => ({ getTemplateById: (id: string | null) => getTemplateByIdMock(id) }));

const emitMock = vi.fn();
vi.mock("@/lib/analytics/fi-events", () => ({ emitFiEvent: (name: string, env: unknown) => emitMock(name, env) }));

vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

import { POST, dynamic } from "./route";

const BATCH_ID = "11111111-2222-4333-8444-555555555555";
const USER = { id: "u-1", email: "prog@accel.au", plan: "investor_vc_small", displayName: "Pat" };
const PROGRAM_FLAGS = ["investor.dealflow", "lp_export", "lp_report"];
const BATCH = {
  id: BATCH_ID,
  userId: "u-1",
  name: "Round 1",
  rubricWeights: {},
  status: "done",
  total: 2,
  doneCount: 2,
  failedCount: 0,
  createdAt: "2026-09-20T00:00:00Z",
  startedAt: null,
  finishedAt: "2026-09-20T01:00:00Z",
  programName: null,
  intakeId: null,
  templateId: "tpl-1",
  weightsVersion: 1,
  applicantsCap: null,
  pilotOrderId: null,
};

const CSV = [
  "company,url,contact_email,stage,sector,deck_url,abn",
  "Acme,https://acme.com.au,f@acme.com.au,MVP,Robotics,https://acme.com.au/deck.pdf,79659615111",
  "Beta,beta.io,,Seed,Fintech,,",
  ",,,,,,",
  "Acme again,acme.com.au,,,,,",
].join("\n");

function textPost(body: string, id = BATCH_ID): Request {
  return new Request(`http://localhost/api/evaluations/batch/${id}/import.csv`, { method: "POST", headers: { "content-type": "text/csv" }, body });
}

function multipartPost(csv: string, id = BATCH_ID): Request {
  const boundary = "----vitestBoundary";
  const body = [`--${boundary}`, 'Content-Disposition: form-data; name="file"; filename="cohort.csv"', "Content-Type: text/csv", "", csv, `--${boundary}--`, ""].join("\r\n");
  return new Request(`http://localhost/api/evaluations/batch/${id}/import.csv`, { method: "POST", headers: { "content-type": `multipart/form-data; boundary=${boundary}` }, body });
}

const ctx = (id = BATCH_ID) => ({ params: Promise.resolve({ id }) });

let evalSeq = 0;
beforeEach(() => {
  vi.clearAllMocks();
  evalSeq = 0;
  getCurrentUserMock.mockResolvedValue(USER);
  getEntitlementsMock.mockResolvedValue(PROGRAM_FLAGS);
  getBatchForUserMock.mockResolvedValue(BATCH);
  countBatchItemsMock.mockResolvedValue(2);
  loadDedupeMock.mockResolvedValue([]);
  getTemplateByIdMock.mockResolvedValue({ id: "tpl-1", consentText: "Round 1 reads your evidence.", questions: [] });
  createEvaluationMock.mockImplementation(async (_u: unknown, input: { name: string }) => {
    evalSeq += 1;
    return { ok: true, evaluation: { id: `ev-${evalSeq}`, projectId: `p-${evalSeq}`, projectName: input.name }, inviteSent: evalSeq === 1, used: evalSeq, limit: 200 };
  });
  addToBatchMock.mockImplementation(async (b: typeof BATCH, ids: string[]) => ({ ok: true, added: ids, alreadyPresent: [], batch: { ...b, status: "queued", total: b.total + ids.length } }));
});

describe("/api/evaluations/batch/[id]/import.csv — gates", () => {
  it("exports dynamic = force-dynamic", () => {
    expect(dynamic).toBe("force-dynamic");
  });
  it("401 anonymous", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    expect((await POST(textPost(CSV), ctx())).status).toBe(401);
  });
  it("403 feature_locked for Scout / Firm + records the gate hit", async () => {
    getEntitlementsMock.mockResolvedValue(["investor.dealflow"]);
    const res = await POST(textPost(CSV), ctx());
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "feature_locked", feature: "lp_export" });
    expect(recordGateHitMock).toHaveBeenCalledWith(expect.objectContaining({ id: "u-1" }), "lp_export", "api", "api/evaluations/batch/[id]/import.csv");
  });
  it("404 for a malformed id and for a batch that is not mine", async () => {
    expect((await POST(textPost(CSV, "nope"), ctx("nope"))).status).toBe(404);
    getBatchForUserMock.mockResolvedValue(null);
    expect((await POST(textPost(CSV), ctx())).status).toBe(404);
    expect(createEvaluationMock).not.toHaveBeenCalled();
  });
});

describe("/api/evaluations/batch/[id]/import.csv — body", () => {
  it("400 invalid_csv when the header is missing", async () => {
    const res = await POST(textPost("foo,bar\n1,2"), ctx());
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_csv" });
  });
  it("413 when the body is over 2 MB", async () => {
    const res = await POST(textPost("company\n" + "x".repeat(2 * 1024 * 1024 + 10)), ctx());
    expect(res.status).toBe(413);
  });
  it("409 cap_reached with counts when used + valid rows exceed applicants_cap; nothing created", async () => {
    getBatchForUserMock.mockResolvedValue({ ...BATCH, applicantsCap: 3 });
    const res = await POST(textPost(CSV), ctx());
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json).toMatchObject({ error: "cap_reached", cap: { used: 2, max: 3, remaining: 1 }, needed: 2 });
    expect(createEvaluationMock).not.toHaveBeenCalled();
    expect(addToBatchMock).not.toHaveBeenCalled();
  });
});

describe("/api/evaluations/batch/[id]/import.csv — happy path", () => {
  it("creates one evaluation per valid row (stage / notes / abn + consent text), adds them to the batch, reports skips by line, emits per row", async () => {
    const res = await POST(multipartPost(CSV), ctx());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, imported: 2, invites_sent: 1, cap: { used: 4, max: null, remaining: null }, batch: { status: "queued", total: 4 } });
    expect(json.skipped).toEqual([
      { line: 4, reason: "empty_row", message: "Empty row" },
      { line: 5, reason: "duplicate_in_file", message: "Duplicate of an earlier row (domain acme.com.au)" },
    ]);
    expect(createEvaluationMock).toHaveBeenNthCalledWith(
      1,
      USER,
      { name: "Acme", website: "https://acme.com.au", founder_email: "f@acme.com.au", industry: "Robotics", stage: 3, notes: "Deck: https://acme.com.au/deck.pdf", abn: "79659615111" },
      { consentText: "Round 1 reads your evidence." },
    );
    expect(createEvaluationMock).toHaveBeenNthCalledWith(2, USER, { name: "Beta", website: "https://beta.io", founder_email: null, industry: "Fintech", stage: 4, notes: null, abn: null }, { consentText: "Round 1 reads your evidence." });
    expect(addToBatchMock).toHaveBeenCalledWith(BATCH, ["ev-1", "ev-2"]);
    expect(emitMock).toHaveBeenCalledTimes(2);
    expect(emitMock).toHaveBeenCalledWith("startup_added_to_cohort", expect.objectContaining({ organisation: "u-1", startup: "p-1", channel: "csv_import", batch_id: BATCH_ID, evaluation_id: "ev-1", invite_sent: true }));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("dedupes against the cohort's existing evaluations", async () => {
    loadDedupeMock.mockResolvedValue([{ website: "https://www.acme.com.au", founderEmail: null, abn: null }]);
    const res = await POST(textPost(CSV), ctx());
    const json = await res.json();
    expect(json.imported).toBe(1);
    expect(json.skipped.map((s: { line: number; reason: string }) => [s.line, s.reason])).toEqual([
      [2, "duplicate_in_cohort"],
      [4, "empty_row"],
      [5, "duplicate_in_cohort"],
    ]);
    expect(createEvaluationMock).toHaveBeenCalledTimes(1);
  });

  it("a plan limit mid-import keeps the earlier rows and reports the rest as plan_limit", async () => {
    createEvaluationMock.mockImplementationOnce(async () => ({ ok: true, evaluation: { id: "ev-1", projectId: "p-1" }, inviteSent: false, used: 25, limit: 25 })).mockImplementationOnce(async () => ({ ok: false, error: "evaluation_limit_reached", limit: 25, used: 25, message: "Your plan tracks up to 25 startups. Upgrade to add more." }));
    const res = await POST(textPost(CSV), ctx());
    const json = await res.json();
    expect(json.imported).toBe(1);
    expect(json.skipped).toContainEqual({ line: 3, reason: "plan_limit", message: "Your plan tracks up to 25 startups. Upgrade to add more." });
    expect(addToBatchMock).toHaveBeenCalledWith(BATCH, ["ev-1"]);
  });

  it("no template on the batch → consentText null", async () => {
    getBatchForUserMock.mockResolvedValue({ ...BATCH, templateId: null });
    getTemplateByIdMock.mockResolvedValue(null);
    await POST(textPost("company\nSolo"), ctx());
    expect(createEvaluationMock).toHaveBeenCalledWith(USER, expect.objectContaining({ name: "Solo" }), { consentText: null });
  });
});
