// Colocated vitest for `customer-service.ts` — the two-step
// SequentialAgent (triage_agent → response_agent) that classifies a support
// message, drafts a grounded reply from the BlockID knowledge base, and
// decides whether to escalate to a human specialist.
//
// The existing `agents.test.ts` covers three shallow end-to-end paths. This
// suite pins the load-bearing detail so a subprocess rewrite cannot silently
// drop:
//   * the seven-category enum in the triage prompt — dropping "billing" or
//     "valuation_question" collapses the router mapping in support ops
//   * the ESCALATE-yes triggers (refunds / billing disputes / privacy /
//     security incidents / legal threats / clear anger) — losing any one of
//     these silently stops CISO+CLO paging on the incident it names
//   * the BLOCKID_KB grounding block — reply agent may ONLY use these facts;
//     a rewrite that removes SVI / ASIC / ATO / ESIC / AUD framing lets the
//     model drift into US SAFE / Delaware guidance
//   * the response prompt's "2-5 sentences" length rail — losing it lets the
//     LLM write essay-length replies that blow the free-provider budget
//   * the response prompt's "Never invent pricing, numbers, or features"
//     rule — losing it lets the LLM hallucinate credits/prices into a
//     support reply (compliance risk under ACL)
//   * the {triage} template token — the response agent's prompt reads the
//     upstream triage via ADK templating; a drift here silently disconnects
//     the two agents so the reply is written without triage grounding
//   * the sequential trace order (triage FIRST, response SECOND) — the
//     response prompt references `{triage}` from session state, so reversing
//     the order sends an empty triage into the response agent
//   * the triage agent's `outputKey: "triage"` — losing it desyncs the
//     response prompt's `{triage}` template and the reply is grounded on ""
//   * the reply is taken from the LAST trace entry — a rewrite that pulls
//     from trace[0] would surface the raw triage classification as the
//     founder-facing reply
//   * fallback shape when the model throws or the message is blank —
//     category "other", sentiment "neutral", escalate TRUE, a non-empty
//     reply that mentions the free SVI (never hard-fails a support surface)
//   * `parseCategory` — accepts each of the seven valid values, treats an
//     unknown / missing value as "other", is case-insensitive
//   * `parseSentiment` — accepts positive|neutral|negative, defaults to
//     "neutral" on missing/unknown, is case-insensitive
//   * ESCALATE parsing is regex-based `/ESCALATE:\s*yes/i` — trailing
//     text, extra whitespace, and case variants all still flip the flag
//   * `maxTokens` budgets — triage capped at 120, response capped at 500
//     (sized against the free-provider ceiling; a silent bump breaks
//     credit math for the customer-success cron)
//   * `.trim()` applied to the reply text — a model that returns
//     "\n\n hi \n\n" must not leak leading/trailing whitespace into the UI

import { describe, it, expect } from "vitest";
import { handleSupportQuery, type SupportResult } from "./customer-service";
import type { ModelCaller } from "@/lib/adk";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── Test doubles ────────────────────────────────────────────────────────

/**
 * Recording model — routes by whether the system prompt contains
 * "triage agent" or "customer-success agent" and logs every (system, user,
 * maxTokens) call so we can pin ordering + prompt templating.
 */
function recordingRouter(routes: {
  triage?: string;
  response?: string;
}): {
  model: ModelCaller;
  calls: Array<{ system: string; user: string; maxTokens: number }>;
} {
  const calls: Array<{ system: string; user: string; maxTokens: number }> = [];
  const model: ModelCaller = async (system, user, maxTokens) => {
    calls.push({ system, user, maxTokens });
    if (/triage agent/i.test(system)) return routes.triage ?? "";
    if (/customer-success agent/i.test(system)) return routes.response ?? "";
    return "";
  };
  return { model, calls };
}

function throwingModel(msg = "provider down"): ModelCaller {
  return async () => {
    throw new Error(msg);
  };
}

// Full source is asserted against in a handful of tests so string greps are
// defensible against a subprocess that swaps in a helper indirection.
const SOURCE = readFileSync(
  resolve(__dirname, "customer-service.ts"),
  "utf8",
);

const FALLBACK_REPLY_MARKER = "Startup Value Index";

// ── Triage prompt content ──────────────────────────────────────────────

