// Unit tests for GET + POST /api/referral — P9-referral-route-test.
//
// The route is the join point for two flows:
//   1. GET  — logged-in user fetches their referral code + funnel counts
//             (pending / signed_up / converted / credits_earned) rolling up
//             the modern `referrals` table AND the legacy `referral_events`
//             + `app_users.referral_credits_earned` v1 columns.
//   2. POST — signup form calls this to record a new referral: validates
//             referralCode + email, resolves the referrer via app_users,
//             blocks self-referral, blocks duplicate referred_email, INSERTs
//             a `referrals` row with status:'signed_up', then awards the
//             referrer via grantCredits(referrer.id, REFERRAL_CREDITS,
//             "referral_bonus", { referred_email }).
//
// Silent regressions this pins against:
//   - dropping the 401 on GET and leaking every founder's funnel counts /
//     referral code out to any anonymous caller;
//   - dropping the 503 when supabase is unconfigured and letting the route
//     throw a TypeError while trying to walk `.from(...)` on `null`;
//   - dropping the getReferralCode lazy-generate 500 guard and returning
//     `link` built from a null code (`/?ref=null`);
//   - dropping the legacy v1 rollup on the GET response and shipping only
//     the modern counts — the CFO's referral funnel dashboard depends on the
//     v1 rows being counted alongside the new ones during the migration
//     window (signedUp = modern.signed_up + legacy.count);
//   - dropping the `head:true` on the count queries and pulling every
//     referrals row into the API for a signed-in user with a big funnel;
//   - dropping the POST JSON-parse guard and letting a text/plain body
//     crash the route with 500 instead of a clean 400;
//   - dropping the typeof-string guard on referralCode / email and letting
//     an object body land on the `.eq()` clause with an ambiguous value;
//   - dropping the self-referral guard and letting a founder farm credits
//     off their own signup;
//   - dropping the referred_email dedupe and letting the same email get
//     re-inserted (double-counting the referrer's converted funnel);
//   - dropping the email `.toLowerCase().trim()` normalisation and letting
//     "Founder@X.COM  " and "founder@x.com" both count as distinct referrals;
//   - dropping the 2-credit grant on the happy path (silently zero-credit
//     the referrer while still returning 200 → the CS team's referral
//     leaderboard silently freezes);
//   - dropping the `referral_bonus` reason tag on grantCredits (breaks the
//     grant ledger group-by that powers the CFO's referral-earn report).

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const getCurrentUserMock = vi.fn<
  () => Promise<{ id: string; email: string } | null>
>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const getReferralCodeMock = vi.fn<(id: string) => Promise<string | null>>();
const getReferralUrlMock = vi.fn<(code: string) => string>();
vi.mock("@/lib/referrals", () => ({
  getReferralCode: (id: string) => getReferralCodeMock(id),
  getReferralUrl: (code: string) => getReferralUrlMock(code),
}));

const grantCreditsMock = vi.fn<
  (
    userId: string,
    amount: number,
    reason: string,
    meta?: Record<string, unknown>,
  ) => Promise<unknown>
>();
vi.mock("@/lib/credits", () => ({
  grantCredits: (
    userId: string,
    amount: number,
    reason: string,
    meta?: Record<string, unknown>,
  ) => grantCreditsMock(userId, amount, reason, meta),
}));

const getSupabaseAdminMock = vi.fn<() => unknown | null>();
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => getSupabaseAdminMock(),
}));

import { GET, POST, dynamic } from "./route";

// ── Fake supabase — captures whichever chain the route walks ───────────────
interface CountQueryLog {
  table: string;
  cols: string;
  opts: { count?: string; head?: boolean } | undefined;
  eqs: Array<[string, unknown]>;
}
interface DataQueryLog {
  table: string;
  cols: string;
  eqs: Array<[string, unknown]>;
  terminator: "raw" | "single" | "maybeSingle";
}
interface InsertLog {
  table: string;
  payload: Record<string, unknown>;
}

