// buildAgentPrompt v2 (G13-W2-R2, spec §C.2 / §C.10): slot composition,
// per-block token caps, the DIMENSION_OWNERS role card, the phase lens,
// knowledge injection and the prompt_versions template path. The snapshot
// block pins every role × three phases (idea / seed / series A) under the
// caps so a prompt-length regression fails here before it costs tokens.

import { describe, expect, it } from "vitest";
import { AGENT_ROLES, type ReportContext } from "./types";
import {
  DEFAULT_PROMPT_TEMPLATE,
  PROMPT_SLOTS,
  buildAgentPrompt,
  buildPromptBlocks,
  promptTemplateFromRow,
  renderPromptTemplate,
  resolvePhaseId,
  templateHasSlots,
} from "./agent-prompts";
import { DIM_ORDER, DIMENSION_OWNERS, benchmarkFor, benchmarkStageForSvi } from "./dimension-owners";
import { PROMPT_BLOCK_CAPS, PROMPT_TOTAL_CAP, capTokens, estimateTokens } from "./prompt-tokens";
import type { GrowthPhaseId } from "@/lib/growth/phase-taxonomy";

function makeContext(stage: number, phase?: GrowthPhaseId): ReportContext {
  return {
    accountId: "acc",
    userId: "u",
    projectId: "p",
    startupName: "Acme Robotics",
    rawText: "",
    sviAnalysis: { totalSVI: 120, stageLabel: "Seed", stage, subs: [{ key: "tre", label: "Traction", value: 44 }], dimensionScores: { tre: 44, mpc: 58 } } as unknown as ReportContext["sviAnalysis"],
    evidenceItems: [],
    criteriaData: {} as ReportContext["criteriaData"],
    stage,
    locale: "en",
    gatherResults: {},
    criterionResults: new Map(),
    phaseGate: phase ? ({ currentPhase: phase, currentPhaseLabel: phase, nextPhase: null, phaseOrder: 1, completionPct: 0, canAdvance: false, blockers: [] } as ReportContext["phaseGate"]) : undefined,
  };
}

// idea / seed / series A on the SVI-analysis scale (0 Concept … 7).
const PHASES: Array<{ label: string; stage: number; phase: GrowthPhaseId }> = [
  { label: "idea", stage: 0, phase: "vision" },
  { label: "seed", stage: 2, phase: "customer_dev" },
  { label: "series A", stage: 5, phase: "funding" },
];

describe("prompt-tokens", () => {
  it("estimateTokens is pessimistic (≥ words × 1.3) and capTokens trims with a marker", () => {
    const text = Array.from({ length: 400 }, (_, i) => `word${i}`).join(" ");
    expect(estimateTokens(text)).toBeGreaterThanOrEqual(520);
    const capped = capTokens(text, 100);
    expect(estimateTokens(capped)).toBeLessThanOrEqual(100);
    expect(capped.endsWith("[trimmed]")).toBe(true);
    expect(capTokens("short", 100)).toBe("short");
    expect(capTokens("anything", 0)).toBe("");
  });
});

describe("buildPromptBlocks — every role × 3 phases stays under the per-block caps", () => {
  AGENT_ROLES.forEach((role) => {
    PHASES.forEach(({ label, stage, phase }) => {
      it(`${role} @ ${label}: criterion prompt blocks ≤ caps and total ≤ PROMPT_TOTAL_CAP`, () => {
        const built = buildPromptBlocks(role, makeContext(stage, phase), { criterion: "idea", phaseId: phase, tier: "standard" });
        expect(built.phaseId).toBe(phase);
        expect(built.tokens.ROLE_CARD).toBeLessThanOrEqual(PROMPT_BLOCK_CAPS.ROLE_CARD);
        expect(built.tokens.PHASE_LENS).toBeLessThanOrEqual(PROMPT_BLOCK_CAPS.PHASE_LENS);
        expect(built.tokens.SKILL_ADDON).toBeLessThanOrEqual(PROMPT_BLOCK_CAPS.SKILL_ADDON + 12); // heading line
        expect(built.tokens.OUTPUT_SCHEMA).toBeLessThanOrEqual(PROMPT_BLOCK_CAPS.OUTPUT_SCHEMA);
        expect(built.totalTokens).toBeLessThanOrEqual(PROMPT_TOTAL_CAP);
        expect(built.blocks.PHASE_LENS).toContain(`(${phase})`);
      });
    });
  });

  DIM_ORDER.forEach((dim) => {
    PHASES.forEach(({ label, stage, phase }) => {
      it(`${DIMENSION_OWNERS[dim].primary} owning ${dim} @ ${label}: chapter prompt ≤ caps, carries frameworks + rubric + benchmark`, () => {
        const owner = DIMENSION_OWNERS[dim];
        const built = buildPromptBlocks(owner.primary, makeContext(stage, phase), { dim, phaseId: phase, tier: "standard", knowledgeFiles: [], moduleOutputs: [{ id: "m1", output: { a: 1, b: "x" } }] });
        expect(built.tokens.ROLE_CARD).toBeLessThanOrEqual(PROMPT_BLOCK_CAPS.ROLE_CARD);
        expect(built.tokens.PHASE_LENS).toBeLessThanOrEqual(PROMPT_BLOCK_CAPS.PHASE_LENS);
        expect(built.tokens.MODULES).toBeLessThanOrEqual(PROMPT_BLOCK_CAPS.MODULES);
        expect(built.totalTokens).toBeLessThanOrEqual(PROMPT_TOTAL_CAP);
        const card = built.blocks.ROLE_CARD;
        expect(card).toContain(owner.title);
        expect(card).toContain("## Frameworks to apply");
        expect(card).toContain(owner.rubric.p50.slice(0, 20));
        const b = benchmarkFor(dim, benchmarkStageForSvi(stage));
        expect(card).toContain(`p25 ${b.p25} · p50 ${b.p50} · p75 ${b.p75}`);
        const behaviour = owner.phaseBehaviour[phase];
        if (behaviour) expect(built.blocks.PHASE_LENS).toContain(behaviour.slice(0, 15));
      });
    });
  });
});

