// Unit tests for GET /api/abs/lookup — P3b (route wrapper half of the P3a
// ABS/IBISWorld industry-lookup fixture).
//
// Asserts:
//   1. Missing input → 400 with a machine-readable error code.
//   2. Known ANZSIC → 200 with TAM/SAM/SOM at default 20% / 1% and
//      AU_MARKET_LOOKUP_DISCLAIMER round-trip.
//   3. Keyword lookup → 200 + top pick + suggestions[] excludes the pick.
//   4. Unknown ANZSIC → 404 with `industry_not_found` (or
//      `industry_missing_tam` if it ever hits a seeded-but-empty row).
//   5. addressablePct / targetSharePct clamp to [0,1] and non-finite
//      overrides fall back to defaults, matching the abn.ts route posture.
//   6. Suggestions are omitted when the caller pinned by ANZSIC (they
//      already picked the class — no pivot list needed).

import { describe, it, expect } from "vitest";
import { AU_MARKET_LOOKUP_DISCLAIMER } from "@/lib/market/au-market-lookup";
import { GET } from "./route";

function req(query: string): Request {
  return new Request(`http://x/api/abs/lookup${query}`);
}

describe("GET /api/abs/lookup", () => {
  it("400s when neither anzsic nor keyword supplied", async () => {
    const res = await GET(req("") as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("missing_lookup_input");
    expect(body.message).toMatch(/anzsic/i);
  });

  it("returns TAM/SAM/SOM at default percentages for a known ANZSIC", async () => {
    const res = await GET(req("?anzsic=J5810") as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age=3600");
    const body = await res.json();
    expect(body.industry.anzsic_code).toBe("J5810");
    expect(body.industry.division).toBe("J");
    expect(body.industry.label).toMatch(/Software Publishing/);
    expect(body.tam_aud).toBe(6_500_000_000);
    expect(body.addressable_pct).toBeCloseTo(0.2, 5);
    expect(body.target_share_pct).toBeCloseTo(0.01, 5);
    expect(body.sam_aud).toBe(Math.round(body.tam_aud * body.addressable_pct));
    expect(body.som_aud).toBe(Math.round(body.sam_aud * body.target_share_pct));
    expect(body.disclaimer).toBe(AU_MARKET_LOOKUP_DISCLAIMER);
    // ANZSIC-pinned callers get no suggestions[] — they picked the class.
    expect(body.suggestions).toEqual([]);
  });

  it("resolves a keyword and returns sibling suggestions[] excluding the top pick", async () => {
    const res = await GET(req("?keyword=saas") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.industry.anzsic_code).toBe("J5810"); // SaaS keyword hit
    expect(Array.isArray(body.suggestions)).toBe(true);
    for (const s of body.suggestions) {
      expect(s.anzsic_code).not.toBe(body.industry.anzsic_code);
      expect(typeof s.label).toBe("string");
      expect(typeof s.tam_aud).toBe("number");
    }
  });

  it("accepts the ?sector alias for ?keyword", async () => {
    const res = await GET(req("?sector=fintech") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.industry.anzsic_code).toBe("K6419");
  });

  it("clamps addressablePct/targetSharePct into [0,1] and honours overrides", async () => {
    const res = await GET(
      req("?anzsic=J5810&addressablePct=0.5&targetSharePct=0.05") as never,
    );
    const body = await res.json();
    expect(body.addressable_pct).toBeCloseTo(0.5, 5);
    expect(body.target_share_pct).toBeCloseTo(0.05, 5);
    expect(body.sam_aud).toBe(Math.round(body.tam_aud * 0.5));

    const overshoot = await GET(
      req("?anzsic=J5810&addressablePct=5&targetSharePct=-3") as never,
    );
    const overshootBody = await overshoot.json();
    expect(overshootBody.addressable_pct).toBe(1);
    expect(overshootBody.target_share_pct).toBe(0);

    const garbage = await GET(
      req("?anzsic=J5810&addressablePct=abc&targetSharePct=") as never,
    );
    const garbageBody = await garbage.json();
    expect(garbageBody.addressable_pct).toBeCloseTo(0.2, 5);
    expect(garbageBody.target_share_pct).toBeCloseTo(0.01, 5);
  });

  it("404s for an unknown ANZSIC with industry_not_found", async () => {
    const res = await GET(req("?anzsic=Z9999") as never);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("industry_not_found");
    expect(body.input.anzsic).toBe("Z9999");
    expect(body.input.keyword).toBeNull();
  });

  it("404s for an unmatched keyword", async () => {
    const res = await GET(req("?keyword=zzzz-nothing-matches") as never);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("industry_not_found");
    expect(body.input.keyword).toBe("zzzz-nothing-matches");
  });
});