interface FakeState {
  countLogs: CountQueryLog[];
  dataLogs: DataQueryLog[];
  insertLogs: InsertLog[];
  fromCalls: number;

  // Per-table count-query results (all use head:true) — keyed by
  // `${table}:${statusFilter ?? "*"}` so the GET's Promise.all of four
  // count queries can each be steered independently.
  counts: Record<string, number | null>;

  // Data-query results, keyed by table name (the GET only reads three
  // non-count tables: referrals(credits_awarded), app_users, referral_events).
  data: Record<string, unknown>;

  // Insert-branch error injection.
  insertError: { message: string } | null;
}

const state: FakeState = {
  countLogs: [],
  dataLogs: [],
  insertLogs: [],
  fromCalls: 0,
  counts: {},
  data: {},
  insertError: null,
};

function resetState() {
  state.countLogs = [];
  state.dataLogs = [];
  state.insertLogs = [];
  state.fromCalls = 0;
  state.counts = {
    "referrals:pending": 0,
    "referrals:signed_up": 0,
    "referrals:converted": 0,
    "referral_events:*": 0,
  };
  state.data = {
    "referrals:credits_awarded": [] as Array<{ credits_awarded: number }>,
    "app_users:referral_credits_earned":
      { referral_credits_earned: 0 } as Record<string, unknown> | null,
    // POST-branch lookups. NB: the app_users referrer lookup passes
    // `"id, email"` verbatim (with the space) — mirror it exactly so
    // key lookups don't silently miss.
    "app_users:id, email": null as { id: string; email: string } | null,
    "referrals:id": null as { id: string } | null,
  };
  state.insertError = null;
}

function makeFakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls += 1;
      return {
        select(cols: string, opts?: { count?: string; head?: boolean }) {
          // Head:true → this is a count-only query
          if (opts?.head) {
            const log: CountQueryLog = {
              table,
              cols,
              opts,
              eqs: [],
            };
            state.countLogs.push(log);
            const chain: {
              eq(col: string, val: unknown): typeof chain & PromiseLike<{ count: number | null }>;
            } = {} as never;
            const build = () => {
              const p = Promise.resolve({
                count: (() => {
                  // Route the count based on filters walked so far.
                  // For referrals table, both flavours are keyed on the
                  // 2nd eq (status filter). For referral_events, no 2nd
                  // eq is applied so key is table:*.
                  if (table === "referrals") {
                    const status = log.eqs.find((e) => e[0] === "status")?.[1];
                    return (
                      state.counts[`referrals:${status ?? "*"}`] ?? 0
                    );
                  }
                  if (table === "referral_events") {
                    return state.counts["referral_events:*"] ?? 0;
                  }
                  return 0;
                })(),
              });
              return {
                eq(col: string, val: unknown) {
                  log.eqs.push([col, val]);
                  return build();
                },
                then: (res: (v: { count: number | null }) => unknown) => p.then(res),
                catch: (rej: (e: unknown) => unknown) => p.catch(rej),
              };
            };
            return build();
          }

          // Plain select — data-returning
          const log: DataQueryLog = {
            table,
            cols,
            eqs: [],
            terminator: "raw",
          };
          state.dataLogs.push(log);
          const raw = () => ({
            eq(col: string, val: unknown) {
              log.eqs.push([col, val]);
              const rawResult = () => {
                if (table === "referrals" && cols === "credits_awarded") {
                  return Promise.resolve({
                    data: state.data["referrals:credits_awarded"],
                  });
                }
                return Promise.resolve({ data: null });
              };
              return {
                single() {
                  log.terminator = "single";
                  return Promise.resolve({
                    data: state.data[`${table}:${cols}`],
                  });
                },
                maybeSingle() {
                  log.terminator = "maybeSingle";
                  return Promise.resolve({
                    data: state.data[`${table}:${cols}`],
                  });
                },
                then: (
                  res: (v: { data: unknown }) => unknown,
                ) => rawResult().then(res),
                catch: (rej: (e: unknown) => unknown) =>
                  rawResult().catch(rej),
              };
            },
          });
          return raw();
        },
        insert(payload: Record<string, unknown>) {
          state.insertLogs.push({ table, payload });
          return Promise.resolve({ error: state.insertError });
        },
      };
    },
  };
}