describe("buildAgentPrompt — slots + template", () => {
  it("DEFAULT_PROMPT_TEMPLATE lists the eight slots in §C.2 order", () => {
    expect(PROMPT_SLOTS).toEqual(["AU_CONTEXT", "ROLE_CARD", "PHASE_LENS", "SKILL_ADDON", "KNOWLEDGE", "MODULES", "EVIDENCE", "OUTPUT_SCHEMA"]);
    PROMPT_SLOTS.forEach((s) => expect(DEFAULT_PROMPT_TEMPLATE).toContain(`{{${s}}}`));
  });

  it("renders a prompt_versions template (variables.template) and falls back to the code default otherwise", () => {
    const ctx = makeContext(2, "customer_dev");
    const row = { id: "x", variables: { template: "HEADER\n{{ROLE_CARD}}\n---\n{{OUTPUT_SCHEMA}}" } };
    const template = promptTemplateFromRow(row);
    expect(templateHasSlots(template)).toBe(true);
    const out = buildAgentPrompt("cfo", ctx, { criterion: "revenue", template });
    expect(out.startsWith("HEADER")).toBe(true);
    expect(out).not.toContain("BlockID.au"); // AU_CONTEXT slot absent from this template
    expect(out).toContain("## Your Role: Chief Financial Officer");
    expect(promptTemplateFromRow({ id: "y", variables: {} })).toBeNull();
    expect(promptTemplateFromRow({ id: "z", variables: { template: "no slots here" } })).toBeNull();
    const dflt = buildAgentPrompt("cfo", ctx, { criterion: "revenue", template: null });
    expect(dflt.startsWith("You are a senior startup analyst at BlockID.au")).toBe(true);
  });

  it("renderPromptTemplate collapses empty slots (no dangling blank runs)", () => {
    const blocks = Object.fromEntries(PROMPT_SLOTS.map((s) => [s, ""])) as Record<(typeof PROMPT_SLOTS)[number], string>;
    blocks.ROLE_CARD = "R";
    blocks.OUTPUT_SCHEMA = "O";
    expect(renderPromptTemplate(DEFAULT_PROMPT_TEMPLATE, blocks)).toBe("R\n\nO");
  });

  it("legacy call shape (role, ctx, criterionString) still works and equals the options form", () => {
    const ctx = makeContext(3);
    expect(buildAgentPrompt("cto", ctx, "code_git")).toBe(buildAgentPrompt("cto", ctx, { criterion: "code_git" }));
  });

  it("injects knowledge rows + knowledge files under ## Knowledge base, capped", () => {
    const ctx = makeContext(2, "customer_dev");
    const longRow = { agent: "cfo", topic: "AU SaaS multiples", text: capTokens(Array.from({ length: 300 }, () => "tok").join(" "), PROMPT_BLOCK_CAPS.KNOWLEDGE_ROW), created_at: "2026-09-01T00:00:00Z" };
    const out = buildPromptBlocks("cfo", ctx, { dim: "cgh", knowledgeRows: [longRow], knowledgeFiles: [{ key: "esop-expertise", path: "esop/esop-expertise.md", text: "ESOP pool 10–15 % is the AU norm.", tokens: 12 }] });
    expect(out.blocks.KNOWLEDGE).toContain("## Knowledge base");
    expect(out.blocks.KNOWLEDGE).toContain("### Knowledge: esop-expertise (esop/esop-expertise.md)");
    expect(out.blocks.KNOWLEDGE).toContain("**AU SaaS multiples** (2026-09-01)");
    expect(estimateTokens(longRow.text)).toBeLessThanOrEqual(PROMPT_BLOCK_CAPS.KNOWLEDGE_ROW);
  });

  it("CDO role card carries the Stage Benchmarks table from dimension-owners (the deleted medians copy)", () => {
    const out = buildAgentPrompt("cdo", makeContext(2));
    expect(out).toContain("## Stage Benchmarks");
    expect(out).toContain("| TRE | 37 | 52 | 67 |");
    expect(out).not.toContain("Use these stage medians");
    expect(out).not.toContain("Concept: FTV:30");
  });

  it("output schema override replaces the legacy markdown contract (W4 JSON)", () => {
    const out = buildAgentPrompt("cro", makeContext(2), { dim: "tre", outputSchema: "## JSON ONLY\n{}", knowledgeFiles: [] });
    expect(out).toContain("## JSON ONLY");
    expect(out).not.toContain("<!-- SCORE: XX -->");
  });

  it("resolvePhaseId: explicit → phase gate → SVI stage mapping", () => {
    expect(resolvePhaseId(makeContext(0), "growth")).toBe("growth");
    expect(resolvePhaseId(makeContext(0, "pitch"))).toBe("pitch");
    expect(resolvePhaseId(makeContext(0))).toBe("customer_dev");
    expect(resolvePhaseId(makeContext(7))).toBe("funding");
  });
});