describe("customer-service — triage prompt", () => {
  it("identifies the agent as BlockID.au customer-support triage", () => {
    expect(SOURCE).toMatch(/customer-support triage agent for BlockID\.au/);
  });

  it("declares the CATEGORY output contract", () => {
    expect(SOURCE).toMatch(/CATEGORY:\s*<one of:/);
  });

  it("lists every supported category in the triage enum", () => {
    for (const cat of [
      "billing",
      "technical",
      "product_how_to",
      "valuation_question",
      "account",
      "feedback",
      "other",
    ]) {
      expect(SOURCE).toContain(cat);
    }
  });

  it("declares the SENTIMENT output contract with three values", () => {
    expect(SOURCE).toMatch(/SENTIMENT:\s*<positive \| neutral \| negative>/);
  });

  it("declares the ESCALATE output contract with yes|no", () => {
    expect(SOURCE).toMatch(/ESCALATE:\s*<yes \| no>/);
  });

  it("names every ESCALATE-yes trigger required by CISO/CLO sign-off", () => {
    // Refunds, billing disputes, data/privacy/security incidents, legal
    // threats, or clear anger.
    expect(SOURCE).toMatch(/refunds/i);
    expect(SOURCE).toMatch(/billing disputes/i);
    expect(SOURCE).toMatch(/data\/privacy\/security incidents/i);
    expect(SOURCE).toMatch(/legal threats/i);
    expect(SOURCE).toMatch(/clear anger/i);
  });
});

// ── Response prompt content (BLOCKID_KB grounding) ──────────────────────

describe("customer-service — response prompt + BLOCKID_KB", () => {
  it("frames the response agent as friendly + concise BlockID.au success", () => {
    expect(SOURCE).toMatch(
      /friendly, concise customer-success agent for BlockID\.au/,
    );
  });

  it("names the Startup Value Index (SVI) as the core product", () => {
    expect(SOURCE).toMatch(/Startup Value Index \(SVI\)/);
  });

  it("pins the SVI as a 0-100 evidence-backed score across 13 criteria", () => {
    expect(SOURCE).toMatch(/0-100/);
    expect(SOURCE).toMatch(/13 criteria/);
  });

  it("declares the pricing anchor: free SVI + credits for paid reports", () => {
    expect(SOURCE).toMatch(/free SVI score/i);
    expect(SOURCE).toMatch(/credits/);
  });

  it("targets Australian founders pre-seed to Series A", () => {
    expect(SOURCE).toMatch(/Australian founders/i);
    expect(SOURCE).toMatch(/pre-seed to Series A/i);
  });

  it("anchors the KB in AU context (ASIC, ATO, ESIC, AUD)", () => {
    expect(SOURCE).toMatch(/\bASIC\b/);
    expect(SOURCE).toMatch(/\bATO\b/);
    expect(SOURCE).toMatch(/\bESIC\b/);
    expect(SOURCE).toMatch(/\bAUD\b/);
  });

  it("references the triage via the {triage} template token", () => {
    expect(SOURCE).toMatch(/\{triage\}/);
  });

  it("caps reply length at 2-5 sentences", () => {
    expect(SOURCE).toMatch(/2-5 sentences/);
  });

  it("forbids invented pricing/numbers/features (ACL compliance rail)", () => {
    expect(SOURCE).toMatch(/Never invent pricing, numbers, or features/i);
  });

  it("asks the agent to escalate acknowledgement when triage says ESCALATE: yes", () => {
    expect(SOURCE).toMatch(/If the triage says ESCALATE: yes/);
    expect(SOURCE).toMatch(/escalating.*human specialist/);
  });

  it("asks the agent to reply with the reply text only (no envelope)", () => {
    expect(SOURCE).toMatch(/Output ONLY the reply text/);
  });

  it("points founders to core BlockID features (SVI / reports / cap table)", () => {
    expect(SOURCE).toMatch(/SVI score/);
    expect(SOURCE).toMatch(/reports/);
    expect(SOURCE).toMatch(/cap table/);
  });
});

// ── Sequential order / trace ────────────────────────────────────────────

