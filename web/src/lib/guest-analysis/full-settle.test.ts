// G35 P2-3 — a guest Full order settles when its ReportV2 job ends:
// done → delivered; terminal failure → failed + ONE "refund needed" alert.
// Compare-and-set on status = 'analyzing' (never settled twice); an analysis
// no guest order points at is a no-op.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

import { GUEST_FULL_ANALYSIS_PATH, guestFullRefundAlertText, settleGuestFullOrder, type GuestSettleDb } from "./full-settle";

type Row = Record<string, unknown>;
const ANALYSIS = "a1b2c3d4-0000-4000-8000-000000000001";
const GUEST = "11111111-2222-4333-8444-555555555555";

function fakeDb(rows: Row[], opts: { lookupError?: string; updateError?: string } = {}) {
  const updates: Array<{ patch: Row; filters: Array<[string, unknown]> }> = [];
  const lookups: Array<Array<[string, unknown]>> = [];
  const db: GuestSettleDb = {
    from: () => ({
      select: () => {
        const filters: Array<[string, unknown]> = [];
        lookups.push(filters);
        const chain = {
          eq: (c: string, v: unknown) => {
            filters.push([c, v]);
            return chain;
          },
          limit: async () => {
            if (opts.lookupError) return { data: null, error: { message: opts.lookupError } };
            const match = rows.filter((r) =>
              filters.every(([c, v]) => (c === GUEST_FULL_ANALYSIS_PATH ? (r.report_data as { fullReport?: { analysisId?: string } } | null)?.fullReport?.analysisId === v : r[c] === v)),
            );
            return { data: match, error: null };
          },
        };
        return chain as never;
      },
      update: (patch: Row) => {
        const entry = { patch, filters: [] as Array<[string, unknown]> };
        updates.push(entry);
        const chain = {
          eq: (c: string, v: unknown) => {
            entry.filters.push([c, v]);
            return chain;
          },
          select: async () => {
            if (opts.updateError) return { data: null, error: { message: opts.updateError } };
            const hit = rows.filter((r) => entry.filters.every(([c, v]) => r[c] === v));
            for (const r of hit) Object.assign(r, patch);
            return { data: hit.map((r) => ({ id: r.id })), error: null };
          },
        };
        return chain as never;
      },
    }),
  };
  return { db, updates, lookups };
}

function guestRow(over: Row = {}): Row {
  return {
    id: GUEST,
    status: "analyzing",
    paid_amount_aud_cents: 4900,
    amount_paid_aud_cents: 4900,
    stripe_session_id: "cs_test_guest",
    email: "founder@acme.com.au",
    report_data: { payg: { tier: "full" }, fullReport: { analysisId: ANALYSIS, pipeline: "tbr-v2" } },
    ...over,
  };
}

const NOW = new Date("2026-10-20T03:00:00.000Z");
let alert: ReturnType<typeof vi.fn>;
beforeEach(() => {
  alert = vi.fn(async () => true);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});

describe("settleGuestFullOrder", () => {
  it("done → delivered + delivered_at, CAS on analyzing, no alert", async () => {
    const rows = [guestRow()];
    const f = fakeDb(rows);
    expect(await settleGuestFullOrder(ANALYSIS, { status: "done" }, { db: f.db, alert, now: () => NOW })).toBe("delivered");
    expect(f.lookups[0]).toEqual([[GUEST_FULL_ANALYSIS_PATH, ANALYSIS], ["status", "analyzing"]]);
    expect(f.updates[0]).toEqual({ patch: { status: "delivered", delivered_at: NOW.toISOString() }, filters: [["id", GUEST], ["status", "analyzing"]] });
    expect(rows[0].status).toBe("delivered");
    expect(alert).not.toHaveBeenCalled();
  });

  it("terminal failure → failed + error_message and ONE refund-needed alert (no e-mail address in it)", async () => {
    const rows = [guestRow()];
    const f = fakeDb(rows);
    expect(await settleGuestFullOrder(ANALYSIS, { status: "failed", error: "engine_overloaded" }, { db: f.db, alert })).toBe("failed");
    expect(rows[0]).toMatchObject({ status: "failed", error_message: "report_job_failed: engine_overloaded" });
    expect(alert).toHaveBeenCalledTimes(1);
    const text = alert.mock.calls[0][0] as string;
    expect(text).toMatch(/refund needed/i);
    expect(text).toContain(GUEST);
    expect(text).toContain(ANALYSIS);
    expect(text).toContain("A$49.00");
    expect(text).toContain("cs_test_guest");
    expect(text).not.toContain("founder@acme.com.au");

    // A second terminal call (re-run / duplicate) finds nothing at analyzing → no second alert.
    expect(await settleGuestFullOrder(ANALYSIS, { status: "failed", error: "again" }, { db: f.db, alert })).toBe("no_order");
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it("an analysis no guest order points at (free / signed-in run) is a no-op", async () => {
    const f = fakeDb([guestRow({ report_data: { fullReport: { analysisId: "other" } } })]);
    expect(await settleGuestFullOrder(ANALYSIS, { status: "failed", error: "x" }, { db: f.db, alert })).toBe("no_order");
    expect(f.updates).toHaveLength(0);
    expect(alert).not.toHaveBeenCalled();
  });

  it("an order already settled elsewhere (CAS lost) → already_settled, no alert", async () => {
    const rows = [guestRow()];
    const f = fakeDb(rows);
    // Simulate a concurrent settle between the lookup and the update.
    const orig = f.db.from("guest_analyses").update;
    f.db.from = () => ({
      select: fakeDb(rows).db.from("x").select,
      update: (patch: Row) => {
        rows[0].status = "delivered";
        return orig(patch);
      },
    });
    expect(await settleGuestFullOrder(ANALYSIS, { status: "failed", error: "x" }, { db: f.db, alert })).toBe("already_settled");
    expect(alert).not.toHaveBeenCalled();
  });

  it("DB errors / no database / a throwing alert never throw", async () => {
    expect(await settleGuestFullOrder(ANALYSIS, { status: "done" }, { db: fakeDb([], { lookupError: "down" }).db, alert })).toBe("error");
    expect(await settleGuestFullOrder(ANALYSIS, { status: "done" }, { db: fakeDb([guestRow()], { updateError: "down" }).db, alert })).toBe("error");
    expect(await settleGuestFullOrder(ANALYSIS, { status: "done" }, { db: null, alert })).toBe("error");
    const throwing = vi.fn(async () => {
      throw new Error("telegram down");
    });
    expect(await settleGuestFullOrder(ANALYSIS, { status: "failed", error: "x" }, { db: fakeDb([guestRow()]).db, alert: throwing })).toBe("failed");
  });

  it("alert text handles a missing amount / session", () => {
    const t = guestFullRefundAlertText({ guestOrderId: GUEST, analysisId: ANALYSIS, amountCents: null, stripeSessionId: null, error: "e" });
    expect(t).toContain("amount unknown");
    expect(t).toContain("(none on the row)");
  });
});
