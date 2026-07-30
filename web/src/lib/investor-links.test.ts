import { describe, it, expect, vi, beforeEach } from "vitest";

// Colocated vitest for the server-only per-investor View-Link helpers
// (P5 investor-readiness surface). Pins the DB chain shapes, the
// scoreId ownership + case-insensitive email match, the notification
// debounce window, and the two lookup-by helpers (token / slug).
//
// Backs migration 0069 investor_links + investor_link_views and the
// /investor/[token] route that a founder shares with a named investor.

type Row = Record<string, unknown> | null;
type Rows = Row[] | null;

interface Captured {
  from: string | null;
  selectCols: string | null;
  eqCalls: Array<{ col: string; val: unknown }>;
  gteCalls: Array<{ col: string; val: unknown }>;
  inCall: { col: string; vals: unknown[] } | null;
  orClause: string | null;
  orderCalls: Array<{ col: string; opts?: { ascending: boolean } }>;
  limitCall: number | null;
  insertPayload: Record<string, unknown> | null;
  updatePayload: Record<string, unknown> | null;
}

interface FakeState {
  adminConfigured: boolean;
  // Per-table result handlers — each returns the { data, error } for a
  // terminal call (maybeSingle / single / limit / order-tail / update).
  singleResult: { data: Row; error: unknown } | null;
  maybeSingleResult: { data: Row; error: unknown } | null;
  limitResult: { data: Rows; error: unknown } | null;
  orderResult: { data: Rows; error: unknown } | null;
  insertResult: { data: Row; error: unknown } | null;
  updateResult: { error: unknown } | null;
  // insertRawResult is what the non-.select() insert path returns
  insertRawResult: { error: unknown } | null;
  captured: Captured;
}

const state: FakeState = {
  adminConfigured: true,
  singleResult: null,
  maybeSingleResult: null,
  limitResult: null,
  orderResult: null,
  insertResult: null,
  updateResult: null,
  insertRawResult: null,
  captured: freshCaptured(),
};

function freshCaptured(): Captured {
  return {
    from: null,
    selectCols: null,
    eqCalls: [],
    gteCalls: [],
    inCall: null,
    orClause: null,
    orderCalls: [],
    limitCall: null,
    insertPayload: null,
    updatePayload: null,
  };
}

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => state.adminConfigured,
  getSupabaseAdmin: () => {
    if (!state.adminConfigured) return null;

    // A shared chain object — every filter/order method returns `chain` so
    // repeated .eq().eq().gte() calls all land on the same captured state.
    // Terminal methods (maybeSingle/single/limit) resolve via `state.*Result`.
    const chain: Record<string, unknown> = {};
    chain.eq = (col: string, val: unknown) => {
      state.captured.eqCalls.push({ col, val });
      return chain;
    };
    chain.gte = (col: string, val: unknown) => {
      state.captured.gteCalls.push({ col, val });
      return chain;
    };
    chain.in = (col: string, vals: unknown[]) => {
      state.captured.inCall = { col, vals };
      return chain;
    };
    chain.or = (clause: string) => {
      state.captured.orClause = clause;
      return chain;
    };
    chain.order = (col: string, opts?: { ascending: boolean }) => {
      state.captured.orderCalls.push({ col, opts });
      // For queries that end with .order(...) (no further chain), returning
      // a Promise-like via `then` lets callers `await` the order directly.
      const promise = Promise.resolve(state.orderResult ?? { data: [], error: null });
      // Preserve chainability for `.order().limit()` too.
      return Object.assign(chain, {
        then: promise.then.bind(promise),
        catch: promise.catch.bind(promise),
      });
    };
    chain.limit = (n: number) => {
      state.captured.limitCall = n;
      return Promise.resolve(state.limitResult ?? { data: [], error: null });
    };
    chain.maybeSingle = () =>
      Promise.resolve(state.maybeSingleResult ?? { data: null, error: null });
    chain.single = () =>
      Promise.resolve(state.singleResult ?? { data: null, error: null });

    return {
      from(table: string) {
        state.captured.from = table;
        return {
          select(cols: string) {
            state.captured.selectCols = cols;
            return chain;
          },
          insert(payload: Record<string, unknown>) {
            state.captured.insertPayload = payload;
            return {
              select(_cols: string) {
                return {
                  single: () =>
                    Promise.resolve(state.insertResult ?? { data: null, error: null }),
                };
              },
              // Bare insert (no .select()) — recordInvestorLinkView path.
              then: (
                resolve: (v: { error: unknown }) => unknown,
              ) => resolve(state.insertRawResult ?? { error: null }),
            };
          },
          update(payload: Record<string, unknown>) {
            state.captured.updatePayload = payload;
            return {
              eq(col: string, val: unknown) {
                state.captured.eqCalls.push({ col, val });
                return Promise.resolve(state.updateResult ?? { error: null });
              },
            };
          },
        };
      },
    };
  },
}));

