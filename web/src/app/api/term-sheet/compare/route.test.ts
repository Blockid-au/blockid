// Colocated tests for POST /api/term-sheet/compare (S26-B):
//   401; 400 on < 2 / > 4 / non-uuid / duplicate-collapsed ids; rows read
//   as the CALLER's own (user_id = caller) and a foreign / unknown id →
//   404 sheet_not_found; preview shows the 2-credit cost (or included for
//   Growth+) and spends nothing; confirm spends then returns the pure
//   comparison; 402 when unaffordable; spend failure → 402.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, type FakeSupabase } from "@/test/fake-supabase";
import { makeScopeState } from "@/test/project-scope-mock";
import { DEMO_ANALYSIS } from "@/lib/term-sheet/demo";

const scopeState = await vi.hoisted(async () => {
  const { makeScopeState } = await import("@/test/project-scope-mock");
  return makeScopeState();
});
vi.mock("@/lib/projects", async () => {
  const { projectsMock } = await import("@/test/project-scope-mock");
  return projectsMock(scopeState);
});
const auth = vi.hoisted(() => ({ user: { id: "user-caller", email: "caller@x.test", plan: "founder_free" } as Record<string, unknown> | null }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => auth.user }));
const db = vi.hoisted(() => ({ sb: null as FakeSupabase | null }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db.sb }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));

const credits = vi.hoisted(() => ({ canAfford: vi.fn(), spendCredits: vi.fn() }));
vi.mock("@/lib/credits", async () => {
  const real = await vi.importActual<typeof import("@/lib/credits")>("@/lib/credits");
  return { FEATURE_COSTS: real.FEATURE_COSTS, canAfford: (...a: unknown[]) => credits.canAfford(...a), spendCredits: (...a: unknown[]) => credits.spendCredits(...a) };
});
const growth = vi.hoisted(() => ({ included: false }));
vi.mock("@/lib/funding/growth-extras", () => ({ hasGrowthExtras: async () => growth.included }));

import { POST } from "./route";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const FOREIGN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const PRICED = { ...DEMO_ANALYSIS, instrumentType: "Series A" as const, keyTerms: { ...DEMO_ANALYSIS.keyTerms, preMoneyAud: 20_000_000, postMoneyAud: 25_000_000, valuationCapAud: null, discountPct: null, boardSeatsToInvestor: 1, liquidationPreference: "2x participating" } };

function seed() {
  db.sb = fakeSupabase({
    term_sheet_analyses: [
      { id: A, user_id: "user-caller", created_at: "2026-09-01T00:00:00Z", company_name: "Acme Pty Ltd", raw_text: "Drag-along 75%. Tag-along applies.", analysis_json: DEMO_ANALYSIS, result_json: DEMO_ANALYSIS },
      { id: B, user_id: "user-caller", created_at: "2026-09-02T00:00:00Z", company_name: null, raw_text: "Full ratchet anti-dilution. Founder vesting will reset.", analysis_json: PRICED, result_json: PRICED },
      { id: C, user_id: "user-caller", created_at: null, company_name: "Third Co Pty Ltd", raw_text: null, analysis_json: null, result_json: DEMO_ANALYSIS },
      { id: FOREIGN, user_id: "someone-else", created_at: null, company_name: "Not yours", raw_text: null, analysis_json: DEMO_ANALYSIS, result_json: DEMO_ANALYSIS },
    ],
  });
}

function reset() {
  Object.assign(scopeState, makeScopeState());
  auth.user = { id: "user-caller", email: "caller@x.test", plan: "founder_free" };
  seed();
  credits.canAfford.mockReset().mockResolvedValue({ allowed: true, balance: 10, cost: 2 });
  credits.spendCredits.mockReset().mockResolvedValue({ ok: true, balance: 8 });
  growth.included = false;
}

