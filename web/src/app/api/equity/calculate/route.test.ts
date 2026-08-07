// Colocated vitest for POST /api/equity/calculate — P9 ship-hardening batch.
//
// This is the pure calculation surface the workspace UI uses for interactive
// what-if modelling — no DB write, no side effects. The route dispatches on
// `action` into the T0095 engine (calculateCapTable / calculateVestingSchedule
// + generateVestingTimeline / calculateDilution / calculateESOP). Coverage pins:
//
//   - 401 when unauthenticated (engine never invoked)
//   - 400 on invalid JSON body
//   - 400 when `action` is missing
//   - 400 when `data` is missing
//   - 400 on an unknown action (error message echoes the action)
//   - calculate_cap_table: forwards plan + members verbatim into calculateCapTable
//     and returns { ok:true, rows:<engine output> }
//   - calculate_vesting: forwards the input verbatim into calculateVestingSchedule
//     and returns { ok:true, events, timeline } where timeline is the
//     generateVestingTimeline projection of events
//   - calculate_dilution: forwards { plan, round } verbatim and returns
//     { ok:true, result }
//   - calculate_esop: forwards pool + totalShares + allocatedShares
//   - calculate_esop: allocatedShares defaults to 0 when omitted (nullish coalesce)
//   - engine exceptions → 500-shape 400 with the thrown message
//   - non-Error throw → 400 with the "Calculation failed" fallback message
//   - dynamic export flag is set to "force-dynamic" (auth-gated route)

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  calculateCapTable: vi.fn(),
  calculateVestingSchedule: vi.fn(),
  calculateDilution: vi.fn(),
  calculateESOP: vi.fn(),
  generateVestingTimeline: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: () => mocks.getCurrentUser() }));
vi.mock("@/lib/equity/engine", () => ({
  calculateCapTable: (...args: unknown[]) => mocks.calculateCapTable(...args),
  calculateVestingSchedule: (...args: unknown[]) => mocks.calculateVestingSchedule(...args),
  calculateDilution: (...args: unknown[]) => mocks.calculateDilution(...args),
  calculateESOP: (...args: unknown[]) => mocks.calculateESOP(...args),
  generateVestingTimeline: (...args: unknown[]) => mocks.generateVestingTimeline(...args),
}));

import { POST, dynamic } from "./route";

const USER = { id: "user-1", email: "founder@blockid.test", plan: "free" };

function postReq(body: unknown, opts?: { badJson?: boolean }) {
  return new Request("http://x/api/equity/calculate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{not json" : JSON.stringify(body),
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUser.mockResolvedValue(USER);
  mocks.calculateCapTable.mockReturnValue([{ name: "Alice", shares: 100 }]);
  mocks.calculateVestingSchedule.mockReturnValue([
    { eventDate: "2026-01-01", sharesVested: 10, cumulativeVested: 10, isCliff: false },
  ]);
  mocks.calculateDilution.mockReturnValue({
    preMoneyValuationAud: 1_000_000,
    postMoneyValuationAud: 1_500_000,
    newSharesIssued: 500_000,
    newTotalShares: 10_500_000,
    investorOwnershipPct: 4.76,
    existingOwnershipPct: 95.24,
    pricePerShareAud: 0.1,
    optionPoolTopUpShares: 0,
  });
  mocks.calculateESOP.mockReturnValue({
    poolSizeShares: 1_000_000,
    poolSizePct: 10,
    allocatedShares: 250_000,
    unallocatedShares: 750_000,
    unallocatedPct: 75,
    schemeType: "ESS" as const,
    auTaxConcession: true,
    auTaxNote: "AU note",
  });
  mocks.generateVestingTimeline.mockReturnValue([
    { date: "2026-01-01", cumulativeVested: 10, isCliff: false },
  ]);
});

afterEach(() => { vi.clearAllMocks(); });