describe("customer-service — triage→response ordering", () => {
  it("calls the triage agent BEFORE the response agent", async () => {
    const { model, calls } = recordingRouter({
      triage: "CATEGORY: product_how_to\nSENTIMENT: neutral\nESCALATE: no",
      response: "Sure — start from the homepage.",
    });
    await handleSupportQuery("How do I get my score?", model);
    expect(calls.length).toBe(2);
    expect(calls[0]?.system).toMatch(/triage agent/i);
    expect(calls[1]?.system).toMatch(/customer-success agent/i);
  });

  it("threads the triage output into the response prompt via {triage}", async () => {
    const { model, calls } = recordingRouter({
      triage:
        "CATEGORY: billing\nSENTIMENT: negative\nESCALATE: yes\nTRIAGE_MARKER_ZZZ",
      response: "Escalating.",
    });
    await handleSupportQuery("refund now", model);
    // ADK renders the response agent's system prompt against session state.
    // The triage output (written under outputKey "triage") must appear inline.
    expect(calls[1]?.system).toContain("TRIAGE_MARKER_ZZZ");
  });

  it("gives the response agent the triage's raw output as its user input", async () => {
    const { model, calls } = recordingRouter({
      triage:
        "CATEGORY: technical\nSENTIMENT: neutral\nESCALATE: no\nRAW_HANDOFF_TOKEN_QQQ",
      response: "ok",
    });
    await handleSupportQuery("bug report", model);
    // SequentialAgent forwards the previous agent's raw output as the next
    // agent's user input. A rewrite that re-uses the initial input as the
    // response's user input would be caught here.
    expect(calls[1]?.user).toContain("RAW_HANDOFF_TOKEN_QQQ");
  });

  it("budgets 120 tokens for triage and 500 for response", async () => {
    const { model, calls } = recordingRouter({
      triage: "CATEGORY: other\nSENTIMENT: neutral\nESCALATE: no",
      response: "hi",
    });
    await handleSupportQuery("hi", model);
    expect(calls[0]?.maxTokens).toBe(120);
    expect(calls[1]?.maxTokens).toBe(500);
  });

  it("passes the founder's original message as the triage user input", async () => {
    const { model, calls } = recordingRouter({
      triage: "CATEGORY: feedback\nSENTIMENT: positive\nESCALATE: no",
      response: "Thanks!",
    });
    await handleSupportQuery("Loved the new dashboard", model);
    expect(calls[0]?.user).toBe("Loved the new dashboard");
  });
});

// ── parseCategory branches ─────────────────────────────────────────────

describe("customer-service — parseCategory", () => {
  const CATS = [
    "billing",
    "technical",
    "product_how_to",
    "valuation_question",
    "account",
    "feedback",
    "other",
  ] as const;

  for (const cat of CATS) {
    it(`accepts the "${cat}" category from a triage payload`, async () => {
      const { model } = recordingRouter({
        triage: `CATEGORY: ${cat}\nSENTIMENT: neutral\nESCALATE: no`,
        response: "ok",
      });
      const res = await handleSupportQuery("q", model);
      expect(res.category).toBe(cat);
    });
  }

  it("returns 'other' when CATEGORY is unrecognised", async () => {
    const { model } = recordingRouter({
      triage: "CATEGORY: gibberish\nSENTIMENT: neutral\nESCALATE: no",
      response: "ok",
    });
    const res = await handleSupportQuery("q", model);
    expect(res.category).toBe("other");
  });

  it("returns 'other' when the CATEGORY label is missing entirely", async () => {
    const { model } = recordingRouter({
      triage: "SENTIMENT: neutral\nESCALATE: no",
      response: "ok",
    });
    const res = await handleSupportQuery("q", model);
    expect(res.category).toBe("other");
  });

  it("is case-insensitive for the CATEGORY label", async () => {
    const { model } = recordingRouter({
      triage: "category: billing\nSENTIMENT: neutral\nESCALATE: no",
      response: "ok",
    });
    const res = await handleSupportQuery("q", model);
    expect(res.category).toBe("billing");
  });

  it("normalises uppercase category values to lowercase enum", async () => {
    const { model } = recordingRouter({
      triage: "CATEGORY: BILLING\nSENTIMENT: neutral\nESCALATE: no",
      response: "ok",
    });
    const res = await handleSupportQuery("q", model);
    expect(res.category).toBe("billing");
  });
});

// ── parseSentiment branches ────────────────────────────────────────────

