// Colocated vitest for the founder-installed Google Analytics OAuth
// connector. Six pure-ish exports:
//   1. isGoogleAnalyticsOAuthConfigured  — env-boolean flag
//   2. buildGoogleAuthorizeUrl           — pure URL builder
//   3. exchangeGoogleCodeForTokens       — POST /token, returns tokens|null
//   4. fetchFirstGa4Property             — GET accountSummaries, first prop
//   5. fetchGa4Stats                     — POST runReport, monthly stats
//   6. scoreGa4Stats                     — pure impact score (0..10)
//
// Regressions here are user-visible: (a) losing the env-guard on
// isGoogleAnalyticsOAuthConfigured leaks a redirect-to-Google that fails
// at OAuth handshake, (b) losing the URL-encoded scope+state+redirect_uri
// wiring in buildGoogleAuthorizeUrl means Google rejects the redirect
// silently, (c) losing the `!res.ok` short-circuit in the three fetch
// helpers turns a Google 5xx into a body-parse throw that crashes the
// route, (d) losing the "no access_token" fallback in
// exchangeGoogleCodeForTokens returns a `{accessToken: undefined}` object
// downstream and stores a broken refresh row, (e) losing the
// `properties/` prefix strip in fetchFirstGa4Property double-prefixes the
// property id in every subsequent GA4 Data API call, (f) losing the
// bounceRatePct fraction→percent conversion in fetchGa4Stats shows "0.42%"
// instead of "42%" in the founder dashboard, and (g) losing the
// scoreGa4Stats ceiling of 10 lets a viral month push the SVI mkt
// dimension above the pinned max and corrupts the total.
//
// The suite pins wire contracts (URLs, HTTP methods, form-encoded bodies,
// Authorization headers, cache: 'no-store') alongside every null-fallback
// branch, and covers the three env-driven behaviours by stubbing
// process.env per case. A small `fetch` stub captures each request so we
// can assert on url, init, and parsed body per call.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildGoogleAuthorizeUrl,
  exchangeGoogleCodeForTokens,
  fetchFirstGa4Property,
  fetchGa4Stats,
  isGoogleAnalyticsOAuthConfigured,
  scoreGa4Stats,
  type GA4PropertySummary,
} from "./google-analytics-oauth";

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

let fetchSpy: ReturnType<typeof vi.fn>;
const originalFetch = globalThis.fetch;
const originalClientId = process.env.GOOGLE_CLIENT_ID;
const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

