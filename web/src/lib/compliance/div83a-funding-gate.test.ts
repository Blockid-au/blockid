// Div 83A funding gate — mirrors the esic-funding-gate.test.ts shape.
//
// Six failure modes to pin: no active grants (pass), unchecked grants,
// stale check, unsure status, ineligible status, db unavailable. Plus
// the wholesale-only blocking-mode branch matrix. Contract:
//   docs/plans/atlassian-standard-mapping-goal.md §P6a Div 83A gate.

import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/analytics/server", () => ({
  emitEvent: vi.fn(async () => undefined),
}));

import {
  assertDiv83AEligibleOrWarn,
  DIV83A_STALE_AFTER_DAYS,
} from "./div83a-funding-gate";

interface StubRow {
  id: string;
  div83a_status: "eligible" | "ineligible" | "unsure" | null;
  div83a_last_checked_at: string | null;
}

function makeSupabase(returnRows: StubRow[] | null, errorMessage?: string): SupabaseClient {
  // The gate builds `.from(...).select().eq('user_id',...).eq('status','active').eq('project_id',...)`
  // and awaits the terminal thenable, so every intermediate must return
  // the same chain, and the chain itself must be awaitable.
  const chain: {
    select: () => typeof chain;
    eq: () => typeof chain;
    then: (
      onFulfilled: (v: { data: StubRow[] | null; error: { message: string } | null }) => unknown,
    ) => Promise<unknown>;
  } = {
    select: () => chain,
    eq: () => chain,
    then: (onFulfilled) =>
      Promise.resolve({
        data: returnRows,
        error: errorMessage ? { message: errorMessage } : null,
      }).then(onFulfilled),
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

const INPUT = { userId: "u1", projectId: "p1" };
const FRESH = new Date().toISOString();
const STALE = new Date(
  Date.now() - (DIV83A_STALE_AFTER_DAYS + 5) * 24 * 60 * 60 * 1000,
).toISOString();

describe("assertDiv83AEligibleOrWarn — warn-only mode", () => {
  it("passes cleanly when there are no active grants", async () => {
    const sb = makeSupabase([]);
    const out = await assertDiv83AEligibleOrWarn(sb, INPUT);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.warn).toBeUndefined();
  });

  it("passes cleanly when every active grant is eligible + fresh", async () => {
    const sb = makeSupabase([
      { id: "g1", div83a_status: "eligible", div83a_last_checked_at: FRESH },
      { id: "g2", div83a_status: "eligible", div83a_last_checked_at: FRESH },
    ]);
    const out = await assertDiv83AEligibleOrWarn(sb, INPUT);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.warn).toBeUndefined();
  });

  it("warns unchecked_grants when a grant has null div83a_status", async () => {
    const sb = makeSupabase([
      { id: "g1", div83a_status: null, div83a_last_checked_at: null },
    ]);
    const out = await assertDiv83AEligibleOrWarn(sb, INPUT);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.warn?.reason).toBe("unchecked_grants");
      expect(out.warn?.url_to_fix).toBe("/workspace/esop/grants");
      expect(out.warn?.message).toMatch(/never been run/);
    }
  });

  it("warns check_stale when eligible grants have a stale checked_at", async () => {
    const sb = makeSupabase([
      { id: "g1", div83a_status: "eligible", div83a_last_checked_at: STALE },
    ]);
    const out = await assertDiv83AEligibleOrWarn(sb, INPUT);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.warn?.reason).toBe("check_stale");
  });

  it("warns grants_unsure when at least one active grant is unsure", async () => {
    const sb = makeSupabase([
      { id: "g1", div83a_status: "eligible", div83a_last_checked_at: FRESH },
      { id: "g2", div83a_status: "unsure", div83a_last_checked_at: FRESH },
    ]);
    const out = await assertDiv83AEligibleOrWarn(sb, INPUT);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.warn?.reason).toBe("grants_unsure");
  });

  it("warns grants_ineligible with precedence over unchecked / stale", async () => {
    const sb = makeSupabase([
      { id: "g1", div83a_status: "ineligible", div83a_last_checked_at: FRESH },
      { id: "g2", div83a_status: null, div83a_last_checked_at: null },
      { id: "g3", div83a_status: "eligible", div83a_last_checked_at: STALE },
    ]);
    const out = await assertDiv83AEligibleOrWarn(sb, INPUT);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.warn?.reason).toBe("grants_ineligible");
      expect(out.warn?.message).toMatch(/failed the Div 83A/);
    }
  });

  it("returns ok+warn when Supabase is unavailable", async () => {
    const out = await assertDiv83AEligibleOrWarn(null, INPUT);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.warn?.reason).toBe("db_unavailable");
  });

  it("returns ok+warn when the Supabase query errors", async () => {
    const sb = makeSupabase(null, "boom");
    const out = await assertDiv83AEligibleOrWarn(sb, INPUT);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.warn?.reason).toBe("db_unavailable");
  });
});

describe("assertDiv83AEligibleOrWarn — blocking mode (wholesale-only)", () => {
  it("passes cleanly when there are no active grants", async () => {
    const sb = makeSupabase([]);
    const out = await assertDiv83AEligibleOrWarn(sb, {
      ...INPUT,
      requireEligible: true,
    });
    expect(out.ok).toBe(true);
  });

  it("passes cleanly with all-eligible + fresh grants", async () => {
    const sb = makeSupabase([
      { id: "g1", div83a_status: "eligible", div83a_last_checked_at: FRESH },
    ]);
    const out = await assertDiv83AEligibleOrWarn(sb, {
      ...INPUT,
      requireEligible: true,
    });
    expect(out.ok).toBe(true);
  });

  it("blocks with reason=grants_ineligible when any grant failed the check", async () => {
    const sb = makeSupabase([
      { id: "g1", div83a_status: "ineligible", div83a_last_checked_at: FRESH },
    ]);
    const out = await assertDiv83AEligibleOrWarn(sb, {
      ...INPUT,
      requireEligible: true,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("grants_ineligible");
      expect(out.url_to_fix).toBe("/workspace/esop/grants");
    }
  });

  it("blocks with reason=grants_unsure when any grant is unresolved", async () => {
    const sb = makeSupabase([
      { id: "g1", div83a_status: "unsure", div83a_last_checked_at: FRESH },
    ]);
    const out = await assertDiv83AEligibleOrWarn(sb, {
      ...INPUT,
      requireEligible: true,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("grants_unsure");
  });

  it("blocks with reason=unchecked_grants when a grant has never been checked", async () => {
    const sb = makeSupabase([
      { id: "g1", div83a_status: null, div83a_last_checked_at: null },
    ]);
    const out = await assertDiv83AEligibleOrWarn(sb, {
      ...INPUT,
      requireEligible: true,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("unchecked_grants");
  });

  it("blocks with reason=check_stale when the checker output is > 180 days old", async () => {
    const sb = makeSupabase([
      { id: "g1", div83a_status: "eligible", div83a_last_checked_at: STALE },
    ]);
    const out = await assertDiv83AEligibleOrWarn(sb, {
      ...INPUT,
      requireEligible: true,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("check_stale");
  });

  it("blocks with reason=db_unavailable when Supabase is null", async () => {
    const out = await assertDiv83AEligibleOrWarn(null, {
      ...INPUT,
      requireEligible: true,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("db_unavailable");
  });
});