const post = (body: unknown) => POST(new Request("http://localhost/api/term-sheet/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(reset);

describe("POST /api/term-sheet/compare", () => {
  it("401 without a session; 400 on bad ids", async () => {
    auth.user = null;
    expect((await post({ ids: [A, B] })).status).toBe(401);
    reset();
    expect((await post({ ids: [A] })).status).toBe(400);
    expect((await post({ ids: [A, B, C, A, B] })).status).toBe(400);
    expect((await post({ ids: [A, "nope"] })).status).toBe(400);
    expect((await post({ ids: [A, A] })).status).toBe(400); // duplicates collapse to one
    expect((await post({})).status).toBe(400);
  });

  it("rows are the CALLER's own; a foreign or unknown id → 404 sheet_not_found", async () => {
    const res = await post({ ids: [A, FOREIGN] });
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: "sheet_not_found", missing: [FOREIGN] });
    expect(db.sb!.hasEq("term_sheet_analyses", "user_id", "user-caller")).toBe(true);
    expect(credits.canAfford).not.toHaveBeenCalled();
  });

  it("preview: 2 credits, labelled sheets, nothing spent", async () => {
    const res = await post({ ids: [A, B] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.preview).toBe(true);
    expect(body.cost).toBe(2);
    expect(body.listedCost).toBe(2);
    expect(body.included).toBe(false);
    expect(body.balance).toBe(10);
    expect(body.sheets[0].label).toMatch(/^Acme Pty Ltd \(Atlas Ventures Pty Ltd\) · 1 Sep/);
    expect(body.sheets[1].label).toMatch(/^Sheet 2 \(Atlas Ventures Pty Ltd\) · 2 Sep/);
    expect(credits.spendCredits).not.toHaveBeenCalled();
  });

  it("confirm: spends 2 credits with the sheet ids then returns the comparison (falls back to result_json)", async () => {
    const res = await post({ ids: [A, B, C], confirm: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(credits.spendCredits).toHaveBeenCalledWith("user-caller", "term_sheet_compare", { project_id: "proj-1", sheet_ids: [A, B, C] });
    expect(body.creditsCharged).toBe(2);
    expect(body.balance).toBe(8);
    expect(body.comparison.version).toBe("tsc-v1");
    expect(body.comparison.sheets.map((s: { id: string }) => s.id)).toEqual([A, B, C]);
    expect(body.comparison.rows).toHaveLength(13);
    const anti = body.comparison.rows.find((r: { key: string }) => r.key === "anti_dilution");
    expect(anti.cells[1].display).toBe("full ratchet");
    const scores = body.comparison.scores.map((s: { sheetId: string; score: number }) => [s.sheetId, s.score]);
    expect(scores.find(([id]: [string, number]) => id === A)![1]).toBeGreaterThan(scores.find(([id]: [string, number]) => id === B)![1]);
    expect(JSON.stringify(body)).not.toMatch(/NaN/);
  });

  it("Growth+ → included, cost 0, no spend", async () => {
    growth.included = true;
    const preview = await (await post({ ids: [A, B] })).json();
    expect(preview).toMatchObject({ preview: true, cost: 0, included: true });
    expect(credits.canAfford).not.toHaveBeenCalled();
    const body = await (await post({ ids: [A, B], confirm: true })).json();
    expect(body.creditsCharged).toBe(0);
    expect(body.comparison).toBeTruthy();
    expect(credits.spendCredits).not.toHaveBeenCalled();
  });

  it("402 when unaffordable; spend failure → 402", async () => {
    credits.canAfford.mockResolvedValue({ allowed: false, balance: 1, cost: 2, reason: "insufficient_credits" });
    expect((await post({ ids: [A, B] })).status).toBe(402);
    reset();
    credits.spendCredits.mockResolvedValue({ ok: false, balance: 1 });
    const res = await post({ ids: [A, B], confirm: true });
    expect(res.status).toBe(402);
    expect((await res.json()).error).toBe("credit_spend_failed");
  });
});
