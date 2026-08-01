// Colocated vitest for `market-research.ts` — the SequentialAgent that pipes
// market_trends_agent → competitive_positioning_agent to fill
// `gatherResults.competitiveResearch` for the CMO's market-criterion prompt in
// agent-dispatcher.ts (the field was previously never populated — see the
// module header).
//
// The shallow smoke-test in `agents.test.ts` proves it runs end-to-end. This
// suite pins the load-bearing detail so a subprocess rewrite can't quietly
// drop:
//   * the AU market context — the trends prompt names BlockID.au + Australian
//     TAM/SAM (drift into pure US framing rips the "AU startup platform"
//     positioning the CMO's report section relies on)
//   * the "no fabricated statistics / no fake sources" guardrail on the trends
//     prompt, and the "name only competitors you are genuinely aware of"
//     guardrail on the positioning prompt (both anchor the fail-safe posture —
//     without them the fallback null result silently becomes plausible-sounding
//     hallucinated market data)
//   * the trace order (trends FIRST, positioning SECOND) — the positioning
//     prompt references `{trends}` in its instruction, so reversing the order
//     silently strips the market grounding step and the JSON positioning
//     landscape comes back untethered from the sector read
//   * the trendsAgent outputKey ("trends") — losing it desyncs the positioning
//     prompt's `{trends}` template and the analyst runs against an empty
//     block, which usually round-trips to "competitors: []" and null result
//   * the fail-safe null return — every downstream caller (report-pipeline
//     gather phase) treats a rejected promise as pipeline-fatal, so this
//     module MUST catch and return null on any model / parse error
//   * the description truncation to 4000 chars — the free model chain has a
//     tight token budget; a raw 20k description blows the context window and
//     silently drops trends output
//   * the hasSignal gate — a fully-empty result (no trends AND no competitors
//     AND no positioning) is worse than null because it pollutes the gather
//     phase with an object shape that the CMO prompt treats as "research
//     found nothing worth mentioning" instead of "research failed, use the
//     stage fallback"
//   * the competitors[] normalisation — Array.isArray guard, string-name
//     filter, note-default-"" coercion, cap of 6 — without any of these the
//     CMO section can render undefined.note or crash on non-array payloads
//   * the parsePositioningJson bail — malformed JSON returns null (never
//     throws) so a mangled model reply doesn't crash the whole gather phase
//   * the maxTokens budgets (500 trends, 600 positioning) — sized against the
//     $0 free-provider ceiling; a silent bump to 2048 pushes the pair over
//     the per-tick free-provider quota
//   * the sector-hint elision — an undefined sector must NOT emit an empty
//     "## Sector hint" heading (the trends agent treats blanks as facts and
//     hallucinates a sector against them)

import { describe, it, expect } from "vitest";
import { researchMarket } from "./market-research";
import type { ModelCaller } from "@/lib/adk";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Test doubles ────────────────────────────────────────────────────────

/**
 * Recording model — routes by whether the system prompt contains "market
 * trends analyst" or "competitive positioning analyst" and logs every call
 * for prompt-shape assertions.
 */
