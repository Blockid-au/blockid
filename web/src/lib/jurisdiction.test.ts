// Colocated vitest for the server-only jurisdiction triangulator.
//
// `detectJurisdiction` fuses three signals — IP header, `bid_jur` cookie, and
// stored billing address — into a `{country, source, confidence}` envelope.
// Every legal gate (s708/s761G equity offers, ESIC certificates, AU-only
// disclaimers) reads `country` to decide which regime applies, and the UI
// reads `source` to render the "you appear to be in X — change?" affordance.
//
// Pinned contracts:
//   • `AU_STATES` shape + `JUR_COOKIE` cookie name (bump would break middleware)
//   • IP header priority — cf-ipcountry > x-vercel-ip-country > x-country
//   • Cloudflare's "XX" unknown-country sentinel treated as no signal
//   • cookie header read wins over next/headers cookies() fallback
//   • billing lookup silently returns null when jurisdiction_source !== 'billing'
//   • signals.length===0 → default AU / low confidence (never throws)
//   • 2+ signals agree → high confidence, else medium
//   • reported source precedence: declared > billing > ip (when tied)
//
// Uses vi.mock for next/headers, @/lib/supabase, and @/lib/auth so the pure
// signal-fusion logic can be exercised without a live Supabase or request scope.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── module state that mocks read from ─────────────────────────────────

interface FakeState {
  adminConfigured: boolean;
  cookieStoreThrows: boolean;
  cookieStore: Map<string, string>;
  sessions: Array<{ token: string; user_id: string }>;
  users: Array<{
    id: string;
    jurisdiction: string | null;
    jurisdiction_source: string | null;
  }>;
  failSessions: string | null;
  failUsers: string | null;
}

const state: FakeState = {
  adminConfigured: true,
  cookieStoreThrows: false,
  cookieStore: new Map(),
  sessions: [],
  users: [],
  failSessions: null,
  failUsers: null,
};

function resetState() {
  state.adminConfigured = true;
  state.cookieStoreThrows = false;
  state.cookieStore = new Map();
  state.sessions = [];
  state.users = [];
  state.failSessions = null;
  state.failUsers = null;
}

// ─── module mocks (must precede the import under test) ─────────────────

vi.mock("next/headers", () => ({
  cookies: async () => {
    if (state.cookieStoreThrows) throw new Error("outside request scope");
    return {
      get(name: string) {
        const v = state.cookieStore.get(name);
        return v === undefined ? undefined : { name, value: v };
      },
    };
  },
}));

vi.mock("@/lib/auth", () => ({ SESSION_COOKIE: "blockid_session" }));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => (state.adminConfigured ? fakeAdmin() : null),
}));

function fakeAdmin() {
  return {
    from(table: string) {
      const filters: Array<{ col: string; val: unknown }> = [];
      const chain = {
        select(_cols: string) {
          return chain;
        },
        eq(col: string, val: unknown) {
          filters.push({ col, val });
          return chain;
        },
        async maybeSingle() {
          if (table === "sessions") {
            if (state.failSessions)
              return { data: null, error: { message: state.failSessions } };
            const row = state.sessions.find((r) =>
              filters.every(({ col, val }) => (r as Record<string, unknown>)[col] === val),
            );
            return { data: row ?? null, error: null };
          }
          if (table === "app_users") {
            if (state.failUsers)
              return { data: null, error: { message: state.failUsers } };
            const row = state.users.find((r) =>
              filters.every(({ col, val }) => (r as Record<string, unknown>)[col] === val),
            );
            return { data: row ?? null, error: null };
          }
          return { data: null, error: null };
        },
      };
      return chain;
    },
  };
}

// Import after all vi.mock hoists.
import {
  AU_STATES,
  JUR_COOKIE,
  detectJurisdiction,
  type JurisdictionResult,
} from "./jurisdiction";

// ─── helpers ───────────────────────────────────────────────────────────

function req(headers: Record<string, string>): Request {
  return new Request("https://example.com/", { headers });
}

beforeEach(() => {
  resetState();
});

// ─── shape pins ────────────────────────────────────────────────────────

describe("module constants", () => {
  it("AU_STATES ships exactly the 8 canonical state/territory codes", () => {
    expect(AU_STATES).toEqual(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]);
  });

  it("JUR_COOKIE matches the middleware-shared name 'bid_jur'", () => {
    expect(JUR_COOKIE).toBe("bid_jur");
  });
});

// ─── no-signal fallback ────────────────────────────────────────────────

