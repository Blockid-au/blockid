// Colocated vitest for GET /api/asic/extract — P9-asic-extract-route-test.
//
// The route is the founder-facing ASIC Company Extract probe wired into the
// Chapter-1 "confirm the incorporating company number in ≤ 60s" flow
// (docs/plans/atlassian-standard-mapping-goal.md §2 Folder 1 item 1.2 —
// P1h). Sibling helpers in web/src/lib/compliance/acn.ts are covered by
// acn.test.ts; this pins the HTTP wire-shape on top of them so the founder-
// facing surface can't silently regress.
//
// Silent regressions this suite pins against:
//   - Losing the `?acn=` query-string wiring so every call becomes an
//     invalid_acn_format 400 regardless of input.
//   - Losing the normalizeAcn call so an ACN with spaces / hyphens 400s
//     instead of being canonicalised to 9 digits.
//   - Losing the checksum short-circuit so a bad-checksum ACN triggers a
//     wasted ABR round-trip that ABR would just reject.
//   - Dropping the `input:` echo on the 400 payload so a founder in devtools
//     loses the "here's what we saw" hint (the funnel-recovery UX depends on
//     it because the field auto-strips whitespace client-side).
//   - Dropping `source: "checksum"` on the failed-checksum branch and
//     mislabelling it as `abr-live` when no live probe ran.
//   - Dropping `source: "abr-live"` when the live probe succeeds and
//     mislabelling it as `checksum` (the founder-facing badge branches on
//     this field: "verified against ABR" vs "checksum-only pass").
//   - Dropping the `live_error` passthrough so a founder loses the ABR error
//     message (needed to distinguish "ABR_GUID not configured" from a real
//     lookup miss).
//   - Regressing the cache-control headers — the failed-checksum response
//     ships `public, max-age=60` while the good-checksum ships
//     `public, max-age=3600, s-maxage=3600` (60s vs 3600s edge cache);
//     dropping the s-maxage half would double the origin load once the
//     Cloudflare cache is deployed.
//   - Regressing the `acn_formatted` `NNN NNN NNN` shape (drops the visual
//     grouping the Chapter-1 UI renders next to the input field).
//   - Regressing the `dynamic = "force-dynamic"` + `runtime = "nodejs"`
//     exports (the ABR fetch requires Node.js runtime, and edge caching
//     the /api/asic/extract handler itself would defeat the query-string
//     bust the JSDoc calls out).

import { describe, it, expect, vi, beforeEach } from "vitest";

const lookupAcnLiveMock = vi.fn<
  (acn: string) => Promise<{
    live: {
      entity_name: string | null;
      abn: string | null;
      abn_status: string | null;
      entity_type_name: string | null;
      abn_status_effective_from: string | null;
      gst_registered: boolean | null;
      gst_effective_from: string | null;
      business_state: string | null;
      business_postcode: string | null;
    } | null;
    live_error: string | null;
  }>
>();

vi.mock("@/lib/compliance/acn", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/compliance/acn")>(
      "@/lib/compliance/acn",
    );
  return {
    ...actual,
    // Keep the pure helpers (normalizeAcn / validateAcnChecksum / formatAcn)
    // as their real implementations — they're already covered by acn.test.ts
    // and we want the route to exercise the real checksum on the real input.
    lookupAcnLive: (acn: string) => lookupAcnLiveMock(acn),
  };
});

import { GET, dynamic, runtime } from "./route";

function makeReq(qs: string): Request {
  return new Request(`https://blockid.au/api/asic/extract${qs}`);
}

beforeEach(() => {
  lookupAcnLiveMock.mockReset();
});

describe("route module wiring", () => {
  it("exports `dynamic = 'force-dynamic'` so the route is never static-shell cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("exports `runtime = 'nodejs'` because the ABR probe needs Node.js fetch", () => {
    expect(runtime).toBe("nodejs");
  });
});

