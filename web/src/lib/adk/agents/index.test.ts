// Barrel test for src/lib/adk/agents/index.ts — the ADK-style agent barrel
// consumed by the report pipeline (CEO summary, SEO title optimiser, support
// triage, financial advisor). Pins two contracts:
//
//  1. Every shipped agent is re-exported by name and is identity-equal to
//     the source-module function, so a rename in a sibling module cannot
//     silently drop it from the barrel.
//  2. Each agent's documented fail-safe branch — "returns fallback / null on
//     model error or empty input" — is preserved. The parsing internals live
//     in the sibling modules; this test scopes to the barrel + fail-safe
//     envelope contract every downstream caller relies on.
//
// Uses a stub ModelCaller so no AI provider is called.
//
// Loop tag: P9-adk-agents-barrel-lib-test

import { describe, expect, it } from "vitest";

import {
  optimizeForSearch,
  handleSupportQuery,
  analyzeFinancials,
  researchMarket,
} from "./index";
import type { ModelCaller } from "../agent";

// Source-module imports (identity-check against the barrel).
import { optimizeForSearch as optimizeForSearchSrc } from "./brand-search-optimization";
import { handleSupportQuery as handleSupportQuerySrc } from "./customer-service";
import { analyzeFinancials as analyzeFinancialsSrc } from "./financial-advisor";
import { researchMarket as researchMarketSrc } from "./market-research";

// ── Test helpers ────────────────────────────────────────────────────────────

/** Model that always returns an empty string — exercises the "no signal" path. */
const emptyModel: ModelCaller = async () => "";

/** Model that always throws — exercises the fail-safe catch branch. */
const throwingModel: ModelCaller = async () => {
  throw new Error("boom");
};

/** Model that records every call for shape assertions. */
function recordingModel(reply: string): {
  call: ModelCaller;
  calls: Array<{ system: string; user: string; maxTokens: number }>;
} {
  const calls: Array<{ system: string; user: string; maxTokens: number }> = [];
  const call: ModelCaller = async (system, user, maxTokens) => {
    calls.push({ system, user, maxTokens });
    return reply;
  };
  return { call, calls };
}

/**
 * Model that returns a different reply for each successive call. Used to
 * simulate a two-stage SequentialAgent run where stage 1 populates
 * `session.state.<outputKey>` and stage 2 returns the final assistant text.
 */
function scriptedModel(replies: string[]): ModelCaller {
  let i = 0;
  return async () => {
    const reply = replies[i] ?? "";
    i += 1;
    return reply;
  };
}

// ── Barrel completeness + identity ─────────────────────────────────────────

describe("adk/agents barrel — exports", () => {
  it("re-exports optimizeForSearch identity-equal to the source module", () => {
    expect(optimizeForSearch).toBe(optimizeForSearchSrc);
  });

  it("re-exports handleSupportQuery identity-equal to the source module", () => {
    expect(handleSupportQuery).toBe(handleSupportQuerySrc);
  });

  it("re-exports analyzeFinancials identity-equal to the source module", () => {
    expect(analyzeFinancials).toBe(analyzeFinancialsSrc);
  });

  it("re-exports researchMarket identity-equal to the source module", () => {
    expect(researchMarket).toBe(researchMarketSrc);
  });

  it("every re-export is an async function", () => {
    for (const fn of [
      optimizeForSearch,
      handleSupportQuery,
      analyzeFinancials,
      researchMarket,
    ]) {
      expect(typeof fn).toBe("function");
      // Node marks async functions with the AsyncFunction constructor name.
      expect(fn.constructor.name).toBe("AsyncFunction");
    }
  });

  it("every re-export has arity 2 (input, model)", () => {
    expect(optimizeForSearch.length).toBe(2);
    expect(handleSupportQuery.length).toBe(2);
    expect(analyzeFinancials.length).toBe(2);
    expect(researchMarket.length).toBe(2);
  });
});

// ── optimizeForSearch fail-safe ─────────────────────────────────────────────