describe("detectJurisdiction — no signals", () => {
  it("returns AU / default / low when no IP header, cookie, or billing row is present", async () => {
    const r: JurisdictionResult = await detectJurisdiction(req({}));
    expect(r).toEqual({ country: "AU", source: "default", confidence: "low" });
  });

  it("cookie store that throws (edge middleware scope) does not propagate", async () => {
    state.cookieStoreThrows = true;
    const r = await detectJurisdiction(req({}));
    expect(r).toEqual({ country: "AU", source: "default", confidence: "low" });
  });
});

// ─── IP header reading ─────────────────────────────────────────────────

describe("detectJurisdiction — IP header", () => {
  it("cf-ipcountry wins over sibling headers (per Cloudflare-fronted deploy)", async () => {
    const r = await detectJurisdiction(
      req({
        "cf-ipcountry": "au",
        "x-vercel-ip-country": "US",
        "x-country": "GB",
      }),
    );
    expect(r.country).toBe("AU");
    expect(r.source).toBe("ip");
  });

  it("falls back to x-vercel-ip-country when cf-ipcountry is absent", async () => {
    const r = await detectJurisdiction(req({ "x-vercel-ip-country": "US" }));
    expect(r.country).toBe("US");
    expect(r.source).toBe("ip");
  });

  it("falls back to x-country when both cloudflare + vercel headers are absent", async () => {
    const r = await detectJurisdiction(req({ "x-country": "NZ" }));
    expect(r.country).toBe("NZ");
    expect(r.source).toBe("ip");
  });

  it("Cloudflare 'XX' unknown-country sentinel is treated as no signal", async () => {
    const r = await detectJurisdiction(req({ "cf-ipcountry": "XX" }));
    // 'XX' rejected → no signals → default AU
    expect(r).toEqual({ country: "AU", source: "default", confidence: "low" });
  });

  it("mixed 'XX' cf-ipcountry falls through to the next available header", async () => {
    const r = await detectJurisdiction(
      req({ "cf-ipcountry": "XX", "x-vercel-ip-country": "GB" }),
    );
    // 'XX' fails inside cf-ipcountry, but readIpCountry uses ||, so the
    // failing check evaluates to null and the fallback IS tried. Pins the
    // sentinel-does-not-short-circuit behaviour.
    expect(r.country).toBe("GB");
    expect(r.source).toBe("ip");
  });

  it("empty header string yields no IP signal", async () => {
    const r = await detectJurisdiction(req({ "cf-ipcountry": "" }));
    expect(r.source).toBe("default");
  });

  it("header longer than 2 chars is rejected (never a valid ISO alpha-2)", async () => {
    const r = await detectJurisdiction(req({ "cf-ipcountry": "AUS" }));
    expect(r.source).toBe("default");
  });

  it("single-char header is rejected", async () => {
    const r = await detectJurisdiction(req({ "cf-ipcountry": "A" }));
    expect(r.source).toBe("default");
  });

  it("lower-case + surrounding whitespace normalised to upper-case", async () => {
    const r = await detectJurisdiction(req({ "cf-ipcountry": "  au  " }));
    expect(r.country).toBe("AU");
    expect(r.source).toBe("ip");
  });
});

// ─── declared cookie ───────────────────────────────────────────────────

describe("detectJurisdiction — declared cookie", () => {
  it("reads bid_jur cookie from the request cookie header", async () => {
    const r = await detectJurisdiction(req({ cookie: "bid_jur=nz" }));
    expect(r.country).toBe("NZ");
    expect(r.source).toBe("declared");
    expect(r.confidence).toBe("medium");
  });

  it("URL-decodes cookie values before parsing", async () => {
    // Not really a real ISO code with encoding but pins the decodeURIComponent
    // call — %55%53 = US
    const r = await detectJurisdiction(req({ cookie: "bid_jur=%55%53" }));
    expect(r.country).toBe("US");
    expect(r.source).toBe("declared");
  });

  it("ignores other cookies with different names", async () => {
    const r = await detectJurisdiction(
      req({ cookie: "other=zz; sessionid=abc; bid_jur=jp" }),
    );
    expect(r.country).toBe("JP");
    expect(r.source).toBe("declared");
  });

  it("cookie header with no bid_jur falls back to next/headers cookies()", async () => {
    state.cookieStore.set("bid_jur", "de");
    const r = await detectJurisdiction(req({ cookie: "other=zz" }));
    expect(r.country).toBe("DE");
    expect(r.source).toBe("declared");
  });

  it("uses next/headers cookies() when the request carries no cookie header at all", async () => {
    state.cookieStore.set("bid_jur", "fr");
    const r = await detectJurisdiction(req({}));
    expect(r.country).toBe("FR");
    expect(r.source).toBe("declared");
  });

  it("cookie longer than 2 chars is rejected", async () => {
    const r = await detectJurisdiction(req({ cookie: "bid_jur=USA" }));
    expect(r.source).toBe("default");
  });

  it("empty cookie value is skipped", async () => {
    const r = await detectJurisdiction(req({ cookie: "bid_jur=" }));
    expect(r.source).toBe("default");
  });
});

