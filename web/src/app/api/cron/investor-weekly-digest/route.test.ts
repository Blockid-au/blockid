// Colocated vitest for GET /api/cron/investor-weekly-digest (P7 track —
// docs/plans/atlassian-standard-mapping-goal.md §P7_weekly_digest_integration).
//
// The route wires the investor-weekly digest cron shell: 30-day-active
// investor filter → watchlist rows → per-ticker latest snapshot via
// computeListings() → InvestorDigestTickerRow sort by |Δ SVI| desc → top
// 5 → buildInvestorDigest → sendEmail (or dry-run subject capture) →
// watchlist write-back of last_digest_svi + last_digest_at.
//
// Coverage priorities:
//   * kill switch (INVESTOR_DIGEST=off) and CRON_SECRET gate
//   * 503 when Supabase not configured; 500 on either supabase query fail
//   * dry_run mode surfaces per-investor {ticker_count, is_empty, subject}
//     WITHOUT sending mail or writing back to `watchlist`
//   * absolute-Δ sort: null-delta tickers sort ahead of every finite Δ,
//     the top slice is capped at TOP_N (5)
//   * opt-out via canSendEmail("weekly_reports") is honoured silently
//   * happy path emits per-investor sendEmail() + write-back for exactly
//     the emitted top-N rows (not the ignored tail)

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ── Supabase fake ────────────────────────────────────────────────────

interface InvestorRow {
  id: string;
  email: string;
  display_name: string | null;
  last_login_at: string | null;
  segment?: string;
}

interface WatchRow {
  id: string;
  account_id: string;
  ticker: string;
  slug: string | null;
  last_digest_svi: number | null;
  last_digest_stage: number | null;
  last_digest_at: string | null;
}

interface FakeState {
  investors: InvestorRow[];
  watchlist: WatchRow[];
  fail: {
    investors?: string;
    watchlist?: string;
  };
  updates: Array<{ id: string; patch: Record<string, unknown> }>;
  investorFilters: {
    segmentIn?: unknown[];
    lastLoginGte?: string;
  };
  watchlistFilters: {
    accountIdIn?: unknown[];
  };
}

const state: FakeState = {
  investors: [],
  watchlist: [],
  fail: {},
  updates: [],
  investorFilters: {},
  watchlistFilters: {},
};

function resetState() {
  state.investors = [];
  state.watchlist = [];
  state.fail = {};
  state.updates = [];
  state.investorFilters = {};
  state.watchlistFilters = {};
}