beforeEach(() => {
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
  // Deterministic envs — every test that cares sets them explicitly below.
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

afterEach(() => {
  vi.unstubAllGlobals();
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  if (originalClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
  else process.env.GOOGLE_CLIENT_ID = originalClientId;
  if (originalClientSecret === undefined) delete process.env.GOOGLE_CLIENT_SECRET;
  else process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
});

function okResponse(body: unknown, init: { status?: number } = {}): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function errorResponse(status = 500): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
  } as unknown as Response;
}

/* ─── isGoogleAnalyticsOAuthConfigured ──────────────────────────────── */

describe("isGoogleAnalyticsOAuthConfigured — env guard", () => {
  it("returns true when both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set", () => {
    process.env.GOOGLE_CLIENT_ID = "client-abc";
    process.env.GOOGLE_CLIENT_SECRET = "secret-xyz";
    expect(isGoogleAnalyticsOAuthConfigured()).toBe(true);
  });

  it("returns false when GOOGLE_CLIENT_ID is missing", () => {
    process.env.GOOGLE_CLIENT_SECRET = "secret-xyz";
    expect(isGoogleAnalyticsOAuthConfigured()).toBe(false);
  });

  it("returns false when GOOGLE_CLIENT_SECRET is missing", () => {
    process.env.GOOGLE_CLIENT_ID = "client-abc";
    expect(isGoogleAnalyticsOAuthConfigured()).toBe(false);
  });

  it("returns false when both envs are absent (default cold-boot state)", () => {
    expect(isGoogleAnalyticsOAuthConfigured()).toBe(false);
  });

  it("treats an empty-string env as unset (Boolean('') === false)", () => {
    // AWS Amplify / Vercel routinely materialise unset envs as "" rather
    // than undefined, so the guard must coerce to Boolean, not string.
    process.env.GOOGLE_CLIENT_ID = "";
    process.env.GOOGLE_CLIENT_SECRET = "secret-xyz";
    expect(isGoogleAnalyticsOAuthConfigured()).toBe(false);
  });
});

/* ─── buildGoogleAuthorizeUrl ───────────────────────────────────────── */

describe("buildGoogleAuthorizeUrl — pure URL builder", () => {
  const REDIRECT = "https://blockid.au/api/integrations/ga4/callback";
  const STATE = "state-token-123";

  it("targets the Google v2 authorize endpoint", () => {
    process.env.GOOGLE_CLIENT_ID = "client-abc";
    const url = new URL(buildGoogleAuthorizeUrl(STATE, REDIRECT));
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
  });

  it("wires client_id, redirect_uri, and state from the caller", () => {
    process.env.GOOGLE_CLIENT_ID = "client-abc";
    const url = new URL(buildGoogleAuthorizeUrl(STATE, REDIRECT));
    expect(url.searchParams.get("client_id")).toBe("client-abc");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("state")).toBe(STATE);
  });

  it("requests offline access + consent so a refresh_token is issued on first grant", () => {
    process.env.GOOGLE_CLIENT_ID = "client-abc";
    const url = new URL(buildGoogleAuthorizeUrl(STATE, REDIRECT));
    // Google only ever emits a refresh_token when BOTH flags are present.
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
  });

  it("pins the response_type to `code` (Authorization Code grant, not implicit)", () => {
    process.env.GOOGLE_CLIENT_ID = "client-abc";
    const url = new URL(buildGoogleAuthorizeUrl(STATE, REDIRECT));
    expect(url.searchParams.get("response_type")).toBe("code");
  });

  it("declares include_granted_scopes=true so previously-granted scopes aren't dropped", () => {
    process.env.GOOGLE_CLIENT_ID = "client-abc";
    const url = new URL(buildGoogleAuthorizeUrl(STATE, REDIRECT));
    expect(url.searchParams.get("include_granted_scopes")).toBe("true");
  });

  it("requests the read-only Analytics scope + openid + email (space-joined per RFC 6749)", () => {
    process.env.GOOGLE_CLIENT_ID = "client-abc";
    const url = new URL(buildGoogleAuthorizeUrl(STATE, REDIRECT));
    const scope = url.searchParams.get("scope") ?? "";
    const parts = scope.split(" ");
    expect(parts).toContain("https://www.googleapis.com/auth/analytics.readonly");
    expect(parts).toContain("openid");
    expect(parts).toContain("email");
    expect(parts).toHaveLength(3);
  });

  it("URL-encodes unicode/whitespace in state via URLSearchParams (no manual escaping)", () => {
    // A CSRF state that carries a signed JWT can contain "=", "/", "+".
    process.env.GOOGLE_CLIENT_ID = "client-abc";
    const stateWithChars = "abc/def+ghi=jkl · Ω";
    const url = new URL(buildGoogleAuthorizeUrl(stateWithChars, REDIRECT));
    expect(url.searchParams.get("state")).toBe(stateWithChars);
  });

  it("falls back to empty client_id when GOOGLE_CLIENT_ID is unset (Google rejects — surface, don't crash)", () => {
    // The `?? ""` fallback keeps the redirect building successfully; the
    // failure surfaces at Google (invalid_client) rather than throwing on
    // the founder's browser.
    const url = new URL(buildGoogleAuthorizeUrl(STATE, REDIRECT));
    expect(url.searchParams.get("client_id")).toBe("");
  });
});

