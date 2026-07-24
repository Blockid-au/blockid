// Unit tests — investor weekly digest email helpers.
// Contract: docs/plans/atlassian-standard-mapping-goal.md §P7.

import { describe, expect, it } from "vitest";
import { buildInvestorDigest } from "./investor-digest";

describe("buildInvestorDigest — empty state", () => {
  it("renders the browse-catalog CTA when the investor has no watchlist", () => {
    const out = buildInvestorDigest({
      name: "Jamie",
      tickers: [],
      isEmpty: true,
      browseUrl: "https://blockid.au/listings",
      watchlistUrl: "https://blockid.au/dashboard/watchlist",
    });
    expect(out.subject).toMatch(/start tracking/i);
    expect(out.html).toContain("Browse the catalog");
    expect(out.text).toContain("no startups tracked yet");
    expect(out.html).toContain("s766B");
  });
});

describe("buildInvestorDigest — populated rows", () => {
  it("renders one row per ticker with SVI + delta + phase", () => {
    const out = buildInvestorDigest({
      name: "Sam",
      tickers: [
        {
          ticker: "SAAS-ABC",
          slug: "abc",
          svi: 72.4,
          deltaSinceLastDigest: 3.2,
          latestPhaseLabel: "Revenue / Business Model",
          sectorLabel: "SaaS",
        },
        {
          ticker: "FIN-XYZ",
          slug: "xyz",
          svi: 48.1,
          deltaSinceLastDigest: -1.5,
          latestPhaseLabel: "PMF / Early Traction",
          sectorLabel: "Fintech",
        },
      ],
      isEmpty: false,
      browseUrl: "https://blockid.au/listings",
      watchlistUrl: "https://blockid.au/dashboard/watchlist",
    });
    expect(out.subject).toMatch(/2 tracked startups/);
    expect(out.html).toContain("SAAS-ABC");
    expect(out.html).toContain("FIN-XYZ");
    expect(out.html).toContain("+3.2");
    expect(out.html).toContain("-1.5");
    expect(out.html).toContain("Revenue / Business Model");
    expect(out.html).toContain("PMF / Early Traction");
    expect(out.text).toContain("SAAS-ABC");
  });

  it("uses 'new' label when deltaSinceLastDigest is null", () => {
    const out = buildInvestorDigest({
      name: "Riya",
      tickers: [
        {
          ticker: "AI-000",
          slug: "aaa",
          svi: 50,
          deltaSinceLastDigest: null,
          latestPhaseLabel: null,
        },
      ],
      isEmpty: false,
      browseUrl: "https://blockid.au/listings",
      watchlistUrl: "https://blockid.au/dashboard/watchlist",
    });
    expect(out.html).toContain("new");
    expect(out.html).toContain("AI-000");
  });

  it("escapes user-controlled strings (name) to prevent HTML injection", () => {
    const out = buildInvestorDigest({
      name: '<script>alert(1)</script>',
      tickers: [],
      isEmpty: true,
      browseUrl: "https://blockid.au/listings",
      watchlistUrl: "https://blockid.au/dashboard/watchlist",
    });
    expect(out.html).not.toContain("<script>alert");
    expect(out.html).toContain("&lt;script&gt;");
  });
});