function fakeSupabase() {
  return {
    from(table: string) {
      if (table === "app_users") {
        return {
          select(_cols: string) {
            return this;
          },
          in(col: string, vals: unknown[]) {
            if (col === "segment") state.investorFilters.segmentIn = vals;
            return this;
          },
          gte(col: string, val: string) {
            if (col === "last_login_at") state.investorFilters.lastLoginGte = val;
            if (state.fail.investors) {
              return Promise.resolve({
                data: null,
                error: { message: state.fail.investors },
              });
            }
            return Promise.resolve({ data: state.investors, error: null });
          },
        };
      }
      if (table === "watchlist") {
        return {
          select(_cols: string) {
            return {
              in(col: string, vals: unknown[]) {
                if (col === "account_id") state.watchlistFilters.accountIdIn = vals;
                if (state.fail.watchlist) {
                  return Promise.resolve({
                    data: null,
                    error: { message: state.fail.watchlist },
                  });
                }
                return Promise.resolve({ data: state.watchlist, error: null });
              },
            };
          },
          update(patch: Record<string, unknown>) {
            return {
              eq(col: string, val: unknown) {
                if (col === "id") {
                  state.updates.push({ id: String(val), patch });
                }
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      throw new Error("unexpected table " + table);
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (supabaseNull ? null : fakeSupabase()),
}));

let supabaseNull = false;

// ── Email + digest mocks ─────────────────────────────────────────────

const sendEmailMock = vi.fn();
vi.mock("@/lib/email", () => ({
  sendEmail: (args: unknown) => sendEmailMock(args),
}));

interface BuildInvestorDigestInput {
  name: string;
  tickers: Array<Record<string, unknown>>;
  isEmpty: boolean;
  browseUrl: string;
  watchlistUrl: string;
  unsubscribeUrl?: string;
}

const buildInvestorDigestMock = vi.fn((input: BuildInvestorDigestInput) => ({
  subject: `Weekly digest for ${input.name} — ${input.tickers.length}${
    input.isEmpty ? " (empty)" : ""
  }`,
  html: `<p>${input.tickers.length}</p>`,
  text: `${input.tickers.length}`,
}));
vi.mock("@/lib/email/investor-digest", () => ({
  buildInvestorDigest: (input: BuildInvestorDigestInput) =>
    buildInvestorDigestMock(input),
}));

// ── Listings snapshot ───────────────────────────────────────────────

const computeListingsMock = vi.fn();
vi.mock("@/lib/startup-index-listings", () => ({
  computeListings: (args: unknown) => computeListingsMock(args),
}));

// ── Email preferences ───────────────────────────────────────────────

const canSendEmailMock = vi.fn();
const ensureEmailPreferencesMock = vi.fn();
const getUnsubscribeUrlMock = vi.fn();
vi.mock("@/lib/email-preferences", () => ({
  canSendEmail: (email: string, category: string) =>
    canSendEmailMock(email, category),
  ensureEmailPreferences: (email: string) => ensureEmailPreferencesMock(email),
  getUnsubscribeUrl: (token: string, category: string) =>
    getUnsubscribeUrlMock(token, category),
}));

import { GET } from "./route";

const SECRET = "cron-secret-test-value";

beforeEach(() => {
  resetState();
  supabaseNull = false;
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue({ ok: true });
  buildInvestorDigestMock.mockClear();
  computeListingsMock.mockReset();
  computeListingsMock.mockResolvedValue({ rows: [] });
  canSendEmailMock.mockReset();
  canSendEmailMock.mockResolvedValue(true);
  ensureEmailPreferencesMock.mockReset();
  ensureEmailPreferencesMock.mockResolvedValue("tok-abc");
  getUnsubscribeUrlMock.mockReset();
  getUnsubscribeUrlMock.mockReturnValue("https://blockid.au/unsub?t=tok-abc");
  process.env.CRON_SECRET = SECRET;
  delete process.env.INVESTOR_DIGEST;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.INVESTOR_DIGEST;
});

function makeReq(opts: { auth?: string; skipEmail?: boolean } = {}) {
  const url = new URL("http://x/api/cron/investor-weekly-digest");
  if (opts.skipEmail) url.searchParams.set("skip_email", "1");
  const headers: Record<string, string> = {};
  if (opts.auth) headers.authorization = opts.auth;
  return new Request(url.toString(), { method: "GET", headers });
}

describe("kill switch + auth gate", () => {
  it("kill switch: INVESTOR_DIGEST=off short-circuits (no supabase read)", async () => {
    process.env.INVESTOR_DIGEST = "off";
    state.investors = [
      { id: "u1", email: "u1@x", display_name: null, last_login_at: null },
    ];
    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, disabled: true });
    // gate short-circuited BEFORE the supabase read → no filters captured
    expect(state.investorFilters.segmentIn).toBeUndefined();
  });

  it("401 when CRON_SECRET is set but no auth header", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "unauthorized" });
    expect(state.investorFilters.segmentIn).toBeUndefined();
  });

  it("401 when CRON_SECRET is set and bearer is wrong", async () => {
    const res = await GET(makeReq({ auth: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  it("no CRON_SECRET set → auth gate is skipped (public cron)", async () => {
    delete process.env.CRON_SECRET;
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, investor_count: 0, emailed: 0 });
  });
});

describe("supabase wiring", () => {
  it("503 not_configured when getSupabaseAdmin returns null", async () => {
    supabaseNull = true;
    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body).toEqual({ ok: false, reason: "not_configured" });
  });

  it("500 investors_query_failed surfaces the underlying error message", async () => {
    state.fail.investors = "conn reset";
    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      reason: "investors_query_failed",
      error: "conn reset",
    });
  });

  it("500 watchlist_query_failed surfaces the underlying error message", async () => {
    state.investors = [
      { id: "u1", email: "u1@x.io", display_name: null, last_login_at: null },
    ];
    state.fail.watchlist = "table missing";
    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({
      ok: false,
      reason: "watchlist_query_failed",
      error: "table missing",
    });
  });

  it("segment filter pins ['investor_angel','investor_vc'] and a 30-day cutoff", async () => {
    state.investors = [];
    const before = Date.now();
    await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    const after = Date.now();

    expect(state.investorFilters.segmentIn).toEqual([
      "investor_angel",
      "investor_vc",
    ]);
    const cutoff = state.investorFilters.lastLoginGte;
    expect(typeof cutoff).toBe("string");
    const cutoffMs = new Date(cutoff as string).getTime();
    const expectedLo = before - 30 * 24 * 60 * 60 * 1000 - 1000;
    const expectedHi = after - 30 * 24 * 60 * 60 * 1000 + 1000;
    expect(cutoffMs).toBeGreaterThanOrEqual(expectedLo);
    expect(cutoffMs).toBeLessThanOrEqual(expectedHi);
  });

  it("no investors → 200 with investor_count=0 and no watchlist query issued", async () => {
    state.investors = [];
    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, investor_count: 0, emailed: 0 });
    expect(state.watchlistFilters.accountIdIn).toBeUndefined();
    expect(computeListingsMock).not.toHaveBeenCalled();
  });

  it("watchlist query is scoped to the returned investor ids", async () => {
    state.investors = [
      { id: "u1", email: "u1@x.io", display_name: null, last_login_at: null },
      { id: "u2", email: "u2@x.io", display_name: null, last_login_at: null },
    ];
    await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(state.watchlistFilters.accountIdIn).toEqual(["u1", "u2"]);
  });
});