/* ─── exchangeGoogleCodeForTokens ───────────────────────────────────── */

describe("exchangeGoogleCodeForTokens — wire contract", () => {
  const REDIRECT = "https://blockid.au/api/integrations/ga4/callback";

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "client-abc";
    process.env.GOOGLE_CLIENT_SECRET = "secret-xyz";
  });

  it("POSTs to the Google OAuth token endpoint", async () => {
    fetchSpy.mockResolvedValueOnce(
      okResponse({ access_token: "at", refresh_token: "rt", expires_in: 3600 }),
    );
    await exchangeGoogleCodeForTokens("auth-code", REDIRECT);
    const [url, init] = fetchSpy.mock.calls[0] as FetchArgs;
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(init?.method).toBe("POST");
  });

  it("sends a form-encoded body (Content-Type application/x-www-form-urlencoded)", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ access_token: "at", expires_in: 3600 }));
    await exchangeGoogleCodeForTokens("auth-code", REDIRECT);
    const [, init] = fetchSpy.mock.calls[0] as FetchArgs;
    const headers = init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(init?.body).toBeInstanceOf(URLSearchParams);
  });

  it("wires code, client_id, client_secret, redirect_uri, grant_type into the body", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ access_token: "at", expires_in: 3600 }));
    await exchangeGoogleCodeForTokens("auth-code", REDIRECT);
    const [, init] = fetchSpy.mock.calls[0] as FetchArgs;
    const body = init?.body as URLSearchParams;
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("client_id")).toBe("client-abc");
    expect(body.get("client_secret")).toBe("secret-xyz");
    expect(body.get("redirect_uri")).toBe(REDIRECT);
    expect(body.get("grant_type")).toBe("authorization_code");
  });

  it("uses cache: 'no-store' — token exchange must never be served from a cache", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ access_token: "at", expires_in: 3600 }));
    await exchangeGoogleCodeForTokens("auth-code", REDIRECT);
    const [, init] = fetchSpy.mock.calls[0] as FetchArgs;
    expect(init?.cache).toBe("no-store");
  });

  it("stamps the User-Agent header so Google's logs identify the caller", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ access_token: "at", expires_in: 3600 }));
    await exchangeGoogleCodeForTokens("auth-code", REDIRECT);
    const [, init] = fetchSpy.mock.calls[0] as FetchArgs;
    const headers = init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("BlockID.au-evidence-bot");
  });

  it("passes empty client_id/client_secret through when env is unset (Google rejects, don't crash)", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    fetchSpy.mockResolvedValueOnce(errorResponse(400));
    await exchangeGoogleCodeForTokens("auth-code", REDIRECT);
    const [, init] = fetchSpy.mock.calls[0] as FetchArgs;
    const body = init?.body as URLSearchParams;
    expect(body.get("client_id")).toBe("");
    expect(body.get("client_secret")).toBe("");
  });
});

