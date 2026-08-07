// Unit tests for GET /api/domain/comau-check — P9-comau-check-route-test.
//
// The route wraps two helpers from @/lib/domain/comau-availability:
//   * validateComAuLabel — pure, offline syntactic guard (auDA subset)
//   * checkComAuRegistration — DNS SOA + NS probe
//
// The sibling lib module already has colocated coverage; the route wrapper
// was previously untested. These tests pin the founder-facing surface that
// the Chapter-1 "60-second win" trust-signal depends on:
//
//   - the ?fqdn / ?label presence guard (missing AND empty-string variants
//     both 400 with `missing_query_param`) so a `/api/domain/comau-check`
//     hit with no query never returns a 500 or leaks past to the DNS probe
//     (which would then throw on `checkComAuRegistration(null)`);
//   - `?fqdn=` takes precedence over `?label=` (the `??` chain), so a UI
//     that always sends `label` and sometimes upgrades to `fqdn` never
//     silently reverts to the label branch;
//   - invalid label 400 body carries {input, label, valid:false, reasons,
//     status:"invalid"} + a 60s public cache-control header — the DNS
//     probe is NOT invoked for a syntactically-invalid label (otherwise
//     the founder pays a DNS round-trip on every keystroke);
//   - valid label 200 body spreads the probe result on top of {input, label,
//     valid:true} + a 300s public+s-maxage cache-control so an edge
//     resolver caches the delegation lookup;
//   - the probe result is passed through verbatim (fqdn / status / evidence
//     / probe_error / disclaimer) — a body-shape drift here would break
//     the /startup/name-check widget that reads these fields keyed;
//   - the `dynamic` + `runtime` module exports are pinned — this route
//     must stay dynamic (DNS state moves out-of-band with builds) and
//     must stay on nodejs (edge runtime lacks node:dns).
//
// Test harness: `vi.mock` intercepts `checkComAuRegistration` so DNS is
// never touched, while `importActual` keeps `validateComAuLabel` real so
// the auDA syntactic guard is exercised end-to-end. A plain Fetch Request
// suffices for the `NextRequest` typing — the route only reads `req.url`.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { ComAuRegistrationResult } from "@/lib/domain/comau-availability";

const checkComAuRegistrationMock =
  vi.fn<(input: string | null | undefined) => Promise<ComAuRegistrationResult>>();

vi.mock("@/lib/domain/comau-availability", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/domain/comau-availability")
  >("@/lib/domain/comau-availability");
  return {
    ...actual,
    checkComAuRegistration: (input: string | null | undefined) =>
      checkComAuRegistrationMock(input),
  };
});

import { GET, dynamic, runtime } from "./route";

function makeReq(url: string): NextRequest {
  return new Request(url) as unknown as NextRequest;
}

const DISCLAIMER =
  "DNS probe only — only an auDA-accredited registrar can guarantee availability. `likely-registered` includes reserved / suspended registrations that still delegate DNS.";

function registeredResult(fqdn: string): ComAuRegistrationResult {
  return {
    fqdn,
    status: "likely-registered",
    evidence: { soa_records: 1, ns_records: 2 },
    probe_error: null,
    disclaimer: DISCLAIMER,
  };
}
function availableResult(fqdn: string): ComAuRegistrationResult {
  return {
    fqdn,
    status: "likely-available",
    evidence: { soa_records: 0, ns_records: 0 },
    probe_error: null,
    disclaimer: DISCLAIMER,
  };
}
function probeErrorResult(fqdn: string): ComAuRegistrationResult {
  return {
    fqdn,
    status: "probe_error",
    evidence: { soa_records: 0, ns_records: 0 },
    probe_error: "ESERVFAIL",
    disclaimer: DISCLAIMER,
  };
}

beforeEach(() => {
  checkComAuRegistrationMock.mockReset();
  checkComAuRegistrationMock.mockResolvedValue(registeredResult("blockid.com.au"));
});