function recordingRouter(routes: {
  trends?: string;
  positioning?: string;
}): {
  model: ModelCaller;
  calls: Array<{ system: string; user: string; maxTokens: number }>;
} {
  const calls: Array<{ system: string; user: string; maxTokens: number }> = [];
  const model: ModelCaller = async (system, user, maxTokens) => {
    calls.push({ system, user, maxTokens });
    if (/market trends analyst/i.test(system)) return routes.trends ?? "";
    if (/competitive positioning analyst/i.test(system)) {
      return routes.positioning ?? "";
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

const TRENDS_OK =
  "SECTOR: Startup equity tokenisation\nTRENDS:\n- ESIC tax-incentive investor interest is climbing\n- ASX listings for micro-cap fintechs are opening back up\nMARKET_SIZE: AU niche ~A$50m; global TAM in the billions (approximate)";

const POSITIONING_OK = `\`\`\`json
{
  "competitors": [
    {"name": "Cake Equity", "note": "cap-table SaaS, Melbourne, no tokenisation"},
    {"name": "Carta", "note": "US market leader, ESIC not supported"}
  ],
  "differentiators": ["ESIC / ESVCLP native", "AU + global reach"],
  "positioning": "The BlockID.au equity token exchange for AU startups.",
  "whitespace": ["Sub-A$500k pre-seed rounds", "Non-metro founders"]
}
\`\`\``;

// Module source read once for grep-defensible content assertions (mirrors the
// pattern in financial-advisor.test.ts).
const SOURCE = readFileSync(
  resolve(__dirname, "market-research.ts"),
  "utf8",
);

const INPUT_OK = {
  startupName: "BlockID",
  description: "Australian startup equity + token issuance platform.",
  sector: "Startup equity",
};

// ── Trends prompt content ───────────────────────────────────────────────

describe("market-research — trends prompt", () => {
  it("names BlockID.au and declares Australian context", () => {
    expect(SOURCE).toMatch(/market trends analyst for BlockID\.au/i);
    expect(SOURCE).toMatch(/Australian startup platform/i);
  });

  it("forbids fabricated statistics and fake sources", () => {
    expect(SOURCE).toMatch(/do NOT fabricate specific statistics/);
    expect(SOURCE).toMatch(/cite fake sources/);
  });

  it("pins the SECTOR / TRENDS / MARKET_SIZE output contract", () => {
    expect(SOURCE).toMatch(/SECTOR: <the startup's primary sector\/category>/);
    expect(SOURCE).toMatch(/TRENDS:\n- </);
    expect(SOURCE).toMatch(/MARKET_SIZE: </);
  });

  it("asks for both AU and global TAM/SAM", () => {
    expect(SOURCE).toMatch(/Australian \+ global context/i);
  });
});

// ── Positioning prompt content ──────────────────────────────────────────

describe("market-research — positioning prompt", () => {
  it("names BlockID.au", () => {
    expect(SOURCE).toMatch(/competitive positioning analyst for BlockID\.au/i);
  });

  it("references {trends} template so it consumes prior session state", () => {
    // Must reference the trends outputKey verbatim — a rename here silently
    // strips the market-grounding step.
    expect(SOURCE).toMatch(/\{trends\}/);
  });

  it("forbids inventing competitor names when unsure", () => {
    expect(SOURCE).toMatch(/if unsure, describe the competitor TYPE/i);
    expect(SOURCE).toMatch(/inventing a company name/i);
  });

  it("pins the JSON keys competitors / differentiators / positioning / whitespace", () => {
    expect(SOURCE).toMatch(/"competitors"/);
    expect(SOURCE).toMatch(/"differentiators"/);
    expect(SOURCE).toMatch(/"positioning"/);
    expect(SOURCE).toMatch(/"whitespace"/);
  });

  it("asks for JSON without markdown fences or prose", () => {
    expect(SOURCE).toMatch(/no markdown fences, no prose/);
  });
});

// ── researchMarket() — guards ────────────────────────────────────────────

describe("researchMarket — input guards", () => {
  it("returns null when description is an empty string (no model call)", async () => {
    const { model, calls } = recordingRouter({});
    const res = await researchMarket({ ...INPUT_OK, description: "" }, model);
    expect(res).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("returns null when description is whitespace-only (no model call)", async () => {
    const { model, calls } = recordingRouter({});
    const res = await researchMarket(
      { ...INPUT_OK, description: "   \n\t  " },
      model,
    );
    expect(res).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("returns null on model throw (fail-safe, no rejection propagated)", async () => {
    const res = await researchMarket(INPUT_OK, throwingModel());
    expect(res).toBeNull();
  });
});

// ── researchMarket() — happy path ────────────────────────────────────────

describe("researchMarket — happy path", () => {
  it("returns fully-populated result on trends + positioning replies", async () => {
    const { model } = recordingRouter({
      trends: TRENDS_OK,
      positioning: POSITIONING_OK,
    });
    const res = await researchMarket(INPUT_OK, model);
    expect(res).not.toBeNull();
    expect(res!.sector).toBe("Startup equity tokenisation");
    expect(res!.marketSize).toMatch(/AU niche/);
    expect(res!.trends).toEqual([
      "ESIC tax-incentive investor interest is climbing",
      "ASX listings for micro-cap fintechs are opening back up",
    ]);
    expect(res!.competitors).toEqual([
      { name: "Cake Equity", note: "cap-table SaaS, Melbourne, no tokenisation" },
      { name: "Carta", note: "US market leader, ESIC not supported" },
    ]);
    expect(res!.differentiators).toEqual([
      "ESIC / ESVCLP native",
      "AU + global reach",
    ]);
    expect(res!.positioning).toMatch(/equity token exchange for AU startups/);
    expect(res!.whitespace).toEqual([
      "Sub-A$500k pre-seed rounds",
      "Non-metro founders",
    ]);
  });

  it("returns non-null when only trends are populated (hasSignal via trends)", async () => {
    const { model } = recordingRouter({
      trends: TRENDS_OK,
      positioning: "not json",
    });
    const res = await researchMarket(INPUT_OK, model);
    expect(res).not.toBeNull();
    expect(res!.trends.length).toBeGreaterThan(0);
    expect(res!.competitors).toEqual([]);
    expect(res!.positioning).toBe("");
  });

  it("returns non-null when only competitors are populated (hasSignal via competitors)", async () => {
    const { model } = recordingRouter({
      trends: "",
      positioning: '{"competitors":[{"name":"Solo","note":"only rival"}]}',
    });
    const res = await researchMarket(INPUT_OK, model);
    expect(res).not.toBeNull();
    expect(res!.competitors).toEqual([{ name: "Solo", note: "only rival" }]);
  });

  it("returns non-null when only positioning string is populated (hasSignal via positioning)", async () => {
    const { model } = recordingRouter({
      trends: "",
      positioning: '{"positioning":"the AU-native option"}',
    });
    const res = await researchMarket(INPUT_OK, model);
    expect(res).not.toBeNull();
    expect(res!.positioning).toBe("the AU-native option");
  });

  it("returns null when neither trends nor competitors nor positioning have signal", async () => {
    const { model } = recordingRouter({
      trends: "SECTOR: X\nMARKET_SIZE: Y", // no TRENDS block → 0 bullets
      positioning: "{}", // empty JSON → 0 competitors, empty positioning
    });
    const res = await researchMarket(INPUT_OK, model);
    expect(res).toBeNull();
  });
});

// ── Field parsing ────────────────────────────────────────────────────────

describe("researchMarket — field parsing", () => {
  it("falls back to input.sector when SECTOR line is missing", async () => {
    const { model } = recordingRouter({
      trends: "TRENDS:\n- something\nMARKET_SIZE: small",
      positioning: '{"positioning":"x"}',
    });
    const res = await researchMarket({ ...INPUT_OK, sector: "Fintech" }, model);
    expect(res!.sector).toBe("Fintech");
  });

  it("falls back to empty string when SECTOR line and input.sector are both missing", async () => {
    const { model } = recordingRouter({
      trends: "TRENDS:\n- foo\nMARKET_SIZE: small",
      positioning: '{"positioning":"x"}',
    });
    const res = await researchMarket(
      { startupName: "X", description: "A short description." },
      model,
    );
    expect(res!.sector).toBe("");
  });

  it("case-insensitively matches SECTOR / MARKET_SIZE labels", async () => {
    const { model } = recordingRouter({
      trends: "sector: mixed reality\nTRENDS:\n- head-mounted uptake\nmarket_size: A$1b niche",
      positioning: '{"positioning":"x"}',
    });
    const res = await researchMarket(INPUT_OK, model);
    expect(res!.sector).toBe("mixed reality");
    expect(res!.marketSize).toBe("A$1b niche");
  });

  it("caps trends at 4 items even if the model returns more", async () => {
    const { model } = recordingRouter({
      trends:
        "SECTOR: X\nTRENDS:\n- one\n- two\n- three\n- four\n- five\n- six\nMARKET_SIZE: Y",
      positioning: '{"positioning":"x"}',
    });
    const res = await researchMarket(INPUT_OK, model);
    expect(res!.trends).toEqual(["one", "two", "three", "four"]);
  });

  it("accepts `*` bullets as well as `-` bullets", async () => {
    const { model } = recordingRouter({
      trends: "SECTOR: X\nTRENDS:\n* asterisk one\n* asterisk two\nMARKET_SIZE: Y",
      positioning: '{"positioning":"x"}',
    });
    const res = await researchMarket(INPUT_OK, model);
    expect(res!.trends).toEqual(["asterisk one", "asterisk two"]);
  });

  it("stops parsing bullets when MARKET_SIZE line is reached", async () => {
    const { model } = recordingRouter({
      trends:
        "SECTOR: X\nTRENDS:\n- keep me\nMARKET_SIZE: Y\n- ignore me (after market_size)",
      positioning: '{"positioning":"x"}',
    });
    const res = await researchMarket(INPUT_OK, model);
    expect(res!.trends).toEqual(["keep me"]);
  });

  it("skips empty trailing bullets and whitespace-only bullet lines", async () => {
    const { model } = recordingRouter({
      trends: "SECTOR: X\nTRENDS:\n- real\n-   \n- \n- another\nMARKET_SIZE: Y",
      positioning: '{"positioning":"x"}',
    });
    const res = await researchMarket(INPUT_OK, model);
    // whitespace-only "- " lines produce an empty trimmed body which the
    // parser must drop.
    expect(res!.trends).toEqual(["real", "another"]);
  });

  it("returns empty trends array when the TRENDS: heading is missing", async () => {
    const { model } = recordingRouter({
      trends:
        "SECTOR: X\n- naked bullet not under trends heading\nMARKET_SIZE: Y",
      positioning: '{"positioning":"x"}',
    });
    const res = await researchMarket(INPUT_OK, model);
    // Only positioning has signal here, so the whole call is not null.
    expect(res!.trends).toEqual([]);
  });
});

// ── Positioning JSON parsing ────────────────────────────────────────────

describe("researchMarket — positioning JSON parsing", () => {
  it("strips ```json and ``` fences before parsing", async () => {
    const { model } = recordingRouter({
      trends: TRENDS_OK,
      positioning:
        "```json\n{\"positioning\":\"fenced\",\"competitors\":[]}\n```",
    });
    const res = await researchMarket(INPUT_OK, model);
    expect(res!.positioning).toBe("fenced");
  });

  it("parses plain JSON without fences", async () => {
    const { model } = recordingRouter({
      trends: TRENDS_OK,
      positioning:
        '{"positioning":"plain","competitors":[{"name":"A","note":"n"}]}',
    });
    const res = await researchMarket(INPUT_OK, model);
    expect(res!.positioning).toBe("plain");
    expect(res!.competitors).toEqual([{ name: "A", note: "n" }]);
  });

  it("extracts the JSON body from surrounding prose via first-{ and last-} scan", async () => {
    const { model } = recordingRouter({
      trends: TRENDS_OK,
      positioning:
        "Here you go: {\"positioning\":\"prose-wrapped\"} — hope this helps!",
    });
    const res = await researchMarket(INPUT_OK, model);
    expect(res!.positioning).toBe("prose-wrapped");
  });

  it("returns empty defaults when positioning JSON is malformed (never throws)", async () => {
    const { model } = recordingRouter({
      trends: TRENDS_OK,
      positioning: "{ this is: not valid json",
    });
    const res = await researchMarket(INPUT_OK, model);
    expect(res!.competitors).toEqual([]);
    expect(res!.differentiators).toEqual([]);
    expect(res!.positioning).toBe("");
    expect(res!.whitespace).toEqual([]);
  });

  it("returns empty defaults when positioning has no { or } at all", async () => {
    const { model } = recordingRouter({
      trends: TRENDS_OK,
      positioning: "not json at all",
    });
    const res = await researchMarket(INPUT_OK, model);
    expect(res!.competitors).toEqual([]);
    expect(res!.positioning).toBe("");
  });

  it("filters competitors without a string name", async () => {
    const { model } = recordingRouter({
      trends: TRENDS_OK,
      positioning: JSON.stringify({
        competitors: [
          { name: "Real", note: "keep" },
          { name: 42, note: "drop numeric name" },
          { note: "no name at all" },
          null,
          { name: "Kept2", note: "keep" },
        ],
        positioning: "x",
      }),
    });
    const res = await researchMarket(INPUT_OK, model);
    expect(res!.competitors).toEqual([
      { name: "Real", note: "keep" },
      { name: "Kept2", note: "keep" },
    ]);
  });

  it("defaults competitor note to empty string when missing / non-string", async () => {
    const { model } = recordingRouter({
      trends: TRENDS_OK,
      positioning: JSON.stringify({
        competitors: [
          { name: "NoNote" },
          { name: "NumericNote", note: 7 },
        ],
        positioning: "x",
      }),
    });
    const res = await researchMarket(INPUT_OK, model);
    expect(res!.competitors).toEqual([
      { name: "NoNote", note: "" },
      { name: "NumericNote", note: "" },
    ]);
  });

  it("caps competitors[] at 6", async () => {
    const many = Array.from({ length: 10 }, (_, i) => ({
      name: `C${i}`,
      note: `n${i}`,
    }));
    const { model } = recordingRouter({
      trends: TRENDS_OK,
      positioning: JSON.stringify({ competitors: many, positioning: "x" }),
    });
    const res = await researchMarket(INPUT_OK, model);
    expect(res!.competitors).toHaveLength(6);
    expect(res!.competitors[0]).toEqual({ name: "C0", note: "n0" });
    expect(res!.competitors[5]).toEqual({ name: "C5", note: "n5" });
  });

  it("defaults competitors to [] when the key is missing entirely", async () => {
    const { model } = recordingRouter({
      trends: TRENDS_OK,
      positioning: '{"positioning":"only-positioning"}',
    });
    const res = await researchMarket(INPUT_OK, model);
    expect(res!.competitors).toEqual([]);
  });

  it("defaults differentiators and whitespace to [] when the keys are missing", async () => {
    const { model } = recordingRouter({
      trends: TRENDS_OK,
      positioning: '{"positioning":"x"}',
    });
    const res = await researchMarket(INPUT_OK, model);
    expect(res!.differentiators).toEqual([]);
    expect(res!.whitespace).toEqual([]);
  });
});

// ── Sequential agent wiring ─────────────────────────────────────────────

describe("researchMarket — sequential agent wiring", () => {
  it("calls trends FIRST and positioning SECOND", async () => {
    const { model, calls } = recordingRouter({
      trends: TRENDS_OK,
      positioning: POSITIONING_OK,
    });
    await researchMarket(INPUT_OK, model);
    expect(calls).toHaveLength(2);
    expect(calls[0].system).toMatch(/market trends analyst/i);
    expect(calls[1].system).toMatch(/competitive positioning analyst/i);
  });

  it("passes the trends output into the positioning prompt via {trends} template", async () => {
    const { model, calls } = recordingRouter({
      trends: TRENDS_OK,
      positioning: POSITIONING_OK,
    });
    await researchMarket(INPUT_OK, model);
    const positioningSystem = calls[1].system;
    // The positioning agent's system prompt should have `{trends}` swapped for
    // the trends agent's raw output (trimmed).
    expect(positioningSystem).toContain(
      "SECTOR: Startup equity tokenisation",
    );
    expect(positioningSystem).toContain(
      "ESIC tax-incentive investor interest is climbing",
    );
    // And it should NOT still contain the literal template token.
    expect(positioningSystem).not.toContain("{trends}");
  });

  it("passes the trends output as the positioning user input (chained sub-agent)", async () => {
    const { model, calls } = recordingRouter({
      trends: TRENDS_OK,
      positioning: POSITIONING_OK,
    });
    await researchMarket(INPUT_OK, model);
    // SequentialAgent forwards agent N's output → agent N+1's user input.
    expect(calls[1].user).toContain(
      "ESIC tax-incentive investor interest is climbing",
    );
  });

  it("sends the initial user input to the trends agent (startup name + description)", async () => {
    const { model, calls } = recordingRouter({
      trends: TRENDS_OK,
      positioning: POSITIONING_OK,
    });
    await researchMarket(INPUT_OK, model);
    expect(calls[0].user).toContain("## Startup\nBlockID");
    expect(calls[0].user).toContain(
      "## Description\nAustralian startup equity + token issuance platform.",
    );
  });

  it("emits a `## Sector hint` block only when input.sector is provided", async () => {
    const { model, calls } = recordingRouter({
      trends: TRENDS_OK,
      positioning: POSITIONING_OK,
    });
    await researchMarket(INPUT_OK, model); // sector: "Startup equity"
    expect(calls[0].user).toContain("## Sector hint\nStartup equity");
  });

  it("omits the `## Sector hint` block entirely when input.sector is undefined", async () => {
    const { model, calls } = recordingRouter({
      trends: TRENDS_OK,
      positioning: POSITIONING_OK,
    });
    await researchMarket(
      { startupName: "S", description: "some description text" },
      model,
    );
    expect(calls[0].user).not.toContain("## Sector hint");
    // Sanity: still emits the other two blocks and no leading empty section.
    expect(calls[0].user).toMatch(/^## Startup\nS\n\n## Description/);
  });

  it("truncates description to the first 4000 chars before sending to trends", async () => {
    const long = "x".repeat(5000);
    const { model, calls } = recordingRouter({
      trends: TRENDS_OK,
      positioning: POSITIONING_OK,
    });
    await researchMarket({ ...INPUT_OK, description: long }, model);
    const descBlock = calls[0].user.split("## Description\n")[1];
    expect(descBlock).toHaveLength(4000);
  });

  it("uses maxTokens 500 for the trends agent and 600 for the positioning agent", async () => {
    const { model, calls } = recordingRouter({
      trends: TRENDS_OK,
      positioning: POSITIONING_OK,
    });
    await researchMarket(INPUT_OK, model);
    expect(calls[0].maxTokens).toBe(500);
    expect(calls[1].maxTokens).toBe(600);
  });

  it("returns null if the positioning call throws (whole SequentialAgent fails fail-safe)", async () => {
    let n = 0;
    const model: ModelCaller = async (system) => {
      n++;
      if (/market trends analyst/i.test(system)) return TRENDS_OK;
      throw new Error("positioning provider down");
    };
    const res = await researchMarket(INPUT_OK, model);
    expect(res).toBeNull();
    expect(n).toBe(2);
  });
});