describe("exchangeGoogleCodeForTokens — success + null fallback", () => {
  const REDIRECT = "https://blockid.au/api/integrations/ga4/callback";

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = "client-abc";
    process.env.GOOGLE_CLIENT_SECRET = "secret-xyz";
  });

  it("returns the parsed tokens on a successful response with all fields", async () => {
    fetchSpy.mockResolvedValueOnce(
      okResponse({
        access_token: "at-123",
        refresh_token: "rt-456",
        expires_in: 3599,
      }),
    );
    const tokens = await exchangeGoogleCodeForTokens("auth-code", REDIRECT);
    expect(tokens).toEqual({
      accessToken: "at-123",
      refreshToken: "rt-456",
      expiresIn: 3599,
    });
  });

  it("materialises a missing refresh_token as null (second-authorize flow only sends access)", async () => {
    // On repeat authorisations Google only issues an access_token — the
    // caller keeps the previously-stored refresh_token, so we must not
    // crash on `undefined`.
    fetchSpy.mockResolvedValueOnce(okResponse({ access_token: "at", expires_in: 3600 }));
    const tokens = await exchangeGoogleCodeForTokens("auth-code", REDIRECT);
    expect(tokens?.refreshToken).toBeNull();
  });

  it("materialises a missing expires_in as 0 (caller will treat as immediately-expired)", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ access_token: "at" }));
    const tokens = await exchangeGoogleCodeForTokens("auth-code", REDIRECT);
    expect(tokens?.expiresIn).toBe(0);
  });

  it("returns null when the response is non-2xx (Google rejected the code)", async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(400));
    const tokens = await exchangeGoogleCodeForTokens("bad-code", REDIRECT);
    expect(tokens).toBeNull();
  });

  it("returns null when the response body is missing access_token entirely", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ refresh_token: "rt", expires_in: 3600 }));
    const tokens = await exchangeGoogleCodeForTokens("auth-code", REDIRECT);
    expect(tokens).toBeNull();
  });

  it("returns null when the response body has an empty-string access_token", async () => {
    // Guard against a stubbed / mocked upstream that returns "" — the row
    // would otherwise land in the DB with a blank access_token.
    fetchSpy.mockResolvedValueOnce(okResponse({ access_token: "", expires_in: 3600 }));
    const tokens = await exchangeGoogleCodeForTokens("auth-code", REDIRECT);
    expect(tokens).toBeNull();
  });
});

/* ─── fetchFirstGa4Property ─────────────────────────────────────────── */

describe("fetchFirstGa4Property — wire contract", () => {
  it("GETs the accountSummaries endpoint with a Bearer access token", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ accountSummaries: [] }));
    await fetchFirstGa4Property("bearer-token-1");
    const [url, init] = fetchSpy.mock.calls[0] as FetchArgs;
    expect(url).toBe("https://analyticsadmin.googleapis.com/v1beta/accountSummaries");
    // GET is the default when init.method is omitted.
    expect(init?.method).toBeUndefined();
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer bearer-token-1");
    expect(headers.Accept).toBe("application/json");
    expect(init?.cache).toBe("no-store");
  });
});