describe("optimizeForSearch — fail-safe envelope", () => {
  const input = { title: "How to launch", keywords: ["launch", "startup"] };

  it("returns fallback with optimized=false when the model throws", async () => {
    const out = await optimizeForSearch(input, throwingModel);
    expect(out).toEqual({
      optimizedTitle: "How to launch",
      expandedKeywords: ["launch", "startup"],
      searchIntent: "",
      metaDescription: "",
      optimized: false,
    });
  });

  it("returns the input title when the model returns empty text (no JSON to parse)", async () => {
    const out = await optimizeForSearch(input, emptyModel);
    expect(out.optimizedTitle).toBe("How to launch");
    expect(out.expandedKeywords).toEqual(["launch", "startup"]);
    expect(out.optimized).toBe(false);
    expect(out.metaDescription).toBe("");
    expect(out.searchIntent).toBe("");
  });

  it("parses a JSON title reply on the happy path and sets optimized=true", async () => {
    // Stage 1 populates session.state.research with a KEYWORDS + INTENT block;
    // stage 2 returns a JSON envelope with the optimised title + meta.
    const model = scriptedModel([
      "KEYWORDS: launch australia, startup guide, saas launch\nINTENT: informational",
      '{"title":"Launch Your Australian Startup in 30 Days","metaDescription":"Step-by-step playbook."}',
    ]);
    const out = await optimizeForSearch(input, model);
    expect(out.optimized).toBe(true);
    expect(out.optimizedTitle).toBe("Launch Your Australian Startup in 30 Days");
    expect(out.metaDescription).toBe("Step-by-step playbook.");
    expect(out.searchIntent).toBe("informational");
    // Expanded keywords parsed from the KEYWORDS line, comma-split + trimmed.
    expect(out.expandedKeywords).toEqual([
      "launch australia",
      "startup guide",
      "saas launch",
    ]);
  });

  it("forwards the angle hint through to the initial input when supplied", async () => {
    const { call, calls } = recordingModel("");
    await optimizeForSearch({ ...input, angle: "AU founder perspective" }, call);
    // First call is the keyword-research agent; its user prompt should include
    // the angle line.
    expect(calls[0]?.user).toContain("## Angle\nAU founder perspective");
  });

  it("omits the angle line entirely when the caller does not pass one", async () => {
    const { call, calls } = recordingModel("");
    await optimizeForSearch(input, call);
    expect(calls[0]?.user).not.toContain("## Angle");
  });
});

// ── handleSupportQuery fail-safe ────────────────────────────────────────────

describe("handleSupportQuery — fail-safe envelope", () => {
  it("returns fallback on empty message without calling the model", async () => {
    const { call, calls } = recordingModel("ignored");
    const out = await handleSupportQuery("", call);
    expect(calls.length).toBe(0);
    expect(out.category).toBe("other");
    expect(out.sentiment).toBe("neutral");
    expect(out.escalate).toBe(true);
    expect(out.reply).toContain("Startup Value Index");
  });

  it("returns fallback on whitespace-only message", async () => {
    const { call, calls } = recordingModel("ignored");
    const out = await handleSupportQuery("   \n\t  ", call);
    expect(calls.length).toBe(0);
    expect(out.escalate).toBe(true);
  });

  it("returns fallback envelope when the model throws", async () => {
    const out = await handleSupportQuery("How do I upgrade?", throwingModel);
    expect(out.category).toBe("other");
    expect(out.sentiment).toBe("neutral");
    expect(out.escalate).toBe(true);
    expect(out.reply).toContain("Startup Value Index");
  });

  it("returns fallback reply text when the model returns empty output", async () => {
    const out = await handleSupportQuery("Any invoice for June?", emptyModel);
    // parseCategory + parseSentiment fall through to defaults; reply falls
    // back to the shipped fallback copy when the model reply is empty.
    expect(out.category).toBe("other");
    expect(out.sentiment).toBe("neutral");
    expect(out.escalate).toBe(false);
    expect(out.reply).toContain("Startup Value Index");
  });

  it("parses category/sentiment/escalate signals from a triage-populated session", async () => {
    // Stage 1 (triage) writes CATEGORY/SENTIMENT/ESCALATE lines into
    // session.state.triage. Stage 2 returns the visible reply text.
    const model = scriptedModel([
      "CATEGORY: billing\nSENTIMENT: negative\nESCALATE: yes",
      "Sorry to hear that — we've flagged your account for review.",
    ]);
    const out = await handleSupportQuery("You charged me twice.", model);
    expect(out.category).toBe("billing");
    expect(out.sentiment).toBe("negative");
    expect(out.escalate).toBe(true);
    expect(out.reply).toBe(
      "Sorry to hear that — we've flagged your account for review.",
    );
  });

  it("coerces an unknown category to 'other' and defaults sentiment to 'neutral'", async () => {
    const model = scriptedModel([
      "CATEGORY: quantum_teleport\nSENTIMENT: euphoric\nESCALATE: no",
      "Thanks!",
    ]);
    const out = await handleSupportQuery("hi", model);
    expect(out.category).toBe("other");
    expect(out.sentiment).toBe("neutral");
    expect(out.escalate).toBe(false);
    expect(out.reply).toBe("Thanks!");
  });
});

