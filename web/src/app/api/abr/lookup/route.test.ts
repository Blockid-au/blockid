// Unit tests for GET /api/abr/lookup — P9-abr-lookup-route-test.
//
// Contract source: docs/plans/atlassian-standard-mapping-goal.md §1 phase 1
// ("live ABR ABN-lookup probe", P0 raise-blocker, spun off as P1g).
//
// A silent regression here would break the Chapter-1 trust signal a founder
// hits before an investor asks the same. Pins:
//   - the `?abn=` presence + normalization guard (11-digit rule via
//     normalizeAbn) — a drop would let arbitrary strings through into
//     validateAbnChecksum's downstream branches;
//   - the checksum short-circuit — a bad ABN must NOT trigger a
//     `lookupAbnLive()` round-trip (the module comment says "ABR would just
//     reject it and we save the round-trip" — if the loop calls ABR on every
//     typo we exhaust the free-tier quota in an afternoon);
//   - the cache-control differentiation between the two 200 branches
//     (max-age=60 for the checksum-failed body, max-age=3600 + s-maxage=3600
//     for the live body) — the CDN policy the route inlines;
//   - `abn_formatted` is populated on every 200 (the `formatAbn(abn) ?? abn`
//     fallback pins that no branch drops the display-friendly string);
//   - `source` flips between "checksum" and "abr-live" based on whether the
//     live lookup returned a `live` payload — the client uses this to decide
//     whether to render the entity_name or a "checksum only" pill;
//   - the 400 body carries `{error, message, input}` with the raw input
//     echoed back (helps debugging when a founder pastes weird input from a
//     PDF), and message mentions "11 digits" — the exact copy the Chapter-1
//     surface reads.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { AbnLiveDetails } from "@/lib/compliance/abn";

const lookupAbnLiveMock = vi.fn<
  (abn: string) => Promise<{ live: AbnLiveDetails | null; live_error: string | null }>
>();

vi.mock("@/lib/compliance/abn", async () => {
  const actual = await vi.importActual<typeof import("@/lib/compliance/abn")>(
    "@/lib/compliance/abn",
  );
  return {
    ...actual,
    lookupAbnLive: (abn: string) => lookupAbnLiveMock(abn),
  };
});

import { GET, dynamic, runtime } from "./route";

function req(url: string): NextRequest {
  // The route only reads `req.url`; a plain Request is enough.
  return new Request(url) as unknown as NextRequest;
}

// A real valid ABN (Auschain PTY LTD) — sums to 89*4 = 356, checksum passes.
const VALID_ABN = "79659615111";

function liveOk(): AbnLiveDetails {
  return {
    entity_name: "AUSCHAIN PTY LTD",
    entity_type_name: "Australian Private Company",
    abn_status: "Active",
    abn_status_effective_from: "2022-06-24",
    gst_registered: false,
    gst_effective_from: null,
    business_state: "NSW",
    business_postcode: "2000",
    acn: "659615111",
  };
}

beforeEach(() => {
  lookupAbnLiveMock.mockReset();
  lookupAbnLiveMock.mockResolvedValue({ live: liveOk(), live_error: null });
});

// ---------------------------------------------------------------------------
// Route module invariants
// ---------------------------------------------------------------------------