describe("fetchFirstGa4Property — happy path + fallbacks", () => {
  it("returns the first property from the first account, stripping the properties/ prefix", async () => {
    fetchSpy.mockResolvedValueOnce(
      okResponse({
        accountSummaries: [
          {
            displayName: "Acme AU",
            propertySummaries: [
              { property: "properties/123456789", displayName: "acme.com" },
            ],
          },
        ],
      }),
    );
    const p = await fetchFirstGa4Property("at");
    expect(p).toEqual({
      propertyId: "123456789",
      displayName: "acme.com",
      accountName: "Acme AU",
    });
  });

  it("falls back to the property id as displayName when the summary omits displayName", async () => {
    fetchSpy.mockResolvedValueOnce(
      okResponse({
        accountSummaries: [
          {
            displayName: "Acme AU",
            propertySummaries: [{ property: "properties/42" }],
          },
        ],
      }),
    );
    const p = await fetchFirstGa4Property("at");
    expect(p?.displayName).toBe("42");
  });

  it("falls back to empty accountName when the account summary omits displayName", async () => {
    fetchSpy.mockResolvedValueOnce(
      okResponse({
        accountSummaries: [
          {
            propertySummaries: [
              { property: "properties/42", displayName: "acme.com" },
            ],
          },
        ],
      }),
    );
    const p = await fetchFirstGa4Property("at");
    expect(p?.accountName).toBe("");
  });

  it("skips property entries missing the required `property` field and returns the next viable one", async () => {
    fetchSpy.mockResolvedValueOnce(
      okResponse({
        accountSummaries: [
          {
            displayName: "Acme AU",
            propertySummaries: [
              { displayName: "skip-me" }, // no property field → skipped
              { property: "properties/999", displayName: "keep-me" },
            ],
          },
        ],
      }),
    );
    const p = await fetchFirstGa4Property("at");
    expect(p?.propertyId).toBe("999");
    expect(p?.displayName).toBe("keep-me");
  });

  it("walks past an empty-propertySummaries account into the next account", async () => {
    fetchSpy.mockResolvedValueOnce(
      okResponse({
        accountSummaries: [
          { displayName: "Empty account", propertySummaries: [] },
          {
            displayName: "Second account",
            propertySummaries: [{ property: "properties/7" }],
          },
        ],
      }),
    );
    const p = await fetchFirstGa4Property("at");
    expect(p?.accountName).toBe("Second account");
    expect(p?.propertyId).toBe("7");
  });

  it("only strips the leading `properties/` prefix — a bare id is returned unchanged", async () => {
    // Guard against Google returning a bare id (never happens today but the
    // regex is anchored, so a bare id must not be corrupted by .replace).
    fetchSpy.mockResolvedValueOnce(
      okResponse({
        accountSummaries: [
          {
            displayName: "Acme AU",
            propertySummaries: [{ property: "bare-id" }],
          },
        ],
      }),
    );
    const p = await fetchFirstGa4Property("at");
    expect(p?.propertyId).toBe("bare-id");
  });

  it("returns null when the response is non-2xx (permissions revoked / token expired)", async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(401));
    const p = await fetchFirstGa4Property("stale-token");
    expect(p).toBeNull();
  });

  it("returns null when accountSummaries is missing entirely", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({}));
    const p = await fetchFirstGa4Property("at");
    expect(p).toBeNull();
  });

  it("returns null when every property in every account is unusable", async () => {
    fetchSpy.mockResolvedValueOnce(
      okResponse({
        accountSummaries: [
          { displayName: "A", propertySummaries: [{ displayName: "no property field" }] },
          { displayName: "B", propertySummaries: [] },
        ],
      }),
    );
    const p = await fetchFirstGa4Property("at");
    expect(p).toBeNull();
  });
});

/* ─── fetchGa4Stats ─────────────────────────────────────────────────── */

const PROP: GA4PropertySummary = {
  propertyId: "123456789",
  displayName: "acme.com",
  accountName: "Acme AU",
};

describe("fetchGa4Stats — wire contract", () => {
  it("POSTs to the property-scoped runReport endpoint with a Bearer token", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ rows: [] }));
    await fetchGa4Stats("at", PROP);
    const [url, init] = fetchSpy.mock.calls[0] as FetchArgs;
    expect(url).toBe(
      "https://analyticsdata.googleapis.com/v1beta/properties/123456789:runReport",
    );
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer at");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init?.cache).toBe("no-store");
  });

  it("uses the default 30-day window when the caller omits windowDays", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ rows: [] }));
    await fetchGa4Stats("at", PROP);
    const [, init] = fetchSpy.mock.calls[0] as FetchArgs;
    const body = JSON.parse(String(init?.body ?? "{}"));
    expect(body.dateRanges).toEqual([{ startDate: "30daysAgo", endDate: "today" }]);
  });

  it("threads a custom windowDays into the dateRanges body", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ rows: [] }));
    await fetchGa4Stats("at", PROP, 7);
    const [, init] = fetchSpy.mock.calls[0] as FetchArgs;
    const body = JSON.parse(String(init?.body ?? "{}"));
    expect(body.dateRanges).toEqual([{ startDate: "7daysAgo", endDate: "today" }]);
  });

  it("requests both sessions and bounceRate metrics in a single call", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ rows: [] }));
    await fetchGa4Stats("at", PROP);
    const [, init] = fetchSpy.mock.calls[0] as FetchArgs;
    const body = JSON.parse(String(init?.body ?? "{}"));
    expect(body.metrics).toEqual([{ name: "sessions" }, { name: "bounceRate" }]);
  });
});

