// Colocated tests for the schema-validated dispatch path (Master Upgrade
// Plan gap G7). The real callStructured runs here — only the transport and
// the ai_runs insert are stubbed — so these tests cover schema validation,
// the single repair pass, the audit row, and the graceful-degradation
// fallback end to end.

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── ai_runs capture (same pattern as call-structured.test.ts) ──────────
type InsertedRow = Record<string, unknown>;
let inserted: InsertedRow[] = [];
let insertCounter = 0;

function fakeSupabase() {
  return {
    from(table: string) {
      if (table !== "ai_runs") throw new Error("unexpected table " + table);
      let payload: InsertedRow = {};
      const api = {
        insert(row: InsertedRow) {
          payload = row;
          return api;
        },
        select(_cols: string) {
          return api;
        },
        async single() {
          insertCounter += 1;
          const id = `run-${insertCounter}`;
          inserted.push({ id, ...payload });
          return { data: { id }, error: null };
        },
      };
      return api;
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => fakeSupabase(),
}));

// Imported AFTER the mock so the module graph picks it up.
import {
  WAVE_1,
  WAVE_2,
  WAVE_3,
  dispatchWave,
  buildEvidenceCatalogue,
  evidenceIdFor,
  areaForCriterion,
  AgentAnalysisPayload,
  NIL_PROMPT_VERSION_ID,
} from "./agent-dispatcher";
import type { CriterionData, ReportContext } from "./types";
import type { StructuredModelCaller } from "@/lib/ai/call-structured";
import { CRITERION_KEYS, type CriterionKey } from "@/lib/evaluation-criteria";
import { computeSVI, extractSignals } from "@/lib/svi-analysis";

const RAW_TEXT =
  "Acme Rail is an Australian SaaS platform for freight scheduling. " +
  "Two co-founders, both ex-Atlassian engineers. Paying pilot customers in Sydney.";

function makeContext(): ReportContext {
  const svi = computeSVI(extractSignals({ rawText: RAW_TEXT }));
  const criteriaData = {} as Record<CriterionKey, CriterionData>;
  for (const key of CRITERION_KEYS) {
    criteriaData[key] = { textInput: "", files: [], links: [], qualityLevel: "incomplete" };
  }
  criteriaData.code_git = {
    textInput: "Monorepo, 240 unit tests, CI runs on every push.",
    files: [],
    links: [{ url: "https://github.com/acme/rail", label: "GitHub" }],
    qualityLevel: "good",
  };
  criteriaData.market = {
    textInput: "Australian rail freight software spend.",
    files: [],
    links: [],
    qualityLevel: "partial",
  };
  return {
    accountId: "acc-1",
    userId: "user-1",
    startupName: "Acme Rail",
    rawText: RAW_TEXT,
    sviAnalysis: svi,
    evidenceItems: [],
    criteriaData,
    stage: svi.stage,
    locale: "en",
    gatherResults: {},
    criterionResults: new Map(),
  };
}

/** A schema-valid payload citing a real catalogue id. */
function validPayload(
  criterion: CriterionKey,
  context: ReportContext,
  overrides: { score?: number; citationId?: string } = {},
): string {
  const catalogue = buildEvidenceCatalogue(criterion, context);
  const evidenceId = overrides.citationId ?? catalogue[0].evidence_id;
  const area = areaForCriterion(criterion);
  const citation = { evidence_id: evidenceId, quote: "Acme Rail is an Australian SaaS platform" };
  const payload = {
    finding: {
      area_id: area,
      title: "Solid engineering foundations",
      detail: "The repository shows disciplined CI practice.",
      proposed_score: overrides.score ?? 72,
      confidence: 0.8,
      hallucination_risk: "low",
      citations: [citation],
      actions: [
        { window: "30d", title: "Publish a test coverage badge", effort: "low", owner: "CTO" },
      ],
    },
    section: {
      area_id: area,
      heading: "Code Quality & Technical Architecture",
      body_markdown: "### Engineering\nThe team runs CI on every push.",
      citations: [citation],
      confidence: 0.8,
      hallucination_risk: "low",
    },
    risks: [
      {
        area_id: area,
        title: "Bus factor of two",
        severity: "medium",
        likelihood: "medium",
        impact: "high",
        mitigation: "Document the deploy runbook.",
        confidence: 0.6,
        hallucination_risk: "low",
        citations: [citation],
      },
    ],
    highlights: ["240 unit tests in CI"],
    data_points: { tests: "240" },
  };
  return JSON.stringify(payload);
}