describe("dry_run mode (skip_email=1)", () => {
  it("returns per-investor dry_run rows with subject + ticker_count and never calls sendEmail", async () => {
    state.investors = [
      { id: "u1", email: "u1@x.io", display_name: "Alice", last_login_at: null },
      { id: "u2", email: "u2@x.io", display_name: null, last_login_at: null },
    ];
    state.watchlist = [
      {
        id: "w1",
        account_id: "u1",
        ticker: "AAA",
        slug: "aaa",
        last_digest_svi: 40,
        last_digest_stage: 3,
        last_digest_at: null,
      },
    ];
    computeListingsMock.mockResolvedValue({
      rows: [
        {
          ticker: "AAA",
          slug: "aaa",
          svi: 47,
          sectorLabel: "SaaS",
          stageLabel: "Seed",
        },
      ],
    });

    const res = await GET(
      makeReq({ auth: `Bearer ${SECRET}`, skipEmail: true }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.investor_count).toBe(2);
    expect(body.emailed).toBe(0);
    expect(body.failures).toBe(0);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(state.updates).toEqual([]);

    const dry = body.dry_run as Array<{
      investor_id: string;
      email: string;
      ticker_count: number;
      is_empty: boolean;
      subject: string;
    }>;
    expect(dry).toHaveLength(2);
    const u1 = dry.find((r) => r.investor_id === "u1")!;
    expect(u1.email).toBe("u1@x.io");
    expect(u1.ticker_count).toBe(1);
    expect(u1.is_empty).toBe(false);
    expect(u1.subject).toMatch(/Alice/);
    const u2 = dry.find((r) => r.investor_id === "u2")!;
    expect(u2.ticker_count).toBe(0);
    expect(u2.is_empty).toBe(true);
    // display_name null → fallback to email local-part
    expect(u2.subject).toMatch(/u2/);
  });

  it("dry_run field is absent from the payload when skip_email is not set", async () => {
    state.investors = [];
    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body).not.toHaveProperty("dry_run");
  });

  it("dry-run harness output covers admin@blockid.au (P7 exit criterion)", async () => {
    state.investors = [
      {
        id: "admin-uid",
        email: "admin@blockid.au",
        display_name: "Admin",
        last_login_at: null,
      },
    ];
    const res = await GET(
      makeReq({ auth: `Bearer ${SECRET}`, skipEmail: true }),
    );
    const body = await res.json();
    expect(body.dry_run).toHaveLength(1);
    expect(body.dry_run[0].email).toBe("admin@blockid.au");
    expect(body.dry_run[0].subject).toMatch(/Admin/);
  });
});

