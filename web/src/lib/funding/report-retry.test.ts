// Colocated vitest for lib/funding/report-retry (review 2026-09-10 #11).
//
// Pins:
//   • candidate = status paid | generating | failed AND a paid marker
//     (meta.paid_at, or stripe_session_id + meta.stripe_event_id) older than
//     10 min — never a signed-in credits/plan row, a spend_failed row, a
//     pending_payment row or a fresh payment still inside the webhook
//   • max 10 per tick, oldest first; dry run lists and touches nothing
//   • the SAME generator the webhook uses is invoked per row, and the ready
//     email goes through sendFundingReportReadyEmail (dedupe on
//     meta.email_sent_at) — guest email first, owner account email otherwise

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = { funding_reports: [], app_users: [] };
const dbRef = { present: true };

function chain(table: string) {
  const filters: Array<[string, string, unknown]> = [];
  const c: Record<string, unknown> = {};
  for (const op of ["select", "in", "order", "limit", "eq"]) {
    c[op] = (...args: unknown[]) => {
      if (op === "in" || op === "eq") filters.push([op, String(args[0]), args[1]]);
      return c;
    };
  }
  c.then = (resolve: (v: unknown) => unknown) =>
    resolve({
      data: (tables[table] ?? []).filter((r) =>
        filters.every(([op, col, v]) => (op === "in" ? (v as unknown[]).includes(r[col]) : r[col] === v)),
      ),
      error: null,
    });
  return c;
}
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (dbRef.present ? { from: (t: string) => chain(t) } : null),
}));

const { generateMock, sendMock } = vi.hoisted(() => ({ generateMock: vi.fn(), sendMock: vi.fn() }));
vi.mock("./reports", () => ({
  EMAIL_SENT_AT_KEY: "email_sent_at",
  generateAndStoreFundingReport: (id: string, opts: unknown) => generateMock(id, opts),
  sendFundingReportReadyEmail: (args: unknown) => sendMock(args),
}));

import { RETRY_MAX_PER_TICK, isRetryCandidate, paidMarkerAt, retryStuckFundingReports } from "./report-retry";

const NOW = new Date("2026-09-10T12:00:00Z");
const OLD = "2026-09-10T11:00:00Z"; // 60 min ago
const FRESH = "2026-09-10T11:55:00Z"; // 5 min ago
const REPORT = { summary: { grant_count: 2, program_count: 1 } };

function row(id: string, over: Row = {}): Row {
  return {
    id,
    user_id: null,
    guest_email: `${id}@example.com`,
    status: "failed",
    stripe_session_id: `cs_${id}`,
    meta: { paid_at: OLD, stripe_event_id: `evt_${id}` },
    access_token: `tok_${id}`,
    created_at: OLD,
    updated_at: OLD,
    ...over,
  };
}

