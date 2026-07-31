import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Colocated vitest for the server-only team-equity + vesting lib
// (`team_members` + `equity_events`) — the phase-5 cap-table surface
// consumed by /workspace/equity + /api/equity + /api/equity/[id].
//
// Pins the private-but-observable behaviours the founder UI depends on:
//   - calculateVesting: no-schedule fully vested, future-start / pre-cliff
//     lock, linear post-cliff fraction with day-of-month regression to
//     the previous whole month, full vest past vestingMonths, 4dp rounding
//   - mapTeamMember: null-safe defaults (email, role="founder", is_active=true),
//     equity_pct string → number coercion
//   - getTeamMembers: table + filter shape (project_id + is_active=true,
//     equity_pct DESC), null-safe on error / no admin / null data
//   - addTeamMember: 100% cap enforcement, event side-effect on success
//   - updateTeamMember: excludes self from cap total, partial dbUpdates
//     only stamp provided columns (updated_at always present)
//   - removeMember: soft-delete flip + "transfer" event log
//   - getEquitySummary: totalAllocated aggregation + 4dp unallocated,
//     events limited to 50 desc by event_date, no-admin degrades to []
//
// The fake Supabase queues per-call {data,error} shapes so multi-table
// operations (e.g. addTeamMember → team_members SELECT + team_members
// INSERT + equity_events INSERT) can each be scripted independently
// without leaking state across calls in a single test.

interface CapturedCall {
  table: string;
  selectCols: string | null;
  insertPayload: Record<string, unknown> | null;
  updatePayload: Record<string, unknown> | null;
  eqCalls: Array<{ col: string; val: unknown }>;
  orderCalls: Array<{ col: string; opts?: { ascending?: boolean } }>;
  limit: number | null;
  terminal: "single" | "maybeSingle" | "await" | null;
}

interface FakeState {
  adminConfigured: boolean;
  queue: Array<{ data?: unknown; error?: unknown }>;
  calls: CapturedCall[];
}

const state: FakeState = {
  adminConfigured: true,
  queue: [],
  calls: [],
};

function nextResponse(): { data: unknown; error: unknown } {
  const next = state.queue.shift() ?? {};
  return { data: next.data ?? null, error: next.error ?? null };
}

function makeChain(table: string) {
  const op: CapturedCall = {
    table,
    selectCols: null,
    insertPayload: null,
    updatePayload: null,
    eqCalls: [],
    orderCalls: [],
    limit: null,
    terminal: null,
  };
  state.calls.push(op);

  const chain: Record<string, unknown> = {};
  chain.select = (cols?: string) => {
    op.selectCols = cols ?? null;
    return chain;
  };
  chain.insert = (payload: Record<string, unknown>) => {
    op.insertPayload = payload;
    return chain;
  };
  chain.update = (payload: Record<string, unknown>) => {
    op.updatePayload = payload;
    return chain;
  };
  chain.eq = (col: string, val: unknown) => {
    op.eqCalls.push({ col, val });
    return chain;
  };
  chain.order = (col: string, opts?: { ascending?: boolean }) => {
    op.orderCalls.push({ col, opts });
    return chain;
  };
  chain.limit = (n: number) => {
    op.limit = n;
    return chain;
  };
  chain.single = () => {
    op.terminal = "single";
    return Promise.resolve(nextResponse());
  };
  chain.maybeSingle = () => {
    op.terminal = "maybeSingle";
    return Promise.resolve(nextResponse());
  };
  chain.then = (
    onFulfilled: (v: unknown) => unknown,
    onRejected?: (e: unknown) => unknown,
  ) => {
    op.terminal = op.terminal ?? "await";
    return Promise.resolve(nextResponse()).then(onFulfilled, onRejected);
  };
  return chain;
}

vi.mock("server-only", () => ({}));

vi.mock("./supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;
    return {
      from: (table: string) => makeChain(table),
    };
  },
}));

// Silence noisy [blockid:equity] error logs during negative-path assertions.
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  state.adminConfigured = true;
  state.queue = [];
  state.calls = [];
  errorSpy.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

function callsFor(table: string): CapturedCall[] {
  return state.calls.filter((c) => c.table === table);
}

// ---------------------------------------------------------------------------
// calculateVesting — observed via getTeamMembers row mapping
// ---------------------------------------------------------------------------