vi.mock("@/lib/slug", () => ({
  newInvestorToken: () => "tok-FIXED",
}));

import {
  createInvestorLink,
  getInvestorLink,
  listInvestorLinksForScore,
  listInvestorLinkViews,
  listInvestorLinkViewsForScore,
  recordInvestorLinkView,
  investorLabel,
  isInvestorLinkActive,
  listInvestorLinksForFounder,
  revokeInvestorLink,
  getInvestorLinkBySlug,
  configured,
  type InvestorLink,
} from "./investor-links";

function seedLink(overrides: Partial<InvestorLink> = {}): InvestorLink {
  return {
    token: "tok-1",
    slug: null,
    scoreId: "score-1",
    founderUserId: null,
    investorEmail: null,
    investorName: null,
    fundName: null,
    note: null,
    createdByEmail: "founder@example.com",
    createdAt: "2026-07-30T00:00:00.000Z",
    expiresAt: null,
    revokedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  state.adminConfigured = true;
  state.singleResult = null;
  state.maybeSingleResult = null;
  state.limitResult = null;
  state.orderResult = null;
  state.insertResult = null;
  state.updateResult = null;
  state.insertRawResult = null;
  state.captured = freshCaptured();
});

// ---------------------------------------------------------------------------
// Pure helpers — no DB touch, no mocks required beyond the top-level shim.
// ---------------------------------------------------------------------------
describe("investorLabel", () => {
  it("combines name + fund when both present", () => {
    expect(
      investorLabel(seedLink({ investorName: "Ada", fundName: "AtlasVC" })),
    ).toBe("Ada (AtlasVC)");
  });
  it("uses fund alone when name is missing", () => {
    expect(investorLabel(seedLink({ fundName: "AtlasVC" }))).toBe("AtlasVC");
  });
  it("uses name alone when fund is missing", () => {
    expect(investorLabel(seedLink({ investorName: "Ada" }))).toBe("Ada");
  });
  it("falls back to email when name+fund are both absent", () => {
    expect(investorLabel(seedLink({ investorEmail: "ada@vc.com" }))).toBe(
      "ada@vc.com",
    );
  });
  it("returns the generic 'an investor' when every identifier is null", () => {
    expect(investorLabel(seedLink())).toBe("an investor");
  });
});

describe("isInvestorLinkActive", () => {
  it("returns false when the link is revoked", () => {
    expect(
      isInvestorLinkActive(seedLink({ revokedAt: "2026-07-01T00:00:00Z" })),
    ).toBe(false);
  });
  it("returns false when expires_at has already passed", () => {
    expect(
      isInvestorLinkActive(seedLink({ expiresAt: "2020-01-01T00:00:00Z" })),
    ).toBe(false);
  });
  it("returns true when expires_at is in the future", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isInvestorLinkActive(seedLink({ expiresAt: future }))).toBe(true);
  });
  it("returns true when neither revoked nor expires is set", () => {
    expect(isInvestorLinkActive(seedLink())).toBe(true);
  });
});

