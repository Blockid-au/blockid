import { beforeEach, describe, expect, it, vi } from "vitest";

const dims = ["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"];
const mock = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  row: null as Record<string, unknown> | null,
  from: vi.fn(), filters: vi.fn(), update: vi.fn(), canAfford: vi.fn(), spend: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ getCurrentUser: async () => mock.user }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => ({ from: mock.from }) }));
vi.mock("@/lib/audit/api-route", () => ({ apiRoute: (_options: unknown, handler: unknown) => handler }));
vi.mock("@/lib/credits", () => ({ canAfford: mock.canAfford, spendCredits: mock.spend, FEATURE_COSTS: { dim_tre_analysis: 1 } }));
import { POST } from "./route";

function request(selected: unknown = dims) {
  return new Request("https://test.invalid/api/pitchdeck/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ pitchdeckId: "deck-1", dims: selected }) });
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.user = { id: "user-1" };
  mock.row = { id: "deck-1", user_id: "user-1", extracted_text: "New business evidence", dim_coverage: Object.fromEntries(dims.map((dim) => [dim, { level: dim === "tre" ? "missing" : "strong" }])), status: "classified" };
  mock.canAfford.mockResolvedValue({ allowed: true, balance: 10 });
  mock.spend.mockResolvedValue({ ok: true, balance: 9 });
  const query = { eq: mock.filters, maybeSingle: async () => ({ data: mock.row, error: null }) };
  mock.filters.mockReturnValue(query);
  mock.update.mockReturnValue({ eq: async () => ({ error: null }) });
  mock.from.mockReturnValue({ select: () => query, update: mock.update });
});

describe("fresh deck admission before credit debit", () => {
  it.each([1, 2, 3, 4, 5, 6, 7])("rejects %i dimensions without checking/debiting credits or changing deck state", async (count) => {
    const response = await POST(request(dims.slice(0, count)));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "full_analysis_required" });
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.canAfford).not.toHaveBeenCalled();
    expect(mock.spend).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });
  it("does not mistake duplicate dimensions for full consent", async () => {
    const response = await POST(request(Array(8).fill("tre")));
    expect(response.status).toBe(400);
    expect(mock.spend).not.toHaveBeenCalled();
  });
  it.each(["", "  \n ", null])("rejects unreadable deck content (%j) before debit", async (text) => {
    mock.row!.extracted_text = text;
    const response = await POST(request());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "empty_deck_text" });
    expect(mock.canAfford).not.toHaveBeenCalled();
    expect(mock.spend).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });
  it("reports unavailable aggregate pricing without asking for a top-up or attempting a debit", async () => {
    const response = await POST(request([...dims].reverse()));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: "analysis_pricing_unavailable" });
    expect(mock.filters).toHaveBeenCalledWith("user_id", "user-1");
    expect(mock.canAfford).not.toHaveBeenCalled();
    expect(mock.spend).not.toHaveBeenCalled();
    expect(mock.update).not.toHaveBeenCalled();
  });
  it("keeps a fully evidenced full run free", async () => {
    mock.row!.dim_coverage = Object.fromEntries(dims.map((dim) => [dim, { level: "strong" }]));
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ ok: true, creditsCharged: 0 });
    expect(mock.spend).not.toHaveBeenCalled();
  });
  it("does not debit a deck missing from the owner-scoped lookup", async () => {
    mock.row = null;
    expect((await POST(request())).status).toBe(404);
    expect(mock.filters).toHaveBeenCalledWith("user_id", "user-1");
    expect(mock.spend).not.toHaveBeenCalled();
  });
  it("rejects unauthenticated requests before lookup or debit", async () => {
    mock.user = null;
    expect((await POST(request())).status).toBe(401);
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.spend).not.toHaveBeenCalled();
  });
});