// ─── billing lookup ────────────────────────────────────────────────────

describe("detectJurisdiction — billing lookup", () => {
  const validSession = () => {
    state.sessions.push({ token: "sess-tok", user_id: "u-1" });
    state.users.push({
      id: "u-1",
      jurisdiction: "US",
      jurisdiction_source: "billing",
    });
  };

  it("returns billing country when session + jurisdiction_source='billing' resolve", async () => {
    validSession();
    const r = await detectJurisdiction(req({ cookie: "blockid_session=sess-tok" }));
    expect(r.country).toBe("US");
    expect(r.source).toBe("billing");
    expect(r.confidence).toBe("medium");
  });

  it("silently returns null when admin client is not configured", async () => {
    state.adminConfigured = false;
    // Even with a valid session cookie, no billing signal is surfaced.
    const r = await detectJurisdiction(req({ cookie: "blockid_session=sess-tok" }));
    expect(r.source).toBe("default");
  });

  it("session cookie missing → no billing lookup", async () => {
    validSession();
    const r = await detectJurisdiction(req({}));
    expect(r.source).toBe("default");
  });

  it("session token that does not match a row → no billing signal", async () => {
    state.users.push({
      id: "u-1",
      jurisdiction: "GB",
      jurisdiction_source: "billing",
    });
    // Note: no matching sessions row.
    const r = await detectJurisdiction(req({ cookie: "blockid_session=stale" }));
    expect(r.source).toBe("default");
  });

  it("user row missing → no billing signal", async () => {
    state.sessions.push({ token: "tok", user_id: "u-1" });
    // No app_users row for u-1.
    const r = await detectJurisdiction(req({ cookie: "blockid_session=tok" }));
    expect(r.source).toBe("default");
  });

  it("jurisdiction_source !== 'billing' is ignored (user-declared column, not authoritative)", async () => {
    state.sessions.push({ token: "tok", user_id: "u-1" });
    state.users.push({
      id: "u-1",
      jurisdiction: "GB",
      jurisdiction_source: "declared",
    });
    const r = await detectJurisdiction(req({ cookie: "blockid_session=tok" }));
    expect(r.source).toBe("default");
  });

  it("billing jurisdiction that is not 2 chars is rejected", async () => {
    state.sessions.push({ token: "tok", user_id: "u-1" });
    state.users.push({
      id: "u-1",
      jurisdiction: "USA",
      jurisdiction_source: "billing",
    });
    const r = await detectJurisdiction(req({ cookie: "blockid_session=tok" }));
    expect(r.source).toBe("default");
  });

  it("null jurisdiction column is coerced to empty then rejected (never throws)", async () => {
    state.sessions.push({ token: "tok", user_id: "u-1" });
    state.users.push({
      id: "u-1",
      jurisdiction: null,
      jurisdiction_source: "billing",
    });
    const r = await detectJurisdiction(req({ cookie: "blockid_session=tok" }));
    expect(r.source).toBe("default");
  });

  it("supabase failure inside session lookup is swallowed (jurisdiction never throws)", async () => {
    state.failSessions = "network down";
    // Even with a session cookie present, the swallow returns null.
    const r = await detectJurisdiction(req({ cookie: "blockid_session=tok" }));
    expect(r.source).toBe("default");
  });

  it("reads session cookie from next/headers when request has no cookie header", async () => {
    validSession();
    state.cookieStore.set("blockid_session", "sess-tok");
    const r = await detectJurisdiction(req({}));
    expect(r.country).toBe("US");
    expect(r.source).toBe("billing");
  });
});

// ─── confidence + source precedence ────────────────────────────────────

