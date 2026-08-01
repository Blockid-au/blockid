// Colocated vitest for `brand-search-optimization.ts` — the SequentialAgent
// that pipes keyword_research_agent → title_optimizer_agent to produce an
// SEO-optimised title, expanded keyword set, and meta description for the
// publish-insight cron. The module is fail-safe: on any error it returns the
// input unchanged so the cron never breaks. Sibling shallow smoke-test in
// `agents.test.ts` covers end-to-end wiring; this suite pins the load-bearing
// details a subprocess rewrite must not silently drop:
//   * the keyword prompt names BlockID.au + Australian founder audience
//     (AU-context grounding — drift into US framing rips the "AU startup
//     platform" positioning the publish-insight cron relies on)
//   * the keyword prompt asks for LONG-TAIL + AU-context (ASIC/ATO/ESIC) and
//     related questions — without these the expanded keyword list collapses
//     into generic head-terms that never match founder search intent
//   * the KEYWORDS / INTENT output contract — parseKeywords looks for the
//     literal "KEYWORDS:" label with case-insensitive match; a rename here
//     silently returns the fallback (empty list)
//   * the title prompt references {research} template so the second agent
//     consumes the first agent's session state via ADK templating; losing the
//     token strips the grounding step
//   * the title prompt's <= 60 char + <= 155 char rules — the SEO surface
//     rendering breaks silently if either cap drifts
//   * the title prompt asks for a raw JSON object with no markdown fences and
//     no prose — parseTitleJson tolerates fences but a drift into "explain
//     your answer first" text leaks prose into the title
//   * fail-safe fallback shape — optimizedTitle=input.title,
//     expandedKeywords=input.keywords, searchIntent="", metaDescription="",
//     optimized=false — every downstream caller (publish-insight) depends on
//     the shape never rejecting
//   * parseKeywords cap of 12 items — a runaway model returning 40 keywords
//     would blow the meta-description slot in the article page
//   * parseKeywords filter (length > 1) — single-char noise from stray commas
//     must not slip into the keyword set
//   * parseTitleJson bail on malformed JSON — a mangled reply returns null
//     (never throws) so the whole optimize call falls through to the fallback
//     shape rather than crashing the publish-insight cron
//   * angle elision — an undefined angle must NOT emit an empty "## Angle"
//     heading (the keyword agent treats a blank angle as a fact and drifts)
//   * maxTokens budgets (400 keyword, 300 title) — sized against the $0
//     free-provider ceiling; a silent bump pushes the pair over quota
//   * sequential trace order — keyword_research FIRST, title_optimizer SECOND

import { describe, it, expect } from "vitest";
import { optimizeForSearch } from "./brand-search-optimization";
import type { ModelCaller } from "@/lib/adk";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Test doubles ────────────────────────────────────────────────────────

/**
 * Recording model — routes by whether the system prompt contains "keyword
 * researcher" or "title and meta-description optimiser" and logs every call
 * for prompt-shape assertions.
 */
function recordingRouter(routes: {
  keyword?: string;
  title?: string;
}): {
  model: ModelCaller;
  calls: Array<{ system: string; user: string; maxTokens: number }>;
} {
  const calls: Array<{ system: string; user: string; maxTokens: number }> = [];
  const model: ModelCaller = async (system, user, maxTokens) => {
    calls.push({ system, user, maxTokens });
    if (/keyword researcher/i.test(system)) return routes.keyword ?? "";
    if (/title and meta-description optimiser/i.test(system)) {
      return routes.title ?? "";
    }
    return "";
  };
  return { model, calls };
}

function throwingModel(msg = "provider down"): ModelCaller {
  return async () => {
    throw new Error(msg);
  };
}

const KEYWORD_OK =
  "KEYWORDS: startup valuation australia, how to value a pre-seed startup australia, esic tax offset calculator, seed round valuation guide, cap table software australia\nINTENT: informational — founders researching valuation methods";

const TITLE_OK = `\`\`\`json
{"title":"Startup Valuation Australia: 2026 Founder's Guide","metaDescription":"How Australian founders value pre-seed and seed startups in 2026 — ESIC, cap tables and comparable rounds explained."}
\`\`\``;

// Module source read once for grep-defensible content assertions (mirrors the
// pattern used in market-research.test.ts / financial-advisor.test.ts).
const SOURCE = readFileSync(
  resolve(__dirname, "brand-search-optimization.ts"),
  "utf8",
);

