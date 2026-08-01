import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Colocated vitest for the previously-untested server-only
// `oauth-ga4-signals.ts` — the Google Analytics 4 evidence connector
// that backs the founder Evidence tab (traction signals surfaced on
// /dashboard/evidence). Regressions here are user-visible AND scoring-
// visible in the same way as `oauth-github-signals.ts`:
//   (a) losing the `properties/` prefix strip in `fetchGa4Signals`
//       double-encodes the property ID into `runReport` URLs like
//       `.../properties/properties/12345:runReport`, which GA4 rejects
//       with 400 — the Evidence tab then hard-errors instead of
//       degrading, and the founder's Traction band loses its GA4
//       inputs entirely;
//   (b) losing the `!res.ok` throw on `runReport` silently reports
//       zero sessions / users / conversions on the very first quota
//       hit or expired token — the SVI Traction band then drops from
//       band 4 down to 1 with no signal to the founder;
//   (c) losing the metric-order contract (sessions, newUsers,
//       conversions, averageSessionDuration) swaps the four fields on
//       the returned `Ga4Signals` — every downstream chart, digest,
//       and export then displays "sessions" numbers under "new users"
//       and vice versa;
//   (d) losing the `Math.round` on `averageSessionDurationSec` leaks
//       Google's fractional-second float into the seconds field the
//       report renderer treats as an int;
//   (e) losing the `Number(...) || 0` guard turns a `null` / `""` /
//       `"abc"` metric value into `NaN` — every downstream sum,
//       average, and formatted string then becomes `NaN`;
//   (f) losing the empty-rows guard (`json.rows?.[0]?.metricValues ??
//       []`) throws on the well-documented "empty report" GA4 answer
//       (a property with no traffic in the 30-day window);
//   (g) `listGa4Properties` losing the `!res.ok` short-circuit throws
//       instead of returning `[]` — the property picker in
//       /dashboard/connectors then fails to render;
//   (h) losing the `properties/` prefix strip in `listGa4Properties`
//       yields IDs that then double-encode when fed back into
//       `fetchGa4Signals`;
//   (i) `listGa4Properties` losing the `if (!propertyId) continue`
//       guard emits `{ propertyId: "", ... }` picker entries the UI
//       cannot resolve;
//   (j) losing the `p.displayName ?? propertyId` fallback shows
//       `undefined` labels in the picker;
//   (k) losing the account-loop / property-loop nesting silently
//       drops properties from any account after the first.
//
// Fetch is stubbed globally with a per-URL responder queue so every
// GA4 API contract assertion (URL + headers + method + body) rides the
// real production codepath. `server-only` is neutered by the vitest
// alias in `web/vitest.config.ts` so no runtime shim import is needed.

import {
  fetchGa4Signals,
  listGa4Properties,
  type Ga4Signals,
  type Ga4Property,
} from "./oauth-ga4-signals";

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

interface Responder {
  match: (url: string) => boolean;
  respond: () => Response | Promise<Response>;
}

const calls: FetchCall[] = [];
const responders: Responder[] = [];

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function queue(match: string | RegExp, body: unknown, init: ResponseInit = {}): void {
  responders.push({
    match:
      typeof match === "string"
        ? (u) => u === match
        : (u) => match.test(u),
    respond: () => jsonResponse(body, init),
  });
}

function queueStatus(
  match: string | RegExp,
  status: number,
  body: unknown = "",
): void {
  responders.push({
    match:
      typeof match === "string"
        ? (u) => u === match
        : (u) => match.test(u),
    respond: () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  });
}

function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();
  calls.push({ url, init });
  for (let i = 0; i < responders.length; i += 1) {
    if (responders[i].match(url)) {
      const r = responders[i];
      responders.splice(i, 1);
      return Promise.resolve(r.respond());
    }
  }
  throw new Error(`fakeFetch: no responder queued for ${url}`);
}

const RUN_REPORT_URL_RE = /^https:\/\/analyticsdata\.googleapis\.com\/v1beta\/properties\/[^/]+:runReport$/;
const ACCOUNT_SUMMARIES_URL =
  "https://analyticsadmin.googleapis.com/v1beta/accountSummaries";

function metricRow(values: Array<string | null | undefined>): {
  metricValues: Array<{ value?: string }>;
} {
  return {
    metricValues: values.map((v) =>
      v === undefined ? {} : { value: v ?? undefined },
    ),
  };
}