describe("configured", () => {
  it("mirrors isSupabaseConfigured (true)", () => {
    state.adminConfigured = true;
    expect(configured()).toBe(true);
  });
  it("mirrors isSupabaseConfigured (false)", () => {
    state.adminConfigured = false;
    expect(configured()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createInvestorLink — score lookup + ownership guard + insert
// ---------------------------------------------------------------------------
describe("createInvestorLink", () => {
  const args = {
    scoreId: "score-1",
    createdByEmail: "Founder@Example.com",
  };

  it("returns not_configured when admin client is null", async () => {
    state.adminConfigured = false;
    const res = await createInvestorLink(args);
    expect(res).toEqual({ ok: false, reason: "not_configured" });
    expect(state.captured.from).toBeNull();
  });

  it("returns db_error when the score lookup errors", async () => {
    state.maybeSingleResult = { data: null, error: { message: "boom" } };
    const res = await createInvestorLink(args);
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ ok: false, reason: "db_error" });
  });

  it("returns score_not_found when the scores row is missing", async () => {
    state.maybeSingleResult = { data: null, error: null };
    const res = await createInvestorLink(args);
    expect(res).toEqual({ ok: false, reason: "score_not_found" });
  });

  it("returns score_not_found when the scores.email owner differs (case-insensitive)", async () => {
    state.maybeSingleResult = {
      data: { id: "score-1", email: "someone-else@example.com" },
      error: null,
    };
    const res = await createInvestorLink(args);
    expect(res).toEqual({ ok: false, reason: "score_not_found" });
  });

  it("passes ownership when scores.email matches ignoring case", async () => {
    state.maybeSingleResult = {
      data: { id: "score-1", email: "founder@example.com" },
      error: null,
    };
    state.insertResult = {
      data: {
        token: "tok-FIXED",
        slug: null,
        score_id: "score-1",
        founder_user_id: null,
        investor_email: null,
        investor_name: null,
        fund_name: null,
        note: null,
        created_by_email: "Founder@Example.com",
        created_at: "2026-07-30T00:00:00.000Z",
        expires_at: null,
        revoked_at: null,
      },
      error: null,
    };
    const res = await createInvestorLink(args);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.link.token).toBe("tok-FIXED");
      expect(res.link.scoreId).toBe("score-1");
    }
    // insert payload should use the generated token + score id
    expect(state.captured.insertPayload).toMatchObject({
      token: "tok-FIXED",
      score_id: "score-1",
      created_by_email: "Founder@Example.com",
      expires_at: null,
    });
  });

  it("passes ownership when scores.email is not a string (skips the strict-equal branch)", async () => {
    state.maybeSingleResult = {
      data: { id: "score-1", email: null },
      error: null,
    };
    state.insertResult = {
      data: {
        token: "tok-FIXED",
        slug: null,
        score_id: "score-1",
        founder_user_id: null,
        investor_email: null,
        investor_name: null,
        fund_name: null,
        note: null,
        created_by_email: "Founder@Example.com",
        created_at: "2026-07-30T00:00:00.000Z",
        expires_at: null,
        revoked_at: null,
      },
      error: null,
    };
    const res = await createInvestorLink(args);
    expect(res.ok).toBe(true);
  });

  it("returns db_error when the insert errors", async () => {
    state.maybeSingleResult = {
      data: { id: "score-1", email: "founder@example.com" },
      error: null,
    };
    state.insertResult = { data: null, error: { message: "insert failed" } };
    const res = await createInvestorLink(args);
    expect(res.ok).toBe(false);
    expect(res).toMatchObject({ ok: false, reason: "db_error" });
  });

  it("serialises expiresAt Date → ISO string in the insert payload", async () => {
    state.maybeSingleResult = {
      data: { id: "score-1", email: "founder@example.com" },
      error: null,
    };
    state.insertResult = {
      data: {
        token: "tok-FIXED",
        slug: null,
        score_id: "score-1",
        founder_user_id: null,
        investor_email: null,
        investor_name: null,
        fund_name: null,
        note: null,
        created_by_email: "Founder@Example.com",
        created_at: "2026-07-30T00:00:00.000Z",
        expires_at: "2027-01-01T00:00:00.000Z",
        revoked_at: null,
      },
      error: null,
    };
    const expiresAt = new Date("2027-01-01T00:00:00.000Z");
    await createInvestorLink({ ...args, expiresAt });
    expect(state.captured.insertPayload?.expires_at).toBe(
      "2027-01-01T00:00:00.000Z",
    );
  });
});

// ---------------------------------------------------------------------------
// Simple by-key / list lookups
// ---------------------------------------------------------------------------
describe("getInvestorLink", () => {
  it("returns null when admin is null", async () => {
    state.adminConfigured = false;
    expect(await getInvestorLink("tok-1")).toBeNull();
  });
  it("hits investor_links.eq(token) and maps snake_case → camelCase", async () => {
    state.maybeSingleResult = {
      data: {
        token: "tok-1",
        slug: "pretty-slug",
        score_id: "score-1",
        founder_user_id: "u-1",
        investor_email: "ada@vc.com",
        investor_name: "Ada",
        fund_name: "AtlasVC",
        note: "hi",
        created_by_email: "founder@example.com",
        created_at: "2026-07-30T00:00:00.000Z",
        expires_at: null,
        revoked_at: null,
      },
      error: null,
    };
    const res = await getInvestorLink("tok-1");
    expect(state.captured.from).toBe("investor_links");
    expect(state.captured.eqCalls).toEqual([{ col: "token", val: "tok-1" }]);
    expect(res).toEqual({
      token: "tok-1",
      slug: "pretty-slug",
      scoreId: "score-1",
      founderUserId: "u-1",
      investorEmail: "ada@vc.com",
      investorName: "Ada",
      fundName: "AtlasVC",
      note: "hi",
      createdByEmail: "founder@example.com",
      createdAt: "2026-07-30T00:00:00.000Z",
      expiresAt: null,
      revokedAt: null,
    });
  });
  it("returns null when the SELECT errors (never throws)", async () => {
    state.maybeSingleResult = { data: null, error: { message: "boom" } };
    expect(await getInvestorLink("tok-1")).toBeNull();
  });
});

describe("getInvestorLinkBySlug", () => {
  it("filters by slug column (not token)", async () => {
    state.maybeSingleResult = {
      data: {
        token: "tok-1",
        slug: "pretty",
        score_id: "score-1",
        founder_user_id: null,
        investor_email: null,
        investor_name: null,
        fund_name: null,
        note: null,
        created_by_email: "founder@example.com",
        created_at: "2026-07-30T00:00:00.000Z",
        expires_at: null,
        revoked_at: null,
      },
      error: null,
    };
    await getInvestorLinkBySlug("pretty");
    expect(state.captured.from).toBe("investor_links");
    expect(state.captured.eqCalls).toEqual([{ col: "slug", val: "pretty" }]);
  });
  it("returns null when admin is null", async () => {
    state.adminConfigured = false;
    expect(await getInvestorLinkBySlug("pretty")).toBeNull();
  });
});

describe("listInvestorLinksForScore", () => {
  it("returns [] when admin is null", async () => {
    state.adminConfigured = false;
    expect(await listInvestorLinksForScore("score-1")).toEqual([]);
  });
  it("orders by created_at desc + filters by score_id", async () => {
    state.orderResult = {
      data: [
        {
          token: "tok-a",
          slug: null,
          score_id: "score-1",
          founder_user_id: null,
          investor_email: null,
          investor_name: null,
          fund_name: null,
          note: null,
          created_by_email: "founder@example.com",
          created_at: "2026-07-30T00:00:00.000Z",
          expires_at: null,
          revoked_at: null,
        },
      ],
      error: null,
    };
    const res = await listInvestorLinksForScore("score-1");
    expect(state.captured.eqCalls).toEqual([{ col: "score_id", val: "score-1" }]);
    expect(state.captured.orderCalls).toEqual([
      { col: "created_at", opts: { ascending: false } },
    ]);
    expect(res).toHaveLength(1);
    expect(res[0].token).toBe("tok-a");
  });
  it("returns [] when the SELECT errors", async () => {
    state.orderResult = { data: null, error: { message: "boom" } };
    expect(await listInvestorLinksForScore("score-1")).toEqual([]);
  });
});

describe("listInvestorLinkViews", () => {
  it("filters by link_token, orders desc, applies the limit (default 100)", async () => {
    state.limitResult = { data: [], error: null };
    await listInvestorLinkViews("tok-1");
    expect(state.captured.from).toBe("investor_link_views");
    expect(state.captured.eqCalls).toEqual([{ col: "link_token", val: "tok-1" }]);
    expect(state.captured.orderCalls).toEqual([
      { col: "viewed_at", opts: { ascending: false } },
    ]);
    expect(state.captured.limitCall).toBe(100);
  });
  it("respects a caller-supplied limit", async () => {
    state.limitResult = { data: [], error: null };
    await listInvestorLinkViews("tok-1", 25);
    expect(state.captured.limitCall).toBe(25);
  });
  it("returns [] on error", async () => {
    state.limitResult = { data: null, error: { message: "boom" } };
    expect(await listInvestorLinkViews("tok-1")).toEqual([]);
  });
  it("maps snake_case view rows to camelCase", async () => {
    state.limitResult = {
      data: [
        {
          id: "v-1",
          link_token: "tok-1",
          score_id: "score-1",
          viewer_ip_hash: "hash-abc",
          viewer_ua: "Mozilla",
          referer: "https://ref",
          duration_ms: 1234,
          viewed_at: "2026-07-30T01:00:00.000Z",
        },
      ],
      error: null,
    };
    const res = await listInvestorLinkViews("tok-1");
    expect(res[0]).toEqual({
      id: "v-1",
      linkToken: "tok-1",
      scoreId: "score-1",
      viewerIpHash: "hash-abc",
      viewerUa: "Mozilla",
      referer: "https://ref",
      durationMs: 1234,
      viewedAt: "2026-07-30T01:00:00.000Z",
    });
  });
});

describe("listInvestorLinkViewsForScore", () => {
  it("filters by score_id (default limit 200)", async () => {
    state.limitResult = { data: [], error: null };
    await listInvestorLinkViewsForScore("score-1");
    expect(state.captured.from).toBe("investor_link_views");
    expect(state.captured.eqCalls).toEqual([{ col: "score_id", val: "score-1" }]);
    expect(state.captured.limitCall).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// recordInvestorLinkView — debounce logic + write
// ---------------------------------------------------------------------------
describe("recordInvestorLinkView", () => {
  const link = seedLink({ token: "tok-1", scoreId: "score-1" });

  it("returns recorded:false when admin is null", async () => {
    state.adminConfigured = false;
    const res = await recordInvestorLinkView({
      link,
      viewerIpHash: "hash",
      viewerUa: "ua",
      referer: null,
    });
    expect(res).toEqual({ recorded: false, shouldNotifyFounder: false });
  });

  it("skips debounce when viewerIpHash is null (always notifies)", async () => {
    state.insertRawResult = { error: null };
    const res = await recordInvestorLinkView({
      link,
      viewerIpHash: null,
      viewerUa: "ua",
      referer: null,
    });
    // No debounce lookup means no .gte call captured
    expect(state.captured.gteCalls).toHaveLength(0);
    expect(res).toEqual({ recorded: true, shouldNotifyFounder: true });
  });

  it("suppresses notification when a prior view exists inside the debounce window", async () => {
    state.limitResult = { data: [{ id: "v-prior" }], error: null };
    state.insertRawResult = { error: null };
    const res = await recordInvestorLinkView({
      link,
      viewerIpHash: "hash-abc",
      viewerUa: "ua",
      referer: null,
    });
    // Debounce query landed on investor_link_views with the 3 filters
    // (link_token + viewer_ip_hash + gte viewed_at).
    expect(state.captured.eqCalls).toEqual([
      { col: "link_token", val: "tok-1" },
      { col: "viewer_ip_hash", val: "hash-abc" },
    ]);
    expect(state.captured.gteCalls[0]?.col).toBe("viewed_at");
    expect(state.captured.limitCall).toBe(1);
    expect(res).toEqual({ recorded: true, shouldNotifyFounder: false });
  });

  it("still notifies when the debounce lookup errors (telemetry never blocks)", async () => {
    state.limitResult = { data: null, error: { message: "boom" } };
    state.insertRawResult = { error: null };
    const res = await recordInvestorLinkView({
      link,
      viewerIpHash: "hash-abc",
      viewerUa: "ua",
      referer: null,
    });
    expect(res).toEqual({ recorded: true, shouldNotifyFounder: true });
  });

  it("returns recorded:false when the view insert errors", async () => {
    state.limitResult = { data: [], error: null };
    state.insertRawResult = { error: { message: "insert failed" } };
    const res = await recordInvestorLinkView({
      link,
      viewerIpHash: "hash-abc",
      viewerUa: "ua",
      referer: null,
    });
    expect(res).toEqual({ recorded: false, shouldNotifyFounder: false });
  });

  it("writes duration_ms:null when not supplied", async () => {
    state.limitResult = { data: [], error: null };
    state.insertRawResult = { error: null };
    await recordInvestorLinkView({
      link,
      viewerIpHash: "hash-abc",
      viewerUa: "ua",
      referer: "https://ref",
    });
    expect(state.captured.insertPayload).toMatchObject({
      link_token: "tok-1",
      score_id: "score-1",
      viewer_ip_hash: "hash-abc",
      viewer_ua: "ua",
      referer: "https://ref",
      duration_ms: null,
    });
  });
});

// ---------------------------------------------------------------------------
// listInvestorLinksForFounder — dual-key match + views aggregation
// ---------------------------------------------------------------------------
describe("listInvestorLinksForFounder", () => {
  it("returns [] when admin is null", async () => {
    state.adminConfigured = false;
    expect(await listInvestorLinksForFounder("u-1", "f@x")).toEqual([]);
  });

  it("returns [] fast when the founder has no links (skips the views round-trip)", async () => {
    state.orderResult = { data: [], error: null };
    const res = await listInvestorLinksForFounder("u-1", "f@x");
    expect(res).toEqual([]);
    // Only one from() call — the second query is skipped when rows is empty.
    expect(state.captured.from).toBe("investor_links");
  });

  it("returns [] when the links query errors", async () => {
    state.orderResult = { data: null, error: { message: "boom" } };
    expect(await listInvestorLinksForFounder("u-1", "f@x")).toEqual([]);
  });

  it("passes the OR clause with both founder_user_id and created_by_email", async () => {
    state.orderResult = { data: [], error: null };
    await listInvestorLinksForFounder("u-1", "f@x");
    expect(state.captured.orClause).toBe(
      "founder_user_id.eq.u-1,created_by_email.eq.f@x",
    );
  });
});

// ---------------------------------------------------------------------------
// revokeInvestorLink — ownership guard + update
// ---------------------------------------------------------------------------
describe("revokeInvestorLink", () => {
  it("returns not_configured when admin is null", async () => {
    state.adminConfigured = false;
    const res = await revokeInvestorLink("tok-1", "u-1", "f@x");
    expect(res).toEqual({ ok: false, reason: "not_configured" });
  });

  it("returns db_error when the ownership lookup errors", async () => {
    state.maybeSingleResult = { data: null, error: { message: "boom" } };
    const res = await revokeInvestorLink("tok-1", "u-1", "f@x");
    expect(res).toMatchObject({ ok: false, reason: "db_error" });
  });

  it("returns not_found when the row is missing", async () => {
    state.maybeSingleResult = { data: null, error: null };
    const res = await revokeInvestorLink("tok-1", "u-1", "f@x");
    expect(res).toEqual({ ok: false, reason: "not_found" });
  });

  it("returns not_found when neither user id nor email match (ownership guard)", async () => {
    state.maybeSingleResult = {
      data: {
        token: "tok-1",
        founder_user_id: "other-user",
        created_by_email: "other@example.com",
        revoked_at: null,
      },
      error: null,
    };
    const res = await revokeInvestorLink("tok-1", "u-1", "f@x");
    expect(res).toEqual({ ok: false, reason: "not_found" });
  });

  it("owns-by-user-id path — updates revoked_at when founder_user_id matches", async () => {
    state.maybeSingleResult = {
      data: {
        token: "tok-1",
        founder_user_id: "u-1",
        created_by_email: "other@example.com",
        revoked_at: null,
      },
      error: null,
    };
    state.updateResult = { error: null };
    const res = await revokeInvestorLink("tok-1", "u-1", "f@x");
    expect(res).toEqual({ ok: true });
    expect(typeof state.captured.updatePayload?.revoked_at).toBe("string");
  });

  it("owns-by-email path — case-insensitive email match wins even without user id", async () => {
    state.maybeSingleResult = {
      data: {
        token: "tok-1",
        founder_user_id: null,
        created_by_email: "Founder@Example.COM",
        revoked_at: null,
      },
      error: null,
    };
    state.updateResult = { error: null };
    const res = await revokeInvestorLink("tok-1", "u-1", "founder@example.com");
    expect(res).toEqual({ ok: true });
  });

  it("returns db_error when the UPDATE errors", async () => {
    state.maybeSingleResult = {
      data: {
        token: "tok-1",
        founder_user_id: "u-1",
        created_by_email: "founder@example.com",
        revoked_at: null,
      },
      error: null,
    };
    state.updateResult = { error: { message: "update failed" } };
    const res = await revokeInvestorLink("tok-1", "u-1", "founder@example.com");
    expect(res).toMatchObject({ ok: false, reason: "db_error" });
  });
});