const INPUT_OK = {
  title: "Startup valuation Australia",
  keywords: ["startup valuation", "australia valuation"],
  angle: "For pre-seed founders raising their first round",
};

// ── Keyword-research prompt content ─────────────────────────────────────

describe("brand-search-optimization — keyword-research prompt", () => {
  it("names BlockID.au and the Australian founder audience", () => {
    expect(SOURCE).toMatch(/keyword researcher for BlockID\.au/i);
    expect(SOURCE).toMatch(/Australian startup valuation platform/i);
    expect(SOURCE).toMatch(/Australian startup founders actually search for/i);
  });

  it("asks for long-tail, high-intent variations", () => {
    expect(SOURCE).toMatch(/Long-tail, high-intent variations/i);
  });

  it("names AU regulatory / geography anchors (ASIC, ATO, ESIC, AUD)", () => {
    expect(SOURCE).toMatch(/ASIC/);
    expect(SOURCE).toMatch(/ATO/);
    expect(SOURCE).toMatch(/ESIC/);
    expect(SOURCE).toMatch(/AUD/);
  });

  it("asks for related questions and comparison queries", () => {
    expect(SOURCE).toMatch(/Related questions and comparison queries/i);
  });

  it("pins the KEYWORDS / INTENT output contract", () => {
    expect(SOURCE).toMatch(/KEYWORDS: /);
    expect(SOURCE).toMatch(/8-12 comma-separated keywords/);
    expect(SOURCE).toMatch(/INTENT: </);
  });
});

// ── Title-optimizer prompt content ──────────────────────────────────────

describe("brand-search-optimization — title-optimizer prompt", () => {
  it("names BlockID.au", () => {
    expect(SOURCE).toMatch(/title and meta-description optimiser for BlockID\.au/i);
  });

  it("references {research} template so it consumes prior session state", () => {
    // A rename here silently strips the keyword-grounding step.
    expect(SOURCE).toMatch(/\{research\}/);
  });

  it("pins the <= 60 char title rule", () => {
    expect(SOURCE).toMatch(/Title: <= 60 characters/);
  });

  it("pins the <= 155 char meta-description rule", () => {
    expect(SOURCE).toMatch(/Meta description: <= 155 characters/);
  });

  it("asks for JSON only, no markdown fences and no prose", () => {
    expect(SOURCE).toMatch(/no markdown fences, no prose/);
  });

  it("pins the {title, metaDescription} JSON keys", () => {
    expect(SOURCE).toMatch(/"title":"\.\.\."/);
    expect(SOURCE).toMatch(/"metaDescription":"\.\.\."/);
  });
});

// ── optimizeForSearch() — fail-safe fallback ────────────────────────────

describe("optimizeForSearch — fail-safe fallback", () => {
  it("returns the fallback shape (optimized=false, inputs preserved) on model throw", async () => {
    const res = await optimizeForSearch(INPUT_OK, throwingModel());
    expect(res).toEqual({
      optimizedTitle: INPUT_OK.title,
      expandedKeywords: INPUT_OK.keywords,
      searchIntent: "",
      metaDescription: "",
      optimized: false,
    });
  });

  it("preserves the exact input keyword ordering on fallback", async () => {
    const res = await optimizeForSearch(
      { title: "T", keywords: ["z-last", "a-first", "m-mid"] },
      throwingModel(),
    );
    expect(res.expandedKeywords).toEqual(["z-last", "a-first", "m-mid"]);
  });

  it("never propagates the rejection to the caller (fail-safe posture)", async () => {
    // Publish-insight cron catches nothing; a rejected promise would kill the
    // whole tick. Assert directly that no throw escapes.
    await expect(
      optimizeForSearch(INPUT_OK, throwingModel("boom")),
    ).resolves.toBeTruthy();
  });

  it("returns the fallback when the title agent throws mid-sequence", async () => {
    let n = 0;
    const model: ModelCaller = async (system) => {
      n++;
      if (/keyword researcher/i.test(system)) return KEYWORD_OK;
      throw new Error("title provider down");
    };
    const res = await optimizeForSearch(INPUT_OK, model);
    // Fail-safe: the whole optimize call reverts to input shape.
    expect(res.optimized).toBe(false);
    expect(res.optimizedTitle).toBe(INPUT_OK.title);
    expect(res.expandedKeywords).toEqual(INPUT_OK.keywords);
    expect(n).toBe(2);
  });
});

// ── optimizeForSearch() — happy path ────────────────────────────────────