describe("fetchGa4Stats — response parsing + fallbacks", () => {
  it("returns rounded sessions + rounded-to-1-dp bounceRate when the row is well-formed", async () => {
    // GA4 returns fractional sessions during sampling; percent must be
    // integer-clean but bounceRate carries one decimal for the dashboard.
    fetchSpy.mockResolvedValueOnce(
      okResponse({
        rows: [{ metricValues: [{ value: "12345.4" }, { value: "0.4237" }] }],
      }),
    );
    const s = await fetchGa4Stats("at", PROP);
    expect(s).toEqual({
      propertyId: "123456789",
      displayName: "acme.com",
      monthlySessions: 12345,
      bounceRatePct: 42.4,
      windowDays: 30,
    });
  });

  it("converts a fractional bounceRate (<=1) into percent by multiplying by 100", async () => {
    // Data API returns bounceRate as a 0..1 fraction; UI wants percent.
    fetchSpy.mockResolvedValueOnce(
      okResponse({ rows: [{ metricValues: [{ value: "500" }, { value: "0.6" }] }] }),
    );
    const s = await fetchGa4Stats("at", PROP);
    expect(s?.bounceRatePct).toBe(60);
  });

  it("passes through an already-percent bounceRate (>1) without re-multiplying", async () => {
    // Some Admin API responses return the same metric already scaled;
    // guard against a "0.42 → 42 → 4200" double-scale bug.
    fetchSpy.mockResolvedValueOnce(
      okResponse({ rows: [{ metricValues: [{ value: "500" }, { value: "42.3" }] }] }),
    );
    const s = await fetchGa4Stats("at", PROP);
    expect(s?.bounceRatePct).toBe(42.3);
  });

  it("returns a zero-filled stats row (not null) when the report has no rows — brand-new property", async () => {
    // A freshly-installed property with zero traffic must still surface a
    // row so the founder sees "0 sessions" rather than "not connected".
    fetchSpy.mockResolvedValueOnce(okResponse({ rows: [] }));
    const s = await fetchGa4Stats("at", PROP, 14);
    expect(s).toEqual({
      propertyId: "123456789",
      displayName: "acme.com",
      monthlySessions: 0,
      bounceRatePct: 0,
      windowDays: 14,
    });
  });

  it("returns a zero-filled stats row when the response omits `rows` entirely", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({}));
    const s = await fetchGa4Stats("at", PROP);
    expect(s?.monthlySessions).toBe(0);
    expect(s?.bounceRatePct).toBe(0);
  });

  it("coerces missing metricValues into 0 without throwing", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ rows: [{}] }));
    const s = await fetchGa4Stats("at", PROP);
    expect(s?.monthlySessions).toBe(0);
    expect(s?.bounceRatePct).toBe(0);
  });

  it("treats a bounceRate string of `0` as a genuine zero (no percent conversion)", async () => {
    fetchSpy.mockResolvedValueOnce(
      okResponse({ rows: [{ metricValues: [{ value: "100" }, { value: "0" }] }] }),
    );
    const s = await fetchGa4Stats("at", PROP);
    // Zero must be preserved as zero — the >0 guard on the percent branch
    // prevents accidentally multiplying zero by 100 and shifting the
    // scoring band.
    expect(s?.bounceRatePct).toBe(0);
  });

  it("returns null when the response is non-2xx (403 property misconfigured)", async () => {
    fetchSpy.mockResolvedValueOnce(errorResponse(403));
    const s = await fetchGa4Stats("at", PROP);
    expect(s).toBeNull();
  });
});

/* ─── scoreGa4Stats ─────────────────────────────────────────────────── */