// ── analyzeFinancials fail-safe ─────────────────────────────────────────────

describe("analyzeFinancials — fail-safe envelope", () => {
  const signals = { startupName: "Acme", stage: "seed" };

  it("returns ok=false with empty strings when the model throws", async () => {
    const out = await analyzeFinancials(signals, throwingModel);
    expect(out).toEqual({ analysis: "", recommendations: "", ok: false });
  });

  it("returns ok=false when both stages produce empty output", async () => {
    const out = await analyzeFinancials(signals, emptyModel);
    expect(out.analysis).toBe("");
    expect(out.recommendations).toBe("");
    expect(out.ok).toBe(false);
  });

  it("returns ok=true when the model produces analysis + recommendations", async () => {
    const model = scriptedModel([
      "## Health\nRunway is 9 months at current burn.",
      "1. Cut cloud spend by 20%.\n2. Freeze non-critical hires.",
    ]);
    const out = await analyzeFinancials(signals, model);
    expect(out.ok).toBe(true);
    expect(out.analysis).toContain("Runway is 9 months");
    expect(out.recommendations).toContain("Cut cloud spend by 20%");
  });

  it("returns ok=true even when only the recommendations stage produced text", async () => {
    // Stage 1 empty → analysis stays empty; stage 2 returns something.
    // The Boolean(analysis || recommendations) gate flips ok to true.
    const model = scriptedModel([
      "",
      "Focus on unit economics before the next raise.",
    ]);
    const out = await analyzeFinancials(signals, model);
    expect(out.analysis).toBe("");
    expect(out.recommendations).toBe(
      "Focus on unit economics before the next raise.",
    );
    expect(out.ok).toBe(true);
  });

  it("forwards optional numeric signals into the analyst prompt", async () => {
    const { call, calls } = recordingModel("");
    await analyzeFinancials(
      {
        startupName: "Acme",
        monthlyRevenueAud: 12_500,
        monthlyBurnAud: 40_000,
        runwayMonths: 6,
        cashAud: 240_000,
        notes: "US expansion planned Q3",
      },
      call,
    );
    // First model call is the analyst; its user prompt should include the
    // numeric facts and the free-text notes line.
    const analystUser = calls[0]?.user ?? "";
    expect(analystUser).toContain("Monthly revenue (AUD): 12500");
    expect(analystUser).toContain("Monthly burn (AUD): 40000");
    expect(analystUser).toContain("Runway (months): 6");
    expect(analystUser).toContain("Cash on hand (AUD): 240000");
    expect(analystUser).toContain("Notes: US expansion planned Q3");
  });

  it("omits missing numeric signals rather than emitting bare labels", async () => {
    const { call, calls } = recordingModel("");
    await analyzeFinancials({ startupName: "Bare" }, call);
    const analystUser = calls[0]?.user ?? "";
    expect(analystUser).not.toContain("Monthly revenue");
    expect(analystUser).not.toContain("Monthly burn");
    expect(analystUser).not.toContain("Runway");
    expect(analystUser).not.toContain("Cash on hand");
    expect(analystUser).not.toContain("Notes:");
  });
});