/** Scripted transport: pops one canned response per model call. */
function scriptedCaller(responses: string[]): {
  caller: StructuredModelCaller;
  calls: string[];
} {
  const calls: string[] = [];
  let i = 0;
  const caller: StructuredModelCaller = async ({ messages }) => {
    calls.push(messages[messages.length - 1].content);
    const text = responses[Math.min(i, responses.length - 1)];
    i += 1;
    return { ok: true, text, tokensIn: 100, tokensOut: 50 };
  };
  return { caller, calls };
}

const resolvePromptVersionId = async () => NIL_PROMPT_VERSION_ID;

beforeEach(() => {
  inserted = [];
  insertCounter = 0;
});

describe("wave structure (unchanged by G7)", () => {
  it("keeps 6 / 6 / 1 agents across the three waves", () => {
    expect(WAVE_1).toHaveLength(6);
    expect(WAVE_2).toHaveLength(6);
    expect(WAVE_3).toHaveLength(1);
  });

  it("stores every result in context.criterionResults for the next wave", async () => {
    const context = makeContext();
    const { caller } = scriptedCaller([validPayload("code_git", context)]);
    await dispatchWave(
      [
        { agentRole: "cto", criterion: "code_git" },
        { agentRole: "cmo", criterion: "market" },
      ],
      context,
      "standard",
      async () => "unused",
      { modelCaller: caller, resolvePromptVersionId },
    );
    expect(context.criterionResults.has("code_git")).toBe(true);
    expect(context.criterionResults.has("market")).toBe(true);
  });
});

describe("evidence catalogue", () => {
  it("mints deterministic, uuid-shaped evidence ids", () => {
    const a = evidenceIdFor("code_git|link|GitHub");
    const b = evidenceIdFor("code_git|link|GitHub");
    expect(a).toBe(b);
    expect(a).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(evidenceIdFor("code_git|link|Other")).not.toBe(a);
  });

  it("includes description, founder evidence and links for a criterion", () => {
    const catalogue = buildEvidenceCatalogue("code_git", makeContext());
    const labels = catalogue.map(e => e.label);
    expect(labels).toContain("Startup description");
    expect(labels).toContain("Founder evidence: code_git");
    expect(labels).toContain("Link: GitHub");
    expect(new Set(catalogue.map(e => e.evidence_id)).size).toBe(catalogue.length);
  });
});

