// Colocated vitest for GET /embed/badge — P9-embed-badge-route-test.
//
// Master Upgrade Plan §11.1 embed widget. The badge is the highest-risk
// public surface because it is hotlinked as <img> onto third-party pages,
// stripped of surrounding context. That is why the contract this suite
// pins is unusually rigid:
//
//   - always 200, always image/svg+xml — a <img> that resolves to 404 or
//     JSON renders as a broken-image icon on someone else's landing page;
//   - the profile-disclosure.ts guarantees survive round-tripping through
//     the renderer: a `demo` badge never emits an unqualified "Verified"
//     and always carries the DEMO chip + "not a real business" subline;
//   - the ETag key includes `kind`, `level`, `trustScore`, `lastVerifiedAt`
//     and `size` — anything that could flip a demo badge to a customer
//     badge (or vice-versa) MUST change the ETag so a CDN cannot serve a
//     stale copy of the wrong disclosure to a third-party page;
//   - a 304 revalidation returns no body and reuses the cache headers, so
//     the origin cost stays near-zero on the hot path.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { PublicBusinessProfile } from "@/lib/business-id/public-profile";

// --- Mocks (registered BEFORE route import) --------------------------------

const readPublicProfileMock = vi.fn<
  (slug: string) => Promise<PublicBusinessProfile | null>
>();

vi.mock("@/lib/business-id/public-profile", () => ({
  readPublicProfile: (slug: string) => readPublicProfileMock(slug),
}));

// Route import MUST come after the mock is registered.
import { GET } from "./route";

// --- Helpers ---------------------------------------------------------------

function buildReq(query: string, headers: Record<string, string> = {}): NextRequest {
  const url = new URL(`https://blockid.au/embed/badge${query}`);
  return {
    url: url.toString(),
    headers: {
      get(name: string) {
        const key = name.toLowerCase();
        for (const [k, v] of Object.entries(headers)) {
          if (k.toLowerCase() === key) return v;
        }
        return null;
      },
    },
  } as unknown as NextRequest;
}

function customerProfile(overrides: Partial<PublicBusinessProfile> = {}): PublicBusinessProfile {
  return {
    slug: "acme",
    legalName: "Acme Pty Ltd",
    verificationLevel: 4,
    trustScore: 81.3,
    lastVerifiedAt: "2026-05-01T00:00:00.000Z",
    badges: [],
    capabilityScores: {},
    attestations: [],
    jurisdiction: "AU",
    publicUrl: "https://blockid.au/id/acme",
    profileKind: "customer",
    ...overrides,
  };
}

function demoProfile(overrides: Partial<PublicBusinessProfile> = {}): PublicBusinessProfile {
  return {
    ...customerProfile(),
    slug: "sample-co",
    legalName: "Sample Co",
    profileKind: "demo",
    ...overrides,
  };
}

