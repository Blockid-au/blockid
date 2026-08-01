// Colocated vitest for `financial-advisor.ts` — the two-step CFO agent
// (analyst → advisor) that produces grounded AU-context financial guidance.
//
// The existing `agents.test.ts` covers the four Agent Garden ports at a
// shallow "does it run and fall back" level. This colocated suite pins the
// load-bearing detail so a subprocess rewrite can't quietly drop:
//   * the AU-specific anchors (R&D 43.5%, ESIC, ATO/GST) from the analyst
//     prompt — without them the guidance drifts into US SAFE / Delaware
//     framing and the CFO advisor stops being defensible under s766B
//   * the "not financial or investment advice" close on every advisor turn
//     (AFSL boundary — CLO/CISO sign-off depends on this appearing verbatim)
//   * the trace order (analyst FIRST, advisor SECOND) — the advisor prompt
//     references `{analysis}` from session state, so reversing the order
//     silently strips the CFO grounding step
//   * the numeric-field rendering — a NaN monthlyBurnAud must NOT surface
//     as "Monthly burn (AUD): NaN" in the fact stream (drops downstream
//     analyst grounding and can leak "NaN" into the founder's report)
//   * the empty-field elision — an undefined stage / notes must NOT emit
//     an empty "Stage:" line (the analyst treats blanks as facts and
//     hallucinates against them)
//   * the ok-flag semantics — `ok:true` when at least one of analysis /
//     recommendations comes back non-empty, `ok:false` only on model
//     throw or a fully-blank pair
//   * the analyst outputKey ("analysis") — losing it desyncs the advisor
//     prompt's `{analysis}` template and the founder gets recommendations
//     grounded on an empty string
//   * the maxTokens budget on both agents (700 each) — the analyst/advisor
//     summaries were sized against a 350-word budget with headroom; a
//     silent bump to 2048 would blow the credit ceiling

import { describe, it, expect } from "vitest";
import { analyzeFinancials, type FinancialSignals } from "./financial-advisor";
import type { ModelCaller } from "@/lib/adk";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Test doubles ────────────────────────────────────────────────────────

/**
 * A `ModelCaller` that records every (system, user, maxTokens) call and
 * routes the reply by whether the system prompt mentions "analyst" or
 * "advisor" — matching the routed() helper in agents.test.ts but exposing
 * the full call log so we can pin ordering + prompt templating.
 */
function recordingRouter(routes: {
  analyst?: string;
  advisor?: string;
}): {
  model: ModelCaller;
  calls: Array<{ system: string; user: string; maxTokens: number }>;
} {
  const calls: Array<{ system: string; user: string; maxTokens: number }> = [];
  const model: ModelCaller = async (system, user, maxTokens) => {
    calls.push({ system, user, maxTokens });
    if (/financial analyst/i.test(system)) return routes.analyst ?? "";
    if (/CFO advisor/i.test(system)) return routes.advisor ?? "";
    return "";
  };
  return { model, calls };
}

function throwingModel(msg = "provider down"): ModelCaller {
  return async () => {
    throw new Error(msg);
  };
}

const AU_DISCLAIMER = "_This is general information, not financial or investment advice._";

// The full module source is inspected in a handful of tests so the string
// grep is defensible against a subprocess that swaps in a helper indirection.
const SOURCE = readFileSync(
  resolve(__dirname, "financial-advisor.ts"),
  "utf8",
);

// ── Analyst prompt content ──────────────────────────────────────────────