describe("schema-validated dispatch", () => {
  it("parses a valid response and writes one ok ai_runs row", async () => {
    const context = makeContext();
    const { caller, calls } = scriptedCaller([validPayload("code_git", context)]);

    const [result] = await dispatchWave(
      [{ agentRole: "cto", criterion: "code_git" }],
      context,
      "standard",
      async () => "prose fallback should not be used",
      { modelCaller: caller, resolvePromptVersionId },
    );

    expect(calls).toHaveLength(1);
    expect(result.schemaValidated).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.grounded).toBe(true);
    expect(result.score).toBe(72);
    expect(result.highlights).toEqual(["240 unit tests in CI"]);
    expect(result.dataPoints).toEqual({ tests: "240" });
    expect(result.nextSteps[0]).toMatch(/\[30d\] Publish a test coverage badge/);
    expect(result.content).toContain("### Engineering");
    expect(result.content).toContain("<!-- SCORE: 72 -->");

    expect(inserted).toHaveLength(1);
    expect(inserted[0].status).toBe("ok");
    expect(inserted[0].purpose).toBe("customer_report");
    expect(inserted[0].model).toBe("free-chain");
    expect((inserted[0].evidence_ids as string[]).length).toBeGreaterThan(0);
    expect(result.runId).toBe(inserted[0].id);
  });

  it("repairs a malformed first response and still logs a single ok row", async () => {
    const context = makeContext();
    const { caller, calls } = scriptedCaller([
      "Here is my analysis!\n\n### Market\nGreat market. <!-- SCORE: 88 -->",
      validPayload("market", context, { score: 64 }),
    ]);

    const [result] = await dispatchWave(
      [{ agentRole: "cmo", criterion: "market" }],
      context,
      "standard",
      async () => "prose fallback should not be used",
      { modelCaller: caller, resolvePromptVersionId },
    );

    expect(calls).toHaveLength(2);
    expect(calls[1]).toContain("failed schema validation");
    expect(result.schemaValidated).toBe(true);
    expect(result.score).toBe(64);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].status).toBe("ok");
    expect(inserted[0].tokens_in).toBe(200); // both calls accounted for
  });

  it("degrades gracefully when both attempts fail schema — report survives", async () => {
    const context = makeContext();
    const { caller } = scriptedCaller(["not json at all", "still not json"]);
    let proseCalls = 0;
    const callAI = async () => {
      proseCalls += 1;
      return [
        "Code Quality",
        "### Risks",
        "- Single maintainer",
        "### Recommended Actions",
        "1. Add a second reviewer",
        "<!-- SCORE: 41 -->",
      ].join("\n");
    };

    const [result] = await dispatchWave(
      [{ agentRole: "cto", criterion: "code_git" }],
      context,
      "standard",
      callAI,
      { modelCaller: caller, resolvePromptVersionId },
    );

    expect(proseCalls).toBe(1);
    expect(result.schemaValidated).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.grounded).toBe(false);
    expect(result.score).toBe(41); // legacy regex extraction still works
    expect(result.risks[0]).toMatch(/Unvalidated analysis/);
    expect(result.degradeReason).toMatch(/schema_fail/);
    expect(result.confidence).toBeLessThan(0.5);

    // The failure is on the audit trail, not swallowed.
    expect(inserted).toHaveLength(1);
    expect(inserted[0].status).toBe("schema_fail");
  });

  it("one failing agent does not take down the rest of the wave", async () => {
    const context = makeContext();
    let n = 0;
    const caller: StructuredModelCaller = async ({ messages }) => {
      n += 1;
      const isMarket = messages[0].content.includes("Evidence for market");
      return {
        ok: true,
        text: isMarket ? "garbage" : validPayload("code_git", context),
        tokensIn: 10,
        tokensOut: 10,
      };
    };

    const results = await dispatchWave(
      [
        { agentRole: "cto", criterion: "code_git" },
        { agentRole: "cmo", criterion: "market" },
      ],
      context,
      "standard",
      async () => "Fallback prose <!-- SCORE: 30 -->",
      { modelCaller: caller, resolvePromptVersionId },
    );

    expect(n).toBeGreaterThanOrEqual(3); // 1 clean + 2 (initial + repair)
    const code = results.find(r => r.criterion === "code_git");
    const market = results.find(r => r.criterion === "market");
    expect(code?.schemaValidated).toBe(true);
    expect(market?.degraded).toBe(true);
    expect(market?.score).toBe(30);
    expect(inserted.map(r => r.status).sort()).toEqual(["ok", "schema_fail"]);
  });

  it("records a model_error and degrades when the provider fails outright", async () => {
    const context = makeContext();
    const caller: StructuredModelCaller = async () => ({
      ok: false,
      status: "rate_limited",
      reason: "HTTP 429",
    });

    const [result] = await dispatchWave(
      [{ agentRole: "cto", criterion: "code_git" }],
      context,
      "standard",
      async () => "Prose <!-- SCORE: 55 -->",
      { modelCaller: caller, resolvePromptVersionId },
    );

    expect(result.degraded).toBe(true);
    expect(result.score).toBe(55);
    expect(inserted[0].status).toBe("rate_limited");
  });

  it("flags a section whose citations do not resolve to the catalogue", async () => {
    const context = makeContext();
    const fake = "11111111-2222-4333-8444-555555555555";
    const { caller } = scriptedCaller([
      validPayload("code_git", context, { citationId: fake }),
    ]);

    const [result] = await dispatchWave(
      [{ agentRole: "cto", criterion: "code_git" }],
      context,
      "standard",
      async () => "unused",
      { modelCaller: caller, resolvePromptVersionId },
    );

    expect(result.schemaValidated).toBe(true);
    expect(result.grounded).toBe(false);
    expect(result.citations).toEqual([]);
    expect(result.risks[0]).toMatch(/Ungrounded analysis/);
  });

  it("structured:false keeps the legacy prose path untouched", async () => {
    const context = makeContext();
    const [result] = await dispatchWave(
      [{ agentRole: "cto", criterion: "code_git" }],
      context,
      "standard",
      async () => "Legacy title\n\n- **Bold highlight**: yes\n\n<!-- SCORE: 61 -->",
      { structured: false },
    );

    expect(result.score).toBe(61);
    expect(result.schemaValidated).toBe(false);
    expect(result.degraded).toBe(false);
    expect(inserted).toHaveLength(0);
  });
});

describe("AgentAnalysisPayload boundary schema", () => {
  it("rejects a payload with no citations (the §6.2 rule)", () => {
    const context = makeContext();
    const parsed = JSON.parse(validPayload("code_git", context)) as Record<string, unknown>;
    const finding = parsed.finding as Record<string, unknown>;
    finding.citations = [];
    expect(AgentAnalysisPayload.safeParse(parsed).success).toBe(false);
  });

  it("defaults the optional presentation fields", () => {
    const context = makeContext();
    const parsed = JSON.parse(validPayload("code_git", context)) as Record<string, unknown>;
    delete parsed.highlights;
    delete parsed.data_points;
    delete parsed.risks;
    const res = AgentAnalysisPayload.safeParse(parsed);
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.highlights).toEqual([]);
      expect(res.data.risks).toEqual([]);
      expect(res.data.data_points).toEqual({});
    }
  });
});