describe("customer-service — parseSentiment", () => {
  for (const s of ["positive", "neutral", "negative"] as const) {
    it(`accepts the "${s}" sentiment`, async () => {
      const { model } = recordingRouter({
        triage: `CATEGORY: other\nSENTIMENT: ${s}\nESCALATE: no`,
        response: "ok",
      });
      const res = await handleSupportQuery("q", model);
      expect(res.sentiment).toBe(s);
    });
  }

  it("defaults to 'neutral' when SENTIMENT is missing", async () => {
    const { model } = recordingRouter({
      triage: "CATEGORY: other\nESCALATE: no",
      response: "ok",
    });
    const res = await handleSupportQuery("q", model);
    expect(res.sentiment).toBe("neutral");
  });

  it("defaults to 'neutral' when SENTIMENT is a value outside the enum", async () => {
    const { model } = recordingRouter({
      triage: "CATEGORY: other\nSENTIMENT: elated\nESCALATE: no",
      response: "ok",
    });
    const res = await handleSupportQuery("q", model);
    expect(res.sentiment).toBe("neutral");
  });

  it("normalises uppercase sentiment values to lowercase enum", async () => {
    const { model } = recordingRouter({
      triage: "CATEGORY: other\nSENTIMENT: NEGATIVE\nESCALATE: yes",
      response: "ok",
    });
    const res = await handleSupportQuery("q", model);
    expect(res.sentiment).toBe("negative");
  });
});

// ── ESCALATE parsing ────────────────────────────────────────────────────

describe("customer-service — escalate parsing", () => {
  it("flips escalate=true on ESCALATE: yes", async () => {
    const { model } = recordingRouter({
      triage: "CATEGORY: billing\nSENTIMENT: negative\nESCALATE: yes",
      response: "ok",
    });
    const res = await handleSupportQuery("refund", model);
    expect(res.escalate).toBe(true);
  });

  it("keeps escalate=false on ESCALATE: no", async () => {
    const { model } = recordingRouter({
      triage: "CATEGORY: technical\nSENTIMENT: neutral\nESCALATE: no",
      response: "ok",
    });
    const res = await handleSupportQuery("bug", model);
    expect(res.escalate).toBe(false);
  });

  it("keeps escalate=false when ESCALATE is missing", async () => {
    const { model } = recordingRouter({
      triage: "CATEGORY: other\nSENTIMENT: neutral",
      response: "ok",
    });
    const res = await handleSupportQuery("q", model);
    expect(res.escalate).toBe(false);
  });

  it("is case-insensitive: escalate: YES still flips the flag", async () => {
    const { model } = recordingRouter({
      triage: "CATEGORY: billing\nSENTIMENT: negative\nescalate: YES",
      response: "ok",
    });
    const res = await handleSupportQuery("refund", model);
    expect(res.escalate).toBe(true);
  });

  it("tolerates extra whitespace between ESCALATE: and yes", async () => {
    const { model } = recordingRouter({
      triage: "CATEGORY: billing\nSENTIMENT: negative\nESCALATE:    yes",
      response: "ok",
    });
    const res = await handleSupportQuery("refund", model);
    expect(res.escalate).toBe(true);
  });

  it("does NOT confuse a category token 'yes' with the escalate flag", async () => {
    // Even though 'yes' appears in the payload, no ESCALATE: yes → false.
    const { model } = recordingRouter({
      triage: "CATEGORY: other\nSENTIMENT: neutral\nESCALATE: no yes-later",
      response: "ok",
    });
    const res = await handleSupportQuery("q", model);
    expect(res.escalate).toBe(false);
  });
});

// ── Reply extraction ────────────────────────────────────────────────────

