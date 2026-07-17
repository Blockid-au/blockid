import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared RPC spy — reassigned per-test so we can control the response and
// inspect the call args.
const rpc = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ rpc }),
}));

// Import AFTER mocks so `getSupabaseAdmin` is bound to our stub.
import { advance, loadDue } from "@/lib/conversion/lifecycle";

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  rpc.mockReset();
});

describe("loadDue", () => {
  it("returns empty array when the RPC returns null data", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const rows = await loadDue(50);
    expect(rows).toEqual([]);
    expect(rpc).toHaveBeenCalledWith("pick_lifecycle_due", { p_limit: 50 });
  });

  it("returns empty array when the RPC returns undefined data", async () => {
    rpc.mockResolvedValueOnce({ data: undefined, error: null });
    const rows = await loadDue();
    expect(rows).toEqual([]);
  });
});

describe("advance", () => {
  it("transitions day5 → day6 with a 24h next_send_at", async () => {
    rpc.mockResolvedValueOnce({ data: "day6", error: null });
    const now = new Date("2026-07-17T00:00:00.000Z");
    const next = await advance("11111111-1111-1111-1111-111111111111", "day5", now);
    expect(next).toBe("day6");
    expect(rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = rpc.mock.calls[0];
    expect(fn).toBe("advance_lifecycle");
    expect(args).toMatchObject({
      p_user: "11111111-1111-1111-1111-111111111111",
      p_from: "day5",
      p_next: "day6",
    });
    // 24h after `now`.
    expect(new Date(args.p_next_send_at).getTime()).toBe(now.getTime() + DAY_MS);
  });

  it("returns 'done' and skips the RPC when advancing from the terminal step", async () => {
    const next = await advance("22222222-2222-2222-2222-222222222222", "done");
    expect(next).toBe("done");
    expect(rpc).not.toHaveBeenCalled();
  });
});