describe("ranking + top-N slice", () => {
  it("sorts by absolute Δ SVI descending, with null-Δ (new ticker) sorting first", async () => {
    state.investors = [
      { id: "u1", email: "u1@x.io", display_name: null, last_login_at: null },
    ];
    // 6 watched tickers, of which 4 have deltas and 2 are new (null baseline)
    state.watchlist = [
      row("w1", "u1", "AAA", 40),
      row("w2", "u1", "BBB", 45),
      row("w3", "u1", "CCC", 30),
      row("w4", "u1", "DDD", null),
      row("w5", "u1", "EEE", 44),
      row("w6", "u1", "FFF", null),
    ];
    // latest — deltas: AAA +5, BBB -3, CCC +20, DDD new, EEE +1, FFF new
    computeListingsMock.mockResolvedValue({
      rows: [
        rowListing("AAA", 45),
        rowListing("BBB", 42),
        rowListing("CCC", 50),
        rowListing("DDD", 12),
        rowListing("EEE", 45),
        rowListing("FFF", 88),
      ],
    });
    await GET(makeReq({ auth: `Bearer ${SECRET}`, skipEmail: true }));

    expect(buildInvestorDigestMock).toHaveBeenCalledTimes(1);
    const call = buildInvestorDigestMock.mock.calls[0][0];
    const tickers = call.tickers as Array<{ ticker: string }>;
    // Top-5 cap enforced → EEE (|Δ|=1) drops off, all others emit
    expect(tickers).toHaveLength(5);
    // null-Δ tickers (DDD, FFF) sort ahead of every finite |Δ|
    expect(tickers[0].ticker).toMatch(/^(DDD|FFF)$/);
    expect(tickers[1].ticker).toMatch(/^(DDD|FFF)$/);
    // Next by |Δ|: CCC (20) → AAA (5) → BBB (3); EEE (1) is excluded
    expect(tickers.slice(2).map((t) => t.ticker)).toEqual(["CCC", "AAA", "BBB"]);
  });

  it("delta is Y - X rounded to 2dp; null baseline → deltaSinceLastDigest=null", async () => {
    state.investors = [
      { id: "u1", email: "u1@x.io", display_name: null, last_login_at: null },
    ];
    state.watchlist = [row("w1", "u1", "AAA", 40.123), row("w2", "u1", "BBB", null)];
    computeListingsMock.mockResolvedValue({
      rows: [rowListing("AAA", 42.999), rowListing("BBB", 55)],
    });
    await GET(makeReq({ auth: `Bearer ${SECRET}`, skipEmail: true }));

    const tickers = buildInvestorDigestMock.mock.calls[0][0].tickers as Array<{
      ticker: string;
      deltaSinceLastDigest: number | null;
    }>;
    const bbb = tickers.find((t) => t.ticker === "BBB")!;
    expect(bbb.deltaSinceLastDigest).toBeNull();
    const aaa = tickers.find((t) => t.ticker === "AAA")!;
    // 42.999 - 40.123 = 2.876 → toFixed(2) = 2.88
    expect(aaa.deltaSinceLastDigest).toBeCloseTo(2.88, 5);
  });

  it("watchlist tickers not present in latestByTicker are silently dropped", async () => {
    state.investors = [
      { id: "u1", email: "u1@x.io", display_name: null, last_login_at: null },
    ];
    state.watchlist = [row("w1", "u1", "AAA", 10), row("w2", "u1", "GHOST", 10)];
    computeListingsMock.mockResolvedValue({ rows: [rowListing("AAA", 15)] });
    await GET(makeReq({ auth: `Bearer ${SECRET}`, skipEmail: true }));

    const tickers = buildInvestorDigestMock.mock.calls[0][0].tickers as Array<{
      ticker: string;
    }>;
    expect(tickers.map((t) => t.ticker)).toEqual(["AAA"]);
  });

  it("empty watchlist → digest is built in isEmpty=true mode", async () => {
    state.investors = [
      { id: "u1", email: "u1@x.io", display_name: null, last_login_at: null },
    ];
    state.watchlist = [];
    computeListingsMock.mockResolvedValue({ rows: [] });
    await GET(makeReq({ auth: `Bearer ${SECRET}`, skipEmail: true }));
    const call = buildInvestorDigestMock.mock.calls[0][0];
    expect(call.isEmpty).toBe(true);
    expect(call.tickers).toEqual([]);
  });
});