describe("detectJurisdiction — confidence + source precedence", () => {
  it("two agreeing signals lift confidence to 'high'", async () => {
    // IP + cookie both agree on AU.
    const r = await detectJurisdiction(
      req({ "cf-ipcountry": "au", cookie: "bid_jur=au" }),
    );
    expect(r.country).toBe("AU");
    expect(r.confidence).toBe("high");
  });

  it("three agreeing signals still 'high' (>=2)", async () => {
    state.sessions.push({ token: "tok", user_id: "u-1" });
    state.users.push({
      id: "u-1",
      jurisdiction: "US",
      jurisdiction_source: "billing",
    });
    const r = await detectJurisdiction(
      req({
        "cf-ipcountry": "us",
        cookie: "bid_jur=us; blockid_session=tok",
      }),
    );
    expect(r.country).toBe("US");
    expect(r.confidence).toBe("high");
  });

  it("single signal → 'medium'", async () => {
    const r = await detectJurisdiction(req({ "cf-ipcountry": "GB" }));
    expect(r.confidence).toBe("medium");
  });

  it("no signals → 'low'", async () => {
    const r = await detectJurisdiction(req({}));
    expect(r.confidence).toBe("low");
  });

  it("declared beats ip when both signals agree on the same country (source precedence)", async () => {
    const r = await detectJurisdiction(
      req({ "cf-ipcountry": "au", cookie: "bid_jur=au" }),
    );
    expect(r.source).toBe("declared");
  });

  it("billing beats ip on the same country (declared absent)", async () => {
    state.sessions.push({ token: "tok", user_id: "u-1" });
    state.users.push({
      id: "u-1",
      jurisdiction: "US",
      jurisdiction_source: "billing",
    });
    const r = await detectJurisdiction(
      req({ "cf-ipcountry": "us", cookie: "blockid_session=tok" }),
    );
    expect(r.source).toBe("billing");
  });

  it("declared beats billing on the same country (three-signal agreement)", async () => {
    state.sessions.push({ token: "tok", user_id: "u-1" });
    state.users.push({
      id: "u-1",
      jurisdiction: "US",
      jurisdiction_source: "billing",
    });
    const r = await detectJurisdiction(
      req({
        "cf-ipcountry": "us",
        cookie: "bid_jur=us; blockid_session=tok",
      }),
    );
    expect(r.source).toBe("declared");
  });

  it("when signals disagree the tally-winner wins; source picks the signal that voted for the winner", async () => {
    // ip=US, declared=AU, billing=US → US has 2 votes, wins.
    // Priority: declared voted AU (not winner) → skip; billing voted US → reported source = billing.
    state.sessions.push({ token: "tok", user_id: "u-1" });
    state.users.push({
      id: "u-1",
      jurisdiction: "US",
      jurisdiction_source: "billing",
    });
    const r = await detectJurisdiction(
      req({
        "cf-ipcountry": "us",
        cookie: "bid_jur=au; blockid_session=tok",
      }),
    );
    expect(r.country).toBe("US");
    expect(r.source).toBe("billing");
    expect(r.confidence).toBe("high");
  });

  it("all three signals disagree → first-listed order defines the winner (ip is enumerated first)", async () => {
    // ip=US, declared=GB, billing=NZ → each has 1 vote. The loop takes the
    // FIRST key that beats winnerCount=0, which is the first inserted entry.
    // Map iteration preserves insertion order; signals are pushed ip → declared → billing.
    // So winner=US and reported source=ip.
    state.sessions.push({ token: "tok", user_id: "u-1" });
    state.users.push({
      id: "u-1",
      jurisdiction: "NZ",
      jurisdiction_source: "billing",
    });
    const r = await detectJurisdiction(
      req({
        "cf-ipcountry": "us",
        cookie: "bid_jur=gb; blockid_session=tok",
      }),
    );
    expect(r.country).toBe("US");
    expect(r.source).toBe("ip");
    // Only one signal voted for US → confidence stays 'medium' despite three inputs.
    expect(r.confidence).toBe("medium");
  });

  it("declared vs ip disagree (2 signals, 1 vote each) — declared wins by insertion order OR ip?", async () => {
    // ip=US (pushed first), declared=AU (pushed second). Map iteration:
    // first key US → winnerCount 0→1, second key AU → 1 not > 1 → skip.
    // So winner=US, reported source=ip (priority declared voted AU not winner).
    const r = await detectJurisdiction(
      req({ "cf-ipcountry": "us", cookie: "bid_jur=au" }),
    );
    expect(r.country).toBe("US");
    expect(r.source).toBe("ip");
    expect(r.confidence).toBe("medium");
  });
});