beforeEach(() => {
  tables.funding_reports = [];
  tables.app_users = [];
  dbRef.present = true;
  generateMock.mockReset().mockResolvedValue(REPORT);
  sendMock.mockReset().mockResolvedValue("sent");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("paidMarkerAt / isRetryCandidate (pure)", () => {
  it("meta.paid_at wins; stripe_session_id + stripe_event_id fall back to created_at; nothing else is paid", () => {
    expect(paidMarkerAt({ meta: { paid_at: OLD }, stripe_session_id: null, created_at: FRESH })).toBe(OLD);
    expect(paidMarkerAt({ meta: { stripe_event_id: "evt_1" }, stripe_session_id: "cs_1", created_at: FRESH })).toBe(FRESH);
    expect(paidMarkerAt({ meta: { stripe_event_id: "evt_1" }, stripe_session_id: null, created_at: FRESH })).toBeNull();
    expect(paidMarkerAt({ meta: null, stripe_session_id: "cs_1", created_at: FRESH })).toBeNull();
    expect(paidMarkerAt({ meta: { paid_at: "junk" }, stripe_session_id: null, created_at: FRESH })).toBeNull();
  });

  it("paid / generating / failed with a paid marker ≥ 10 min old qualify; ready, pending_payment, spend_failed, fresh and unpaid do not", () => {
    for (const status of ["paid", "generating", "failed"]) expect(isRetryCandidate(row("a", { status }) as never, NOW), status).toBe(true);
    for (const status of ["ready", "pending_payment", "spend_failed"]) expect(isRetryCandidate(row("a", { status }) as never, NOW), status).toBe(false);
    expect(isRetryCandidate(row("a", { meta: { paid_at: FRESH } }) as never, NOW)).toBe(false);
    // Signed-in credits row: no Stripe session, no paid_at.
    expect(isRetryCandidate(row("a", { stripe_session_id: null, meta: {} }) as never, NOW)).toBe(false);
  });
});

describe("retryStuckFundingReports", () => {
  it("no DB → ok:false supabase_unavailable", async () => {
    dbRef.present = false;
    expect(await retryStuckFundingReports({}, { now: NOW })).toMatchObject({ ok: false, error: "supabase_unavailable" });
  });

  it("regenerates each stuck paid row with the webhook's generator and emails the guest once via the shared sender", async () => {
    tables.funding_reports = [
      row("fr_failed"),
      row("fr_paid", { status: "paid" }),
      row("fr_ready", { status: "ready" }), // filtered by the status query in prod; here the fake returns it and the pure filter must drop it
      row("fr_fresh", { meta: { paid_at: FRESH } }),
      row("fr_credits", { stripe_session_id: null, meta: {}, guest_email: null, user_id: "u-1" }),
      row("fr_owner", { guest_email: null, user_id: "u-2" }),
      row("fr_already_mailed", { meta: { paid_at: OLD, email_sent_at: OLD } }),
    ];
    tables.app_users = [{ id: "u-2", email: "owner@example.com" }];
    sendMock.mockImplementation(async (args: { reportId: string }) => (args.reportId === "fr_already_mailed" ? "already_sent" : "sent"));

    const s = await retryStuckFundingReports({}, { now: NOW });
    expect(s.ok).toBe(true);
    expect(s.candidates.map((c) => c.id)).toEqual(["fr_failed", "fr_paid", "fr_owner", "fr_already_mailed"]);
    expect(generateMock.mock.calls.map((c) => c[0])).toEqual(["fr_failed", "fr_paid", "fr_owner", "fr_already_mailed"]);
    expect(generateMock).toHaveBeenCalledWith("fr_failed", { withNarrative: true });
    expect(s.regenerated).toBe(4);
    // Guest → guest_email; owner row → app_users.email; token carried for the link.
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ reportId: "fr_failed", to: "fr_failed@example.com", accessToken: "tok_fr_failed", report: REPORT }));
    expect(sendMock).toHaveBeenCalledWith(expect.objectContaining({ reportId: "fr_owner", to: "owner@example.com" }));
    expect(s.emailed).toBe(3);
    expect(s.email_skipped).toBe(1);
    expect(s.results.find((r) => r.id === "fr_already_mailed")).toEqual({ id: "fr_already_mailed", outcome: "ready", email: "already_sent" });
  });

  it("a generator that returns null / throws is counted as failed and never emailed", async () => {
    tables.funding_reports = [row("fr_null"), row("fr_throw")];
    generateMock.mockImplementation(async (id: string) => {
      if (id === "fr_throw") throw new Error("llm down");
      return null;
    });
    const s = await retryStuckFundingReports({}, { now: NOW });
    expect(s).toMatchObject({ ok: true, regenerated: 0, failed: 2, emailed: 0 });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("caps at 10 per tick, oldest first", async () => {
    tables.funding_reports = Array.from({ length: 14 }, (_, i) =>
      row(`fr_${String(i).padStart(2, "0")}`, { created_at: `2026-09-10T0${Math.floor(i / 10)}:${String(i % 10)}0:00Z` }),
    );
    const s = await retryStuckFundingReports({}, { now: NOW });
    expect(s.candidates).toHaveLength(RETRY_MAX_PER_TICK);
    expect(s.candidates[0].id).toBe("fr_00");
    expect(generateMock).toHaveBeenCalledTimes(10);
  });

  it("dry run lists candidates, generates nothing and sends nothing", async () => {
    tables.funding_reports = [row("fr_1"), row("fr_2", { status: "generating" })];
    const s = await retryStuckFundingReports({ dryRun: true }, { now: NOW });
    expect(s).toMatchObject({ ok: true, dryRun: true, regenerated: 0, emailed: 0 });
    expect(s.candidates.map((c) => c.id)).toEqual(["fr_1", "fr_2"]);
    expect(s.results.every((r) => r.outcome === "dry")).toBe(true);
    expect(generateMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
