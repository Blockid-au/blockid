// Colocated vitest for /api/funding/draft (T0251, per-grant application drafts).
//
// Pins:
//   1. 401 without a session; 400 without grant_id; 404 unknown grant; 403 when
//      the project is not the caller's; 403 plan_required below Starter.
//   2. Growth / Startup Package (hasGrowthExtras true) → cost 0, no canAfford,
//      no spendCredits, draft stored with credits_cost 0, no confirm needed.
//   3. Starter → transparent pricing: confirm !== true returns 200 preview
//      { cost: 2, prompts } and generates NOTHING; confirm:true → generate →
//      spendCredits(…, "grant_application_draft") → insert (review
//      2026-09-10 #3: spend BEFORE insert so a lost race stores nothing);
//      canAfford false → 402 with creditsRequired; insert failure after a
//      spend refunds via grantCredits.
//   4. AI failure → 200 with empty answers, ai_ok:false, and NOT charged.
//   5. PATCH → owner update of answers / status; 404 when not owned.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const enforceRateLimitMock = vi.hoisted(() => vi.fn<(...a: unknown[]) => Response | null>());
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => enforceRateLimitMock(...a) }));

const { canAffordMock, spendCreditsMock, grantCreditsMock } = vi.hoisted(() => ({ canAffordMock: vi.fn(), spendCreditsMock: vi.fn(), grantCreditsMock: vi.fn() }));
vi.mock("@/lib/credits", () => ({
  grantCredits: (...a: unknown[]) => grantCreditsMock(...a),
  canAfford: (u: string, f: string) => canAffordMock(u, f),
  spendCredits: (u: string, f: string, m?: unknown) => spendCreditsMock(u, f, m),
  FEATURE_COSTS: { grant_application_draft: 2 },
}));

const canMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/entitlements", () => ({ can: (u: unknown, f: string) => canMock(u, f) }));

const growthMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funding/growth-extras", () => ({ hasGrowthExtras: (u: unknown) => growthMock(u) }));

const getProjectByIdMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/projects", () => ({ getProjectById: (id: string) => getProjectByIdMock(id) }));

const getGrantMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funding/data", () => ({ getGrant: (id: string) => getGrantMock(id) }));

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: () => ({}) }) }));

const { gatherMock, insertMock, updateMock } = vi.hoisted(() => ({ gatherMock: vi.fn(), insertMock: vi.fn(), updateMock: vi.fn() }));
vi.mock("@/lib/funding/application-drafts", () => ({
  gatherDraftContext: (...a: unknown[]) => gatherMock(...a),
  insertGrantDraft: (row: unknown) => insertMock(row),
  updateGrantDraft: (id: string, u: string, patch: unknown) => updateMock(id, u, patch),
}));

const draftMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agents/grant-application-drafter", () => ({
  draftGrantApplication: (g: unknown, p: unknown, c: unknown) => draftMock(g, p, c),
}));

import { ANSWER_KEY_MAX_LEN, ANSWER_MAX_KEYS, PATCH, POST } from "./route";

const USER = { id: "u-1", email: "f@acme.io", plan: "founder_starter" };
const PROJECT = { id: "11111111-1111-4111-8111-111111111111", userId: "u-1", name: "Acme", description: "Soil sensors", industry: "AgTech", stage: 2 };
const GRANT = {
  id: "nsw-mvp-ventures", name: "MVP Ventures", provider: "Investment NSW", summary: "s", amount_note: null, co_contribution: "1:1",
  official_url: "https://x", exclude_from_matching: false, closes_at: null,
  application_prompts: [{ id: "product", question: "Describe the MVP." }, { id: "budget", question: "Budget?" }, { id: "team", question: "Team?" }],
};
const CTX = { startup: "Acme", description: null, industry: null, stage: null, state: null, svi: null, evidence: [], matchWhy: [], eligibility: [] };