describe("POST /api/equity/calculate", () => {
  it("exports dynamic = 'force-dynamic' so auth is honoured per request", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("returns 401 when unauthenticated and never invokes the engine", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(postReq({ action: "calculate_cap_table", data: {} }));
    expect(res.status).toBe(401);
    expect((await json(res)).error).toBe("Authentication required");
    expect(mocks.calculateCapTable).not.toHaveBeenCalled();
    expect(mocks.calculateVestingSchedule).not.toHaveBeenCalled();
    expect(mocks.calculateDilution).not.toHaveBeenCalled();
    expect(mocks.calculateESOP).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON body", async () => {
    const res = await POST(postReq(null, { badJson: true }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("Invalid JSON");
  });

  it("returns 400 when action is missing", async () => {
    const res = await POST(postReq({ data: { foo: 1 } }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("action and data required");
  });

  it("returns 400 when data is missing", async () => {
    const res = await POST(postReq({ action: "calculate_cap_table" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("action and data required");
  });

  it("returns 400 on an unknown action and echoes the action in the message", async () => {
    const res = await POST(
      postReq({ action: "calculate_moonshot", data: { anything: true } }),
    );
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("Unknown action: calculate_moonshot");
    expect(mocks.calculateCapTable).not.toHaveBeenCalled();
  });

  describe("action=calculate_cap_table", () => {
    it("forwards plan + members verbatim to the engine and returns rows", async () => {
      const plan = { totalShares: 10_000_000, preMoneyValuation: 5_000_000 };
      const members = [
        { name: "Alice", role: "founder", sharesIssued: 4_000_000, optionsGranted: 0 },
        { name: "Bob", role: "cofounder", sharesIssued: 4_000_000, optionsGranted: 0 },
      ];
      const rows = [
        { name: "Alice", role: "founder", shareClass: "Ordinary", shares: 4_000_000, options: 0, fullyDilutedShares: 4_000_000, ownershipPct: 40, fullyDilutedPct: 50, valueAud: 2_000_000 },
      ];
      mocks.calculateCapTable.mockReturnValue(rows);
      const res = await POST(postReq({ action: "calculate_cap_table", data: { plan, members } }));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.ok).toBe(true);
      expect(body.rows).toEqual(rows);
      expect(mocks.calculateCapTable).toHaveBeenCalledTimes(1);
      expect(mocks.calculateCapTable).toHaveBeenCalledWith(plan, members);
    });
  });

  describe("action=calculate_vesting", () => {
    it("forwards input verbatim and returns { events, timeline }", async () => {
      const input = {
        totalShares: 1_000_000,
        cliffMonths: 12,
        vestMonths: 48,
        scheduleType: "monthly" as const,
        startDate: "2026-01-01",
      };
      const events = [
        { eventDate: "2027-01-01", sharesVested: 250_000, cumulativeVested: 250_000, isCliff: true },
      ];
      const timeline = [{ date: "2027-01-01", cumulativeVested: 250_000, isCliff: true }];
      mocks.calculateVestingSchedule.mockReturnValue(events);
      mocks.generateVestingTimeline.mockReturnValue(timeline);
      const res = await POST(postReq({ action: "calculate_vesting", data: input }));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.ok).toBe(true);
      expect(body.events).toEqual(events);
      expect(body.timeline).toEqual(timeline);
      expect(mocks.calculateVestingSchedule).toHaveBeenCalledWith(input);
      // Timeline is derived from the schedule result, not the input body.
      expect(mocks.generateVestingTimeline).toHaveBeenCalledWith(events);
    });

    it("still returns 200 with empty events + timeline when the engine returns []", async () => {
      mocks.calculateVestingSchedule.mockReturnValue([]);
      mocks.generateVestingTimeline.mockReturnValue([]);
      const res = await POST(postReq({
        action: "calculate_vesting",
        data: { totalShares: 0, cliffMonths: 0, vestMonths: 12, scheduleType: "monthly", startDate: "2026-01-01" },
      }));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.events).toEqual([]);
      expect(body.timeline).toEqual([]);
    });
  });

  describe("action=calculate_dilution", () => {
    it("forwards { plan, round } verbatim and returns { result }", async () => {
      const plan = { totalShares: 10_000_000 };
      const round = { raiseAmountAud: 500_000, preMoneyValuationAud: 5_000_000, optionPoolTopUpPct: 10 };
      const result = { anything: "opaque" };
      mocks.calculateDilution.mockReturnValue(result);
      const res = await POST(postReq({ action: "calculate_dilution", data: { plan, round } }));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.ok).toBe(true);
      expect(body.result).toEqual(result);
      expect(mocks.calculateDilution).toHaveBeenCalledWith(plan, round);
    });
  });

  describe("action=calculate_esop", () => {
    it("forwards pool + totalShares + allocatedShares to the engine", async () => {
      const pool = { poolSizeShares: 1_000_000, schemeType: "ESS", auTaxConcession: true };
      const res = await POST(postReq({
        action: "calculate_esop",
        data: { pool, totalShares: 10_000_000, allocatedShares: 250_000 },
      }));
      expect(res.status).toBe(200);
      const body = await json(res);
      expect(body.ok).toBe(true);
      expect(body.summary).toBeDefined();
      expect(mocks.calculateESOP).toHaveBeenCalledWith(pool, 10_000_000, 250_000);
    });

    it("defaults allocatedShares to 0 when omitted (nullish coalesce)", async () => {
      const pool = { poolSizeShares: 500_000, schemeType: "ESS", auTaxConcession: false };
      await POST(postReq({
        action: "calculate_esop",
        data: { pool, totalShares: 5_000_000 },
      }));
      expect(mocks.calculateESOP).toHaveBeenCalledWith(pool, 5_000_000, 0);
    });

    it("defaults allocatedShares to 0 when explicitly null (nullish coalesce)", async () => {
      const pool = { poolSizeShares: 100, schemeType: "ESOP", auTaxConcession: false };
      await POST(postReq({
        action: "calculate_esop",
        data: { pool, totalShares: 1_000, allocatedShares: null },
      }));
      expect(mocks.calculateESOP).toHaveBeenCalledWith(pool, 1_000, 0);
    });
  });

  describe("engine error handling", () => {
    it("returns 400 with the thrown Error message when the engine throws", async () => {
      mocks.calculateVestingSchedule.mockImplementation(() => {
        throw new Error("cliffMonths cannot exceed vestMonths");
      });
      const res = await POST(postReq({
        action: "calculate_vesting",
        data: { totalShares: 100, cliffMonths: 24, vestMonths: 12, scheduleType: "monthly", startDate: "2026-01-01" },
      }));
      expect(res.status).toBe(400);
      expect((await json(res)).error).toBe("cliffMonths cannot exceed vestMonths");
    });

    it("falls back to 'Calculation failed' when a non-Error value is thrown", async () => {
      mocks.calculateDilution.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw "string-not-error";
      });
      const res = await POST(postReq({
        action: "calculate_dilution",
        data: { plan: { totalShares: 1 }, round: { raiseAmountAud: 0, preMoneyValuationAud: 0 } },
      }));
      expect(res.status).toBe(400);
      expect((await json(res)).error).toBe("Calculation failed");
    });

    it("returns 400 when calculateESOP itself throws (surfaces engine message)", async () => {
      mocks.calculateESOP.mockImplementation(() => {
        throw new Error("bad pool");
      });
      const res = await POST(postReq({
        action: "calculate_esop",
        data: { pool: {}, totalShares: 1 },
      }));
      expect(res.status).toBe(400);
      expect((await json(res)).error).toBe("bad pool");
    });
  });
});
