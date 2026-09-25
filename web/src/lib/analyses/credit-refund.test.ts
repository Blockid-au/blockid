// AF04 — refunds for /analyze runs paid with credits. Drives the module with a
// fake Supabase client: the charge is found by analysis id, refunded once,
// and a second pass (a prior refund exists) refunds nothing.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const grantMock = vi.fn(async () => ({ ok: true, balance: 10 }));
vi.mock("@/lib/credits", () => ({ grantCredits: (...a: unknown[]) => grantMock(...(a as [])) }));

type Rows = Record<string, unknown[]>;
const state: { rows: Rows; filters: Array<[string, string, unknown]> } = { rows: {}, filters: [] };
function fakeClient() {
  return {
    from(table: string) {
      const q = {
        select: () => q,
        eq: (col: string, val: unknown) => {
          state.filters.push([table, col, val]);
          return q;
        },
        limit: async () => ({ data: state.rows[table] ?? [], error: null }),
      };
      return q;
    },
  };
}
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => fakeClient() }));

import { refundIntakeCreditsForFailedAnalysis, INTAKE_REFUND_REASON } from "./credit-refund";

beforeEach(() => {
  grantMock.mockClear();
  state.rows = {};
  state.filters = [];
});

describe("refundIntakeCreditsForFailedAnalysis", () => {
  it("refunds the exact charge tagged with the analysis id", async () => {
    state.rows.usage_logs = [{ user_id: "u1", credits_used: 3 }];
    expect(await refundIntakeCreditsForFailedAnalysis("a-1")).toBe(3);
    expect(grantMock).toHaveBeenCalledWith("u1", 3, INTAKE_REFUND_REASON, { analysis_id: "a-1", feature: "trust_report" });
    expect(state.filters).toContainEqual(["usage_logs", "metadata->>analysis_id", "a-1"]);
    expect(state.filters).toContainEqual(["usage_logs", "metadata->>channel", "analyze_intake"]);
  });

  it("no charge (a free or entitled run) → refunds nothing", async () => {
    expect(await refundIntakeCreditsForFailedAnalysis("a-2")).toBe(0);
    expect(grantMock).not.toHaveBeenCalled();
  });

  it("is idempotent: an existing refund for the analysis means no second refund", async () => {
    state.rows.usage_logs = [{ user_id: "u1", credits_used: 3 }];
    state.rows.credit_transactions = [{ id: "tx-1" }];
    expect(await refundIntakeCreditsForFailedAnalysis("a-1")).toBe(0);
    expect(grantMock).not.toHaveBeenCalled();
  });
});