describe("optimizeForSearch — happy path", () => {
  it("returns optimized=true with parsed title + meta + expanded keywords + intent", async () => {
    const { model } = recordingRouter({ keyword: KEYWORD_OK, title: TITLE_OK });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.optimized).toBe(true);
    expect(res.optimizedTitle).toBe(
      "Startup Valuation Australia: 2026 Founder's Guide",
    );
    expect(res.metaDescription).toBe(
      "How Australian founders value pre-seed and seed startups in 2026 — ESIC, cap tables and comparable rounds explained.",
    );
    expect(res.searchIntent).toBe(
      "informational — founders researching valuation methods",
    );
    expect(res.expandedKeywords).toEqual([
      "startup valuation australia",
      "how to value a pre-seed startup australia",
      "esic tax offset calculator",
      "seed round valuation guide",
      "cap table software australia",
    ]);
  });

  it("falls back to input title when the parsed title is an empty string", async () => {
    const { model } = recordingRouter({
      keyword: KEYWORD_OK,
      title: '{"title":"","metaDescription":"desc"}',
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.optimizedTitle).toBe(INPUT_OK.title);
    // Empty title is falsy → optimized=false per the module contract.
    expect(res.optimized).toBe(false);
  });

  it("falls back to input title when parsed title is whitespace-only (trim then ||)", async () => {
    const { model } = recordingRouter({
      keyword: KEYWORD_OK,
      title: '{"title":"   ","metaDescription":"desc"}',
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.optimizedTitle).toBe(INPUT_OK.title);
  });

  it("trims surrounding whitespace on the parsed title", async () => {
    const { model } = recordingRouter({
      keyword: KEYWORD_OK,
      title: '{"title":"  Wrapped Title  ","metaDescription":"desc"}',
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.optimizedTitle).toBe("Wrapped Title");
    expect(res.optimized).toBe(true);
  });

  it("trims surrounding whitespace on the parsed meta description", async () => {
    const { model } = recordingRouter({
      keyword: KEYWORD_OK,
      title: '{"title":"T","metaDescription":"   spaced desc   "}',
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.metaDescription).toBe("spaced desc");
  });

  it("returns empty metaDescription when the key is missing but title is present", async () => {
    const { model } = recordingRouter({
      keyword: KEYWORD_OK,
      title: '{"title":"Only Title"}',
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.optimizedTitle).toBe("Only Title");
    expect(res.metaDescription).toBe("");
    expect(res.optimized).toBe(true);
  });
});

// ── Keyword parsing ─────────────────────────────────────────────────────

describe("optimizeForSearch — keyword parsing", () => {
  it("parses a KEYWORDS: line into a trimmed array preserving order", async () => {
    const { model } = recordingRouter({
      keyword: "KEYWORDS:  first,   second   , third  \nINTENT: x",
      title: TITLE_OK,
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.expandedKeywords).toEqual(["first", "second", "third"]);
  });

  it("case-insensitively matches the keywords label", async () => {
    const { model } = recordingRouter({
      keyword: "keywords: one, two\nintent: x",
      title: TITLE_OK,
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.expandedKeywords).toEqual(["one", "two"]);
  });

  it("filters keywords with length <= 1 (single-char noise from stray commas)", async () => {
    const { model } = recordingRouter({
      keyword: "KEYWORDS: real one, x, another, y, third\nINTENT: x",
      title: TITLE_OK,
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.expandedKeywords).toEqual(["real one", "another", "third"]);
  });

  it("caps expanded keywords at 12 even if the model returns more", async () => {
    const many = Array.from({ length: 20 }, (_, i) => `keyword ${i + 1}`).join(", ");
    const { model } = recordingRouter({
      keyword: `KEYWORDS: ${many}\nINTENT: x`,
      title: TITLE_OK,
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.expandedKeywords).toHaveLength(12);
    expect(res.expandedKeywords[0]).toBe("keyword 1");
    expect(res.expandedKeywords[11]).toBe("keyword 12");
  });

  it("falls back to input keywords when KEYWORDS: line is missing entirely", async () => {
    const { model } = recordingRouter({
      keyword: "no keywords line here\nINTENT: informational",
      title: TITLE_OK,
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.expandedKeywords).toEqual(INPUT_OK.keywords);
    // Intent still parses independently.
    expect(res.searchIntent).toBe("informational");
  });

  it("falls back to input keywords when the KEYWORDS: line yields zero valid entries after filtering", async () => {
    const { model } = recordingRouter({
      keyword: "KEYWORDS: x, y, z\nINTENT: x",
      title: TITLE_OK,
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    // All entries are length 1 and dropped → parseKeywords returns null →
    // fallback to input.keywords.
    expect(res.expandedKeywords).toEqual(INPUT_OK.keywords);
  });

  it("falls back to input keywords when the entire keyword-research reply is empty", async () => {
    const { model } = recordingRouter({ keyword: "", title: TITLE_OK });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.expandedKeywords).toEqual(INPUT_OK.keywords);
    expect(res.searchIntent).toBe("");
  });
});

// ── Intent parsing ──────────────────────────────────────────────────────

describe("optimizeForSearch — intent parsing", () => {
  it("parses an INTENT: line into a trimmed string", async () => {
    const { model } = recordingRouter({
      keyword: "KEYWORDS: one, two\nINTENT:   informational — founder research   ",
      title: TITLE_OK,
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.searchIntent).toBe("informational — founder research");
  });

  it("case-insensitively matches the intent label", async () => {
    const { model } = recordingRouter({
      keyword: "KEYWORDS: one, two\nintent: transactional",
      title: TITLE_OK,
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.searchIntent).toBe("transactional");
  });

  it("returns empty intent when the INTENT: line is missing", async () => {
    const { model } = recordingRouter({
      keyword: "KEYWORDS: one, two",
      title: TITLE_OK,
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.searchIntent).toBe("");
    // Keywords still parse independently.
    expect(res.expandedKeywords).toEqual(["one", "two"]);
  });

  it("returns empty intent when the keyword-research reply is empty", async () => {
    const { model } = recordingRouter({ keyword: "", title: TITLE_OK });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.searchIntent).toBe("");
  });
});

// ── Title JSON parsing ──────────────────────────────────────────────────

describe("optimizeForSearch — title JSON parsing", () => {
  it("strips ```json and ``` fences before parsing", async () => {
    const { model } = recordingRouter({
      keyword: KEYWORD_OK,
      title:
        "```json\n{\"title\":\"Fenced Title\",\"metaDescription\":\"Fenced desc\"}\n```",
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.optimizedTitle).toBe("Fenced Title");
    expect(res.metaDescription).toBe("Fenced desc");
  });

  it("parses plain JSON without fences", async () => {
    const { model } = recordingRouter({
      keyword: KEYWORD_OK,
      title: '{"title":"Plain","metaDescription":"Plain desc"}',
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.optimizedTitle).toBe("Plain");
    expect(res.metaDescription).toBe("Plain desc");
  });

  it("extracts the JSON body from surrounding prose via first-{ and last-} scan", async () => {
    const { model } = recordingRouter({
      keyword: KEYWORD_OK,
      title:
        'Here is my answer: {"title":"Prose Wrapped","metaDescription":"desc"} — hope this helps!',
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.optimizedTitle).toBe("Prose Wrapped");
    expect(res.metaDescription).toBe("desc");
  });

  it("falls back to input title and empty meta on malformed JSON (never throws)", async () => {
    const { model } = recordingRouter({
      keyword: KEYWORD_OK,
      title: "{ this is: not valid json",
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.optimizedTitle).toBe(INPUT_OK.title);
    expect(res.metaDescription).toBe("");
    expect(res.optimized).toBe(false);
    // But keywords + intent from the FIRST agent still populate.
    expect(res.expandedKeywords[0]).toBe("startup valuation australia");
    expect(res.searchIntent).toContain("informational");
  });

  it("falls back when the reply has no { or } at all", async () => {
    const { model } = recordingRouter({
      keyword: KEYWORD_OK,
      title: "not json at all",
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.optimizedTitle).toBe(INPUT_OK.title);
    expect(res.metaDescription).toBe("");
    expect(res.optimized).toBe(false);
  });

  it("falls back when the reply is missing a closing brace", async () => {
    const { model } = recordingRouter({
      keyword: KEYWORD_OK,
      title: '{"title":"unclosed"',
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.optimizedTitle).toBe(INPUT_OK.title);
    expect(res.optimized).toBe(false);
  });

  it("uses the last } (not the first) so nested objects inside the payload survive", async () => {
    // The parseTitleJson scan uses `lastIndexOf('}')` — a payload with a
    // nested object should still be captured whole.
    const { model } = recordingRouter({
      keyword: KEYWORD_OK,
      title:
        '{"title":"Nested","metaDescription":"desc","_debug":{"a":1,"b":2}}',
    });
    const res = await optimizeForSearch(INPUT_OK, model);
    expect(res.optimizedTitle).toBe("Nested");
  });
});

// ── Sequential agent wiring ─────────────────────────────────────────────

describe("optimizeForSearch — sequential agent wiring", () => {
  it("calls keyword-research FIRST and title-optimizer SECOND", async () => {
    const { model, calls } = recordingRouter({
      keyword: KEYWORD_OK,
      title: TITLE_OK,
    });
    await optimizeForSearch(INPUT_OK, model);
    expect(calls).toHaveLength(2);
    expect(calls[0].system).toMatch(/keyword researcher/i);
    expect(calls[1].system).toMatch(/title and meta-description optimiser/i);
  });

  it("passes the keyword-research raw output into the title prompt via {research} template", async () => {
    const { model, calls } = recordingRouter({
      keyword: KEYWORD_OK,
      title: TITLE_OK,
    });
    await optimizeForSearch(INPUT_OK, model);
    const titleSystem = calls[1].system;
    expect(titleSystem).toContain("KEYWORDS: startup valuation australia");
    expect(titleSystem).toContain("INTENT: informational");
    // And the literal template token must have been substituted.
    expect(titleSystem).not.toContain("{research}");
  });

  it("forwards the keyword-research output as the title agent's user input (chained sub-agent)", async () => {
    const { model, calls } = recordingRouter({
      keyword: KEYWORD_OK,
      title: TITLE_OK,
    });
    await optimizeForSearch(INPUT_OK, model);
    // SequentialAgent forwards agent N's output → agent N+1's user input.
    expect(calls[1].user).toContain("KEYWORDS: startup valuation australia");
  });

  it("sends the initial user input to the keyword agent (topic + seed keywords + angle)", async () => {
    const { model, calls } = recordingRouter({
      keyword: KEYWORD_OK,
      title: TITLE_OK,
    });
    await optimizeForSearch(INPUT_OK, model);
    expect(calls[0].user).toContain("## Topic\nStartup valuation Australia");
    expect(calls[0].user).toContain(
      "## Seed Keywords\nstartup valuation, australia valuation",
    );
    expect(calls[0].user).toContain(
      "## Angle\nFor pre-seed founders raising their first round",
    );
  });

  it("emits a `## Angle` block only when input.angle is provided", async () => {
    const { model, calls } = recordingRouter({
      keyword: KEYWORD_OK,
      title: TITLE_OK,
    });
    await optimizeForSearch(INPUT_OK, model);
    expect(calls[0].user).toContain("## Angle");
  });

  it("omits the `## Angle` block entirely when input.angle is undefined", async () => {
    const { model, calls } = recordingRouter({
      keyword: KEYWORD_OK,
      title: TITLE_OK,
    });
    await optimizeForSearch(
      { title: "T", keywords: ["one", "two"] },
      model,
    );
    expect(calls[0].user).not.toContain("## Angle");
    // Sanity: still emits the other two blocks with no trailing blank section.
    expect(calls[0].user).toMatch(/^## Topic\nT\n\n## Seed Keywords\none, two$/);
  });

  it("omits the `## Angle` block when input.angle is an empty string (Boolean(\"\") is false)", async () => {
    const { model, calls } = recordingRouter({
      keyword: KEYWORD_OK,
      title: TITLE_OK,
    });
    await optimizeForSearch(
      { title: "T", keywords: ["k1"], angle: "" },
      model,
    );
    // filter(Boolean) drops empty-string segments so no dangling "## Angle\n"
    // heading leaks into the prompt.
    expect(calls[0].user).not.toContain("## Angle");
  });

  it("joins seed keywords with a comma+space separator", async () => {
    const { model, calls } = recordingRouter({
      keyword: KEYWORD_OK,
      title: TITLE_OK,
    });
    await optimizeForSearch(
      { title: "T", keywords: ["alpha", "beta", "gamma"] },
      model,
    );
    expect(calls[0].user).toContain("## Seed Keywords\nalpha, beta, gamma");
  });

  it("uses maxTokens 400 for the keyword agent and 300 for the title agent", async () => {
    const { model, calls } = recordingRouter({
      keyword: KEYWORD_OK,
      title: TITLE_OK,
    });
    await optimizeForSearch(INPUT_OK, model);
    expect(calls[0].maxTokens).toBe(400);
    expect(calls[1].maxTokens).toBe(300);
  });

  it("uses the SequentialAgent name 'brand_search_optimization'", () => {
    // The name is baked into the module so a rename here (or drift onto a
    // different agent registry key) is visible in the diff.
    expect(SOURCE).toMatch(/new SequentialAgent\(\s*"brand_search_optimization"/);
  });
});