beforeEach(() => {
  calls.length = 0;
  responders.length = 0;
  vi.stubGlobal("fetch", fakeFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchGa4Signals — happy path shape", () => {
  it("returns a fully-populated Ga4Signals object when runReport answers with all four metrics", async () => {
    queue(RUN_REPORT_URL_RE, {
      rows: [metricRow(["100", "40", "5", "180"])],
    });
    const out = await fetchGa4Signals("token-A", "12345");
    const expected: Ga4Signals = {
      sessions30d: 100,
      newUsers30d: 40,
      conversions30d: 5,
      averageSessionDurationSec: 180,
    };
    expect(out).toEqual(expected);
  });

  it("rounds fractional metric values to the nearest integer", async () => {
    queue(RUN_REPORT_URL_RE, {
      rows: [metricRow(["100.4", "40.7", "5.5", "180.51"])],
    });
    const out = await fetchGa4Signals("tok", "12345");
    expect(out).toEqual({
      sessions30d: 100,
      newUsers30d: 41,
      conversions30d: 6,
      averageSessionDurationSec: 181,
    });
  });

  it("rounds averageSessionDurationSec — the field is documented as seconds, not fractional-seconds", async () => {
    queue(RUN_REPORT_URL_RE, {
      rows: [metricRow(["0", "0", "0", "42.9"])],
    });
    const out = await fetchGa4Signals("tok", "12345");
    expect(out.averageSessionDurationSec).toBe(43);
    expect(Number.isInteger(out.averageSessionDurationSec)).toBe(true);
  });

  it("returns zeros when the report answers with no rows (property with no traffic)", async () => {
    queue(RUN_REPORT_URL_RE, { rows: [] });
    const out = await fetchGa4Signals("tok", "12345");
    expect(out).toEqual({
      sessions30d: 0,
      newUsers30d: 0,
      conversions30d: 0,
      averageSessionDurationSec: 0,
    });
  });

  it("returns zeros when the report answers without a `rows` key", async () => {
    queue(RUN_REPORT_URL_RE, {});
    const out = await fetchGa4Signals("tok", "12345");
    expect(out.sessions30d).toBe(0);
    expect(out.newUsers30d).toBe(0);
    expect(out.conversions30d).toBe(0);
    expect(out.averageSessionDurationSec).toBe(0);
  });

  it("treats a missing metricValues entry as zero rather than throwing", async () => {
    queue(RUN_REPORT_URL_RE, {
      rows: [metricRow(["10", undefined, undefined, undefined])],
    });
    const out = await fetchGa4Signals("tok", "12345");
    expect(out.sessions30d).toBe(10);
    expect(out.newUsers30d).toBe(0);
    expect(out.conversions30d).toBe(0);
    expect(out.averageSessionDurationSec).toBe(0);
  });

  it("treats an explicit null value as zero (via the `|| 0` NaN guard)", async () => {
    queue(RUN_REPORT_URL_RE, {
      rows: [metricRow([null, null, null, null])],
    });
    const out = await fetchGa4Signals("tok", "12345");
    expect(out.sessions30d).toBe(0);
    expect(out.newUsers30d).toBe(0);
    expect(out.conversions30d).toBe(0);
    expect(out.averageSessionDurationSec).toBe(0);
  });

  it("treats a non-numeric string as zero rather than NaN (the `|| 0` fallback)", async () => {
    queue(RUN_REPORT_URL_RE, {
      rows: [metricRow(["abc", "xyz", "not-a-number", ""])],
    });
    const out = await fetchGa4Signals("tok", "12345");
    // Number("") === 0 without needing the || fallback; NaN inputs are the
    // real target of the guard.
    expect(out.sessions30d).toBe(0);
    expect(out.newUsers30d).toBe(0);
    expect(out.conversions30d).toBe(0);
    expect(Number.isNaN(out.averageSessionDurationSec)).toBe(false);
  });
});

describe("fetchGa4Signals — propertyId normalisation", () => {
  it("strips the `properties/` prefix before building the runReport URL", async () => {
    queue(RUN_REPORT_URL_RE, { rows: [metricRow(["1", "1", "1", "1"])] });
    await fetchGa4Signals("tok", "properties/999888");
    expect(calls[0].url).toBe(
      "https://analyticsdata.googleapis.com/v1beta/properties/999888:runReport",
    );
  });

  it("accepts a bare property ID and does not mangle it", async () => {
    queue(RUN_REPORT_URL_RE, { rows: [metricRow(["1", "1", "1", "1"])] });
    await fetchGa4Signals("tok", "555");
    expect(calls[0].url).toBe(
      "https://analyticsdata.googleapis.com/v1beta/properties/555:runReport",
    );
  });

  it("only strips a *leading* `properties/` — an accidental inline slash stays intact", async () => {
    queue(/:runReport$/, { rows: [metricRow(["1", "1", "1", "1"])] });
    // The regex is anchored to the start of the string, so a non-leading
    // occurrence must NOT be stripped (it would be an entirely different bug).
    await fetchGa4Signals("tok", "abc/properties/456");
    expect(calls[0].url).toContain("/properties/abc/properties/456:runReport");
  });
});

describe("fetchGa4Signals — request contract", () => {
  it("issues a POST request", async () => {
    queue(RUN_REPORT_URL_RE, { rows: [metricRow(["0", "0", "0", "0"])] });
    await fetchGa4Signals("tok", "1");
    expect(calls[0].init?.method).toBe("POST");
  });

  it("sends Bearer authorization header with the supplied access token", async () => {
    queue(RUN_REPORT_URL_RE, { rows: [metricRow(["0", "0", "0", "0"])] });
    await fetchGa4Signals("shhh-secret", "1");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer shhh-secret");
  });

  it("sends Content-Type application/json (GA4 rejects other media types on runReport)", async () => {
    queue(RUN_REPORT_URL_RE, { rows: [metricRow(["0", "0", "0", "0"])] });
    await fetchGa4Signals("tok", "1");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("sends Accept application/json", async () => {
    queue(RUN_REPORT_URL_RE, { rows: [metricRow(["0", "0", "0", "0"])] });
    await fetchGa4Signals("tok", "1");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/json");
  });

  it("uses no-store cache mode so signals are always fresh", async () => {
    queue(RUN_REPORT_URL_RE, { rows: [metricRow(["0", "0", "0", "0"])] });
    await fetchGa4Signals("tok", "1");
    expect(calls[0].init?.cache).toBe("no-store");
  });

  it("sends the 30-day rolling window (`30daysAgo` → `today`)", async () => {
    queue(RUN_REPORT_URL_RE, { rows: [metricRow(["0", "0", "0", "0"])] });
    await fetchGa4Signals("tok", "1");
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.dateRanges).toEqual([
      { startDate: "30daysAgo", endDate: "today" },
    ]);
  });

  it("requests the four metrics in the exact order the return-shape mapping depends on", async () => {
    queue(RUN_REPORT_URL_RE, { rows: [metricRow(["0", "0", "0", "0"])] });
    await fetchGa4Signals("tok", "1");
    const body = JSON.parse(calls[0].init?.body as string);
    // Order is load-bearing: fetchGa4Signals reads metricValues[0..3] as
    // sessions/newUsers/conversions/averageSessionDuration. Reordering
    // here silently swaps the four fields on the returned signal object.
    expect(body.metrics).toEqual([
      { name: "sessions" },
      { name: "newUsers" },
      { name: "conversions" },
      { name: "averageSessionDuration" },
    ]);
  });

  it("does not send any dimensions (property-wide aggregate report)", async () => {
    queue(RUN_REPORT_URL_RE, { rows: [metricRow(["0", "0", "0", "0"])] });
    await fetchGa4Signals("tok", "1");
    const body = JSON.parse(calls[0].init?.body as string);
    expect(body.dimensions).toBeUndefined();
  });

  it("body is valid JSON (a string, not a Buffer / FormData / URLSearchParams)", async () => {
    queue(RUN_REPORT_URL_RE, { rows: [metricRow(["0", "0", "0", "0"])] });
    await fetchGa4Signals("tok", "1");
    expect(typeof calls[0].init?.body).toBe("string");
    expect(() => JSON.parse(calls[0].init?.body as string)).not.toThrow();
  });
});

describe("fetchGa4Signals — error handling", () => {
  it("throws when runReport returns a non-2xx status (token expired / quota hit)", async () => {
    queueStatus(RUN_REPORT_URL_RE, 401, "auth failed");
    await expect(fetchGa4Signals("bad-token", "1")).rejects.toThrow(
      /GA4 runReport failed: 401/,
    );
  });

  it("includes the response body text in the thrown Error message", async () => {
    queueStatus(RUN_REPORT_URL_RE, 500, "internal boom");
    await expect(fetchGa4Signals("tok", "1")).rejects.toThrow(/internal boom/);
  });

  it("surfaces the numeric status code alongside the body text", async () => {
    queueStatus(RUN_REPORT_URL_RE, 403, "permission denied");
    await expect(fetchGa4Signals("tok", "1")).rejects.toThrow(
      /403 permission denied/,
    );
  });

  it("does NOT throw when the report body is well-formed but empty (property with no traffic)", async () => {
    queue(RUN_REPORT_URL_RE, { rows: [] });
    await expect(fetchGa4Signals("tok", "1")).resolves.toBeDefined();
  });

  it("does NOT throw when the metricValues array is shorter than 4 entries", async () => {
    queue(RUN_REPORT_URL_RE, { rows: [{ metricValues: [{ value: "1" }] }] });
    const out = await fetchGa4Signals("tok", "1");
    expect(out.sessions30d).toBe(1);
    expect(out.newUsers30d).toBe(0);
    expect(out.conversions30d).toBe(0);
    expect(out.averageSessionDurationSec).toBe(0);
  });
});

describe("listGa4Properties — happy path shape", () => {
  it("returns a flat list of {propertyId, displayName, parent} entries", async () => {
    queue(ACCOUNT_SUMMARIES_URL, {
      accountSummaries: [
        {
          account: "accounts/1",
          displayName: "BlockID AU",
          propertySummaries: [
            {
              property: "properties/12345",
              displayName: "blockid.au",
              parent: "accounts/1",
            },
          ],
        },
      ],
    });
    const out = await listGa4Properties("tok");
    const expected: Ga4Property[] = [
      { propertyId: "12345", displayName: "blockid.au", parent: "BlockID AU" },
    ];
    expect(out).toEqual(expected);
  });

  it("flattens across multiple accounts, each with multiple properties", async () => {
    queue(ACCOUNT_SUMMARIES_URL, {
      accountSummaries: [
        {
          displayName: "Acct A",
          propertySummaries: [
            { property: "properties/1", displayName: "one" },
            { property: "properties/2", displayName: "two" },
          ],
        },
        {
          displayName: "Acct B",
          propertySummaries: [
            { property: "properties/3", displayName: "three" },
          ],
        },
      ],
    });
    const out = await listGa4Properties("tok");
    expect(out).toHaveLength(3);
    expect(out.map((p) => p.propertyId)).toEqual(["1", "2", "3"]);
    expect(out.map((p) => p.parent)).toEqual(["Acct A", "Acct A", "Acct B"]);
  });

  it("strips the `properties/` prefix from every returned property ID", async () => {
    queue(ACCOUNT_SUMMARIES_URL, {
      accountSummaries: [
        {
          displayName: "acct",
          propertySummaries: [
            { property: "properties/abc" },
            { property: "properties/xyz" },
          ],
        },
      ],
    });
    const out = await listGa4Properties("tok");
    expect(out.map((p) => p.propertyId)).toEqual(["abc", "xyz"]);
  });

  it("falls back to the propertyId as displayName when the summary omits displayName", async () => {
    queue(ACCOUNT_SUMMARIES_URL, {
      accountSummaries: [
        {
          displayName: "acct",
          propertySummaries: [{ property: "properties/42" }],
        },
      ],
    });
    const out = await listGa4Properties("tok");
    expect(out[0].displayName).toBe("42");
  });

  it("uses account.displayName for the parent field", async () => {
    queue(ACCOUNT_SUMMARIES_URL, {
      accountSummaries: [
        {
          displayName: "My Company",
          propertySummaries: [{ property: "properties/1", displayName: "site" }],
        },
      ],
    });
    const out = await listGa4Properties("tok");
    expect(out[0].parent).toBe("My Company");
  });

  it("falls back to empty-string parent when account.displayName is absent", async () => {
    queue(ACCOUNT_SUMMARIES_URL, {
      accountSummaries: [
        {
          propertySummaries: [{ property: "properties/1", displayName: "site" }],
        },
      ],
    });
    const out = await listGa4Properties("tok");
    expect(out[0].parent).toBe("");
  });
});

describe("listGa4Properties — degradation and edge cases", () => {
  it("returns [] on a non-2xx status (no throw)", async () => {
    queueStatus(ACCOUNT_SUMMARIES_URL, 401);
    const out = await listGa4Properties("bad-token");
    expect(out).toEqual([]);
  });

  it("returns [] on a 500", async () => {
    queueStatus(ACCOUNT_SUMMARIES_URL, 500, "boom");
    const out = await listGa4Properties("tok");
    expect(out).toEqual([]);
  });

  it("returns [] when the payload omits accountSummaries entirely", async () => {
    queue(ACCOUNT_SUMMARIES_URL, {});
    const out = await listGa4Properties("tok");
    expect(out).toEqual([]);
  });

  it("returns [] when accountSummaries is an empty array", async () => {
    queue(ACCOUNT_SUMMARIES_URL, { accountSummaries: [] });
    const out = await listGa4Properties("tok");
    expect(out).toEqual([]);
  });

  it("skips accounts whose propertySummaries key is missing entirely", async () => {
    queue(ACCOUNT_SUMMARIES_URL, {
      accountSummaries: [{ displayName: "empty acct" }],
    });
    const out = await listGa4Properties("tok");
    expect(out).toEqual([]);
  });

  it("skips property summaries whose `property` field is missing", async () => {
    queue(ACCOUNT_SUMMARIES_URL, {
      accountSummaries: [
        {
          displayName: "acct",
          propertySummaries: [
            { displayName: "orphan" },
            { property: "properties/9", displayName: "ok" },
          ],
        },
      ],
    });
    const out = await listGa4Properties("tok");
    expect(out).toHaveLength(1);
    expect(out[0].propertyId).toBe("9");
  });

  it("skips property summaries where `property` is exactly `properties/` (empty ID after strip)", async () => {
    queue(ACCOUNT_SUMMARIES_URL, {
      accountSummaries: [
        {
          displayName: "acct",
          propertySummaries: [
            { property: "properties/", displayName: "orphan" },
            { property: "properties/7", displayName: "ok" },
          ],
        },
      ],
    });
    const out = await listGa4Properties("tok");
    expect(out.map((p) => p.propertyId)).toEqual(["7"]);
  });

  it("preserves order — properties come back in account-then-property order", async () => {
    queue(ACCOUNT_SUMMARIES_URL, {
      accountSummaries: [
        {
          displayName: "A",
          propertySummaries: [
            { property: "properties/a1" },
            { property: "properties/a2" },
          ],
        },
        {
          displayName: "B",
          propertySummaries: [
            { property: "properties/b1" },
          ],
        },
      ],
    });
    const out = await listGa4Properties("tok");
    expect(out.map((p) => `${p.parent}:${p.propertyId}`)).toEqual([
      "A:a1",
      "A:a2",
      "B:b1",
    ]);
  });
});

describe("listGa4Properties — request contract", () => {
  it("hits the analyticsadmin.googleapis.com accountSummaries endpoint (v1beta)", async () => {
    queue(ACCOUNT_SUMMARIES_URL, {});
    await listGa4Properties("tok");
    expect(calls[0].url).toBe(ACCOUNT_SUMMARIES_URL);
  });

  it("sends Bearer authorization header with the supplied token", async () => {
    queue(ACCOUNT_SUMMARIES_URL, {});
    await listGa4Properties("hidden-token");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer hidden-token");
  });

  it("sends Accept application/json", async () => {
    queue(ACCOUNT_SUMMARIES_URL, {});
    await listGa4Properties("tok");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/json");
  });

  it("uses no-store cache mode (do not cache per-user OAuth listings)", async () => {
    queue(ACCOUNT_SUMMARIES_URL, {});
    await listGa4Properties("tok");
    expect(calls[0].init?.cache).toBe("no-store");
  });

  it("does not send a method (defaults to GET — the endpoint is read-only)", async () => {
    queue(ACCOUNT_SUMMARIES_URL, {});
    await listGa4Properties("tok");
    expect(calls[0].init?.method).toBeUndefined();
  });

  it("does not send a body on the GET request", async () => {
    queue(ACCOUNT_SUMMARIES_URL, {});
    await listGa4Properties("tok");
    expect(calls[0].init?.body).toBeUndefined();
  });

  it("does not send a Content-Type header on the GET request", async () => {
    queue(ACCOUNT_SUMMARIES_URL, {});
    await listGa4Properties("tok");
    const headers = calls[0].init?.headers as Record<string, string> | undefined;
    // The module only sets Authorization + Accept on this call. A stray
    // Content-Type header would mis-signal a request body.
    expect(headers?.["Content-Type"]).toBeUndefined();
  });
});
