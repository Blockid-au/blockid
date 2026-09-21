// HTTP contract for GET / POST /api/projects/[id]/outcomes (G21 P3-A): auth
// ladder (401 / 404 bad id or no access / 503 access outage), owner list +
// counts + viewer flags, evaluator tier projection, member cannot record
// (403), owner records as founder → 201 proposed with audit action + FI
// event, evaluator records as evaluator, duplicate → 200, rate limits 429,
// missing 0427 → 503 migration_pending. The service is mocked at its
// boundary (lib/outcomes/service.test.ts covers it).
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  resolveClaimsViewer: vi.fn(),
  listProjectOutcomes: vi.fn(),
  recordOutcome: vi.fn(),
  checkRateLimit: vi.fn(),
  enforceRateLimit: vi.fn(),
  auditAction: vi.fn(),
  auditNote: vi.fn(),
  emitOutcomeRecorded: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => ({}) }) }));
vi.mock("@/lib/evidence/claims-access", () => ({ resolveClaimsViewer: (...a: unknown[]) => mocks.resolveClaimsViewer(...a) }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: (...a: unknown[]) => mocks.checkRateLimit(...a), enforceRateLimit: (...a: unknown[]) => mocks.enforceRateLimit(...a) }));
vi.mock("@/lib/audit/context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/audit/context")>("@/lib/audit/context");
  return { ...actual, auditAction: (...a: unknown[]) => mocks.auditAction(...a), auditNote: (...a: unknown[]) => mocks.auditNote(...a) };
});
vi.mock("@/lib/analytics/fi-events", () => ({ emitOutcomeRecorded: (...a: unknown[]) => mocks.emitOutcomeRecorded(...a) }));
vi.mock("@/lib/outcomes/service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/outcomes/service")>("@/lib/outcomes/service");
  return { ...actual, listProjectOutcomes: (...a: unknown[]) => mocks.listProjectOutcomes(...a), recordOutcome: (...a: unknown[]) => mocks.recordOutcome(...a) };
});
vi.mock("server-only", () => ({}));

import { GET, POST } from "./route";

const PID = "11111111-2222-4333-8444-555555555555";
const FOUNDER = { id: "u-1", email: "f@x.io", role: "user", plan: "founder_free" };
const ROW = { id: "o-1", project_id: PID, kind: "funding_raised", observed_at: "2026-08-15T09:30:00.000Z", value: { amount_aud: 500000, source_url: "https://x.io/n" }, source: "founder", confidence: 60, recorded_by: "u-1", status: "proposed", confirmed_by: null, confirmed_at: null, note: "n", created_at: "2026-09-20", updated_at: "2026-09-20" };
const CONFIRMED = { ...ROW, id: "o-2", status: "confirmed", confirmed_by: "u-1", confirmed_at: "2026-09-20" };
const OWNER = { kind: "owner", role: "owner", viewer: { scope: "owner", userId: "u-1" }, consentTier: null };
const BODY = { kind: "funding_raised", observedAt: "2026-08-15", value: { amount_aud: 500000 } };

const ctx = (id = PID) => ({ params: Promise.resolve({ id }) });
function get(id = PID) {
  return GET(new Request(`http://localhost/api/projects/${id}/outcomes`), ctx(id));
}
function post(body: unknown, id = PID) {
  return POST(new Request(`http://localhost/api/projects/${id}/outcomes`, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }), ctx(id));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(FOUNDER);
  mocks.resolveClaimsViewer.mockResolvedValue(OWNER);
  mocks.listProjectOutcomes.mockResolvedValue([ROW, CONFIRMED]);
  mocks.recordOutcome.mockResolvedValue({ ok: true, row: ROW, duplicate: false });
  mocks.checkRateLimit.mockReturnValue({ allowed: true, remaining: 9, resetIn: 1000 });
  mocks.enforceRateLimit.mockReturnValue(null);
});

describe("GET /api/projects/[id]/outcomes", () => {
  it("401 anon · 404 bad id · 404 no access · 503 access outage · 429 read limit", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(401);
    expect((await get("nope")).status).toBe(404);
    mocks.resolveClaimsViewer.mockResolvedValueOnce(null);
    expect((await get()).status).toBe(404);
    mocks.resolveClaimsViewer.mockRejectedValueOnce(new Error("db down"));
    expect((await get()).status).toBe(503);
    mocks.enforceRateLimit.mockReturnValueOnce(new Response(null, { status: 429 }));
    expect((await get()).status).toBe(429);
    expect(mocks.listProjectOutcomes).not.toHaveBeenCalled();
  });

  it("owner: every row without actor ids, counts, viewer flags can_record + can_resolve", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const body = await res.json();
    expect(body.outcomes).toHaveLength(2);
    expect(body.outcomes[0]).not.toHaveProperty("recorded_by");
    expect(body.outcomes[0].value.source_url).toBe("https://x.io/n");
    expect(body.counts).toEqual({ proposed: 1, confirmed: 1, rejected: 0 });
    expect(body.viewer).toEqual({ kind: "owner", consent_tier: null, can_record: true, can_resolve: true });
  });

  it("member: list only (no record / resolve); evaluator: tier projection + consent_tier on the viewer", async () => {
    mocks.resolveClaimsViewer.mockResolvedValueOnce({ ...OWNER, role: "viewer" });
    const m = await (await get()).json();
    expect(m.viewer).toMatchObject({ can_record: false, can_resolve: false });
    mocks.resolveClaimsViewer.mockResolvedValueOnce({ kind: "evaluator", evaluationId: "ev-1", viewer: { scope: "evaluators", userId: "e-1" }, consentTier: "attributed_only" });
    const e = await (await get()).json();
    expect(e.viewer).toEqual({ kind: "evaluator", consent_tier: "attributed_only", can_record: true, can_resolve: false });
    expect(e.outcomes.map((o: { id: string }) => o.id)).toEqual(["o-2"]);
    expect(e.outcomes[0]).toMatchObject({ withheld: true, value: {} });
  });

  it("503 migration_pending when 0427 is not applied; 500 on any other read failure", async () => {
    mocks.listProjectOutcomes.mockRejectedValueOnce(new Error('relation "public.startup_outcomes" does not exist'));
    const res = await get();
    expect(res.status).toBe(503);
    expect((await res.json()).reason).toBe("migration_pending");
    mocks.listProjectOutcomes.mockRejectedValueOnce(new Error("boom"));
    expect((await get()).status).toBe(500);
  });
});