describe("customer-service — reply extraction", () => {
  it("uses the LAST trace entry (response) as the reply, not the triage", async () => {
    const { model } = recordingRouter({
      triage: "CATEGORY: product_how_to\nSENTIMENT: neutral\nESCALATE: no",
      response: "Start from the homepage — the SVI is free.",
    });
    const res = await handleSupportQuery("q", model);
    expect(res.reply).toBe("Start from the homepage — the SVI is free.");
    // The reply must NOT be the triage classification block.
    expect(res.reply).not.toMatch(/CATEGORY:/);
  });

  it("trims surrounding whitespace on the reply", async () => {
    const { model } = recordingRouter({
      triage: "CATEGORY: other\nSENTIMENT: neutral\nESCALATE: no",
      response: "\n\n  Hi there.  \n\n",
    });
    const res = await handleSupportQuery("q", model);
    expect(res.reply).toBe("Hi there.");
  });

  it("falls back to the safe reply when the response agent returns whitespace", async () => {
    const { model } = recordingRouter({
      triage: "CATEGORY: other\nSENTIMENT: neutral\nESCALATE: no",
      response: "   ",
    });
    const res = await handleSupportQuery("q", model);
    expect(res.reply).toContain(FALLBACK_REPLY_MARKER);
    // The category / escalate values from the triage should still be honoured.
    expect(res.category).toBe("other");
    expect(res.escalate).toBe(false);
  });
});

// ── Fallback path ──────────────────────────────────────────────────────

describe("customer-service — fallback path", () => {
  it("returns the escalation fallback for a blank message", async () => {
    const { model, calls } = recordingRouter({
      triage: "CATEGORY: billing\nSENTIMENT: negative\nESCALATE: yes",
      response: "hi",
    });
    const res = await handleSupportQuery("   ", model);
    expect(res.category).toBe("other");
    expect(res.sentiment).toBe("neutral");
    expect(res.escalate).toBe(true);
    expect(res.reply).toContain(FALLBACK_REPLY_MARKER);
    // The model must never be called for a blank message (short-circuit).
    expect(calls.length).toBe(0);
  });

  it("returns the escalation fallback when the model throws", async () => {
    const res = await handleSupportQuery("hi", throwingModel("groq 500"));
    expect(res.category).toBe("other");
    expect(res.sentiment).toBe("neutral");
    expect(res.escalate).toBe(true);
    expect(res.reply.length).toBeGreaterThan(0);
    expect(res.reply).toContain(FALLBACK_REPLY_MARKER);
  });

  it("returns the fallback when the triage throws mid-run", async () => {
    let calls = 0;
    const model: ModelCaller = async () => {
      calls += 1;
      throw new Error("triage down");
    };
    const res = await handleSupportQuery("q", model);
    expect(res.escalate).toBe(true);
    expect(calls).toBe(1);
  });

  it("returns the fallback when the response agent throws after a good triage", async () => {
    let calls = 0;
    const model: ModelCaller = async () => {
      calls += 1;
      if (calls === 1) return "CATEGORY: billing\nSENTIMENT: negative\nESCALATE: yes";
      throw new Error("response down");
    };
    const res = await handleSupportQuery("q", model);
    // A response throw hits the outer catch, so the triage-derived category
    // is dropped in favour of the atomic fallback shape.
    expect(res.category).toBe("other");
    expect(res.escalate).toBe(true);
  });

  it("returns the fallback when the message is a lone tab character", async () => {
    const { model, calls } = recordingRouter({
      triage: "CATEGORY: other\nSENTIMENT: neutral\nESCALATE: no",
      response: "ok",
    });
    const res = await handleSupportQuery("\t", model);
    expect(res.escalate).toBe(true);
    expect(calls.length).toBe(0);
  });
});

// ── Result shape / exports ─────────────────────────────────────────────

describe("customer-service — result shape + exports", () => {
  it("exports the handleSupportQuery function", () => {
    expect(typeof handleSupportQuery).toBe("function");
  });

  it("returns every required SupportResult field", async () => {
    const { model } = recordingRouter({
      triage: "CATEGORY: product_how_to\nSENTIMENT: positive\nESCALATE: no",
      response: "Sure — SVI is free.",
    });
    const res: SupportResult = await handleSupportQuery("q", model);
    expect(res).toHaveProperty("category");
    expect(res).toHaveProperty("sentiment");
    expect(res).toHaveProperty("escalate");
    expect(res).toHaveProperty("reply");
    expect(typeof res.escalate).toBe("boolean");
    expect(typeof res.reply).toBe("string");
  });

  it("returns exactly the four documented keys (no leakage)", async () => {
    const { model } = recordingRouter({
      triage: "CATEGORY: other\nSENTIMENT: neutral\nESCALATE: no",
      response: "ok",
    });
    const res = await handleSupportQuery("q", model);
    expect(Object.keys(res).sort()).toEqual(
      ["category", "escalate", "reply", "sentiment"].sort(),
    );
  });
});