describe("equity — calculateVesting (via getTeamMembers)", () => {
  it("no vestingMonths → fully vested with 0 unvested", async () => {
    const { getTeamMembers } = await import("./equity");
    state.queue.push({
      data: [
        {
          id: "m1",
          project_id: "p1",
          name: "Ava",
          equity_pct: 20,
          vesting_months: null,
          cliff_months: null,
          vesting_start_date: "2025-01-01",
        },
      ],
    });
    const [m] = await getTeamMembers("p1");
    expect(m.vestedPct).toBe(20);
    expect(m.unvestedPct).toBe(0);
  });

  it("no vestingStartDate → fully vested (schedule cannot start)", async () => {
    const { getTeamMembers } = await import("./equity");
    state.queue.push({
      data: [
        {
          id: "m1",
          project_id: "p1",
          name: "Ben",
          equity_pct: 15,
          vesting_months: 48,
          cliff_months: 12,
          vesting_start_date: null,
        },
      ],
    });
    const [m] = await getTeamMembers("p1");
    expect(m.vestedPct).toBe(15);
    expect(m.unvestedPct).toBe(0);
  });

  it("future vestingStartDate → 0% vested, full unvested", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T00:00:00Z"));
    const { getTeamMembers } = await import("./equity");
    state.queue.push({
      data: [
        {
          id: "m1",
          project_id: "p1",
          name: "Cara",
          equity_pct: 10,
          vesting_months: 48,
          cliff_months: 12,
          vesting_start_date: "2027-06-01",
        },
      ],
    });
    const [m] = await getTeamMembers("p1");
    expect(m.vestedPct).toBe(0);
    expect(m.unvestedPct).toBe(10);
  });

  it("cliff not yet passed → 0% vested (fully unvested)", async () => {
    vi.useFakeTimers();
    // 6 months elapsed, cliff is 12
    vi.setSystemTime(new Date("2026-07-01T00:00:00Z"));
    const { getTeamMembers } = await import("./equity");
    state.queue.push({
      data: [
        {
          id: "m1",
          project_id: "p1",
          name: "Dan",
          equity_pct: 25,
          vesting_months: 48,
          cliff_months: 12,
          vesting_start_date: "2026-01-01",
        },
      ],
    });
    const [m] = await getTeamMembers("p1");
    expect(m.vestedPct).toBe(0);
    expect(m.unvestedPct).toBe(25);
  });

  it("past vestingMonths → 100% vested with 0 unvested", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2030-06-01T00:00:00Z"));
    const { getTeamMembers } = await import("./equity");
    state.queue.push({
      data: [
        {
          id: "m1",
          project_id: "p1",
          name: "Eli",
          equity_pct: 40,
          vesting_months: 48,
          cliff_months: 12,
          vesting_start_date: "2026-01-01",
        },
      ],
    });
    const [m] = await getTeamMembers("p1");
    expect(m.vestedPct).toBe(40);
    expect(m.unvestedPct).toBe(0);
  });

  it("linear vesting post-cliff — 24/48 = 50% of allocated equity", async () => {
    vi.useFakeTimers();
    // 24 months from 2026-01-15 → 2028-01-15 (exact day match, no -1)
    vi.setSystemTime(new Date("2028-01-15T00:00:00Z"));
    const { getTeamMembers } = await import("./equity");
    state.queue.push({
      data: [
        {
          id: "m1",
          project_id: "p1",
          name: "Fay",
          equity_pct: 20,
          vesting_months: 48,
          cliff_months: 12,
          vesting_start_date: "2026-01-15",
        },
      ],
    });
    const [m] = await getTeamMembers("p1");
    expect(m.vestedPct).toBe(10);
    expect(m.unvestedPct).toBe(10);
  });

  it("day-of-month before start → previous whole month (23 not 24 months)", async () => {
    vi.useFakeTimers();
    // 2028-01-14 is one day before the 15th anniversary → monthsElapsed = 23
    vi.setSystemTime(new Date("2028-01-14T00:00:00Z"));
    const { getTeamMembers } = await import("./equity");
    state.queue.push({
      data: [
        {
          id: "m1",
          project_id: "p1",
          name: "Gia",
          equity_pct: 48,
          vesting_months: 48,
          cliff_months: 12,
          vesting_start_date: "2026-01-15",
        },
      ],
    });
    const [m] = await getTeamMembers("p1");
    // 23/48 * 48 = 23 exactly, so vested=23, unvested=25
    expect(m.vestedPct).toBe(23);
    expect(m.unvestedPct).toBe(25);
  });

  it("rounds vestedPct + unvestedPct to 4 decimal places", async () => {
    vi.useFakeTimers();
    // 13 months elapsed, 48-month schedule → 13/48 fraction
    vi.setSystemTime(new Date("2027-02-01T00:00:00Z"));
    const { getTeamMembers } = await import("./equity");
    state.queue.push({
      data: [
        {
          id: "m1",
          project_id: "p1",
          name: "Hal",
          equity_pct: 25,
          vesting_months: 48,
          cliff_months: 12,
          vesting_start_date: "2026-01-01",
        },
      ],
    });
    const [m] = await getTeamMembers("p1");
    // 25 * 13/48 = 6.770833... → rounded to 4dp = 6.7708
    expect(m.vestedPct).toBe(6.7708);
    // 25 - 6.7708 = 18.2292 exactly at 4dp
    expect(m.unvestedPct).toBe(18.2292);
  });

  it("null cliff_months coerces to 0 (equity vests from month 0)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-01T00:00:00Z"));
    const { getTeamMembers } = await import("./equity");
    state.queue.push({
      data: [
        {
          id: "m1",
          project_id: "p1",
          name: "Ivy",
          equity_pct: 12,
          vesting_months: 48,
          cliff_months: null,
          vesting_start_date: "2026-01-01",
        },
      ],
    });
    const [m] = await getTeamMembers("p1");
    // 6/48 * 12 = 1.5 → 1.5 vested, 10.5 unvested
    expect(m.vestedPct).toBe(1.5);
    expect(m.unvestedPct).toBe(10.5);
  });
});