function jsonReq(body: unknown): NextRequest {
  return new Request("http://localhost/api/referral", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  resetState();
  getCurrentUserMock.mockReset();
  getReferralCodeMock.mockReset();
  getReferralUrlMock.mockReset();
  grantCreditsMock.mockReset();
  getSupabaseAdminMock.mockReset();

  getCurrentUserMock.mockResolvedValue({ id: "u-1", email: "founder@x.com" });
  getReferralCodeMock.mockResolvedValue("ABC12345");
  getReferralUrlMock.mockImplementation(
    (c: string) => `https://blockid.au/?ref=${c}`,
  );
  grantCreditsMock.mockResolvedValue(undefined);
  getSupabaseAdminMock.mockReturnValue(makeFakeSupabase());
});

describe("/api/referral — dynamic export", () => {
  it('exports dynamic = "force-dynamic" so per-user GETs never prerender', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("GET — auth gate", () => {
  it("returns 401 { error:'Authentication required' } when getCurrentUser is null", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Authentication required",
    });
  });

  it("does NOT touch supabase / getReferralCode on the anonymous path", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    await GET();
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(getReferralCodeMock).not.toHaveBeenCalled();
  });
});

describe("GET — supabase not configured", () => {
  it("returns 503 { error:'Service unavailable' } when getSupabaseAdmin returns null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Service unavailable",
    });
  });

  it("does NOT walk getReferralCode when supabase is unconfigured", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    await GET();
    expect(getReferralCodeMock).not.toHaveBeenCalled();
  });
});

describe("GET — referral-code lazy-generate guard", () => {
  it("returns 500 { error:'Could not generate referral code' } when getReferralCode is null", async () => {
    getReferralCodeMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Could not generate referral code",
    });
  });

  it("passes the current user's id (not email) to getReferralCode", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-42", email: "x@y.com" });
    await GET();
    expect(getReferralCodeMock).toHaveBeenCalledWith("u-42");
  });
});