describe("scoreGa4Stats — pure impact scorer", () => {
  const base = { propertyId: "1", displayName: "x", windowDays: 30 };

  it("returns the base score of 3 when sessions=0 and bounceRate=0 (fresh install)", () => {
    expect(scoreGa4Stats({ ...base, monthlySessions: 0, bounceRatePct: 0 })).toBe(3);
  });

  it("adds +1 to base when sessions cross 100 (nascent traction)", () => {
    expect(scoreGa4Stats({ ...base, monthlySessions: 100, bounceRatePct: 0 })).toBe(4);
  });

  it("adds +2 to base when sessions cross 1_000", () => {
    expect(scoreGa4Stats({ ...base, monthlySessions: 1_000, bounceRatePct: 0 })).toBe(5);
  });

  it("adds +4 to base when sessions cross 10_000", () => {
    expect(scoreGa4Stats({ ...base, monthlySessions: 10_000, bounceRatePct: 0 })).toBe(7);
  });

  it("adds +5 to base when sessions cross 50_000 (top sessions band)", () => {
    expect(scoreGa4Stats({ ...base, monthlySessions: 50_000, bounceRatePct: 0 })).toBe(8);
  });

  it("adds +2 when bounceRate is in the healthy band (0 < bounce ≤ 40)", () => {
    expect(scoreGa4Stats({ ...base, monthlySessions: 0, bounceRatePct: 40 })).toBe(5);
    expect(scoreGa4Stats({ ...base, monthlySessions: 0, bounceRatePct: 25 })).toBe(5);
  });

  it("adds +1 when bounceRate is in the acceptable band (40 < bounce ≤ 60)", () => {
    expect(scoreGa4Stats({ ...base, monthlySessions: 0, bounceRatePct: 60 })).toBe(4);
    expect(scoreGa4Stats({ ...base, monthlySessions: 0, bounceRatePct: 50 })).toBe(4);
  });

  it("adds nothing when bounceRate is above 60% (poor engagement)", () => {
    expect(scoreGa4Stats({ ...base, monthlySessions: 0, bounceRatePct: 75 })).toBe(3);
  });

  it("does not credit bounceRate=0 as a healthy bounce (no data ≠ good data)", () => {
    // The guard `stats.bounceRatePct > 0` prevents a brand-new property
    // with zero traffic from getting a phantom +2 for a "great" bounce.
    expect(scoreGa4Stats({ ...base, monthlySessions: 100, bounceRatePct: 0 })).toBe(4);
  });

  it("caps the maximum score at 10 even when both dimensions are maxed out", () => {
    // Sessions max = base(3) + 5 = 8; bounce healthy = +2 → 10.
    expect(
      scoreGa4Stats({ ...base, monthlySessions: 250_000, bounceRatePct: 20 }),
    ).toBe(10);
  });

  it("still caps at 10 when the raw sum would exceed 10 (defensive Math.min)", () => {
    // Same input as above — this pin ensures a future +N boost doesn't
    // silently push the SVI mkt dimension above the pinned cap.
    expect(
      scoreGa4Stats({ ...base, monthlySessions: 999_999, bounceRatePct: 15 }),
    ).toBe(10);
  });

  it("uses ≥-thresholds (band edges qualify — 100/1000/10000/50000 all land on the higher band)", () => {
    // Off-by-one guard: an exactly-1000 property must be in the "≥1000"
    // band, not the "≥100" band.
    expect(scoreGa4Stats({ ...base, monthlySessions: 100, bounceRatePct: 0 })).toBe(4);
    expect(scoreGa4Stats({ ...base, monthlySessions: 999, bounceRatePct: 0 })).toBe(4);
    expect(scoreGa4Stats({ ...base, monthlySessions: 1_000, bounceRatePct: 0 })).toBe(5);
  });

  it("takes only the highest matching sessions band (else-if cascade, not additive)", () => {
    // A property with 100_000 sessions must add +5 once, not +5+4+2+1 = 12.
    expect(
      scoreGa4Stats({ ...base, monthlySessions: 100_000, bounceRatePct: 0 }),
    ).toBe(8);
  });
});
