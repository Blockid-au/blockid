import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { InvestorMatch } from "@/lib/funding/investor-match";
import { InvestorMatchesPanel } from "./investor-matches-panel";

// Server-safe panel (S-IA2): locked card for Starter with the Growth link
// scoped to /workspace/investors; ranked cards for Growth; never-blank empty
// state with the programs link for the founder's capital.

const MATCH: InvestorMatch = {
  investor_id: "inv-1", name: "Sydney Seed Fund", firm: "Sydney Angels", thesis: "Pre-seed agtech in ANZ", plan: "investor_angel", score: 100,
  reasons: ["Invests in agtech"], gaps: ["stage"], sectors: ["agtech"], stages: ["seed"], geos: ["AU"],
  cheque_band: "100k_500k", min_svi: 50,
  intro_href: "mailto:support@blockid.au?subject=Intro%20request",
};

describe("InvestorMatchesPanel", () => {
  it("locked: Growth card linking to pricing from /workspace/investors, no investor data", () => {
    const out = renderToStaticMarkup(<InvestorMatchesPanel unlocked={false} investors={[MATCH]} capital="Sydney" />);
    expect(out).toContain("data-investors");
    expect(out).toContain("data-growth-locked");
    expect(out).toContain('href="/pricing?feature=report.premium&amp;from=/workspace/investors"');
    expect(out).not.toContain("data-investor=");
    expect(out).not.toContain("Sydney Seed Fund");
  });

  it("unlocked: ranked cards with reasons, gaps, cheque band and the support intro", () => {
    const out = renderToStaticMarkup(<InvestorMatchesPanel unlocked investors={[MATCH]} capital={null} />);
    expect(out).toContain('data-count="1"');
    expect(out).toContain('data-investor="inv-1"');
    expect(out).toContain("data-investor-name");
    expect(out).toContain("Fit 100");
    expect(out).toContain("Outside their stage preference");
    expect(out).toContain("Cheque: 100k 500k");
    expect(out).toContain("data-request-intro");
    expect(out).not.toContain("data-growth-locked");
  });

  it("unlocked + empty: queue copy and the programs link (capital slug, else the index)", () => {
    const sydney = renderToStaticMarkup(<InvestorMatchesPanel unlocked investors={[]} capital="Sydney" />);
    expect(sydney).toContain('data-count="0"');
    expect(sydney).toContain("data-no-investors");
    expect(sydney).toContain('href="/funding/programs/sydney"');
    const none = renderToStaticMarkup(<InvestorMatchesPanel unlocked investors={[]} capital={null} />);
    expect(none).toContain('href="/funding/programs"');
  });
});
