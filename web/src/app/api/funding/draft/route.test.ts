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
//   6. S16-A program path: `{ program_id }` → getProgram + promptsForProgram
//      (generic 6 when unseeded), drafter gets a kind:"program" target with
//      the intake window, row stored with program_id set / grant_id null,
//      same gate / preview / spend / AI-failure rules; both ids → 400;
//      unknown program → 404 program_not_found.

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
// S17-A: the route is member-aware (getProject + roleCanWrite). The mock
// keeps `getProjectByIdMock` as the knob: a row whose userId is the caller
// is the owner; a row with `role` set is a shared-project member; a row
// owned by someone else with no role is a non-member (route → 403).
vi.mock("@/lib/projects", () => ({
  getProject: async (userId: string, id: string) => {
    const row = await getProjectByIdMock(id);
    if (!row) return null;
    if (row.role) return row;
    if (row.userId === userId) return { ...row, role: "owner" };
    return null;
  },
  roleCanWrite: (role: string | null) => role === "owner" || role === "admin" || role === "editor",
  creditChargeNote: (scope: { isOwner: boolean } | null) =>
    !scope || scope.isOwner ? "Charged to your credits." : "Charged to your own credits — not the project owner's.",
}));

const { getGrantMock, getProgramMock } = vi.hoisted(() => ({ getGrantMock: vi.fn(), getProgramMock: vi.fn() }));
vi.mock("@/lib/funding/data", () => ({ getGrant: (id: string) => getGrantMock(id), getProgram: (id: string) => getProgramMock(id) }));

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
const PROGRAM = {
  id: "syd-startmate-accelerator", name: "Startmate Accelerator", operator: "Startmate", program_type: "accelerator", summary: "Australia's best-known accelerator.",
  applications_open: "2026-09", applications_close: "2026-11-08", next_cohort_start: "2027-01-25", funding_aud: 120000, equity_pct: "≤8%", cost_to_founder: "free",
  benefits: ["4,000+ mentor network", "Demo Day"], length_weeks: 12, official_url: "https://www.startmate.com/accelerator",
  application_prompts: [{ id: "one_liner", question: "One sentence." }, { id: "problem", question: "Problem?" }, { id: "team", question: "Team?" }, { id: "why_startmate", question: "Why Startmate?" }, { id: "milestones", question: "Milestones?" }],
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
  getProgramMock.mockReset().mockResolvedValue(PROGRAM);
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
    expect(gatherMock).toHaveBeenCalledWith({ id: "u-1", email: "f@acme.io" }, expect.objectContaining(PROJECT), { kind: "grant", id: GRANT.id }, expect.anything());
    // Grant drafts keep grant_id and leave program_id null (0329 CHECK: exactly one).
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ program_id: null }));
    const target = draftMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(target.kind).toBeUndefined();
    expect(target).toMatchObject({ id: GRANT.id, name: "MVP Ventures", co_contribution: "1:1" });
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

  // S17-A — shared-project members on the credits rail.
  it("viewer member → 403 before any pricing; editor member's preview says the MEMBER's own credits are charged", async () => {
    const PID = "11111111-1111-4111-8111-111111111111";
    getProjectByIdMock.mockResolvedValueOnce({ ...PROJECT, userId: "owner-9", role: "viewer" });
    expect((await post({ grant_id: GRANT.id, project_id: PID })).status).toBe(403);
    expect(canAffordMock).not.toHaveBeenCalled();

    getProjectByIdMock.mockResolvedValueOnce({ ...PROJECT, userId: "owner-9", role: "editor" });
    const res = await post({ grant_id: GRANT.id, project_id: PID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preview).toBe(true);
    expect(body.creditNote).toMatch(/your own credits — not the project owner's/);
    expect(canAffordMock).toHaveBeenCalledWith("u-1", "grant_application_draft");
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

describe("POST — program drafts (S16-A)", () => {
  const PID = "11111111-1111-4111-8111-111111111111";
  const PROGRAM_ANSWERS = { one_liner: "A", problem: "B", team: "C", why_startmate: "D", milestones: "E" };

  it("grant_id + program_id together → 400; bad program id shape → 400; unknown program → 404 program_not_found", async () => {
    const both = await post({ grant_id: GRANT.id, program_id: PROGRAM.id });
    expect(both.status).toBe(400);
    expect((await both.json()).field).toBe("program_id");
    expect((await post({ program_id: "Nope;drop" })).status).toBe(400);
    getProgramMock.mockResolvedValueOnce(null);
    const missing = await post({ program_id: "zzz-nope" });
    expect(missing.status).toBe(404);
    expect((await missing.json()).error).toBe("program_not_found");
    expect(getGrantMock).not.toHaveBeenCalled();
    expect(draftMock).not.toHaveBeenCalled();
  });

  it("Growth → cost 0, drafter gets a kind:program target with name + intake + funding, row stored with program_id set and grant_id null", async () => {
    growthMock.mockResolvedValue(true);
    draftMock.mockResolvedValueOnce({ answers: PROGRAM_ANSWERS, ai_ok: true, failed: [], provider: "groq", model: "m" });
    const res = await post({ program_id: PROGRAM.id, project_id: PID });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, cost: 0, creditsCharged: 0, ai_ok: true, kind: "program", program: { id: PROGRAM.id, name: "Startmate Accelerator", official_url: PROGRAM.official_url } });
    expect(body.grant).toBeUndefined();
    expect(body.prompts.map((p: { id: string }) => p.id)).toEqual(["one_liner", "problem", "team", "why_startmate", "milestones"]);
    expect(getProgramMock).toHaveBeenCalledWith(PROGRAM.id);
    expect(getGrantMock).not.toHaveBeenCalled();
    expect(canAffordMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();
    // The drafter target is the program-flavoured shape.
    const target = draftMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(target).toMatchObject({
      kind: "program",
      id: PROGRAM.id,
      name: "Startmate Accelerator",
      provider: "Startmate",
      program_type: "accelerator",
      intake: "Applications open Sep 2026, close 8 Nov 2026; next cohort 25 Jan 2027",
      funding: "A$120,000 for ≤8%",
      cost_to_founder: "free",
      benefits: ["4,000+ mentor network", "Demo Day"],
      length_weeks: 12,
    });
    expect(draftMock.mock.calls[0]![1]).toEqual(PROGRAM.application_prompts);
    // Context gathering is keyed on the program so match notes come from program_matches.
    expect(gatherMock).toHaveBeenCalledWith({ id: "u-1", email: "f@acme.io" }, expect.objectContaining(PROJECT), { kind: "program", id: PROGRAM.id }, expect.anything());
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u-1", project_id: PID, grant_id: null, program_id: PROGRAM.id, credits_cost: 0, status: "draft", answers: PROGRAM_ANSWERS }));
  });

  it("Starter → preview carries cost + prompts + program echo and spends nothing; confirm:true → spend (program_id meta) then insert", async () => {
    const preview = await post({ program_id: PROGRAM.id, project_id: PID });
    expect(preview.status).toBe(200);
    const pbody = await preview.json();
    expect(pbody).toMatchObject({ ok: true, preview: true, cost: 2, balance: 10, kind: "program", program: { id: PROGRAM.id, name: "Startmate Accelerator" } });
    expect(pbody.prompts).toHaveLength(5);
    expect(draftMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(spendCreditsMock).not.toHaveBeenCalled();

    draftMock.mockResolvedValueOnce({ answers: PROGRAM_ANSWERS, ai_ok: true, failed: [], provider: "groq", model: "m" });
    const order: string[] = [];
    insertMock.mockImplementation(async (row: Record<string, unknown>) => { order.push("insert"); return { id: "22222222-2222-4222-8222-222222222222", ...row, created_at: "", updated_at: "" }; });
    spendCreditsMock.mockImplementation(async () => { order.push("spend"); return { ok: true, balance: 8 }; });
    const res = await post({ program_id: PROGRAM.id, project_id: PID, confirm: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, cost: 2, creditsCharged: 2, balance: 8, ai_ok: true, kind: "program" });
    expect(order).toEqual(["spend", "insert"]);
    expect(spendCreditsMock).toHaveBeenCalledWith("u-1", "grant_application_draft", { project_id: PID, program_id: PROGRAM.id });
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ credits_cost: 2, program_id: PROGRAM.id, grant_id: null }));
  });

  it("plan gate still applies (403 plan_required) and canAfford false → 402 before any generation", async () => {
    canMock.mockResolvedValueOnce(false);
    expect((await post({ program_id: PROGRAM.id })).status).toBe(403);
    canAffordMock.mockResolvedValueOnce({ allowed: false, balance: 0, cost: 2, reason: "insufficient_credits" });
    expect((await post({ program_id: PROGRAM.id, confirm: true })).status).toBe(402);
    expect(draftMock).not.toHaveBeenCalled();
  });

  it("AI failure → 200, empty answers stored against program_id, NOT charged; insert failure refunds with program_id meta", async () => {
    draftMock.mockResolvedValueOnce({ answers: { one_liner: "", problem: "", team: "", why_startmate: "", milestones: "" }, ai_ok: false, failed: ["one_liner", "problem", "team", "why_startmate", "milestones"], provider: null, model: null });
    const res = await post({ program_id: PROGRAM.id, confirm: true });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, ai_ok: false, creditsCharged: 0, cost: 2, kind: "program" });
    expect(spendCreditsMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ credits_cost: 0, program_id: PROGRAM.id, grant_id: null }));

    draftMock.mockResolvedValueOnce({ answers: PROGRAM_ANSWERS, ai_ok: true, failed: [], provider: "groq", model: "m" });
    insertMock.mockResolvedValueOnce(null);
    const failed = await post({ program_id: PROGRAM.id, confirm: true });
    expect(failed.status).toBe(500);
    expect(grantCreditsMock).toHaveBeenCalledWith("u-1", 2, "refund", expect.objectContaining({ feature: "grant_application_draft", program_id: PROGRAM.id }));
  });

  it("a program without seeded prompts drafts against the generic 6-question accelerator set", async () => {
    growthMock.mockResolvedValue(true);
    getProgramMock.mockResolvedValueOnce({ ...PROGRAM, application_prompts: [] });
    draftMock.mockResolvedValueOnce({ answers: { problem: "a", solution: "b", traction: "c", team: "d", why_program: "e", milestones: "f" }, ai_ok: true, failed: [], provider: "groq", model: "m" });
    const res = await post({ program_id: PROGRAM.id });
    const body = await res.json();
    expect(body.prompts.map((p: { id: string }) => p.id)).toEqual(["problem", "solution", "traction", "team", "why_program", "milestones"]);
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
