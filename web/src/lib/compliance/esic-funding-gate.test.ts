// ESIC funding gate — pure-ish behaviour tests.
//
// The helper touches Supabase + analytics; we build lightweight stubs so
// the branching (fresh eligible / stale / not-eligible / missing / db
// unavailable) is testable without a real backend. Contract:
//   docs/plans/atlassian-standard-mapping-goal.md §P6_ausindustry_esic_gates.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mock the analytics emitter — @/lib/analytics/server pulls in
// `server-only` which vitest cannot resolve without an SSR shim.
vi.mock("@/lib/analytics/server", () => ({
  emitEvent: vi.fn(async () => undefined),
}));

import {
  assertESICEligibleOrWarn,
  ESIC_STALE_AFTER_DAYS,
} from "./esic-funding-gate";

// ---------------------------------------------------------------------------
// Analytics — keep it silent. The helper only imports emitEvent from
// @/lib/analytics/server; vitest's ESM boundary doesn't need a mock because
// the real emitter degrades to a no-op when SUPABASE env vars are missing
// (see server.ts). All we care about is the return payload.
// ---------------------------------------------------------------------------

interface StubRow {
  is_esic: boolean;
  assessed_at: string;
}

function makeSupabase(returnRow: StubRow | null, errorMessage?: string): SupabaseClient {
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: async () => ({
      data: returnRow,
      error: errorMessage ? { message: errorMessage } : null,
    }),
  };
  return { from: () => chain } as unknown as SupabaseClient;
}

const INPUT = { userId: "u1", projectId: "p1" };

describe("assertESICEligibleOrWarn — warn-only mode", () => {
  beforeEach(() => {
    // no-op — analytics is best-effort in this helper.
  });

  it("passes cleanly when the founder has a fresh eligible assessment", async () => {
    const sb = makeSupabase({
      is_esic: true,
      assessed_at: new Date().toISOString(),
    });
    const out = await assertESICEligibleOrWarn(sb, INPUT);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.warn).toBeUndefined();
  });

  it("returns ok+warn when NO assessment is on file", async () => {
    const sb = makeSupabase(null);
    const out = await assertESICEligibleOrWarn(sb, INPUT);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.warn?.reason).toBe("no_assessment_on_file");
      expect(out.warn?.url_to_fix).toBe("/compliance/esic");
    }
  });

  it("returns ok+warn when the assessment is stale", async () => {
    const stale = new Date(
      Date.now() - (ESIC_STALE_AFTER_DAYS + 5) * 24 * 60 * 60 * 1000,
    ).toISOString();
    const sb = makeSupabase({ is_esic: true, assessed_at: stale });
    const out = await assertESICEligibleOrWarn(sb, INPUT);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.warn?.reason).toBe("assessment_stale");
  });

  it("returns ok+warn when the latest assessment says NOT eligible", async () => {
    const sb = makeSupabase({
      is_esic: false,
      assessed_at: new Date().toISOString(),
    });
    const out = await assertESICEligibleOrWarn(sb, INPUT);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.warn?.reason).toBe("not_esic_eligible");
  });

  it("returns ok+warn when Supabase is unavailable", async () => {
    const out = await assertESICEligibleOrWarn(null, INPUT);
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.warn?.reason).toBe("db_unavailable");
  });
});

describe("assertESICEligibleOrWarn — blocking mode (wholesale-only)", () => {
  it("blocks with reason=no_assessment_on_file when nothing on file", async () => {
    const sb = makeSupabase(null);
    const out = await assertESICEligibleOrWarn(sb, {
      ...INPUT,
      requireEligible: true,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("no_assessment_on_file");
      expect(out.url_to_fix).toBe("/compliance/esic");
    }
  });

  it("blocks with reason=not_esic_eligible when latest row says false", async () => {
    const sb = makeSupabase({
      is_esic: false,
      assessed_at: new Date().toISOString(),
    });
    const out = await assertESICEligibleOrWarn(sb, {
      ...INPUT,
      requireEligible: true,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("not_esic_eligible");
  });

  it("blocks with reason=assessment_stale when the row is stale", async () => {
    const stale = new Date(
      Date.now() - (ESIC_STALE_AFTER_DAYS + 1) * 24 * 60 * 60 * 1000,
    ).toISOString();
    const sb = makeSupabase({ is_esic: true, assessed_at: stale });
    const out = await assertESICEligibleOrWarn(sb, {
      ...INPUT,
      requireEligible: true,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("assessment_stale");
  });

  it("blocks with reason=db_unavailable when Supabase is null", async () => {
    const out = await assertESICEligibleOrWarn(null, {
      ...INPUT,
      requireEligible: true,
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("db_unavailable");
  });

  it("passes cleanly with a fresh eligible row", async () => {
    const sb = makeSupabase({
      is_esic: true,
      assessed_at: new Date().toISOString(),
    });
    const out = await assertESICEligibleOrWarn(sb, {
      ...INPUT,
      requireEligible: true,
    });
    expect(out.ok).toBe(true);
  });
});