describe("400 invalid_acn_format branch", () => {
  it("400s when the `acn` query param is missing entirely", async () => {
    const res = await GET(makeReq("") as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_acn_format");
    expect(body.message).toMatch(/exactly 9 digits/);
    expect(body.input).toBeNull();
    expect(lookupAcnLiveMock).not.toHaveBeenCalled();
  });

  it("400s when the `acn` query param is blank", async () => {
    const res = await GET(makeReq("?acn=") as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_acn_format");
    expect(body.input).toBe("");
    expect(lookupAcnLiveMock).not.toHaveBeenCalled();
  });

  it("400s when the `acn` query param has fewer than 9 digits after normalisation", async () => {
    const res = await GET(makeReq("?acn=12345678") as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_acn_format");
    expect(body.input).toBe("12345678");
    expect(lookupAcnLiveMock).not.toHaveBeenCalled();
  });

  it("400s when the `acn` query param has more than 9 digits after normalisation", async () => {
    const res = await GET(makeReq("?acn=1234567890") as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_acn_format");
    expect(body.input).toBe("1234567890");
    expect(lookupAcnLiveMock).not.toHaveBeenCalled();
  });

  it("400s when the `acn` query param has no digits at all", async () => {
    const res = await GET(makeReq("?acn=abcdefghi") as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_acn_format");
    expect(body.input).toBe("abcdefghi");
    expect(lookupAcnLiveMock).not.toHaveBeenCalled();
  });

  it("echoes the raw pre-normalisation input on the 400 payload so a founder can debug in devtools", async () => {
    const res = await GET(
      makeReq("?acn=" + encodeURIComponent("ACN: 12-34")) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.input).toBe("ACN: 12-34");
  });
});

describe("failed-checksum short-circuit (skips ABR)", () => {
  it("200s with source:'checksum', valid_checksum:false, and live_error explaining the skip", async () => {
    // 123456789 fails the ASIC modulus-10 checksum (asserted in acn.test.ts).
    const res = await GET(makeReq("?acn=123456789") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid_checksum).toBe(false);
    expect(body.source).toBe("checksum");
    expect(body.live).toBeNull();
    expect(body.live_error).toMatch(/checksum failed/i);
    expect(body.acn).toBe("123456789");
    expect(body.acn_formatted).toBe("123 456 789");
    expect(lookupAcnLiveMock).not.toHaveBeenCalled();
  });

  it("sets `cache-control: public, max-age=60` on the failed-checksum branch (short cache — user is likely to retype)", async () => {
    const res = await GET(makeReq("?acn=123456789") as never);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("normalises whitespace + hyphens BEFORE running the checksum, so `123-456-789` yields the same failed-checksum payload as `123456789`", async () => {
    const res = await GET(
      makeReq("?acn=" + encodeURIComponent("123-456-789")) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.acn).toBe("123456789");
    expect(body.valid_checksum).toBe(false);
    expect(lookupAcnLiveMock).not.toHaveBeenCalled();
  });

  it("echoes the canonical 9-digit `acn` (not the raw input) on the failed-checksum payload so downstream consumers get a stable key", async () => {
    const res = await GET(
      makeReq("?acn=" + encodeURIComponent("111 111 111")) as never,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.acn).toBe("111111111");
    expect(body.acn_formatted).toBe("111 111 111");
    expect(body.valid_checksum).toBe(false);
  });
});

describe("valid-checksum + live probe wiring", () => {
  it("passes the canonical 9-digit ACN (no spaces) into lookupAcnLive", async () => {
    lookupAcnLiveMock.mockResolvedValue({ live: null, live_error: null });
    // Auschain PTY LTD's real ACN — passes the ASIC modulus-10 checksum.
    await GET(
      makeReq("?acn=" + encodeURIComponent("659 615 111")) as never,
    );
    expect(lookupAcnLiveMock).toHaveBeenCalledTimes(1);
    expect(lookupAcnLiveMock).toHaveBeenCalledWith("659615111");
  });

  it("returns source:'abr-live' when the live probe hands back a live payload", async () => {
    lookupAcnLiveMock.mockResolvedValue({
      live: {
        entity_name: "AUSCHAIN PTY LTD",
        abn: "79659615111",
        abn_status: "Active",
        entity_type_name: "Australian Private Company",
        abn_status_effective_from: "2022-05-11",
        gst_registered: true,
        gst_effective_from: "2022-05-11",
        business_state: "NSW",
        business_postcode: "2000",
      },
      live_error: null,
    });
    const res = await GET(makeReq("?acn=659615111") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid_checksum).toBe(true);
    expect(body.source).toBe("abr-live");
    expect(body.live).toEqual({
      entity_name: "AUSCHAIN PTY LTD",
      abn: "79659615111",
      abn_status: "Active",
      entity_type_name: "Australian Private Company",
      abn_status_effective_from: "2022-05-11",
      gst_registered: true,
      gst_effective_from: "2022-05-11",
      business_state: "NSW",
      business_postcode: "2000",
    });
    expect(body.live_error).toBeNull();
  });

  it("returns source:'checksum' when the live probe returns null live + a live_error (e.g. ABR_GUID missing / HTTP error / timeout)", async () => {
    lookupAcnLiveMock.mockResolvedValue({
      live: null,
      live_error: "ABR_GUID not configured (register free at https://abr.business.gov.au/Tools/WebServices)",
    });
    const res = await GET(makeReq("?acn=659615111") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid_checksum).toBe(true);
    expect(body.source).toBe("checksum");
    expect(body.live).toBeNull();
    expect(body.live_error).toMatch(/ABR_GUID not configured/);
  });

  it("passes through an ABR timeout as live_error without throwing", async () => {
    lookupAcnLiveMock.mockResolvedValue({
      live: null,
      live_error: "ABR timeout after 4000ms",
    });
    const res = await GET(makeReq("?acn=659615111") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.source).toBe("checksum");
    expect(body.live_error).toBe("ABR timeout after 4000ms");
  });

  it("passes through an ABR HTTP error as live_error", async () => {
    lookupAcnLiveMock.mockResolvedValue({
      live: null,
      live_error: "ABR HTTP 503",
    });
    const res = await GET(makeReq("?acn=659615111") as never);
    const body = await res.json();
    expect(body.source).toBe("checksum");
    expect(body.live_error).toBe("ABR HTTP 503");
  });

  it("passes through an ABR Message rejection (e.g. unknown ACN) as live_error", async () => {
    lookupAcnLiveMock.mockResolvedValue({
      live: null,
      live_error: "ACN not found",
    });
    const res = await GET(makeReq("?acn=659615111") as never);
    const body = await res.json();
    expect(body.valid_checksum).toBe(true);
    expect(body.source).toBe("checksum");
    expect(body.live_error).toBe("ACN not found");
  });

  it("echoes the canonical acn + acn_formatted on the valid-checksum + live-null branch", async () => {
    lookupAcnLiveMock.mockResolvedValue({ live: null, live_error: null });
    const res = await GET(
      makeReq("?acn=" + encodeURIComponent("659-615-111")) as never,
    );
    const body = await res.json();
    expect(body.acn).toBe("659615111");
    expect(body.acn_formatted).toBe("659 615 111");
  });

  it("sets `cache-control: public, max-age=3600, s-maxage=3600` on the valid-checksum branch (1h edge cache is safe for ASIC records)", async () => {
    lookupAcnLiveMock.mockResolvedValue({ live: null, live_error: null });
    const res = await GET(makeReq("?acn=659615111") as never);
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=3600, s-maxage=3600",
    );
  });

  it("still calls the live probe even when live_error will come back — the route does not gate on ABR_GUID env presence", async () => {
    lookupAcnLiveMock.mockResolvedValue({
      live: null,
      live_error: "ABR_GUID not configured",
    });
    await GET(makeReq("?acn=659615111") as never);
    // Contract: the route always attempts the live lookup on good-checksum
    // input. The env gate lives inside lookupAcnLive itself (which is
    // covered by acn.test.ts) — decoupling here means an operator can flip
    // ABR_GUID on/off without redeploying the route.
    expect(lookupAcnLiveMock).toHaveBeenCalledTimes(1);
  });

  it("only calls the live probe once per request (no accidental double-fetch)", async () => {
    lookupAcnLiveMock.mockResolvedValue({
      live: {
        entity_name: "AUSCHAIN PTY LTD",
        abn: "79659615111",
        abn_status: "Active",
        entity_type_name: "Australian Private Company",
        abn_status_effective_from: "2022-05-11",
        gst_registered: true,
        gst_effective_from: "2022-05-11",
        business_state: "NSW",
        business_postcode: "2000",
      },
      live_error: null,
    });
    await GET(makeReq("?acn=659615111") as never);
    expect(lookupAcnLiveMock).toHaveBeenCalledTimes(1);
  });
});

describe("response payload shape", () => {
  it("failed-checksum payload has the six documented keys and nothing else the founder-facing UI would trip on", async () => {
    const res = await GET(makeReq("?acn=123456789") as never);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      [
        "acn",
        "acn_formatted",
        "valid_checksum",
        "source",
        "live",
        "live_error",
      ].sort(),
    );
  });

  it("good-checksum + live payload has the six documented keys", async () => {
    lookupAcnLiveMock.mockResolvedValue({
      live: {
        entity_name: "AUSCHAIN PTY LTD",
        abn: "79659615111",
        abn_status: "Active",
        entity_type_name: "Australian Private Company",
        abn_status_effective_from: "2022-05-11",
        gst_registered: true,
        gst_effective_from: "2022-05-11",
        business_state: "NSW",
        business_postcode: "2000",
      },
      live_error: null,
    });
    const res = await GET(makeReq("?acn=659615111") as never);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      [
        "acn",
        "acn_formatted",
        "valid_checksum",
        "source",
        "live",
        "live_error",
      ].sort(),
    );
  });

  it("content-type is application/json on every response branch", async () => {
    const bad = await GET(makeReq("?acn=abc") as never);
    expect(bad.headers.get("content-type")).toMatch(/application\/json/);

    const badChk = await GET(makeReq("?acn=123456789") as never);
    expect(badChk.headers.get("content-type")).toMatch(/application\/json/);

    lookupAcnLiveMock.mockResolvedValue({ live: null, live_error: null });
    const ok = await GET(makeReq("?acn=659615111") as never);
    expect(ok.headers.get("content-type")).toMatch(/application\/json/);
  });
});