describe("GET /api/domain/comau-check — module exports", () => {
  it("exports dynamic = 'force-dynamic' so Next never caches DNS state", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("exports runtime = 'nodejs' — node:dns is not on the edge runtime", () => {
    expect(runtime).toBe("nodejs");
  });
});

describe("GET /api/domain/comau-check — presence guard", () => {
  it("400 missing_query_param when neither ?fqdn nor ?label is present", async () => {
    const res = await GET(makeReq("https://x/api/domain/comau-check"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual({
      error: "missing_query_param",
      message: "provide ?label=<slug> or ?fqdn=<slug>.com.au",
    });
    expect(checkComAuRegistrationMock).not.toHaveBeenCalled();
  });

  it("400 when ?label= is present but empty (empty string is falsy)", async () => {
    const res = await GET(makeReq("https://x/api/domain/comau-check?label="));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_query_param");
    expect(checkComAuRegistrationMock).not.toHaveBeenCalled();
  });

  it("400 when ?fqdn= is present but empty (?? does not fall through empty strings)", async () => {
    // `URLSearchParams.get("fqdn")` returns "" when the key exists with no
    // value. `"" ?? label` yields "" (only null/undefined trigger the
    // fallback), so the label param is intentionally never consulted here
    // — the route treats an explicit-empty fqdn as a bad request.
    const res = await GET(
      makeReq("https://x/api/domain/comau-check?fqdn=&label=blockid"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_query_param");
    expect(checkComAuRegistrationMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/domain/comau-check — param precedence", () => {
  it("uses ?label= when only ?label= is supplied", async () => {
    checkComAuRegistrationMock.mockResolvedValueOnce(
      availableResult("blockid.com.au"),
    );
    await GET(makeReq("https://x/api/domain/comau-check?label=blockid"));
    expect(checkComAuRegistrationMock).toHaveBeenCalledWith("blockid");
  });

  it("uses ?fqdn= when only ?fqdn= is supplied", async () => {
    await GET(
      makeReq("https://x/api/domain/comau-check?fqdn=blockid.com.au"),
    );
    expect(checkComAuRegistrationMock).toHaveBeenCalledWith("blockid.com.au");
  });

  it("?fqdn= takes precedence over ?label= (the `??` chain)", async () => {
    await GET(
      makeReq(
        "https://x/api/domain/comau-check?fqdn=blockid.com.au&label=other",
      ),
    );
    expect(checkComAuRegistrationMock).toHaveBeenCalledTimes(1);
    expect(checkComAuRegistrationMock).toHaveBeenCalledWith("blockid.com.au");
  });
});

describe("GET /api/domain/comau-check — invalid label branch", () => {
  it("400 for illegal characters — body carries validation reasons", async () => {
    const res = await GET(
      makeReq("https://x/api/domain/comau-check?label=block_id"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.valid).toBe(false);
    expect(body.status).toBe("invalid");
    expect(body.reasons).toContain("illegal_chars");
    expect(body.input).toBe("block_id");
    expect(body.label).toBe("block_id");
    expect(checkComAuRegistrationMock).not.toHaveBeenCalled();
  });

  it("400 for too-short label — reasons carries 'too_short'", async () => {
    const res = await GET(makeReq("https://x/api/domain/comau-check?label=a"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reasons).toContain("too_short");
    expect(body.valid).toBe(false);
    expect(body.status).toBe("invalid");
    expect(checkComAuRegistrationMock).not.toHaveBeenCalled();
  });

  it("400 for leading hyphen — reasons carries 'leading_hyphen'", async () => {
    const res = await GET(
      makeReq("https://x/api/domain/comau-check?label=-blockid"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reasons).toContain("leading_hyphen");
    expect(checkComAuRegistrationMock).not.toHaveBeenCalled();
  });

  it("400 for trailing hyphen — reasons carries 'trailing_hyphen'", async () => {
    const res = await GET(
      makeReq("https://x/api/domain/comau-check?label=blockid-"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reasons).toContain("trailing_hyphen");
    expect(checkComAuRegistrationMock).not.toHaveBeenCalled();
  });

  it("400 body preserves the raw ?fqdn= input verbatim even when normalised away", async () => {
    // "BAD_LABEL.com.au" normalises to "bad_label" (suffix stripped, lower);
    // the body echoes the raw input the founder typed so a UI can highlight
    // exactly what they entered while showing the sanitised label alongside.
    const res = await GET(
      makeReq("https://x/api/domain/comau-check?fqdn=BAD_LABEL.com.au"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.input).toBe("BAD_LABEL.com.au");
    expect(body.label).toBe("bad_label");
  });

  it("invalid response carries the 60-second public cache-control header", async () => {
    // Short cache — a founder iterating on labels shouldn't hammer the
    // route but rewrites are common, so 60s is the sweet spot.
    const res = await GET(makeReq("https://x/api/domain/comau-check?label=a"));
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
  });

  it("does not invoke the DNS probe for any invalid-label branch", async () => {
    for (const label of ["", "-x", "x-", "a", "block_id"]) {
      checkComAuRegistrationMock.mockReset();
      await GET(
        makeReq(`https://x/api/domain/comau-check?label=${encodeURIComponent(label)}`),
      );
      expect(checkComAuRegistrationMock).not.toHaveBeenCalled();
    }
  });
});

describe("GET /api/domain/comau-check — valid label happy path", () => {
  it("200 spreads probe fields on top of {input, label, valid:true}", async () => {
    checkComAuRegistrationMock.mockResolvedValueOnce(
      registeredResult("blockid.com.au"),
    );
    const res = await GET(
      makeReq("https://x/api/domain/comau-check?label=blockid"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.input).toBe("blockid");
    expect(body.label).toBe("blockid");
    expect(body.valid).toBe(true);
    expect(body.status).toBe("likely-registered");
    expect(body.fqdn).toBe("blockid.com.au");
    expect(body.evidence).toEqual({ soa_records: 1, ns_records: 2 });
    expect(body.probe_error).toBeNull();
    expect(body.disclaimer).toBe(DISCLAIMER);
  });

  it("200 with likely-available probe forwards evidence + null probe_error", async () => {
    checkComAuRegistrationMock.mockResolvedValueOnce(
      availableResult("fresh-startup.com.au"),
    );
    const res = await GET(
      makeReq("https://x/api/domain/comau-check?label=fresh-startup"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("likely-available");
    expect(body.evidence).toEqual({ soa_records: 0, ns_records: 0 });
    expect(body.probe_error).toBeNull();
  });

  it("200 with probe_error branch forwards the DNS error code verbatim", async () => {
    checkComAuRegistrationMock.mockResolvedValueOnce(
      probeErrorResult("brittle.com.au"),
    );
    const res = await GET(
      makeReq("https://x/api/domain/comau-check?label=brittle"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("probe_error");
    expect(body.probe_error).toBe("ESERVFAIL");
  });

  it("valid response carries the 5-minute public + s-maxage cache-control header", async () => {
    // DNS delegation flips rarely; the 5min edge cache stops a founder from
    // hammering the resolver while iterating on a name they've picked.
    const res = await GET(
      makeReq("https://x/api/domain/comau-check?label=blockid"),
    );
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=300, s-maxage=300",
    );
  });

  it("passes the raw input string into the probe — not the normalised label", async () => {
    // The lib's checkComAuRegistration internally re-normalises + formats
    // the fqdn, so the route intentionally forwards the raw input to keep
    // one canonicalisation point. Verifies we don't accidentally start
    // pre-normalising here (which would drift from the lib's contract).
    await GET(
      makeReq("https://x/api/domain/comau-check?fqdn=BlockID.COM.AU"),
    );
    expect(checkComAuRegistrationMock).toHaveBeenCalledWith("BlockID.COM.AU");
  });

  it("accepts an IDN label (`xn--` ACE prefix) — validator allows it, probe fires", async () => {
    // auDA reserves positions 3-4 double-hyphen for IDN. xn--... must NOT
    // trip the `consecutive_hyphens_non_idn` guard, so the route proceeds
    // to the probe branch.
    checkComAuRegistrationMock.mockResolvedValueOnce(
      availableResult("xn--fzy.com.au"),
    );
    const res = await GET(
      makeReq("https://x/api/domain/comau-check?label=xn--fzy"),
    );
    expect(res.status).toBe(200);
    expect(checkComAuRegistrationMock).toHaveBeenCalledWith("xn--fzy");
  });

  it("body.input is the raw fqdn when ?fqdn= is used (echo pinned)", async () => {
    checkComAuRegistrationMock.mockResolvedValueOnce(
      registeredResult("blockid.com.au"),
    );
    const res = await GET(
      makeReq("https://x/api/domain/comau-check?fqdn=blockid.com.au"),
    );
    const body = await res.json();
    // input echoes the raw ?fqdn= param; label is the normalised slug.
    expect(body.input).toBe("blockid.com.au");
    expect(body.label).toBe("blockid");
  });

  it("re-invokes checkComAuRegistration on every request (route does not memoise)", async () => {
    // Caching lives at the edge via the cache-control header — the handler
    // itself must remain stateless so an ops-triggered flush is honoured.
    await GET(makeReq("https://x/api/domain/comau-check?label=blockid"));
    await GET(makeReq("https://x/api/domain/comau-check?label=blockid"));
    await GET(makeReq("https://x/api/domain/comau-check?label=blockid"));
    expect(checkComAuRegistrationMock).toHaveBeenCalledTimes(3);
  });
});

describe("GET /api/domain/comau-check — response envelope", () => {
  it("emits application/json for the invalid-label branch", async () => {
    const res = await GET(makeReq("https://x/api/domain/comau-check?label=a"));
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("emits application/json for the valid-label branch", async () => {
    const res = await GET(
      makeReq("https://x/api/domain/comau-check?label=blockid"),
    );
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("emits application/json for the presence-guard 400", async () => {
    const res = await GET(makeReq("https://x/api/domain/comau-check"));
    expect(res.headers.get("content-type")).toContain("application/json");
  });
});