describe("send + write-back", () => {
  it("opt-out via canSendEmail(weekly_reports)=false → no digest, no send, no update", async () => {
    state.investors = [
      { id: "u1", email: "u1@x.io", display_name: null, last_login_at: null },
    ];
    state.watchlist = [row("w1", "u1", "AAA", 40)];
    computeListingsMock.mockResolvedValue({ rows: [rowListing("AAA", 45)] });
    canSendEmailMock.mockResolvedValue(false);

    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailed).toBe(0);
    expect(body.failures).toBe(0);
    expect(canSendEmailMock).toHaveBeenCalledWith("u1@x.io", "weekly_reports");
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(buildInvestorDigestMock).not.toHaveBeenCalled();
    expect(state.updates).toEqual([]);
  });

  it("happy send → sendEmail invoked with subject/html, emailed++, watchlist row write-back for each top-N row", async () => {
    state.investors = [
      { id: "u1", email: "u1@x.io", display_name: "Alice", last_login_at: null },
    ];
    state.watchlist = [row("w1", "u1", "AAA", 40), row("w2", "u1", "BBB", 20)];
    computeListingsMock.mockResolvedValue({
      rows: [rowListing("AAA", 47), rowListing("BBB", 44)],
    });

    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailed).toBe(1);
    expect(body.failures).toBe(0);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const sendArgs = sendEmailMock.mock.calls[0][0];
    expect(sendArgs.to).toBe("u1@x.io");
    expect(sendArgs.subject).toBe("Weekly digest for Alice — 2");
    expect(sendArgs.unsubscribeUrl).toBe("https://blockid.au/unsub?t=tok-abc");

    // both watchlist rows should get updated with the latest svi + a fresh at-time
    expect(state.updates).toHaveLength(2);
    const w1 = state.updates.find((u) => u.id === "w1")!;
    expect(w1.patch.last_digest_svi).toBe(47);
    expect(typeof w1.patch.last_digest_at).toBe("string");
    const w2 = state.updates.find((u) => u.id === "w2")!;
    expect(w2.patch.last_digest_svi).toBe(44);
  });

  it("write-back is restricted to the top-N slice (tail rows are NOT written)", async () => {
    state.investors = [
      { id: "u1", email: "u1@x.io", display_name: null, last_login_at: null },
    ];
    // 6 rows all with baseline 10 → deltas are latest-10
    state.watchlist = [
      row("w1", "u1", "AAA", 10),
      row("w2", "u1", "BBB", 10),
      row("w3", "u1", "CCC", 10),
      row("w4", "u1", "DDD", 10),
      row("w5", "u1", "EEE", 10),
      row("w6", "u1", "FFF", 10),
    ];
    computeListingsMock.mockResolvedValue({
      rows: [
        rowListing("AAA", 60), // Δ 50
        rowListing("BBB", 55), // Δ 45
        rowListing("CCC", 50), // Δ 40
        rowListing("DDD", 45), // Δ 35
        rowListing("EEE", 40), // Δ 30
        rowListing("FFF", 11), // Δ 1 — should be excluded from top-5
      ],
    });
    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    expect(state.updates).toHaveLength(5);
    expect(state.updates.map((u) => u.id).sort()).toEqual([
      "w1",
      "w2",
      "w3",
      "w4",
      "w5",
    ]);
  });

  it("sendEmail returns ok:false → failures++, no write-back for that investor", async () => {
    state.investors = [
      { id: "u1", email: "u1@x.io", display_name: null, last_login_at: null },
    ];
    state.watchlist = [row("w1", "u1", "AAA", 40)];
    computeListingsMock.mockResolvedValue({ rows: [rowListing("AAA", 47)] });
    sendEmailMock.mockResolvedValue({ ok: false, error: "smtp down" });

    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailed).toBe(0);
    expect(body.failures).toBe(1);
    expect(state.updates).toEqual([]);
  });

  it("sendEmail throws → failures++ (never bubbles up as a 500)", async () => {
    state.investors = [
      { id: "u1", email: "u1@x.io", display_name: null, last_login_at: null },
    ];
    state.watchlist = [row("w1", "u1", "AAA", 40)];
    computeListingsMock.mockResolvedValue({ rows: [rowListing("AAA", 47)] });
    sendEmailMock.mockRejectedValue(new Error("network"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.failures).toBe(1);
    expect(body.emailed).toBe(0);
    expect(state.updates).toEqual([]);
    warn.mockRestore();
  });

  it("investor with a blank email is skipped entirely", async () => {
    state.investors = [
      { id: "u1", email: "", display_name: null, last_login_at: null },
      { id: "u2", email: "u2@x.io", display_name: null, last_login_at: null },
    ];
    state.watchlist = [row("w2", "u2", "AAA", 40)];
    computeListingsMock.mockResolvedValue({ rows: [rowListing("AAA", 47)] });

    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    const body = await res.json();
    expect(body.investor_count).toBe(2);
    expect(body.emailed).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0].to).toBe("u2@x.io");
  });

  it("computeListings failure → route degrades to empty market snapshot (all digests isEmpty=true, no crash)", async () => {
    state.investors = [
      { id: "u1", email: "u1@x.io", display_name: null, last_login_at: null },
    ];
    state.watchlist = [row("w1", "u1", "AAA", 40)];
    computeListingsMock.mockRejectedValue(new Error("boom"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailed).toBe(1);
    const call = buildInvestorDigestMock.mock.calls[0][0];
    expect(call.isEmpty).toBe(true);
    expect(call.tickers).toEqual([]);
    warn.mockRestore();
  });

  it("unsubscribe URL prep failure is swallowed — send still fires without an unsubscribeUrl", async () => {
    state.investors = [
      { id: "u1", email: "u1@x.io", display_name: null, last_login_at: null },
    ];
    state.watchlist = [row("w1", "u1", "AAA", 40)];
    computeListingsMock.mockResolvedValue({ rows: [rowListing("AAA", 45)] });
    ensureEmailPreferencesMock.mockRejectedValue(new Error("prefs table missing"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const res = await GET(makeReq({ auth: `Bearer ${SECRET}` }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailed).toBe(1);
    const sendArgs = sendEmailMock.mock.calls[0][0];
    expect(sendArgs.to).toBe("u1@x.io");
    expect(sendArgs.unsubscribeUrl).toBeUndefined();
    warn.mockRestore();
  });
});

// ── helpers ────────────────────────────────────────────────────────

function row(
  id: string,
  account_id: string,
  ticker: string,
  last_digest_svi: number | null,
): WatchRow {
  return {
    id,
    account_id,
    ticker,
    slug: ticker.toLowerCase(),
    last_digest_svi,
    last_digest_stage: null,
    last_digest_at: null,
  };
}

function rowListing(ticker: string, svi: number) {
  return {
    ticker,
    slug: ticker.toLowerCase(),
    svi,
    sectorLabel: "SaaS",
    stageLabel: "Seed",
  };
}
