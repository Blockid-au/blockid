import { describe, it, expect } from "vitest";
import { optimizeForSearch } from "./brand-search-optimization";
import { handleSupportQuery } from "./customer-service";
import { analyzeFinancials } from "./financial-advisor";
import { researchMarket } from "./market-research";
import type { ModelCaller } from "@/lib/adk";

// Route the mock by which agent (system prompt) is calling — deterministic, $0.
function routed(routes: Array<{ match: RegExp; reply: string }>): ModelCaller {
  return async (system) => {
    const hit = routes.find((r) => r.match.test(system));
    return hit ? hit.reply : "";
  };
}

describe("brand-search-optimization", () => {
  it("expands keywords and returns an optimised title + meta", async () => {
    const model = routed([
      {
        match: /keyword researcher/i,
        reply:
          "KEYWORDS: startup valuation australia, pre-seed valuation, svi score, cap table\nINTENT: informational — founders researching valuation",
      },
      {
        match: /title and meta-description optimiser/i,
        reply: '{"title":"Startup Valuation Australia: 2026 Guide","metaDescription":"How to value your Australian startup with the free SVI score."}',
      },
    ]);

    const res = await optimizeForSearch(
      { title: "Valuing your startup", keywords: ["valuation"] },
      model,
    );

    expect(res.optimized).toBe(true);
    expect(res.optimizedTitle).toMatch(/Valuation Australia/);
    expect(res.expandedKeywords.length).toBeGreaterThan(1);
    expect(res.expandedKeywords).toContain("svi score");
    expect(res.searchIntent).toMatch(/informational/);
    expect(res.metaDescription).toMatch(/SVI score/);
  });

  it("falls back to the input on a failing model", async () => {
    const model: ModelCaller = async () => {
      throw new Error("down");
    };
    const res = await optimizeForSearch(
      { title: "Original", keywords: ["a", "b"] },
      model,
    );
    expect(res.optimized).toBe(false);
    expect(res.optimizedTitle).toBe("Original");
    expect(res.expandedKeywords).toEqual(["a", "b"]);
  });
});

describe("customer-service", () => {
  it("triages, classifies, and grounds a reply", async () => {
    const model = routed([
      { match: /triage agent/i, reply: "CATEGORY: product_how_to\nSENTIMENT: neutral\nESCALATE: no" },
      { match: /customer-success agent/i, reply: "Your SVI score is free — start it from the homepage!" },
    ]);

    const res = await handleSupportQuery("How do I get my score?", model);
    expect(res.category).toBe("product_how_to");
    expect(res.escalate).toBe(false);
    expect(res.reply).toMatch(/SVI score/);
  });

  it("flags escalation for billing disputes", async () => {
    const model = routed([
      { match: /triage agent/i, reply: "CATEGORY: billing\nSENTIMENT: negative\nESCALATE: yes" },
      { match: /customer-success agent/i, reply: "I'm escalating this to a specialist." },
    ]);
    const res = await handleSupportQuery("I want a refund now!", model);
    expect(res.category).toBe("billing");
    expect(res.sentiment).toBe("negative");
    expect(res.escalate).toBe(true);
  });

  it("returns a safe escalation fallback when the model throws", async () => {
    const model: ModelCaller = async () => {
      throw new Error("down");
    };
    const res = await handleSupportQuery("hello", model);
    expect(res.escalate).toBe(true);
    expect(res.reply.length).toBeGreaterThan(0);
  });
});

describe("financial-advisor", () => {
  it("produces analysis + recommendations from signals", async () => {
    const model = routed([
      { match: /financial analyst/i, reply: "### Health\nRunway is tight at 6 months." },
      { match: /CFO advisor/i, reply: "### Moves\nRaise within 3 months.\n\n_This is general information, not financial or investment advice._" },
    ]);

    const res = await analyzeFinancials(
      { startupName: "Acme", stage: "seed", monthlyBurnAud: 20000, runwayMonths: 6 },
      model,
    );

    expect(res.ok).toBe(true);
    expect(res.analysis).toMatch(/Runway/);
    expect(res.recommendations).toMatch(/not financial or investment advice/);
  });

  it("returns ok:false on model failure", async () => {
    const model: ModelCaller = async () => {
      throw new Error("down");
    };
    const res = await analyzeFinancials({ startupName: "Acme" }, model);
    expect(res.ok).toBe(false);
    expect(res.analysis).toBe("");
  });
});

describe("market-research", () => {
  it("parses sector, trends, market size, and competitor JSON", async () => {
    const model = routed([
      {
        match: /market trends analyst/i,
        reply:
          "SECTOR: fintech\nTRENDS:\n- open banking adoption rising\n- AI underwriting\nMARKET_SIZE: large, multi-billion AUD globally",
      },
      {
        match: /competitive positioning analyst/i,
        reply:
          '{"competitors":[{"name":"Acme Rival","note":"bigger but slower"}],"differentiators":["faster onboarding"],"positioning":"the fast option for SMEs","whitespace":["regional banks"]}',
      },
    ]);

    const res = await researchMarket(
      { startupName: "Acme", description: "A fintech for SME lending." },
      model,
    );

    expect(res).not.toBeNull();
    expect(res!.sector).toBe("fintech");
    expect(res!.trends.length).toBe(2);
    expect(res!.marketSize).toMatch(/multi-billion/);
    expect(res!.competitors[0].name).toBe("Acme Rival");
    expect(res!.positioning).toMatch(/fast option/);
  });

  it("returns null for empty description", async () => {
    const model: ModelCaller = async () => "";
    const res = await researchMarket({ startupName: "X", description: "  " }, model);
    expect(res).toBeNull();
  });

  it("returns null on model failure", async () => {
    const model: ModelCaller = async () => {
      throw new Error("down");
    };
    const res = await researchMarket({ startupName: "X", description: "real desc" }, model);
    expect(res).toBeNull();
  });
});