describe("POST /api/projects/[id]/outcomes", () => {
  it("401 anon · 429 write limit with Retry-After · 400 invalid JSON / body (field named) · 404 no access · 403 member", async () => {
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await post(BODY)).status).toBe(401);
    mocks.checkRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, resetIn: 30_000 });
    const rl = await post(BODY);
    expect(rl.status).toBe(429);
    expect(rl.headers.get("Retry-After")).toBe("30");
    expect(mocks.checkRateLimit).toHaveBeenCalledWith("outcomes:record:u-1", 30, 3_600_000);
    expect((await post("{not json")).status).toBe(400);
    const bad = await post({ kind: "funding_raised", observedAt: "2026-08-15", value: {} });
    expect(bad.status).toBe(400);
    expect((await bad.json()).field).toBe("value.amount_aud");
    mocks.resolveClaimsViewer.mockResolvedValueOnce(null);
    expect((await post(BODY)).status).toBe(404);
    mocks.resolveClaimsViewer.mockResolvedValueOnce({ ...OWNER, role: "editor" });
    expect((await post(BODY)).status).toBe(403);
    expect(mocks.recordOutcome).not.toHaveBeenCalled();
  });

  it("201 owner → source founder, proposed; audit action outcome.recorded + note; FI event outcome_recorded; actor ids stripped", async () => {
    const res = await post(BODY);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, duplicate: false, outcome: { id: "o-1", status: "proposed" } });
    expect(body.outcome).not.toHaveProperty("recorded_by");
    const args = mocks.recordOutcome.mock.calls[0]![1] as { projectId: string; source: string; recordedBy: string; input: { kind: string; observedAt: string } };
    expect(args).toMatchObject({ projectId: PID, source: "founder", recordedBy: "u-1", input: { kind: "funding_raised", observedAt: "2026-08-15T00:00:00.000Z" } });
    expect(mocks.auditAction).toHaveBeenCalledWith("outcome.recorded");
    expect(mocks.auditNote).toHaveBeenCalledWith("o-1", { project_id: PID, kind: "funding_raised", source: "founder", status: "proposed", duplicate: false });
    expect(mocks.emitOutcomeRecorded).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: "u-1", actorUserId: "u-1", projectId: PID, channel: "api", outcomeId: "o-1", kind: "funding_raised", source: "founder", status: "proposed" }));
  });

  it("evaluator with an evaluations row records as source evaluator (owner unknown on the envelope)", async () => {
    mocks.resolveClaimsViewer.mockResolvedValueOnce({ kind: "evaluator", evaluationId: "ev-1", viewer: { scope: "evaluators", userId: "e-1" }, consentTier: "reports_shared" });
    mocks.recordOutcome.mockResolvedValueOnce({ ok: true, row: { ...ROW, source: "evaluator", confidence: 70 }, duplicate: false });
    const res = await post(BODY);
    expect(res.status).toBe(201);
    expect((mocks.recordOutcome.mock.calls[0]![1] as { source: string }).source).toBe("evaluator");
    expect(mocks.emitOutcomeRecorded).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: null, actorUserId: "u-1", source: "evaluator" }));
  });

  it("duplicate → 200 with the existing row and no FI event; service errors surface with their status; missing table → 503", async () => {
    mocks.recordOutcome.mockResolvedValueOnce({ ok: true, row: ROW, duplicate: true });
    const dup = await post(BODY);
    expect(dup.status).toBe(200);
    expect((await dup.json()).duplicate).toBe(true);
    expect(mocks.emitOutcomeRecorded).not.toHaveBeenCalled();
    mocks.recordOutcome.mockResolvedValueOnce({ ok: false, error: "too_many_proposed", message: "wait", status: 429 });
    expect((await post(BODY)).status).toBe(429);
    mocks.recordOutcome.mockRejectedValueOnce(new Error('relation "startup_outcomes" does not exist'));
    expect((await post(BODY)).status).toBe(503);
  });
});