beforeEach(() => {
  readPublicProfileMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Always-200 contract ---------------------------------------------------

describe("GET /embed/badge — always returns a valid SVG (never a broken image)", () => {
  it("returns 200 for a missing slug (no ?slug= param)", async () => {
    // A third-party page with a typo'd hotlink must still see a badge, not a
    // broken-image glyph. The generic Unverified placeholder is the fallback.
    const res = await GET(buildReq(""));
    expect(res.status).toBe(200);
    expect(readPublicProfileMock).not.toHaveBeenCalled();
  });

  it("returns 200 for a whitespace-only slug", async () => {
    // ?slug=%20%20 must not hit Supabase and must not 500 — trim, then treat
    // as absent.
    const res = await GET(buildReq("?slug=%20%20"));
    expect(res.status).toBe(200);
    expect(readPublicProfileMock).not.toHaveBeenCalled();
  });

  it("returns 200 for an unknown slug (profile lookup returns null)", async () => {
    // public_index=false or a genuinely missing row: never 404 on the badge.
    readPublicProfileMock.mockResolvedValue(null);
    const res = await GET(buildReq("?slug=nope"));
    expect(res.status).toBe(200);
  });

  it("returns 200 for a real customer profile", async () => {
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const res = await GET(buildReq("?slug=acme"));
    expect(res.status).toBe(200);
  });

  it("returns 200 for a demo profile", async () => {
    // Demo profiles must render — with disclosure — not 4xx.
    readPublicProfileMock.mockResolvedValue(demoProfile());
    const res = await GET(buildReq("?slug=sample-co"));
    expect(res.status).toBe(200);
  });
});

// --- Response headers ------------------------------------------------------

describe("GET /embed/badge — response headers", () => {
  it("sets Content-Type: image/svg+xml; charset=utf-8", async () => {
    // <img> tags dispatch based on Content-Type — text/plain would render as
    // XML source in some browsers.
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const res = await GET(buildReq("?slug=acme"));
    expect(res.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
  });

  it("sets X-Content-Type-Options: nosniff so browsers cannot MIME-sniff to text/html", async () => {
    // Nosniff blocks the browser from re-interpreting the SVG as HTML if the
    // third-party page mis-embeds it, closing an XSS vector.
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const res = await GET(buildReq("?slug=acme"));
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("sets the documented Cache-Control: public, max-age=300, s-maxage=3600", async () => {
    // 5-minute browser cache, 1-hour edge cache — cutting these would 10-100x
    // origin load because the badge is a hot embed.
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const res = await GET(buildReq("?slug=acme"));
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=300, s-maxage=3600",
    );
  });

  it("sets Vary: Accept-Encoding so gzip/br variants do not collide", async () => {
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const res = await GET(buildReq("?slug=acme"));
    expect(res.headers.get("vary")).toBe("Accept-Encoding");
  });

  it("emits a WEAK ETag (W/ prefix) — SVG contains locale-formatted dates", async () => {
    // Strong ETags would force a byte-exact comparison; the en-AU date string
    // could differ across Node/ICU versions while the underlying data is the
    // same, needlessly busting the cache. Weak is deliberate.
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const res = await GET(buildReq("?slug=acme"));
    const etag = res.headers.get("etag") ?? "";
    expect(etag.startsWith('W/"badge-')).toBe(true);
    expect(etag.endsWith('"')).toBe(true);
  });
});

// --- ETag discrimination ---------------------------------------------------

describe("GET /embed/badge — ETag discriminates on every input that flips the badge", () => {
  it("keeps ETag stable across two identical requests", async () => {
    // Deterministic hash of the inputs — the same customer at the same level
    // MUST hit the same ETag so revalidation succeeds.
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const a = await GET(buildReq("?slug=acme"));
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const b = await GET(buildReq("?slug=acme"));
    expect(a.headers.get("etag")).toBe(b.headers.get("etag"));
  });

  it("changes ETag when the verification level changes (L3 vs L4)", async () => {
    // A verification-level flip is the whole point of the badge — the CDN
    // must not serve L3 to viewers after the founder reaches L4.
    readPublicProfileMock.mockResolvedValue(customerProfile({ verificationLevel: 3 }));
    const l3 = (await GET(buildReq("?slug=acme"))).headers.get("etag");
    readPublicProfileMock.mockResolvedValue(customerProfile({ verificationLevel: 4 }));
    const l4 = (await GET(buildReq("?slug=acme"))).headers.get("etag");
    expect(l3).not.toBe(l4);
  });

  it("changes ETag when profileKind flips customer → demo (disclosure regression guard)", async () => {
    // This is the security-relevant one. A stale CDN copy of a "Verified L4"
    // customer badge served for a slug that has since been reseeded as demo
    // is the exact failure profile-disclosure.ts prevents. The ETag key must
    // therefore include `kind`.
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const asCustomer = (await GET(buildReq("?slug=acme"))).headers.get("etag");
    readPublicProfileMock.mockResolvedValue(demoProfile({ slug: "acme", verificationLevel: 4, trustScore: 81.3, lastVerifiedAt: "2026-05-01T00:00:00.000Z" }));
    const asDemo = (await GET(buildReq("?slug=acme"))).headers.get("etag");
    expect(asCustomer).not.toBe(asDemo);
  });

  it("changes ETag when the trust score changes (81.3 vs 82.0)", async () => {
    readPublicProfileMock.mockResolvedValue(customerProfile({ trustScore: 81.3 }));
    const a = (await GET(buildReq("?slug=acme"))).headers.get("etag");
    readPublicProfileMock.mockResolvedValue(customerProfile({ trustScore: 82.0 }));
    const b = (await GET(buildReq("?slug=acme"))).headers.get("etag");
    expect(a).not.toBe(b);
  });

  it("changes ETag when lastVerifiedAt changes", async () => {
    // A re-verification pushes the date forward — the "Verified {date}"
    // subline must update on the third-party page, not stay stale.
    readPublicProfileMock.mockResolvedValue(customerProfile({ lastVerifiedAt: "2026-05-01T00:00:00.000Z" }));
    const may = (await GET(buildReq("?slug=acme"))).headers.get("etag");
    readPublicProfileMock.mockResolvedValue(customerProfile({ lastVerifiedAt: "2026-08-01T00:00:00.000Z" }));
    const aug = (await GET(buildReq("?slug=acme"))).headers.get("etag");
    expect(may).not.toBe(aug);
  });

  it("changes ETag when size changes (sm vs md vs lg)", async () => {
    // Different SVG viewBox dimensions — cannot share a cache entry.
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const sm = (await GET(buildReq("?slug=acme&size=sm"))).headers.get("etag");
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const md = (await GET(buildReq("?slug=acme&size=md"))).headers.get("etag");
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const lg = (await GET(buildReq("?slug=acme&size=lg"))).headers.get("etag");
    expect(new Set([sm, md, lg]).size).toBe(3);
  });

  it("uses a stable ETag for the unknown-slug placeholder", async () => {
    // The generic Unverified badge is the same asset for every unknown slug
    // — a shared ETag is what lets a CDN collapse them into one cache entry.
    readPublicProfileMock.mockResolvedValue(null);
    const a = (await GET(buildReq("?slug=one"))).headers.get("etag");
    readPublicProfileMock.mockResolvedValue(null);
    const b = (await GET(buildReq("?slug=two"))).headers.get("etag");
    expect(a).toBe(b);
  });
});

// --- 304 revalidation ------------------------------------------------------

describe("GET /embed/badge — 304 revalidation", () => {
  it("returns 304 with no body when If-None-Match matches the ETag", async () => {
    // The whole point of the ETag; without this the origin renders SVG on
    // every verifier pull.
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const first = await GET(buildReq("?slug=acme"));
    const etag = first.headers.get("etag") ?? "";
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const second = await GET(buildReq("?slug=acme", { "If-None-Match": etag }));
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  it("carries the same Cache-Control + ETag on the 304 so the client can extend its TTL", async () => {
    // A 304 that omits Cache-Control forces the browser to treat the cached
    // copy as freshly-served-but-uncacheable, defeating the revalidation.
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const first = await GET(buildReq("?slug=acme"));
    const etag = first.headers.get("etag") ?? "";
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const second = await GET(buildReq("?slug=acme", { "If-None-Match": etag }));
    expect(second.headers.get("cache-control")).toBe(
      "public, max-age=300, s-maxage=3600",
    );
    expect(second.headers.get("etag")).toBe(etag);
  });

  it("returns 200 with the SVG body when If-None-Match does NOT match", async () => {
    // Client sends a stale ETag — must get fresh bytes, not 304.
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const res = await GET(
      buildReq("?slug=acme", { "If-None-Match": 'W/"badge-deadbeef"' }),
    );
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.startsWith("<?xml")).toBe(true);
  });

  it("does NOT reuse a 304 across a customer→demo flip on the same slug", async () => {
    // Same slug, kind changes: the disclosure MUST land, so a client whose
    // cached ETag was from the customer render must get fresh bytes.
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const customerRes = await GET(buildReq("?slug=acme"));
    const customerEtag = customerRes.headers.get("etag") ?? "";
    readPublicProfileMock.mockResolvedValue(
      demoProfile({ slug: "acme", verificationLevel: 4, trustScore: 81.3, lastVerifiedAt: "2026-05-01T00:00:00.000Z" }),
    );
    const demoRes = await GET(
      buildReq("?slug=acme", { "If-None-Match": customerEtag }),
    );
    expect(demoRes.status).toBe(200);
  });
});

// --- SVG payload -----------------------------------------------------------

describe("GET /embed/badge — SVG payload structure", () => {
  it("begins with an XML declaration and a viewBox-carrying <svg> root", async () => {
    // XML declaration is what makes strict SVG renderers accept the payload
    // as image/svg+xml rather than falling back to XHTML heuristics.
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const body = await (await GET(buildReq("?slug=acme&size=md"))).text();
    expect(body.startsWith("<?xml")).toBe(true);
    expect(body).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(body).toContain('viewBox="0 0 220 64"');
  });

  it("renders the L{level} chip and level label for a customer profile", async () => {
    readPublicProfileMock.mockResolvedValue(customerProfile({ verificationLevel: 4 }));
    const body = await (await GET(buildReq("?slug=acme"))).text();
    expect(body).toContain(">L4<");
    expect(body).toContain(">Attested"); // headline text for level 4
    // Score inline for a real verification claim.
    expect(body).toContain("81.3/100");
  });

  it("prints the DEMO chip and never emits an unqualified 'Verified' for a demo profile", async () => {
    // The whole reason profile-disclosure.ts exists: a demo badge that says
    // "Verified" on a third-party page is exactly the failure mode.
    readPublicProfileMock.mockResolvedValue(demoProfile());
    const body = await (await GET(buildReq("?slug=sample-co"))).text();
    expect(body).toContain(">DEMO<");
    expect(body).toContain("Sample data");
    expect(body).toContain("Demo profile · not a real business");
    // The subline for a real verification is `Verified {date}` — must not appear.
    expect(body).not.toMatch(/>Verified 2026/);
    // Score line only accompanies a verified claim — must not leak on demo.
    expect(body).not.toContain("/100");
  });

  it("prints the generic Unverified placeholder for an unknown slug", async () => {
    readPublicProfileMock.mockResolvedValue(null);
    const body = await (await GET(buildReq("?slug=missing"))).text();
    expect(body).toContain(">N/A<");
    expect(body).toContain(">Unverified");
    expect(body).toContain("Not verified · blockid.au");
    expect(body).not.toContain("/100");
  });

  it("always ends the subline with '· blockid.au' so the third-party page shows the source", async () => {
    // Attribution is what makes the badge trustworthy in a third-party
    // context — no attribution string, no way for a viewer to verify.
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const body = await (await GET(buildReq("?slug=acme"))).text();
    expect(body).toContain("· blockid.au");
  });

  it("carries an aria-label matching the BadgeChrome accessibleTitle for screen-readers", async () => {
    // Assistive tech reads aria-label — a demo badge that reads as "BlockID
    // Verified" to a screen-reader user is the same regression as the visual
    // one.
    readPublicProfileMock.mockResolvedValue(demoProfile({ verificationLevel: 4 }));
    const body = await (await GET(buildReq("?slug=sample-co"))).text();
    expect(body).toContain('aria-label="BlockID sample data');
    expect(body).toContain("Not a real business and not a real verification");
  });
});

// --- Size handling ---------------------------------------------------------

describe("GET /embed/badge — size parameter", () => {
  it("defaults to size=md when the query parameter is absent", async () => {
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const body = await (await GET(buildReq("?slug=acme"))).text();
    expect(body).toContain('viewBox="0 0 220 64"');
  });

  it("falls back to md for an unknown size string (e.g. size=xl)", async () => {
    // Unknown values must not crash and must not render a 0×0 SVG.
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const body = await (await GET(buildReq("?slug=acme&size=xl"))).text();
    expect(body).toContain('viewBox="0 0 220 64"');
  });

  it("renders size=sm at 160×44", async () => {
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const body = await (await GET(buildReq("?slug=acme&size=sm"))).text();
    expect(body).toContain('viewBox="0 0 160 44"');
  });

  it("renders size=lg at 300×88", async () => {
    readPublicProfileMock.mockResolvedValue(customerProfile());
    const body = await (await GET(buildReq("?slug=acme&size=lg"))).text();
    expect(body).toContain('viewBox="0 0 300 88"');
  });
});

// --- Lookup wiring ---------------------------------------------------------

describe("GET /embed/badge — Supabase lookup wiring", () => {
  it("calls readPublicProfile with the trimmed slug", async () => {
    // Trailing whitespace comes from URL-encoded tokens in the wild; trim
    // ensures the Supabase equality filter matches the stored value.
    readPublicProfileMock.mockResolvedValue(customerProfile());
    await GET(buildReq("?slug=%20acme%20"));
    expect(readPublicProfileMock).toHaveBeenCalledWith("acme");
  });

  it("does not call readPublicProfile when the slug is empty after trimming", async () => {
    // Wasted round-trip guard — an empty slug can never match anything.
    await GET(buildReq("?slug="));
    expect(readPublicProfileMock).not.toHaveBeenCalled();
  });
});