describe("GET /api/abr/lookup — route module invariants", () => {
  it('exports dynamic = "force-dynamic" so lookups never cache at the App-Router layer', () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it('exports runtime = "nodejs" — the live lookup uses AbortController + node fetch', () => {
    expect(runtime).toBe("nodejs");
  });
});

// ---------------------------------------------------------------------------
// 400 — invalid input branch
// ---------------------------------------------------------------------------

describe("GET /api/abr/lookup — invalid input", () => {
  it("returns 400 when the abn query param is missing entirely", async () => {
    const res = await GET(req("http://x/api/abr/lookup"));
    expect(res.status).toBe(400);
  });

  it("400 body carries {error, message, input:null} when the param is missing", async () => {
    const res = await GET(req("http://x/api/abr/lookup"));
    const body = (await res.json()) as { error: string; message: string; input: string | null };
    expect(body.error).toBe("invalid_abn_format");
    expect(body.message).toMatch(/11 digits/);
    expect(body.input).toBeNull();
  });

  it("returns 400 with input echoed back when the param is not 11 digits", async () => {
    const res = await GET(req("http://x/api/abr/lookup?abn=123"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; input: string };
    expect(body.error).toBe("invalid_abn_format");
    expect(body.input).toBe("123");
  });

  it("returns 400 for non-digit garbage that normalizes to empty", async () => {
    const res = await GET(req("http://x/api/abr/lookup?abn=abcdefg"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an ABN with 10 digits (one short)", async () => {
    const res = await GET(req("http://x/api/abr/lookup?abn=7965961511"));
    expect(res.status).toBe(400);
  });

  it("returns 400 for an ABN with 12 digits (one long)", async () => {
    const res = await GET(req("http://x/api/abr/lookup?abn=796596151119"));
    expect(res.status).toBe(400);
  });

  it("returns 400 when the param is an empty string (?abn=)", async () => {
    const res = await GET(req("http://x/api/abr/lookup?abn="));
    expect(res.status).toBe(400);
  });

  it("does NOT call lookupAbnLive on the 400 branch — no wasted ABR round-trip", async () => {
    await GET(req("http://x/api/abr/lookup?abn=123"));
    expect(lookupAbnLiveMock).not.toHaveBeenCalled();
  });

  it("400 responses do not carry a cache-control header (default fetch semantics)", async () => {
    const res = await GET(req("http://x/api/abr/lookup"));
    // The route only sets cache-control on the two 200 branches; the 400
    // branch inherits Next's default (no explicit header), so assert absence
    // to pin that a stale-if-error CDN cache never persists a 400.
    expect(res.headers.get("cache-control")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 200 checksum-failed branch
// ---------------------------------------------------------------------------

describe("GET /api/abr/lookup — checksum-failed branch", () => {
  // 11 zeros: normalizes fine (11 digits) but sum = -10, checksum fails.
  const BAD = "00000000000";

  it("returns 200 with valid_checksum:false when the modulus-89 check fails", async () => {
    const res = await GET(req(`http://x/api/abr/lookup?abn=${BAD}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { valid_checksum: boolean };
    expect(body.valid_checksum).toBe(false);
  });

  it('response source = "checksum" on the failed branch', async () => {
    const res = await GET(req(`http://x/api/abr/lookup?abn=${BAD}`));
    const body = (await res.json()) as { source: string };
    expect(body.source).toBe("checksum");
  });

  it("response live is null and live_error explains the skip on the failed branch", async () => {
    const res = await GET(req(`http://x/api/abr/lookup?abn=${BAD}`));
    const body = (await res.json()) as { live: unknown; live_error: string };
    expect(body.live).toBeNull();
    expect(body.live_error).toMatch(/checksum failed/);
    expect(body.live_error).toMatch(/skipped ABR call/);
  });

  it("does NOT call lookupAbnLive when the checksum fails — quota-preserving", async () => {
    await GET(req(`http://x/api/abr/lookup?abn=${BAD}`));
    expect(lookupAbnLiveMock).not.toHaveBeenCalled();
  });

  it("cache-control on the checksum-failed 200 is short (max-age=60)", async () => {
    // A typo may be re-tried in seconds after the founder corrects it; a long
    // TTL would serve stale "invalid" for an hour.
    const res = await GET(req(`http://x/api/abr/lookup?abn=${BAD}`));
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("abn_formatted is populated on the checksum-failed branch (formatAbn fallback)", async () => {
    const res = await GET(req(`http://x/api/abr/lookup?abn=${BAD}`));
    const body = (await res.json()) as { abn_formatted: string; abn: string };
    expect(body.abn).toBe(BAD);
    expect(body.abn_formatted).toBe("00 000 000 000");
  });
});

// ---------------------------------------------------------------------------
// 200 checksum-passed branch — live lookup succeeded
// ---------------------------------------------------------------------------

describe("GET /api/abr/lookup — checksum-passed + live-ok branch", () => {
  it("returns 200 with valid_checksum:true when the checksum passes", async () => {
    const res = await GET(req(`http://x/api/abr/lookup?abn=${VALID_ABN}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { valid_checksum: boolean };
    expect(body.valid_checksum).toBe(true);
  });

  it('source = "abr-live" when lookupAbnLive returns a non-null live payload', async () => {
    const res = await GET(req(`http://x/api/abr/lookup?abn=${VALID_ABN}`));
    const body = (await res.json()) as { source: string };
    expect(body.source).toBe("abr-live");
  });

  it("calls lookupAbnLive exactly once with the normalized 11-digit ABN", async () => {
    await GET(req(`http://x/api/abr/lookup?abn=${VALID_ABN}`));
    expect(lookupAbnLiveMock).toHaveBeenCalledTimes(1);
    expect(lookupAbnLiveMock).toHaveBeenCalledWith(VALID_ABN);
  });

  it("passes the normalized ABN even when the caller supplied spaces / hyphens", async () => {
    // Query-string encoding: `%20` (space) + literal hyphen must survive
    // normalizeAbn intact so the ABR call sees only digits.
    await GET(req(`http://x/api/abr/lookup?abn=79%20659-615-111`));
    expect(lookupAbnLiveMock).toHaveBeenCalledWith(VALID_ABN);
  });

  it("live payload passes through verbatim under the `live` key", async () => {
    const res = await GET(req(`http://x/api/abr/lookup?abn=${VALID_ABN}`));
    const body = (await res.json()) as { live: AbnLiveDetails };
    expect(body.live).toEqual(liveOk());
  });

  it("live_error is null on the happy live branch", async () => {
    const res = await GET(req(`http://x/api/abr/lookup?abn=${VALID_ABN}`));
    const body = (await res.json()) as { live_error: string | null };
    expect(body.live_error).toBeNull();
  });

  it("abn_formatted uses the NN NNN NNN NNN convention", async () => {
    const res = await GET(req(`http://x/api/abr/lookup?abn=${VALID_ABN}`));
    const body = (await res.json()) as { abn_formatted: string };
    expect(body.abn_formatted).toBe("79 659 615 111");
  });

  it("abn field is the canonical 11-digit string (no spaces)", async () => {
    const res = await GET(req(`http://x/api/abr/lookup?abn=${VALID_ABN}`));
    const body = (await res.json()) as { abn: string };
    expect(body.abn).toBe(VALID_ABN);
  });

  it("cache-control on the happy branch is 1h public + edge (s-maxage=3600)", async () => {
    const res = await GET(req(`http://x/api/abr/lookup?abn=${VALID_ABN}`));
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=3600, s-maxage=3600",
    );
  });
});

// ---------------------------------------------------------------------------
// 200 checksum-passed branch — live lookup unavailable / failed
// ---------------------------------------------------------------------------

describe("GET /api/abr/lookup — checksum-passed + live-degraded branch", () => {
  it('source falls back to "checksum" when lookupAbnLive returns live:null', async () => {
    lookupAbnLiveMock.mockResolvedValue({
      live: null,
      live_error: "ABR_GUID not configured",
    });
    const res = await GET(req(`http://x/api/abr/lookup?abn=${VALID_ABN}`));
    const body = (await res.json()) as { source: string; live: unknown; live_error: string };
    expect(res.status).toBe(200);
    expect(body.source).toBe("checksum");
    expect(body.live).toBeNull();
    expect(body.live_error).toBe("ABR_GUID not configured");
  });

  it("valid_checksum stays true even when the live lookup is unavailable", async () => {
    lookupAbnLiveMock.mockResolvedValue({
      live: null,
      live_error: "ABR HTTP 503",
    });
    const res = await GET(req(`http://x/api/abr/lookup?abn=${VALID_ABN}`));
    const body = (await res.json()) as { valid_checksum: boolean };
    expect(body.valid_checksum).toBe(true);
  });

  it("still emits the 1h cache-control on the live-degraded branch", async () => {
    // The route makes no cache-control distinction between live-ok and
    // live-degraded on a valid checksum — pins that a future refactor cannot
    // silently drop caching on the degraded path (which would 10× the load
    // on a temporarily-down ABR endpoint).
    lookupAbnLiveMock.mockResolvedValue({
      live: null,
      live_error: "ABR timeout after 4000ms",
    });
    const res = await GET(req(`http://x/api/abr/lookup?abn=${VALID_ABN}`));
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=3600, s-maxage=3600",
    );
  });

  it("live_error passes through verbatim from lookupAbnLive on the degraded branch", async () => {
    lookupAbnLiveMock.mockResolvedValue({
      live: null,
      live_error: "ABR parse error: Unexpected token < in JSON at position 0",
    });
    const res = await GET(req(`http://x/api/abr/lookup?abn=${VALID_ABN}`));
    const body = (await res.json()) as { live_error: string };
    expect(body.live_error).toBe(
      "ABR parse error: Unexpected token < in JSON at position 0",
    );
  });

  it("abn_formatted still populated when live is null (formatAbn fallback path)", async () => {
    lookupAbnLiveMock.mockResolvedValue({ live: null, live_error: "x" });
    const res = await GET(req(`http://x/api/abr/lookup?abn=${VALID_ABN}`));
    const body = (await res.json()) as { abn_formatted: string };
    expect(body.abn_formatted).toBe("79 659 615 111");
  });
});

// ---------------------------------------------------------------------------
// Response envelope shape
// ---------------------------------------------------------------------------

describe("GET /api/abr/lookup — response envelope shape", () => {
  it("emits the full AbnLookupResult keyset on the happy branch", async () => {
    const res = await GET(req(`http://x/api/abr/lookup?abn=${VALID_ABN}`));
    const body = (await res.json()) as Record<string, unknown>;
    expect(new Set(Object.keys(body))).toEqual(
      new Set([
        "abn",
        "abn_formatted",
        "valid_checksum",
        "source",
        "live",
        "live_error",
      ]),
    );
  });

  it("emits the full AbnLookupResult keyset on the checksum-failed branch", async () => {
    const res = await GET(req("http://x/api/abr/lookup?abn=00000000000"));
    const body = (await res.json()) as Record<string, unknown>;
    // Same envelope both branches — the client can render both without
    // switching on a discriminant.
    expect(new Set(Object.keys(body))).toEqual(
      new Set([
        "abn",
        "abn_formatted",
        "valid_checksum",
        "source",
        "live",
        "live_error",
      ]),
    );
  });

  it("Content-Type of every 200 response is application/json", async () => {
    const res = await GET(req(`http://x/api/abr/lookup?abn=${VALID_ABN}`));
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("Content-Type of the 400 response is application/json", async () => {
    const res = await GET(req("http://x/api/abr/lookup"));
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });
});