// ── researchMarket fail-safe ────────────────────────────────────────────────

describe("researchMarket — fail-safe envelope", () => {
  const base = { startupName: "Acme", description: "AU fintech for SMB." };

  it("returns null on empty description without calling the model", async () => {
    const { call, calls } = recordingModel("ignored");
    const out = await researchMarket({ startupName: "Acme", description: "" }, call);
    expect(out).toBeNull();
    expect(calls.length).toBe(0);
  });

  it("returns null on whitespace-only description", async () => {
    const { call, calls } = recordingModel("ignored");
    const out = await researchMarket(
      { startupName: "Acme", description: "   \n   " },
      call,
    );
    expect(out).toBeNull();
    expect(calls.length).toBe(0);
  });

  it("returns null when the model throws", async () => {
    const out = await researchMarket(base, throwingModel);
    expect(out).toBeNull();
  });

  it("returns null when both stages produce no recognisable signal", async () => {
    // Empty model output → no TRENDS bullets, no positioning JSON — the
    // hasSignal gate short-circuits to null.
    const out = await researchMarket(base, emptyModel);
    expect(out).toBeNull();
  });

  it("returns a populated result when the trends + positioning stages emit signal", async () => {
    const model = scriptedModel([
      // Stage 1: trendsAgent writes into session.state.trends. TRENDS
      // must come before MARKET_SIZE because parseBullets stops at the
      // first MARKET_SIZE line (see market-research.ts:parseBullets).
      [
        "SECTOR: fintech",
        "TRENDS:",
        "- Embedded finance",
        "- Real-time payouts",
        "MARKET_SIZE: A$1.2B AU SMB payments",
      ].join("\n"),
      // Stage 2: positioningAgent returns a JSON envelope.
      JSON.stringify({
        competitors: [{ name: "Zeller", note: "AU merchant terminal" }],
        differentiators: ["Same-day AU settlement"],
        positioning: "The fastest AU SMB payments rail.",
        whitespace: ["Regional agri co-ops"],
      }),
    ]);
    const out = await researchMarket(base, model);
    expect(out).not.toBeNull();
    expect(out?.sector).toBe("fintech");
    expect(out?.marketSize).toBe("A$1.2B AU SMB payments");
    expect(out?.trends).toEqual(["Embedded finance", "Real-time payouts"]);
    expect(out?.competitors).toEqual([
      { name: "Zeller", note: "AU merchant terminal" },
    ]);
    expect(out?.differentiators).toEqual(["Same-day AU settlement"]);
    expect(out?.positioning).toBe("The fastest AU SMB payments rail.");
    expect(out?.whitespace).toEqual(["Regional agri co-ops"]);
  });

  it("caps the description at 4000 chars in the initial prompt", async () => {
    const { call, calls } = recordingModel("");
    const longDesc = "x".repeat(6000);
    await researchMarket({ ...base, description: longDesc }, call);
    // First model call is the trends agent; its user prompt embeds the
    // description under a ## Description heading, capped to 4000 chars.
    const trendsUser = calls[0]?.user ?? "";
    // Count the run of x's to confirm the cap fired.
    const xRun = trendsUser.match(/x+/)?.[0]?.length ?? 0;
    expect(xRun).toBe(4000);
  });

  it("forwards a sector hint when supplied and omits the line otherwise", async () => {
    const { call: callWith, calls: callsWith } = recordingModel("");
    await researchMarket({ ...base, sector: "healthtech" }, callWith);
    expect(callsWith[0]?.user).toContain("## Sector hint\nhealthtech");

    const { call: callWithout, calls: callsWithout } = recordingModel("");
    await researchMarket(base, callWithout);
    expect(callsWithout[0]?.user).not.toContain("## Sector hint");
  });
});