describe("GET — happy path funnel", () => {
  it("returns 200 with { ok, code, link, stats } shape", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      code: "ABC12345",
      link: "https://blockid.au/?ref=ABC12345",
      stats: expect.any(Object),
    });
  });

  it("stats.pending mirrors the count of referrals filtered by status:'pending'", async () => {
    state.counts["referrals:pending"] = 7;
    const body = await (await GET()).json();
    expect(body.stats.pending).toBe(7);
  });

  it("stats.signedUp sums modern signed_up + legacy referral_events count", async () => {
    state.counts["referrals:signed_up"] = 4;
    state.counts["referral_events:*"] = 6;
    const body = await (await GET()).json();
    expect(body.stats.signedUp).toBe(10);
  });

  it("stats.converted mirrors the count of referrals filtered by status:'converted'", async () => {
    state.counts["referrals:converted"] = 3;
    const body = await (await GET()).json();
    expect(body.stats.converted).toBe(3);
  });

  it("stats.creditsEarned sums modern credits_awarded + legacy referral_credits_earned", async () => {
    state.data["referrals:credits_awarded"] = [
      { credits_awarded: 2 },
      { credits_awarded: 5 },
      { credits_awarded: 1 },
    ];
    (state.data["app_users:referral_credits_earned"] as Record<string, unknown>) = {
      referral_credits_earned: 12,
    };
    const body = await (await GET()).json();
    expect(body.stats.creditsEarned).toBe(2 + 5 + 1 + 12);
  });

  it("coerces null count(s) to 0 so a fresh account never returns NaN / null in stats", async () => {
    state.counts["referrals:pending"] = null as unknown as number;
    state.counts["referrals:signed_up"] = null as unknown as number;
    state.counts["referrals:converted"] = null as unknown as number;
    state.counts["referral_events:*"] = null as unknown as number;
    const body = await (await GET()).json();
    expect(body.stats).toEqual({
      pending: 0,
      signedUp: 0,
      converted: 0,
      creditsEarned: 0,
    });
  });

  it("coerces a missing legacy referral_credits_earned column to 0", async () => {
    state.data["app_users:referral_credits_earned"] = null;
    const body = await (await GET()).json();
    expect(body.stats.creditsEarned).toBe(0);
  });

  it("returns creditsEarned=0 when the modern credits_awarded query returns null data", async () => {
    state.data["referrals:credits_awarded"] = null;
    state.data["app_users:referral_credits_earned"] = null;
    const body = await (await GET()).json();
    expect(body.stats.creditsEarned).toBe(0);
  });

  it("issues exactly four head:true count queries + two data-only reads per GET", async () => {
    await GET();
    expect(state.countLogs).toHaveLength(4);
    for (const c of state.countLogs) {
      expect(c.opts).toMatchObject({ count: "exact", head: true });
      expect(c.cols).toBe("id");
    }
    expect(
      state.dataLogs.filter(
        (d) => d.table === "referrals" && d.cols === "credits_awarded",
      ),
    ).toHaveLength(1);
    expect(
      state.dataLogs.filter(
        (d) => d.table === "app_users" && d.cols === "referral_credits_earned",
      ),
    ).toHaveLength(1);
  });

  it("scopes every count query to the current user via referrer_id = user.id", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-77", email: "x@y.com" });
    await GET();
    for (const c of state.countLogs) {
      expect(c.eqs.find((e) => e[0] === "referrer_id")?.[1]).toBe("u-77");
    }
  });

  it("filters referrals count queries by status pending / signed_up / converted (exact strings)", async () => {
    await GET();
    const statuses = state.countLogs
      .filter((c) => c.table === "referrals")
      .map((c) => c.eqs.find((e) => e[0] === "status")?.[1])
      .sort();
    expect(statuses).toEqual(["converted", "pending", "signed_up"]);
  });

  it("looks the app_users legacy column up via .eq('id', user.id).single()", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-77", email: "x@y.com" });
    await GET();
    const usersLog = state.dataLogs.find(
      (d) => d.table === "app_users" && d.cols === "referral_credits_earned",
    );
    expect(usersLog?.terminator).toBe("single");
    expect(usersLog?.eqs).toEqual([["id", "u-77"]]);
  });

  it("builds the referral link via getReferralUrl(code) — never a hard-coded template", async () => {
    getReferralUrlMock.mockReturnValue("https://custom.example/x");
    const body = await (await GET()).json();
    expect(body.link).toBe("https://custom.example/x");
    expect(getReferralUrlMock).toHaveBeenCalledWith("ABC12345");
  });
});

describe("POST — body parse guard", () => {
  it("returns 400 { error:'Invalid JSON body' } when body is not JSON", async () => {
    const req = new Request("http://localhost/api/referral", {
      method: "POST",
      body: "{not-json",
    }) as unknown as NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Invalid JSON body",
    });
  });

  it("does NOT touch supabase / grantCredits on a JSON-parse failure", async () => {
    const req = new Request("http://localhost/api/referral", {
      method: "POST",
      body: "{not-json",
    }) as unknown as NextRequest;
    await POST(req);
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });
});