describe("financial-advisor — analyst prompt", () => {
  it("declares Australian context", () => {
    expect(SOURCE).toMatch(/Australia/);
  });

  it("names the R&D Tax Incentive rate 43.5%", () => {
    expect(SOURCE).toMatch(/43\.5%/);
    expect(SOURCE).toMatch(/R&D Tax Incentive/);
  });

  it("references ESIC as an AU-specific anchor", () => {
    expect(SOURCE).toMatch(/\bESIC\b/);
  });

  it("references ATO/GST as an AU-specific anchor", () => {
    expect(SOURCE).toMatch(/ATO\/GST/);
  });

  it("caps the analyst output at 350 words", () => {
    expect(SOURCE).toMatch(/under 350 words/);
  });

  it("requires markdown sub-headings", () => {
    expect(SOURCE).toMatch(/### sub-headings/);
  });

  it("forbids invented numbers (grounded-only rule)", () => {
    expect(SOURCE).toMatch(/never invent numbers/);
  });
});

// ── Advisor prompt content ──────────────────────────────────────────────

describe("financial-advisor — advisor prompt", () => {
  it("references the analyst's read via {analysis} template", () => {
    expect(SOURCE).toMatch(/\{analysis\}/);
  });

  it("closes with the AU non-advice disclaimer verbatim", () => {
    expect(SOURCE).toContain(AU_DISCLAIMER);
  });

  it("asks for 3-5 concrete next financial moves", () => {
    expect(SOURCE).toMatch(/3-5 concrete next financial moves/);
  });

  it("frames the tone as mentor-like", () => {
    expect(SOURCE).toMatch(/like a mentor/i);
  });

  it("caps the advisor output at 350 words", () => {
    // Both prompts share the 350-word rail — expect at least two hits.
    const hits = SOURCE.match(/under 350 words/g) ?? [];
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Fact-stream construction ────────────────────────────────────────────

describe("financial-advisor — fact stream", () => {
  it("passes every populated numeric signal through to the analyst", async () => {
    const { model, calls } = recordingRouter({
      analyst: "### Health\nOK",
      advisor: "### Moves\nOK\n\n" + AU_DISCLAIMER,
    });
    const signals: FinancialSignals = {
      startupName: "Acme",
      stage: "seed",
      monthlyRevenueAud: 10000,
      monthlyBurnAud: 20000,
      runwayMonths: 6,
      cashAud: 120000,
      notes: "two founders, one paying customer",
    };
    await analyzeFinancials(signals, model);
    const analystUser = calls[0]?.user ?? "";
    expect(analystUser).toContain("Startup: Acme");
    expect(analystUser).toContain("Stage: seed");
    expect(analystUser).toContain("Monthly revenue (AUD): 10000");
    expect(analystUser).toContain("Monthly burn (AUD): 20000");
    expect(analystUser).toContain("Runway (months): 6");
    expect(analystUser).toContain("Cash on hand (AUD): 120000");
    expect(analystUser).toContain("Notes: two founders, one paying customer");
  });

  it("omits stage and notes when they are undefined", async () => {
    const { model, calls } = recordingRouter({ analyst: "x", advisor: "y" });
    await analyzeFinancials({ startupName: "Acme" }, model);
    const analystUser = calls[0]?.user ?? "";
    expect(analystUser).not.toMatch(/^Stage:/m);
    expect(analystUser).not.toMatch(/^Notes:/m);
    // The header + name line must still be there.
    expect(analystUser).toContain("## Financial Signals");
    expect(analystUser).toContain("Startup: Acme");
  });

  it("omits any numeric line whose value is undefined", async () => {
    const { model, calls } = recordingRouter({ analyst: "x", advisor: "y" });
    await analyzeFinancials(
      { startupName: "Acme", monthlyRevenueAud: 5000 },
      model,
    );
    const analystUser = calls[0]?.user ?? "";
    expect(analystUser).toContain("Monthly revenue (AUD): 5000");
    expect(analystUser).not.toMatch(/Monthly burn/);
    expect(analystUser).not.toMatch(/Runway \(months\)/);
    expect(analystUser).not.toMatch(/Cash on hand/);
  });

  it("omits NaN numeric fields rather than surfacing 'NaN'", async () => {
    const { model, calls } = recordingRouter({ analyst: "x", advisor: "y" });
    await analyzeFinancials(
      {
        startupName: "Acme",
        monthlyBurnAud: Number.NaN,
        runwayMonths: Number.NaN,
      },
      model,
    );
    const analystUser = calls[0]?.user ?? "";
    expect(analystUser).not.toMatch(/NaN/);
    expect(analystUser).not.toMatch(/Monthly burn/);
    expect(analystUser).not.toMatch(/Runway/);
  });

  it("keeps the startup name even when every other signal is missing", async () => {
    const { model, calls } = recordingRouter({ analyst: "x", advisor: "y" });
    await analyzeFinancials({ startupName: "Solo Ltd" }, model);
    expect(calls[0]?.user).toContain("Startup: Solo Ltd");
  });

  it("prefixes the fact block with the ## Financial Signals header", async () => {
    const { model, calls } = recordingRouter({ analyst: "x", advisor: "y" });
    await analyzeFinancials({ startupName: "Acme" }, model);
    expect(calls[0]?.user.startsWith("## Financial Signals")).toBe(true);
  });

  it("passes zero-valued numeric signals through (0 !== undefined)", async () => {
    const { model, calls } = recordingRouter({ analyst: "x", advisor: "y" });
    await analyzeFinancials(
      { startupName: "Acme", monthlyRevenueAud: 0, cashAud: 0 },
      model,
    );
    const analystUser = calls[0]?.user ?? "";
    expect(analystUser).toContain("Monthly revenue (AUD): 0");
    expect(analystUser).toContain("Cash on hand (AUD): 0");
  });
});

// ── Sequential order / trace ────────────────────────────────────────────

describe("financial-advisor — analyst→advisor ordering", () => {
  it("calls the analyst before the advisor", async () => {
    const { model, calls } = recordingRouter({
      analyst: "### Health\nfine",
      advisor: "### Moves\nraise\n\n" + AU_DISCLAIMER,
    });
    await analyzeFinancials({ startupName: "Acme", stage: "seed" }, model);
    expect(calls.length).toBe(2);
    expect(calls[0]?.system).toMatch(/financial analyst/i);
    expect(calls[1]?.system).toMatch(/CFO advisor/i);
  });

  it("threads the analyst output into the advisor via {analysis}", async () => {
    const { model, calls } = recordingRouter({
      analyst: "### Health\nRUNWAY_MARKER_XYZ",
      advisor: "### Moves\nOK\n\n" + AU_DISCLAIMER,
    });
    await analyzeFinancials({ startupName: "Acme" }, model);
    // The advisor's system prompt is rendered with session state, so the
    // analyst's output (the `analysis` outputKey) must appear inline.
    expect(calls[1]?.system).toContain("RUNWAY_MARKER_XYZ");
  });

  it("gives the advisor the analyst's raw output as its user input", async () => {
    const { model, calls } = recordingRouter({
      analyst: "### Health\nUSER_INPUT_HANDOFF_TOKEN",
      advisor: "### Moves\nOK\n\n" + AU_DISCLAIMER,
    });
    await analyzeFinancials({ startupName: "Acme" }, model);
    // SequentialAgent hands the previous agent's raw output as the next
    // agent's user input — pinning that here so a rewrite that reuses the
    // initial input for every step is caught immediately.
    expect(calls[1]?.user).toContain("USER_INPUT_HANDOFF_TOKEN");
  });

  it("budgets 700 tokens for each sub-agent", async () => {
    const { model, calls } = recordingRouter({
      analyst: "x",
      advisor: "y\n\n" + AU_DISCLAIMER,
    });
    await analyzeFinancials({ startupName: "Acme" }, model);
    expect(calls[0]?.maxTokens).toBe(700);
    expect(calls[1]?.maxTokens).toBe(700);
  });
});

// ── Result shape ────────────────────────────────────────────────────────

describe("financial-advisor — result shape", () => {
  it("returns ok:true when both agents produce content", async () => {
    const { model } = recordingRouter({
      analyst: "### Health\nAll good.",
      advisor: "### Moves\nRaise soon.\n\n" + AU_DISCLAIMER,
    });
    const res = await analyzeFinancials({ startupName: "Acme" }, model);
    expect(res.ok).toBe(true);
    expect(res.analysis).toContain("All good.");
    expect(res.recommendations).toContain("Raise soon.");
    expect(res.recommendations).toContain(AU_DISCLAIMER);
  });

  it("trims surrounding whitespace on both fields", async () => {
    const { model } = recordingRouter({
      analyst: "   ### Health\nOK   ",
      advisor: "\n\n### Moves\nRaise\n\n" + AU_DISCLAIMER + "\n\n",
    });
    const res = await analyzeFinancials({ startupName: "Acme" }, model);
    expect(res.analysis.startsWith(" ")).toBe(false);
    expect(res.analysis.endsWith(" ")).toBe(false);
    expect(res.recommendations.startsWith("\n")).toBe(false);
    expect(res.recommendations.endsWith("\n")).toBe(false);
  });

  it("returns ok:true when only the analyst produces content", async () => {
    const { model } = recordingRouter({
      analyst: "### Health\nJust the analyst.",
      advisor: "   ",
    });
    const res = await analyzeFinancials({ startupName: "Acme" }, model);
    expect(res.ok).toBe(true);
    expect(res.analysis).toContain("Just the analyst.");
    expect(res.recommendations).toBe("");
  });

  it("returns ok:true when only the advisor produces content", async () => {
    const { model } = recordingRouter({
      analyst: "   ",
      advisor: "### Moves\nJust the advisor.\n\n" + AU_DISCLAIMER,
    });
    const res = await analyzeFinancials({ startupName: "Acme" }, model);
    expect(res.ok).toBe(true);
    expect(res.analysis).toBe("");
    expect(res.recommendations).toContain("Just the advisor.");
  });

  it("returns ok:false when both agents reply with pure whitespace", async () => {
    const { model } = recordingRouter({ analyst: "   ", advisor: "\n\n\t" });
    const res = await analyzeFinancials({ startupName: "Acme" }, model);
    expect(res.ok).toBe(false);
    expect(res.analysis).toBe("");
    expect(res.recommendations).toBe("");
  });

  it("returns ok:false with empty fields when the analyst throws", async () => {
    const res = await analyzeFinancials(
      { startupName: "Acme" },
      throwingModel("groq 500"),
    );
    expect(res.ok).toBe(false);
    expect(res.analysis).toBe("");
    expect(res.recommendations).toBe("");
  });

  it("returns ok:false when the advisor throws after a good analyst turn", async () => {
    let calls = 0;
    const model: ModelCaller = async (system) => {
      calls += 1;
      if (calls === 1) return "### Health\nOK";
      throw new Error("advisor down");
    };
    const res = await analyzeFinancials({ startupName: "Acme" }, model);
    // The advisor throw bubbles out of seq.run and hits the outer catch, so
    // even the analyst text is dropped — the "advice pair" is atomic.
    expect(res.ok).toBe(false);
    expect(res.analysis).toBe("");
    expect(res.recommendations).toBe("");
  });
});

// ── Type surface ────────────────────────────────────────────────────────

describe("financial-advisor — exports + types", () => {
  it("exports the analyzeFinancials function", () => {
    expect(typeof analyzeFinancials).toBe("function");
  });

  it("accepts every documented FinancialSignals field without error", async () => {
    const { model } = recordingRouter({ analyst: "x", advisor: "y" });
    // TypeScript covers the field-name check at compile time; this asserts
    // the runtime path still tolerates the full shape.
    const signals: FinancialSignals = {
      startupName: "Acme",
      stage: "seed",
      monthlyRevenueAud: 1,
      monthlyBurnAud: 1,
      runwayMonths: 1,
      cashAud: 1,
      notes: "n",
    };
    const res = await analyzeFinancials(signals, model);
    expect(res).toHaveProperty("analysis");
    expect(res).toHaveProperty("recommendations");
    expect(res).toHaveProperty("ok");
    expect(typeof res.ok).toBe("boolean");
  });
});