// ---------------------------------------------------------------------------
// mapTeamMember — observed via getTeamMembers
// ---------------------------------------------------------------------------

describe("equity — mapTeamMember row mapping", () => {
  it("defaults null email, role='founder', is_active=true", async () => {
    const { getTeamMembers } = await import("./equity");
    state.queue.push({
      data: [
        {
          id: "m1",
          project_id: "p1",
          name: "Ada",
          equity_pct: 5,
          // email, role, is_active all missing
        },
      ],
    });
    const [m] = await getTeamMembers("p1");
    expect(m.email).toBeNull();
    expect(m.role).toBe("founder");
    expect(m.isActive).toBe(true);
  });

  it("coerces string equity_pct to number", async () => {
    const { getTeamMembers } = await import("./equity");
    state.queue.push({
      data: [
        {
          id: "m1",
          project_id: "p1",
          name: "Bo",
          equity_pct: "33.33",
          role: "engineer",
        },
      ],
    });
    const [m] = await getTeamMembers("p1");
    expect(m.equityPct).toBe(33.33);
    expect(typeof m.equityPct).toBe("number");
  });

  it("undefined/NaN equity_pct → 0 (safe default, no cap-table corruption)", async () => {
    const { getTeamMembers } = await import("./equity");
    state.queue.push({
      data: [
        { id: "m1", project_id: "p1", name: "Cal", equity_pct: "not-a-number" },
      ],
    });
    const [m] = await getTeamMembers("p1");
    expect(m.equityPct).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getTeamMembers
// ---------------------------------------------------------------------------

describe("equity — getTeamMembers", () => {
  it("returns [] when supabase admin is not configured", async () => {
    const { getTeamMembers } = await import("./equity");
    state.adminConfigured = false;
    const rows = await getTeamMembers("p1");
    expect(rows).toEqual([]);
    expect(state.calls).toEqual([]);
  });

  it("queries team_members with project_id + is_active=true, orders by equity_pct DESC", async () => {
    const { getTeamMembers } = await import("./equity");
    state.queue.push({ data: [] });
    await getTeamMembers("proj-9");
    const [op] = callsFor("team_members");
    expect(op.selectCols).toBe("*");
    expect(op.eqCalls).toContainEqual({ col: "project_id", val: "proj-9" });
    expect(op.eqCalls).toContainEqual({ col: "is_active", val: true });
    expect(op.orderCalls).toContainEqual({
      col: "equity_pct",
      opts: { ascending: false },
    });
  });

  it("returns [] and logs when supabase errors", async () => {
    const { getTeamMembers } = await import("./equity");
    state.queue.push({ error: { message: "boom" } });
    const rows = await getTeamMembers("p1");
    expect(rows).toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      "[blockid:equity] getTeamMembers failed",
      { message: "boom" },
    );
  });

  it("returns [] when supabase yields null data with no error", async () => {
    const { getTeamMembers } = await import("./equity");
    state.queue.push({ data: null });
    const rows = await getTeamMembers("p1");
    expect(rows).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// addTeamMember
// ---------------------------------------------------------------------------

describe("equity — addTeamMember", () => {
  it("rejects with 'Database not configured' when admin is null", async () => {
    const { addTeamMember } = await import("./equity");
    state.adminConfigured = false;
    const res = await addTeamMember("p1", {
      name: "X",
      role: "founder",
      equityPct: 10,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Database not configured");
  });

  it("rejects when total allocated + new grant would exceed 100%", async () => {
    const { addTeamMember } = await import("./equity");
    // getTeamMembers → existing at 60%
    state.queue.push({
      data: [
        {
          id: "m1",
          project_id: "p1",
          name: "Existing",
          equity_pct: 60,
        },
      ],
    });
    const res = await addTeamMember("p1", {
      name: "Newbie",
      role: "engineer",
      equityPct: 50,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Total equity would exceed 100%");
    expect(res.error).toContain("60.00");
    expect(res.error).toContain("50.00");
    // No insert happened.
    expect(state.calls.find((c) => c.insertPayload !== null)).toBeUndefined();
  });

  it("returns error when insert fails", async () => {
    const { addTeamMember } = await import("./equity");
    // getTeamMembers → empty
    state.queue.push({ data: [] });
    // insert → error
    state.queue.push({ error: { message: "unique violation" } });
    const res = await addTeamMember("p1", {
      name: "X",
      role: "founder",
      equityPct: 10,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("unique violation");
    // Should NOT have inserted an equity_events row on the insert-failure path.
    expect(callsFor("equity_events")).toEqual([]);
  });

  it("returns mapped member + logs a 'grant' equity_events row on success", async () => {
    const { addTeamMember } = await import("./equity");
    state.queue.push({ data: [] }); // getTeamMembers
    state.queue.push({
      data: {
        id: "m-new",
        project_id: "p1",
        name: "Ada",
        email: "ada@example.com",
        role: "cto",
        equity_pct: 20,
        vesting_months: 48,
        cliff_months: 12,
        vesting_start_date: "2026-01-01",
        is_active: true,
      },
    }); // insert().select().single()
    state.queue.push({}); // equity_events insert await

    const res = await addTeamMember("p1", {
      name: "Ada",
      email: "ada@example.com",
      role: "cto",
      equityPct: 20,
      vestingMonths: 48,
      cliffMonths: 12,
      vestingStartDate: "2026-01-01",
    });

    expect(res.ok).toBe(true);
    expect(res.member?.id).toBe("m-new");
    expect(res.member?.equityPct).toBe(20);
    // insert payload snake_case + null-coerced optional fields
    const memberInsert = callsFor("team_members").find(
      (c) => c.insertPayload !== null,
    );
    expect(memberInsert?.insertPayload).toMatchObject({
      project_id: "p1",
      name: "Ada",
      email: "ada@example.com",
      role: "cto",
      equity_pct: 20,
      vesting_months: 48,
      cliff_months: 12,
      vesting_start_date: "2026-01-01",
    });
    // Equity event side-effect
    const eventInsert = callsFor("equity_events")[0];
    expect(eventInsert.insertPayload).toMatchObject({
      project_id: "p1",
      member_id: "m-new",
      event_type: "grant",
      equity_pct: 20,
    });
    expect(eventInsert.insertPayload?.description).toContain("Ada");
    expect(eventInsert.insertPayload?.description).toContain("cto");
  });

  it("coerces optional fields to null in the insert payload when omitted", async () => {
    const { addTeamMember } = await import("./equity");
    state.queue.push({ data: [] });
    state.queue.push({
      data: {
        id: "m2",
        project_id: "p1",
        name: "Bo",
        equity_pct: 5,
      },
    });
    state.queue.push({});
    await addTeamMember("p1", { name: "Bo", role: "advisor", equityPct: 5 });
    const memberInsert = callsFor("team_members").find(
      (c) => c.insertPayload !== null,
    );
    expect(memberInsert?.insertPayload).toMatchObject({
      email: null,
      vesting_months: null,
      cliff_months: null,
      vesting_start_date: null,
    });
  });
});

// ---------------------------------------------------------------------------
// updateTeamMember
// ---------------------------------------------------------------------------

describe("equity — updateTeamMember", () => {
  it("rejects with 'Database not configured' when admin is null", async () => {
    const { updateTeamMember } = await import("./equity");
    state.adminConfigured = false;
    const res = await updateTeamMember("m1", { equityPct: 5 });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Database not configured");
  });

  it("skips the equity-total check when equityPct is not being changed", async () => {
    const { updateTeamMember } = await import("./equity");
    // Only the final update chain fires — no fetch of current, no getTeamMembers.
    state.queue.push({}); // update
    const res = await updateTeamMember("m1", { name: "Renamed" });
    expect(res.ok).toBe(true);
    // Only one team_members call (the update), nothing else.
    expect(callsFor("team_members").length).toBe(1);
    expect(callsFor("team_members")[0].updatePayload).toMatchObject({
      name: "Renamed",
    });
  });

  it("excludes the target member from the cap total when equityPct changes", async () => {
    const { updateTeamMember } = await import("./equity");
    // 1. fetch current row for project_id
    state.queue.push({
      data: { project_id: "p1", equity_pct: 30 },
    });
    // 2. getTeamMembers — current member counts for 30, plus another at 40
    state.queue.push({
      data: [
        { id: "m1", project_id: "p1", name: "Me", equity_pct: 30 },
        { id: "m2", project_id: "p1", name: "Other", equity_pct: 40 },
      ],
    });
    // 3. update
    state.queue.push({});
    // Target changing itself from 30 → 55; total excluding self = 40; 40+55=95 → OK
    const res = await updateTeamMember("m1", { equityPct: 55 });
    expect(res.ok).toBe(true);
  });

  it("rejects when the updated equity would push the cap total > 100 (excluding self)", async () => {
    const { updateTeamMember } = await import("./equity");
    state.queue.push({
      data: { project_id: "p1", equity_pct: 30 },
    });
    state.queue.push({
      data: [
        { id: "m1", project_id: "p1", name: "Me", equity_pct: 30 },
        { id: "m2", project_id: "p1", name: "Other", equity_pct: 40 },
      ],
    });
    // Attempting to raise self to 65 → other 40 + 65 = 105 → reject
    const res = await updateTeamMember("m1", { equityPct: 65 });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Total equity would exceed 100%");
    expect(res.error).toContain("40.00");
    expect(res.error).toContain("65.00");
    // Should not have issued the UPDATE.
    expect(callsFor("team_members").some((c) => c.updatePayload !== null)).toBe(
      false,
    );
  });

  it("propagates the supabase error when the UPDATE fails", async () => {
    const { updateTeamMember } = await import("./equity");
    state.queue.push({ error: { message: "conflict" } });
    const res = await updateTeamMember("m1", { name: "Renamed" });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("conflict");
  });

  it("only stamps provided columns (plus updated_at) into the UPDATE payload", async () => {
    const { updateTeamMember } = await import("./equity");
    state.queue.push({});
    await updateTeamMember("m1", {
      role: "advisor",
      vestingMonths: 24,
      vestingStartDate: null,
    });
    const upd = callsFor("team_members")[0].updatePayload!;
    expect(Object.keys(upd).sort()).toEqual(
      ["role", "updated_at", "vesting_months", "vesting_start_date"].sort(),
    );
    expect(upd.role).toBe("advisor");
    expect(upd.vesting_months).toBe(24);
    expect(upd.vesting_start_date).toBeNull();
    expect(typeof upd.updated_at).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// removeMember
// ---------------------------------------------------------------------------

describe("equity — removeMember", () => {
  it("rejects with 'Database not configured' when admin is null", async () => {
    const { removeMember } = await import("./equity");
    state.adminConfigured = false;
    const res = await removeMember("m1");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Database not configured");
  });

  it("soft-deletes (is_active=false) and stamps updated_at", async () => {
    const { removeMember } = await import("./equity");
    // 1. fetch member for the event log
    state.queue.push({
      data: { project_id: "p1", name: "Ada", equity_pct: 10 },
    });
    // 2. update
    state.queue.push({});
    // 3. equity_events insert
    state.queue.push({});
    const res = await removeMember("m1");
    expect(res.ok).toBe(true);
    const upd = callsFor("team_members").find((c) => c.updatePayload !== null)!;
    expect(upd.updatePayload).toMatchObject({ is_active: false });
    expect(typeof upd.updatePayload?.updated_at).toBe("string");
  });

  it("logs a 'transfer' equity_events row describing the returned pool", async () => {
    const { removeMember } = await import("./equity");
    state.queue.push({
      data: { project_id: "p1", name: "Ada", equity_pct: 15 },
    });
    state.queue.push({});
    state.queue.push({});
    await removeMember("m1");
    const event = callsFor("equity_events")[0];
    expect(event.insertPayload).toMatchObject({
      project_id: "p1",
      member_id: "m1",
      event_type: "transfer",
      equity_pct: 15,
    });
    expect(event.insertPayload?.description).toContain("Ada");
    expect(event.insertPayload?.description).toContain("unallocated pool");
  });

  it("propagates the supabase error when the soft-delete UPDATE fails", async () => {
    const { removeMember } = await import("./equity");
    state.queue.push({
      data: { project_id: "p1", name: "Ada", equity_pct: 10 },
    });
    state.queue.push({ error: { message: "row locked" } });
    const res = await removeMember("m1");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("row locked");
    // Should NOT have logged an equity_events row on failure.
    expect(callsFor("equity_events")).toEqual([]);
  });

  it("does not attempt an equity_events insert when the member fetch returns null", async () => {
    const { removeMember } = await import("./equity");
    // fetch returns null (member missing)
    state.queue.push({ data: null });
    // update still succeeds
    state.queue.push({});
    const res = await removeMember("m1");
    expect(res.ok).toBe(true);
    expect(callsFor("equity_events")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getEquitySummary
// ---------------------------------------------------------------------------

describe("equity — getEquitySummary", () => {
  it("aggregates totalAllocated and computes 4dp unallocated remainder", async () => {
    const { getEquitySummary } = await import("./equity");
    // getTeamMembers
    state.queue.push({
      data: [
        { id: "m1", project_id: "p1", name: "A", equity_pct: 33.3333 },
        { id: "m2", project_id: "p1", name: "B", equity_pct: 33.3333 },
      ],
    });
    // equity_events fetch
    state.queue.push({ data: [] });
    const s = await getEquitySummary("p1");
    expect(s.totalAllocated).toBeCloseTo(66.6666, 4);
    // 100 - 66.6666 = 33.3334 (rounded to 4dp)
    expect(s.unallocated).toBe(33.3334);
    expect(s.members).toHaveLength(2);
    expect(s.events).toEqual([]);
  });

  it("loads up to 50 events ordered by event_date DESC on project_id", async () => {
    const { getEquitySummary } = await import("./equity");
    state.queue.push({ data: [] });
    state.queue.push({
      data: [
        {
          id: "e1",
          project_id: "p1",
          member_id: "m1",
          event_type: "grant",
          equity_pct: 10,
          description: "d",
          event_date: "2026-07-01",
          created_at: "2026-07-01T00:00:00Z",
        },
      ],
    });
    const s = await getEquitySummary("p1");
    const eventsCall = callsFor("equity_events")[0];
    expect(eventsCall.selectCols).toBe("*");
    expect(eventsCall.eqCalls).toContainEqual({ col: "project_id", val: "p1" });
    expect(eventsCall.orderCalls).toContainEqual({
      col: "event_date",
      opts: { ascending: false },
    });
    expect(eventsCall.limit).toBe(50);
    expect(s.events).toHaveLength(1);
    expect(s.events[0].type).toBe("grant");
    expect(s.events[0].date).toBe("2026-07-01");
  });

  it("skips the events fetch entirely and returns [] events when admin is null", async () => {
    const { getEquitySummary } = await import("./equity");
    state.adminConfigured = false;
    const s = await getEquitySummary("p1");
    expect(s.members).toEqual([]);
    expect(s.events).toEqual([]);
    expect(s.totalAllocated).toBe(0);
    expect(s.unallocated).toBe(100);
    expect(state.calls).toEqual([]);
  });

  it("returns [] events when the events fetch errors (but keeps members)", async () => {
    const { getEquitySummary } = await import("./equity");
    state.queue.push({
      data: [
        { id: "m1", project_id: "p1", name: "A", equity_pct: 10 },
      ],
    });
    state.queue.push({ error: { message: "events fetch failed" } });
    const s = await getEquitySummary("p1");
    expect(s.members).toHaveLength(1);
    expect(s.events).toEqual([]);
    expect(s.totalAllocated).toBe(10);
    expect(s.unallocated).toBe(90);
  });
});