describe("POST — input validation", () => {
  it("returns 400 { error:'Missing referralCode' } when referralCode is absent", async () => {
    const res = await POST(jsonReq({ email: "new@x.com" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Missing referralCode",
    });
  });

  it("returns 400 when referralCode is empty string (falsy guard)", async () => {
    const res = await POST(jsonReq({ referralCode: "", email: "new@x.com" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when referralCode is non-string (number → typeof guard)", async () => {
    const res = await POST(
      jsonReq({ referralCode: 12345, email: "new@x.com" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 { error:'Missing email' } when email is absent", async () => {
    const res = await POST(jsonReq({ referralCode: "ABC" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Missing email" });
  });

  it("returns 400 when email is non-string (object → typeof guard)", async () => {
    const res = await POST(
      jsonReq({ referralCode: "ABC", email: { a: 1 } }),
    );
    expect(res.status).toBe(400);
  });

  it("does NOT touch supabase or grantCredits on any validation failure", async () => {
    await POST(jsonReq({ referralCode: "ABC" }));
    expect(getSupabaseAdminMock).not.toHaveBeenCalled();
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });
});

describe("POST — supabase not configured", () => {
  it("returns 503 { error:'Service unavailable' } when getSupabaseAdmin returns null", async () => {
    getSupabaseAdminMock.mockReturnValue(null);
    const res = await POST(
      jsonReq({ referralCode: "ABC", email: "new@x.com" }),
    );
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Service unavailable",
    });
  });
});

describe("POST — referrer lookup", () => {
  it("returns 404 { error:'Invalid referral code' } when the referral code resolves to no user", async () => {
    state.data["app_users:id, email"] = null;
    const res = await POST(
      jsonReq({ referralCode: "NOPE", email: "new@x.com" }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Invalid referral code",
    });
  });

  it("scopes the referrer lookup to app_users.referral_code = <code> via maybeSingle()", async () => {
    state.data["app_users:id, email"] = {
      id: "r-1",
      email: "ref@x.com",
    };
    state.data["referrals:id"] = null;
    await POST(jsonReq({ referralCode: "ABC", email: "new@x.com" }));
    const lookup = state.dataLogs.find(
      (d) => d.table === "app_users" && d.cols === "id, email",
    );
    expect(lookup?.terminator).toBe("maybeSingle");
    expect(lookup?.eqs).toEqual([["referral_code", "ABC"]]);
  });

  it("does NOT insert or grant on the invalid-code branch", async () => {
    state.data["app_users:id, email"] = null;
    await POST(jsonReq({ referralCode: "NOPE", email: "new@x.com" }));
    expect(state.insertLogs).toHaveLength(0);
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });
});

describe("POST — self-referral guard", () => {
  it("returns 400 { error:'Cannot refer yourself' } when the referrer email == referred email (case-insensitive)", async () => {
    state.data["app_users:id, email"] = {
      id: "r-1",
      email: "Founder@X.COM",
    };
    const res = await POST(
      jsonReq({ referralCode: "ABC", email: "founder@x.com" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Cannot refer yourself",
    });
  });

  it("self-referral triggers on trimmed email too (' founder@x.com ' still blocked)", async () => {
    state.data["app_users:id, email"] = {
      id: "r-1",
      email: "founder@x.com",
    };
    const res = await POST(
      jsonReq({ referralCode: "ABC", email: "  Founder@X.COM  " }),
    );
    expect(res.status).toBe(400);
  });

  it("does NOT insert or grant on the self-referral branch", async () => {
    state.data["app_users:id, email"] = {
      id: "r-1",
      email: "founder@x.com",
    };
    await POST(jsonReq({ referralCode: "ABC", email: "founder@x.com" }));
    expect(state.insertLogs).toHaveLength(0);
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });
});

describe("POST — duplicate referred_email guard", () => {
  it("returns 409 { error:'Email already referred' } when the email is already in referrals", async () => {
    state.data["app_users:id, email"] = {
      id: "r-1",
      email: "ref@x.com",
    };
    state.data["referrals:id"] = { id: "existing-row" };
    const res = await POST(
      jsonReq({ referralCode: "ABC", email: "new@x.com" }),
    );
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Email already referred",
    });
  });

  it("dedupe lookup is keyed on the normalised (trim+lowercase) email", async () => {
    state.data["app_users:id, email"] = {
      id: "r-1",
      email: "ref@x.com",
    };
    state.data["referrals:id"] = null;
    await POST(
      jsonReq({ referralCode: "ABC", email: "  NEW@X.COM  " }),
    );
    const dedupeLog = state.dataLogs.find(
      (d) => d.table === "referrals" && d.cols === "id",
    );
    expect(dedupeLog?.terminator).toBe("maybeSingle");
    expect(dedupeLog?.eqs).toEqual([["referred_email", "new@x.com"]]);
  });

  it("does NOT insert or grant on the duplicate-email branch", async () => {
    state.data["app_users:id, email"] = {
      id: "r-1",
      email: "ref@x.com",
    };
    state.data["referrals:id"] = { id: "existing-row" };
    await POST(jsonReq({ referralCode: "ABC", email: "new@x.com" }));
    expect(state.insertLogs).toHaveLength(0);
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });
});

describe("POST — insert failure", () => {
  it("returns 500 { error:'Failed to record referral' } when the INSERT surfaces an error", async () => {
    state.data["app_users:id, email"] = {
      id: "r-1",
      email: "ref@x.com",
    };
    state.data["referrals:id"] = null;
    state.insertError = { message: "constraint boom" };
    const res = await POST(
      jsonReq({ referralCode: "ABC", email: "new@x.com" }),
    );
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Failed to record referral",
    });
  });

  it("does NOT call grantCredits when the INSERT surfaces an error", async () => {
    state.data["app_users:id, email"] = {
      id: "r-1",
      email: "ref@x.com",
    };
    state.data["referrals:id"] = null;
    state.insertError = { message: "constraint boom" };
    await POST(jsonReq({ referralCode: "ABC", email: "new@x.com" }));
    expect(grantCreditsMock).not.toHaveBeenCalled();
  });
});

describe("POST — happy path", () => {
  beforeEach(() => {
    state.data["app_users:id, email"] = {
      id: "r-1",
      email: "ref@x.com",
    };
    state.data["referrals:id"] = null;
  });

  it("returns 200 { ok:true, creditsAwarded:2 } — the module-level REFERRAL_CREDITS constant", async () => {
    const res = await POST(
      jsonReq({ referralCode: "ABC", email: "new@x.com" }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, creditsAwarded: 2 });
  });

  it("INSERTs into `referrals` with status:'signed_up' + credits_awarded:2 + normalised email", async () => {
    await POST(
      jsonReq({ referralCode: "ABC", email: "  NEW@X.COM  " }),
    );
    expect(state.insertLogs).toHaveLength(1);
    expect(state.insertLogs[0].table).toBe("referrals");
    expect(state.insertLogs[0].payload).toEqual({
      referrer_id: "r-1",
      referrer_email: "ref@x.com",
      referred_email: "new@x.com",
      referral_code: "ABC",
      status: "signed_up",
      credits_awarded: 2,
    });
  });

  it("calls grantCredits(referrer.id, 2, 'referral_bonus', { referred_email }) exactly once", async () => {
    await POST(jsonReq({ referralCode: "ABC", email: "new@x.com" }));
    expect(grantCreditsMock).toHaveBeenCalledTimes(1);
    expect(grantCreditsMock).toHaveBeenCalledWith(
      "r-1",
      2,
      "referral_bonus",
      { referred_email: "new@x.com" },
    );
  });

  it("passes the normalised (trim+lowercase) email into grantCredits meta, not the raw form", async () => {
    await POST(
      jsonReq({ referralCode: "ABC", email: "  NEW@X.COM  " }),
    );
    expect(grantCreditsMock.mock.calls[0]?.[3]).toEqual({
      referred_email: "new@x.com",
    });
  });

  it("does NOT call getCurrentUser on the POST branch (referral signup is anonymous)", async () => {
    await POST(jsonReq({ referralCode: "ABC", email: "new@x.com" }));
    expect(getCurrentUserMock).not.toHaveBeenCalled();
  });
});