function post(body: unknown) {
  return POST(new Request("http://localhost/api/funding/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}
function patch(body: unknown) {
  return PATCH(new Request("http://localhost/api/funding/draft", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}

beforeEach(() => {
  getCurrentUserMock.mockReset().mockResolvedValue(USER);
  enforceRateLimitMock.mockReset().mockReturnValue(null);
  canAffordMock.mockReset().mockResolvedValue({ allowed: true, balance: 10, cost: 2 });
  spendCreditsMock.mockReset().mockResolvedValue({ ok: true, balance: 8 });
  grantCreditsMock.mockReset().mockResolvedValue({ ok: true, balance: 10 });
  canMock.mockReset().mockResolvedValue(true);
  growthMock.mockReset().mockResolvedValue(false);
  getProjectByIdMock.mockReset().mockResolvedValue(PROJECT);
  getGrantMock.mockReset().mockResolvedValue(GRANT);
  gatherMock.mockReset().mockResolvedValue(CTX);
  insertMock.mockReset().mockImplementation(async (row: Record<string, unknown>) => ({ id: "22222222-2222-4222-8222-222222222222", ...row, created_at: "", updated_at: "" }));
  updateMock.mockReset();
  draftMock.mockReset().mockResolvedValue({ answers: { product: "A", budget: "B", team: "C" }, ai_ok: true, failed: [], provider: "groq", model: "m" });
});

describe("POST /api/funding/draft — guards", () => {
  it("401 / 400 / 404 / 403 paths", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    expect((await post({ grant_id: "x" })).status).toBe(401);

    expect((await post({})).status).toBe(400);

    getGrantMock.mockResolvedValueOnce(null);
    expect((await post({ grant_id: "nope" })).status).toBe(404);
    // S8-C: catalogue id shape is checked before any lookup.
    expect((await post({ grant_id: "Nope;drop" })).status).toBe(400);
    expect((await post({ grant_id: "../rdti" })).status).toBe(400);
    expect((await post({ grant_id: GRANT.id, project_id: "proj-1" })).status).toBe(400);
    // S8-C: oversize body is a 413 before parsing. (Cross-site refusal moved
    // to the S9-A proxy gate — src/proxy.test.ts.)
    const big = await POST(new Request("http://localhost/api/funding/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ grant_id: GRANT.id, pad: "x".repeat(20 * 1024) }) }));
    expect(big.status).toBe(413);

    getProjectByIdMock.mockResolvedValueOnce({ ...PROJECT, userId: "someone-else" });
    expect((await post({ grant_id: GRANT.id, project_id: "11111111-1111-4111-8111-111111111111" })).status).toBe(403);

    canMock.mockResolvedValueOnce(false);
    const locked = await post({ grant_id: GRANT.id });
    expect(locked.status).toBe(403);
    expect((await locked.json()).error).toBe("plan_required");
    expect(draftMock).not.toHaveBeenCalled();
  });

  it("rate limit response is returned as-is", async () => {
    enforceRateLimitMock.mockReturnValueOnce(new Response("slow", { status: 429 }));
    expect((await post({ grant_id: GRANT.id })).status).toBe(429);
  });
});

describe("POST — Growth / Startup Package rail", () => {
  it("cost 0, no credit calls, no confirm needed, draft stored with the grant's prompts", async () => {
    growthMock.mockResolvedValue(true);
    const res = await post({ grant_id: GRANT.id, project_id: "11111111-1111-4111-8111-111111111111" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, cost: 0, creditsCharged: 0, ai_ok: true });
    expect(body.preview).toBeUndefined();
    expect(canAffordMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(draftMock).toHaveBeenCalledTimes(1);
    expect(draftMock.mock.calls[0]![1]).toEqual(GRANT.application_prompts);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u-1", project_id: "11111111-1111-4111-8111-111111111111", grant_id: GRANT.id, credits_cost: 0, status: "draft", answers: { product: "A", budget: "B", team: "C" } }));
    expect(gatherMock).toHaveBeenCalledWith({ id: "u-1", email: "f@acme.io" }, PROJECT, GRANT.id, expect.anything());
  });
});

describe("POST — Starter credits rail (transparent pricing)", () => {
  it("confirm omitted → 200 preview with the cost + prompts, nothing generated or spent", async () => {
    const res = await post({ grant_id: GRANT.id, project_id: "11111111-1111-4111-8111-111111111111" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, preview: true, cost: 2, balance: 10, grant: { id: GRANT.id, name: "MVP Ventures" } });
    expect(body.prompts).toHaveLength(3);
    expect(canAffordMock).toHaveBeenCalledWith("u-1", "grant_application_draft");
    expect(draftMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("confirm:true → generate, spend 2 credits, THEN insert (spend before insert, #3)", async () => {
    const order: string[] = [];
    insertMock.mockImplementation(async (row: Record<string, unknown>) => { order.push("insert"); return { id: "22222222-2222-4222-8222-222222222222", ...row, created_at: "", updated_at: "" }; });
    spendCreditsMock.mockImplementation(async () => { order.push("spend"); return { ok: true, balance: 8 }; });
    const res = await post({ grant_id: GRANT.id, project_id: "11111111-1111-4111-8111-111111111111", confirm: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, cost: 2, creditsCharged: 2, balance: 8, ai_ok: true });
    expect(order).toEqual(["spend", "insert"]);
    expect(spendCreditsMock).toHaveBeenCalledWith("u-1", "grant_application_draft", { project_id: "11111111-1111-4111-8111-111111111111", grant_id: GRANT.id });
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ credits_cost: 2, status: "draft" }));
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("canAfford false → 402 with creditsRequired + balance, nothing generated", async () => {
    canAffordMock.mockResolvedValueOnce({ allowed: false, balance: 1, cost: 2, reason: "insufficient_credits" });
    const res = await post({ grant_id: GRANT.id, confirm: true });
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ ok: false, error: "insufficient_credits", creditsRequired: 2, balance: 1 });
    expect(draftMock).not.toHaveBeenCalled();
  });

  it("spend failure → 402 credit_spend_failed with credits_needed and NOTHING inserted (#3)", async () => {
    spendCreditsMock.mockResolvedValueOnce({ ok: false, balance: 0 });
    const res = await post({ grant_id: GRANT.id, confirm: true });
    expect(res.status).toBe(402);
    expect(await res.json()).toMatchObject({ error: "credit_spend_failed", creditsRequired: 2, credits_needed: 2, balance: 0 });
    expect(insertMock).not.toHaveBeenCalled();
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });

  it("insert failure after a successful spend → 500 and the 2 credits are refunded", async () => {
    insertMock.mockResolvedValueOnce(null);
    const res = await post({ grant_id: GRANT.id, confirm: true });
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ error: "draft_insert_failed" });
    expect(spendCreditsMock).toHaveBeenCalledTimes(1);
    expect(grantCreditsMock).toHaveBeenCalledWith("u-1", 2, "refund", expect.objectContaining({ feature: "grant_application_draft", grant_id: GRANT.id }));
  });
});

describe("POST — never blank", () => {
  it("AI failure → 200, prompts stored with empty answers, ai_ok:false, and NOT charged", async () => {
    draftMock.mockResolvedValueOnce({ answers: { product: "", budget: "", team: "" }, ai_ok: false, failed: ["product", "budget", "team"], provider: null, model: null });
    const res = await post({ grant_id: GRANT.id, confirm: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, ai_ok: false, creditsCharged: 0, cost: 2, failed: ["product", "budget", "team"] });
    expect(body.prompts).toHaveLength(3);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ credits_cost: 0, answers: { product: "", budget: "", team: "" } }));
    expect(spendCreditsMock).not.toHaveBeenCalled();
  });

  it("drafter throwing is caught the same way", async () => {
    draftMock.mockRejectedValueOnce(new Error("boom"));
    const res = await post({ grant_id: GRANT.id, confirm: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, ai_ok: false, creditsCharged: 0 });
  });

  it("a grant without prompts drafts against the generic 4-question set", async () => {
    growthMock.mockResolvedValue(true);
    getGrantMock.mockResolvedValueOnce({ ...GRANT, application_prompts: [] });
    const res = await post({ grant_id: GRANT.id });
    const body = await res.json();
    expect(body.prompts.map((p: { id: string }) => p.id)).toEqual(["project", "eligibility", "budget", "outcomes"]);
  });
});

describe("PATCH /api/funding/draft", () => {
  it("401 / 400 / 404 and the owner update", async () => {
    getCurrentUserMock.mockResolvedValueOnce(null);
    expect((await patch({ id: "22222222-2222-4222-8222-222222222222", answers: {} })).status).toBe(401);
    expect((await patch({ answers: { a: "x" } })).status).toBe(400);
    expect((await patch({ id: "22222222-2222-4222-8222-222222222222" })).status).toBe(400);

    updateMock.mockResolvedValueOnce(null);
    expect((await patch({ id: "99999999-9999-4999-8999-999999999999", answers: { a: "x" } })).status).toBe(404);
    // S8-C: a non-uuid id is a 404 without touching the DB; keys are capped.
    updateMock.mockClear();
    expect((await patch({ id: "d-9", answers: { a: "x" } })).status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
    const many = Object.fromEntries(Array.from({ length: 80 }, (_, i) => [`k${i}`, "v"]));
    updateMock.mockResolvedValueOnce({ id: "22222222-2222-4222-8222-222222222222", answers: {}, status: "draft" });
    expect((await patch({ id: "22222222-2222-4222-8222-222222222222", answers: { ...many, ["L".repeat(65)]: "v" } })).status).toBe(200);
    const sent = updateMock.mock.calls.at(-1)?.[2] as { answers: Record<string, string> };
    expect(Object.keys(sent.answers)).toHaveLength(ANSWER_MAX_KEYS);
    expect(Object.keys(sent.answers).some((k) => k.length > ANSWER_KEY_MAX_LEN)).toBe(false);

    updateMock.mockResolvedValueOnce({ id: "22222222-2222-4222-8222-222222222222", answers: { a: "x" }, status: "final" });
    const res = await patch({ id: "22222222-2222-4222-8222-222222222222", answers: { a: "x", junk: 5 }, status: "final" });
    expect(res.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222", "u-1", { answers: { a: "x" }, status: "final" });
    expect((await res.json()).draft.status).toBe("final");
  });
});
