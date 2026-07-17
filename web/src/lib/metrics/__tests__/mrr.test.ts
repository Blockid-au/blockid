import { describe, it, expect, vi, beforeEach } from "vitest";

// Configurable stub for getSupabaseAdmin. Each test reassigns `supabaseImpl`
// to either `null` (dev without secrets) or a fake client that returns fixed
// v_mrr_active / v_mrr_by_segment rows.
let supabaseImpl: unknown = null;

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => supabaseImpl,
}));

// Import AFTER mocks so `getSupabaseAdmin` binds to our stub.
import { getRealMrrAud } from "@/lib/metrics/mrr";

beforeEach(() => {
  supabaseImpl = null;
});

describe("getRealMrrAud", () => {
  it("returns zeros when getSupabaseAdmin is unavailable", async () => {
    supabaseImpl = null;
    const result = await getRealMrrAud();
    expect(result).toEqual({
      mrrAud: 0,
      arrAud: 0,
      activeSubs: 0,
      bySegment: [],
    });
  });

  it("converts view-shaped rows to AUD and sums across plans", async () => {
    // Fixture cents values — deliberately hand-picked so the maths is
    // obvious: 2 founder_starter (2900 x 2 = 5800), 1 founder_growth (9900),
    // 1 investor_angel (7900). Total 23,600 cents = A$236.00 MRR.
    const activeRows = [
      { plan_id: "founder_starter", active_subs: 2, mrr_cents: 5800 },
      { plan_id: "founder_growth", active_subs: 1, mrr_cents: 9900 },
      { plan_id: "investor_angel", active_subs: 1, mrr_cents: 7900 },
    ];
    const segmentRows = [
      { segment: "founder", active_subs: 3, mrr_cents: 15700 },
      { segment: "investor_angel", active_subs: 1, mrr_cents: 7900 },
    ];

    supabaseImpl = {
      from(view: string) {
        return {
          select() {
            if (view === "v_mrr_active") return Promise.resolve({ data: activeRows, error: null });
            if (view === "v_mrr_by_segment") return Promise.resolve({ data: segmentRows, error: null });
            return Promise.resolve({ data: [], error: null });
          },
        };
      },
    };

    const result = await getRealMrrAud();

    expect(result.activeSubs).toBe(4);
    expect(result.mrrAud).toBe(236);
    // 236 x 12 = 2832 ARR run-rate.
    expect(result.arrAud).toBe(2832);
    expect(result.bySegment).toEqual([
      { segment: "founder", mrrAud: 157, subs: 3 },
      { segment: "investor_angel", mrrAud: 79, subs: 1 },
    ]);
  });
});
