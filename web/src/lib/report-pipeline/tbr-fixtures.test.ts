// TBR-<dim>-v2.0.0 prompt-eval fixtures (G13-W2-R2, spec §C.10): eight
// files × three cases (idea / seed / series A) discovered by the
// prompt-eval-nightly runner as `${agent}-v${version}.json`. Pins: every
// file parses with PromptEvalFixture, `expected.proposed_score` bands equal
// the ANCHORS p25–p75 at stages 0 / 2 / 4, the expected visual kind is the
// owner primary visual, `must_cite ≥ 1` whenever evidence rows exist, the
// case input is a valid W4 user turn, and a good chapter payload scores
// ≥ 0.8 accuracy while a hallucinating one hard-fails.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PromptEvalFixture, runEval, shouldPromote, type FixtureCase } from "@/lib/ai/eval-runner";
import type { PromptVersion } from "@/lib/ai/prompt-registry";
import { DimensionChapterInput, DimensionChapterPayload, VERDICT_WORD_CAPS } from "./agent-dispatcher";
import { autoCite, itemsFromEvidenceRows } from "./auto-cite";
import { COMPUTED_FACT_IDS, computedFactRows } from "./computed-facts";
import { findUncitedClaims } from "./llm-auditor";
import { trimVerdict } from "./verdict-trim";
import { salvageTruncatedJson } from "@/lib/ai/json-salvage";
import { groundedShareOf } from "@/lib/ai/eval-runner";
import { draftFromPayload, ExecutiveSummaryInput, ExecutiveSummaryPayload, type ExecutiveSummaryPayload as ExecutivePayload } from "./executive-summary";
import { finaliseExecutiveStructured } from "@/lib/report-v2/executive-structure";
import { EXECUTIVE_VERDICT_LABELS, hasMarkdownSyntax } from "@/lib/report-v2/schema";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { DIM_ORDER, DIMENSION_OWNERS, benchmarkFor, type DimKey } from "./dimension-owners";

const FIXTURE_DIR = path.join(process.cwd(), "test-fixtures", "prompt-eval");

function loadFixture(dim: DimKey) {
  const raw = readFileSync(path.join(FIXTURE_DIR, `TBR-${dim}-v2.0.0.json`), "utf8");
  return PromptEvalFixture.parse(JSON.parse(raw));
}

const pv = (dim: DimKey): PromptVersion => ({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  agent: `TBR-${dim}`,
  version: "2.0.0",
  purpose: "test",
  model: "free-chain",
  variables: {},
  output_schema: {},
  guardrails: [],
  test_set_id: null,
  evaluation_result: null,
  status: "canary",
  released_at: null,
  rollback_from: null,
  created_at: "2026-09-16T00:00:00Z",
});

/** A schema-valid owner payload that satisfies the case (cites when evidence exists, names the gaps). */
function goodPayload(c: FixtureCase): Record<string, unknown> {
  const input = c.input as { dim: DimKey; deterministicScore: number; evidenceRows: Array<{ id: string }> };
  const ev = input.evidenceRows[0]?.id;
  const cite = ev ? `[ev:${ev}]` : "[unevidenced]";
  const gaps = c.expected.must_have_gaps.map((g) => `Missing ${g} evidence ${cite}`);
  const payload = {
    dim: input.dim,
    verdict: `${DIMENSION_OWNERS[input.dim].title} is developing ${cite}.`,
    score_adjustment: { proposed: input.deterministicScore, deterministic: input.deterministicScore, reason: "aligned" },
    strengths: [`Evidence present ${cite}`],
    gaps: gaps.length ? gaps : [`Thin evidence ${cite}`],
    next_action: { title: "Add evidence", window: "30d", expected_lift: 3 },
    criterion_cards: [],
    primary_visual: { kind: DIMENSION_OWNERS[input.dim].primaryVisual, data_state: "partial", series: [] },
    frameworks_used: [],
    confidence: 0.7,
    hallucination_risk: "low",
  };
  return { ...payload, proposed_score: input.deterministicScore };
}

/** G19 fixtures beside the eight per-dimension files: S41 score ledger, S46 valuation inputs, S47 structured executive — plus the G23-A grounding fixture. */
const G19_FIXTURES = ["TBR-executive-v2.2.0.json", "TBR-ledger-v2.1.0.json", "TBR-valuation-inputs-v2.1.0.json", "TBR-grounding-v2.4.0.json", "TBR-grounding-v2.5.0.json"];

describe("TBR-<dim>-v2.0.0 fixtures", () => {
  it("ships exactly eight TBR-<dim>-v2.0.0 fixtures, one per dimension, discoverable by the nightly runner naming rule (plus the G19 TBR-ledger + TBR-valuation-inputs fixtures)", () => {
    const files = readdirSync(FIXTURE_DIR).filter((f) => f.startsWith("TBR-")).sort();
    expect(files).toHaveLength(DIM_ORDER.length + G19_FIXTURES.length);
    expect(files.filter((f) => !G19_FIXTURES.includes(f))).toEqual([...DIM_ORDER].sort().map((d) => `TBR-${d}-v2.0.0.json`));
    for (const f of G19_FIXTURES) expect(files).toContain(f);
  });

  DIM_ORDER.forEach((dim) => {
    describe(`TBR-${dim}`, () => {
      const fx = loadFixture(dim);
      const owner = DIMENSION_OWNERS[dim];

      it("parses with PromptEvalFixture and carries idea / seed / series A cases", () => {
        expect(fx.agent).toBe(`TBR-${dim}`);
        expect(fx.version).toBe("2.0.0");
        expect(fx.cases.map((c) => c.id)).toEqual([`case_idea_${dim}`, `case_seed_${dim}`, `case_series_a_${dim}`]);
      });

      it("proposed_score bands equal ANCHORS p25–p75 at stages 0 / 2 / 4", () => {
        [0, 2, 4].forEach((stage, i) => {
          const b = benchmarkFor(dim, stage);
          expect(fx.cases[i].expected.proposed_score).toEqual({ min: b.p25, max: b.p75 });
          expect((fx.cases[i].input as { benchmark: { p50: number } }).benchmark.p50).toBe(b.p50);
        });
      });

      it("expects the owner primary visual, ≥ 1 citation when evidence rows exist, and gaps + forbidden terms per case", () => {
        fx.cases.forEach((c) => {
          expect(c.expected.primary_visual).toEqual({ kind: owner.primaryVisual });
          expect(owner.allowedVisuals).toContain(c.expected.primary_visual!.kind);
          const rows = (c.input as { evidenceRows: unknown[] }).evidenceRows;
          expect(c.expected.must_cite).toBe(rows.length ? 1 : 0);
          expect(c.expected.must_have_gaps.length).toBeGreaterThanOrEqual(1);
          expect(c.expected.must_not_hallucinate.length).toBeGreaterThanOrEqual(1);
          expect(c.expected.confidence?.min).toBe(0.5);
        });
      });

      it("every case input is a valid W4 user turn (DimensionChapterInput) for this dim", () => {
        fx.cases.forEach((c) => {
          const parsed = DimensionChapterInput.safeParse(c.input);
          expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues.slice(0, 2))).toBe(true);
          if (parsed.success) expect(parsed.data.dim).toBe(dim);
        });
      });

      it("a good owner payload scores ≥ 0.8 accuracy (promotable); a hallucinating one hard-fails", async () => {
        const good = await runEval(fx, pv(dim), {
          runCase: async (c) => {
            const data = goodPayload(c);
            expect(DimensionChapterPayload.safeParse(data).success).toBe(true);
            return { ok: true, data, latencyMs: 10, costUsd: 0.001, runId: c.id };
          },
        });
        expect(good.accuracy_pct).toBeGreaterThanOrEqual(0.8);
        expect(good.hard_fail).toBe(false);
        expect(shouldPromote(good)).toBe(true);

        const bad = await runEval(fx, pv(dim), {
          runCase: async (c) => {
            const data = goodPayload(c);
            const forbidden = c.expected.must_not_hallucinate[0];
            return { ok: true, data: { ...data, verdict: `${data.verdict} ${forbidden}` }, latencyMs: 10, costUsd: 0.001, runId: c.id };
          },
        });
        expect(bad.hard_fail).toBe(true);
        expect(shouldPromote(bad)).toBe(false);
      });
    });
  });
});

// ── G19-S41: the score-ledger fixture — the owner must explain the score with the ledger it was given ──

describe("TBR-ledger-v2.1.0 fixture (G19-S41)", () => {
  const raw = readFileSync(path.join(FIXTURE_DIR, "TBR-ledger-v2.1.0.json"), "utf8");
  const fx = PromptEvalFixture.parse(JSON.parse(raw));
  const ledgerPv: PromptVersion = { ...pv("tre"), agent: "TBR-ledger", version: "2.1.0" };

  it("every case input is a valid W4 user turn carrying scoreLedger, and expects the verdict to mention ≥ 1 ledger signal (or the unassessed wording)", () => {
    // G19-S46: a second assessed dimension (CGH, CFO owner) beside the TRE seed and the unassessed FTV idea.
    expect(fx.cases.map((c) => c.id)).toEqual(["case_ledger_seed_tre", "case_ledger_idea_ftv_unassessed", "case_ledger_seed_cgh"]);
    expect(new Set(fx.cases.map((c) => (c.input as { dim: string }).dim)).size).toBe(3);
    for (const c of fx.cases) {
      const parsed = DimensionChapterInput.safeParse(c.input);
      expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues.slice(0, 2))).toBe(true);
      if (!parsed.success) continue;
      const ledger = parsed.data.scoreLedger!;
      expect(ledger).toBeDefined();
      expect(c.expected.verdict_must_mention_any?.length).toBeGreaterThanOrEqual(1);
      if (ledger.assessed) {
        // The signals the verdict may cite are exactly the ledger's; every forbidden term is a signal NOT in the ledger.
        const names = ledger.signals.map((s) => s.signal);
        expect(c.expected.verdict_must_mention_any).toEqual(names);
        for (const forbidden of c.expected.must_not_hallucinate) expect(names.some((n) => n.toLowerCase().includes(forbidden.toLowerCase()))).toBe(false);
        expect(Math.max(0, Math.min(100, ledger.signals.reduce((a, s) => a + s.points, ledger.base)))).toBe(parsed.data.deterministicScore);
      } else {
        expect(ledger.signals).toEqual([]);
        expect(c.expected.verdict_must_mention_any).toContain("not assessed");
      }
      const b = benchmarkFor(parsed.data.dim as DimKey, parsed.data.stage);
      expect(c.expected.proposed_score).toEqual({ min: b.p25, max: b.p75 });
      expect(c.expected.primary_visual).toEqual({ kind: DIMENSION_OWNERS[parsed.data.dim as DimKey].primaryVisual });
    }
  });

  it("a verdict that cites a ledger signal is promotable; one that explains the score with an invented signal hard-fails; one that names no signal scores lower", async () => {
    const cite = (c: FixtureCase) => {
      const input = c.input as { scoreLedger: { assessed: boolean; signals: Array<{ signal: string; points: number }> } };
      const first = input.scoreLedger.signals[0];
      return input.scoreLedger.assessed ? `${first.signal} (+${first.points}) carries the score.` : "Not assessed yet — no evidence reached this dimension; 50 is the stage baseline.";
    };
    const good = await runEval(fx, ledgerPv, {
      runCase: async (c) => {
        const base = goodPayload(c);
        const data = { ...base, verdict: `${cite(c)} ${base.verdict as string}` };
        expect(DimensionChapterPayload.safeParse(data).success).toBe(true);
        return { ok: true, data, latencyMs: 10, costUsd: 0.001, runId: c.id };
      },
    });
    expect(good.accuracy_pct).toBeGreaterThanOrEqual(0.8);
    expect(good.hard_fail).toBe(false);
    expect(shouldPromote(good)).toBe(true);

    const invented = await runEval(fx, ledgerPv, {
      runCase: async (c) => {
        const data = goodPayload(c);
        return { ok: true, data: { ...data, verdict: `${cite(c)} ${c.expected.must_not_hallucinate[0]} lifts the score.` }, latencyMs: 10, costUsd: 0.001, runId: c.id };
      },
    });
    expect(invented.hard_fail).toBe(true);
    expect(shouldPromote(invented)).toBe(false);

    const silent = await runEval(fx, ledgerPv, {
      runCase: async (c) => ({ ok: true, data: goodPayload(c), latencyMs: 10, costUsd: 0.001, runId: c.id }),
    });
    expect(silent.accuracy_pct).toBeLessThan(good.accuracy_pct);
  });
});

// ── G19-S46: the valuation-inputs fixture — revenue is explained from the inputs table, never invented ──

describe("TBR-valuation-inputs-v2.1.0 fixture (G19-S42/S46)", () => {
  const raw = readFileSync(path.join(FIXTURE_DIR, "TBR-valuation-inputs-v2.1.0.json"), "utf8");
  const fx = PromptEvalFixture.parse(JSON.parse(raw));
  const valuationPv: PromptVersion = { ...pv("tre"), agent: "TBR-valuation-inputs", version: "2.1.0" };
  type ValInputs = { mrrAud: number; arrAud: number; revenueSource: string };
  const inputsOf = (c: FixtureCase): ValInputs => {
    const mods = (c.input as { moduleOutputs: Array<{ id: string; output: ValInputs }> }).moduleOutputs;
    return mods.find((m) => m.id === "report-pipeline/valuation-chapter.ts:inputs")!.output;
  };

  it("carries a pre-revenue case (ARR 0, source none → verdict must say pre-revenue / Berkus, any 'ARR A$' hard-fails) and a Stripe case (verdict must name the connector source; must cite)", () => {
    expect(fx.cases.map((c) => c.id)).toEqual(["case_valuation_prerevenue_tre", "case_valuation_stripe_tre"]);
    for (const c of fx.cases) {
      const parsed = DimensionChapterInput.safeParse(c.input);
      expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues.slice(0, 2))).toBe(true);
      if (!parsed.success) continue;
      expect(parsed.data.dim).toBe("tre");
      const b = benchmarkFor("tre", parsed.data.stage);
      expect(c.expected.proposed_score).toEqual({ min: b.p25, max: b.p75 });
      expect(c.expected.primary_visual).toEqual({ kind: DIMENSION_OWNERS.tre.primaryVisual });
    }
    const [pre, stripe] = fx.cases;
    expect(inputsOf(pre)).toMatchObject({ mrrAud: 0, arrAud: 0, revenueSource: "none" });
    expect(pre.expected.verdict_must_mention_any).toEqual(expect.arrayContaining(["pre-revenue", "Berkus"]));
    expect(pre.expected.must_not_hallucinate).toEqual(expect.arrayContaining(["ARR A$", "MRR A$"]));
    expect(pre.expected.must_cite).toBe(0);
    expect((pre.input as { evidenceRows: unknown[] }).evidenceRows).toEqual([]);

    expect(inputsOf(stripe)).toMatchObject({ arrAud: 100_800, revenueSource: "connector" });
    expect((stripe.input as { evidenceRows: Array<{ source: string }> }).evidenceRows[0].source).toBe("stripe");
    expect(stripe.expected.verdict_must_mention_any).toEqual(expect.arrayContaining(["Stripe", "connector"]));
    expect(stripe.expected.must_cite).toBe(1);
    expect(stripe.expected.grounded_share_min).toBe(0.8);
    // The forbidden figures are NOT the ones in the inputs table (so a truthful verdict can never trip them).
    for (const forbidden of stripe.expected.must_not_hallucinate) expect(JSON.stringify(stripe.input)).not.toContain(forbidden);
  });

  it("a verdict that explains revenue from the inputs is promotable; one that invents an ARR hard-fails on both cases", async () => {
    const truthful = (c: FixtureCase) => {
      const i = inputsOf(c);
      return i.arrAud === 0
        ? "Pre-revenue: no MRR in any source, so Berkus and scorecard carry the band; no multiple applies."
        : `Stripe connector shows A$8,400 MRR (A$100,800 ARR) across 14 subscriptions [ev:ev-stripe-mrr-01].`;
    };
    const good = await runEval(fx, valuationPv, {
      runCase: async (c) => {
        const base = goodPayload(c);
        const data = { ...base, verdict: `${truthful(c)} ${base.verdict as string}` };
        expect(DimensionChapterPayload.safeParse(data).success).toBe(true);
        return { ok: true, data, latencyMs: 10, costUsd: 0.001, runId: c.id };
      },
    });
    expect(good.accuracy_pct).toBeGreaterThanOrEqual(0.8);
    expect(good.hard_fail).toBe(false);
    expect(shouldPromote(good)).toBe(true);

    const invented = await runEval(fx, valuationPv, {
      runCase: async (c) => {
        const base = goodPayload(c);
        const lie = inputsOf(c).arrAud === 0 ? "ARR A$120,000 supports a 4× multiple." : "ARR A$2.4M — A$1.2M was booked last quarter alone.";
        return { ok: true, data: { ...base, verdict: `${truthful(c)} ${lie}` }, latencyMs: 10, costUsd: 0.001, runId: c.id };
      },
    });
    expect(invented.hard_fail).toBe(true);
    expect(invented.per_case.every((c) => c.hardFail)).toBe(true);
    expect(shouldPromote(invented)).toBe(false);

    // Naming no source at all scores lower than the truthful verdict.
    const silent = await runEval(fx, valuationPv, {
      runCase: async (c) => ({ ok: true, data: goodPayload(c), latencyMs: 10, costUsd: 0.001, runId: c.id }),
    });
    expect(silent.accuracy_pct).toBeLessThan(good.accuracy_pct);
  });
});

// ── G19-S47: the structured executive fixture — JSON contract, no markdown, valid verdict, the lowest dim named ──

describe("TBR-executive-v2.2.0 fixture (G19-S47)", () => {
  const raw = readFileSync(path.join(FIXTURE_DIR, "TBR-executive-v2.2.0.json"), "utf8");
  const fx = PromptEvalFixture.parse(JSON.parse(raw));
  const execPv: PromptVersion = { ...pv("tre"), agent: "TBR-executive", version: "2.2.0" };
  type Input = { lowestDim: string; chapters: Array<{ dim: string; title: string; score: number; band: string; evidenceIds: string[]; nextAction: string; expectedLift: number }>; phase: { id: string; label: string; blockers: string[] } | null; svi: number };

  /** A contract-shaped CEO answer that satisfies the case: names the lowest dim in a gap, cites where ids exist, valid label. */
  function goodExecutivePayload(c: FixtureCase): ExecutivePayload {
    const input = c.input as unknown as Input;
    const lowest = input.chapters.find((ch) => ch.dim === input.lowestDim)!;
    const cite = (ch: { evidenceIds: string[] }) => (ch.evidenceIds[0] ? ` [ev:${ch.evidenceIds[0]}]` : " [unevidenced]");
    const strongest = [...input.chapters].sort((a, b) => b.score - a.score);
    const weakest = [...input.chapters].sort((a, b) => a.score - b.score);
    return {
      headline: `${(c.input as { startupName: string }).startupName}: SVI ${input.svi} with ${lowest.title} the gap to close`,
      summary: [`The startup scores SVI ${input.svi}.${cite(strongest[0])}`, `${lowest.title} is the lowest dimension at ${lowest.score}.${cite(lowest)}`],
      key_insight: `${lowest.title} decides the next gate.`,
      reasons_to_back: strongest.slice(0, 3).map((ch) => ({ title: `${ch.title} is strong`, body: `Scores ${ch.score}.${cite(ch)}`, dim: ch.dim })),
      critical_gaps: weakest.slice(0, 3).map((ch) => ({ title: `${ch.title} below the gate`, body: `${ch.nextAction}.${cite(ch)}`, dim: ch.dim, lift: ch.expectedLift })),
      benchmarks: input.chapters.map((ch) => ({ dim: ch.dim, score: ch.score, band: ch.band })),
      phase_now: input.phase ? { phase_id: input.phase.id, label: input.phase.label, blocker: input.phase.blockers[0] ?? "", what_it_takes: `${lowest.nextAction}.` } : null,
      verdict: { label: input.svi >= 70 ? "back_with_conditions" : "watch", condition: input.svi >= 70 ? `${lowest.nextAction}.` : undefined, confidence: 0.6 },
      actions: weakest.slice(0, 3).map((ch, i) => ({ title: ch.nextAction, detail: `${ch.nextAction} within the window.`, window: i === 0 ? "this_week" : "30d", dim: ch.dim })),
    };
  }

  /** The eval-runner reads flat `gaps` / `verdict` / `confidence` keys — project the contract onto them. */
  function evalShape(p: ExecutivePayload): Record<string, unknown> {
    return { ...p, gaps: p.critical_gaps.map((g) => `${g.title} ${g.body ?? ""}`), verdict: `${p.verdict.label} ${p.verdict.condition ?? ""}`, confidence: p.verdict.confidence };
  }

  it("carries a seed (Stripe-evidenced, TRE lowest, must cite) and an idea (nothing evidenced, FTV lowest, no citation) case; every input is a valid CEO user turn", () => {
    expect(fx.cases.map((c) => c.id)).toEqual(["case_executive_seed_saas", "case_executive_idea_prerevenue"]);
    for (const c of fx.cases) {
      const parsed = ExecutiveSummaryInput.safeParse(c.input);
      expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues.slice(0, 2))).toBe(true);
      if (!parsed.success) continue;
      expect(parsed.data.chapters).toHaveLength(8);
      const lowest = parsed.data.chapters.find((ch) => ch.dim === parsed.data.lowestDim)!;
      // must_have_gaps names the lowest dimension's title word.
      expect(c.expected.must_have_gaps.some((g) => lowest.title.includes(g))).toBe(true);
      expect(c.expected.must_cite).toBe(parsed.data.chapters.some((ch) => ch.evidenceIds.length > 0) ? 1 : 0);
      for (const label of c.expected.verdict_must_mention_any ?? []) expect(EXECUTIVE_VERDICT_LABELS).toContain(label);
      // Markdown tokens are forbidden terms on every case.
      expect(c.expected.must_not_hallucinate).toEqual(expect.arrayContaining(["**", "<!--"]));
    }
  });

  it("a contract-shaped answer parses, finalises without markdown, keeps a valid verdict label and a gap naming the lowest dim — and is promotable; a markdown / invented-figure answer hard-fails", async () => {
    const demo = demoReportV2();
    for (const c of fx.cases) {
      const payload = goodExecutivePayload(c);
      expect(ExecutiveSummaryPayload.safeParse(payload).success).toBe(true);
      const input = c.input as unknown as Input;
      const s = finaliseExecutiveStructured(draftFromPayload(payload), { chapters: demo.dimensions, phase: demo.executive.phaseNow, locale: "en" });
      expect(hasMarkdownSyntax(JSON.stringify(s))).toBe(false);
      expect(EXECUTIVE_VERDICT_LABELS).toContain(s.verdict.label);
      expect(s.criticalGaps.some((g) => g.dim === input.lowestDim)).toBe(true);
      expect(s.reasonsToBack).toHaveLength(3);
      expect(s.criticalGaps).toHaveLength(3);
    }
    const good = await runEval(fx, execPv, { runCase: async (c) => ({ ok: true, data: evalShape(goodExecutivePayload(c)), latencyMs: 10, costUsd: 0.001, runId: c.id }) });
    expect(good.accuracy_pct).toBeGreaterThanOrEqual(0.8);
    expect(good.hard_fail).toBe(false);
    expect(shouldPromote(good)).toBe(true);

    const markdown = await runEval(fx, execPv, {
      runCase: async (c) => {
        const p = goodExecutivePayload(c);
        return { ok: true, data: evalShape({ ...p, headline: `**${p.headline}**` }), latencyMs: 10, costUsd: 0.001, runId: c.id };
      },
    });
    expect(markdown.hard_fail).toBe(true);
    expect(shouldPromote(markdown)).toBe(false);

    const invented = await runEval(fx, execPv, {
      runCase: async (c) => {
        const p = goodExecutivePayload(c);
        return { ok: true, data: evalShape({ ...p, summary: [...(p.summary as string[]), "ARR A$2.4M supports a Series B."] }), latencyMs: 10, costUsd: 0.001, runId: c.id };
      },
    });
    expect(invented.hard_fail).toBe(true);
  });
});

// ── G23-A: TBR-grounding-v2.4.0 — the three grounding fixes + the G24-D computed-fact case, pinned nightly-style (no LLM) ──
describe("TBR-grounding-v2.4.0 fixture (G23-A + G24-D)", () => {
  const fx = PromptEvalFixture.parse(JSON.parse(readFileSync(path.join(FIXTURE_DIR, "TBR-grounding-v2.4.0.json"), "utf8")));
  const pvG: PromptVersion = { ...pv("tre"), agent: "TBR-grounding", version: "2.4.0" };
  type Rows = Array<{ id: string; label: string; value?: string }>;
  const rowsOf = (c: FixtureCase) => (c.input as { evidenceRows: Rows }).evidenceRows;
  const items = (c: FixtureCase) => itemsFromEvidenceRows(rowsOf(c).map((r) => ({ evidence_id: r.id, label: r.label, value: r.value })));
  /** An owner payload whose sentences quote register numbers but carry no [ev:] marker (what the free models actually write). */
  function uncitedPayload(c: FixtureCase, verdict: string, strengths: string[], gaps: string[]): Record<string, unknown> {
    const input = c.input as { dim: DimKey; deterministicScore: number };
    return { dim: input.dim, verdict, score_adjustment: { proposed: input.deterministicScore, deterministic: input.deterministicScore, reason: "aligned" }, strengths, gaps, next_action: { title: "Add evidence", window: "30d", expected_lift: 3 }, criterion_cards: [], primary_visual: { kind: DIMENSION_OWNERS[input.dim].primaryVisual, data_state: "partial", series: [] }, frameworks_used: [], confidence: 0.7, hallucination_risk: "low", proposed_score: input.deterministicScore };
  }
  /** What buildDimensionChapter does to the text fields: auto-cite against the chapter rows, trim the verdict to the cap. */
  function groundPayload(c: FixtureCase, p: Record<string, unknown>): Record<string, unknown> {
    const it = items(c);
    const cite = (t: string) => autoCite(t, it).text;
    return { ...p, verdict: cite(trimVerdict(p.verdict as string, VERDICT_WORD_CAPS.chapter).text), strengths: (p.strengths as string[]).map(cite), gaps: (p.gaps as string[]).map(cite) };
  }
  const caseById = (id: string) => fx.cases.find((c) => c.id === id)!;

  it("parses, carries four cases (auto-cite, verdict trim, budget overrun, computed facts) with uuid-shaped ids, valid W4 inputs and the grounding + word-cap constraints", () => {
    expect(fx.cases.map((c) => c.id)).toEqual(["case_autocite_tre", "case_verdict_trim_mpc", "case_budget_overrun_mpc", "case_computed_facts_iri"]);
    for (const c of fx.cases) {
      expect(DimensionChapterInput.safeParse(c.input).success).toBe(true);
      for (const r of rowsOf(c)) expect(r.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(c.expected.grounded_share_min).toBe(0.85);
      expect(c.expected.verdict_max_words).toBe(80);
      expect(c.expected.must_cite).toBeGreaterThanOrEqual(1);
    }
  });

  it("(a) auto-cite: an uncited owner payload quoting the Stripe / founder numbers grounds below 0.85 raw and at or above 0.85 after the auto-citer — promotable; an invented ARR still hard-fails", async () => {
    const c = caseById("case_autocite_tre");
    const raw = uncitedPayload(
      c,
      "Traction is real but thin: Stripe shows A$12,400 MRR from 9 active subscriptions, growing 8 % month on month. The score sits at the seed median.",
      ["MRR of A$12,400 with 2.1 % churn over 90 days", "9 paying customers on A$12,400 MRR"],
      [`No cohort retention data yet [ev:${rowsOf(c)[1]!.id}]`],
    );
    expect(groundedShareOf(c, raw)).toBeLessThan(0.85);
    const grounded = groundPayload(c, raw);
    expect(groundedShareOf(c, grounded)).toBeGreaterThanOrEqual(0.85);
    expect(String(grounded.verdict)).toMatch(/8 % month on month \[ev:6f1d2c3b-[^\]]+\]\./);
    expect(DimensionChapterPayload.safeParse(grounded).success).toBe(true);
    const run = async (data: Record<string, unknown>) => runEval({ ...fx, cases: [c] }, pvG, { runCase: async () => ({ ok: true, data, latencyMs: 5, costUsd: 0.001, runId: c.id }) });
    const good = await run(grounded);
    expect(good.hard_fail).toBe(false);
    expect(good.accuracy_pct).toBeGreaterThanOrEqual(0.8);
    expect(shouldPromote(good)).toBe(true);
    const invented = await run({ ...grounded, verdict: `${grounded.verdict} Revenue reached A$1.2M ARR.` });
    expect(invented.hard_fail).toBe(true);
  });

  it("(c) verdict trim: a 100-word verdict parses (no schema failure) and is trimmed to the last full sentence within 80 words, its citation kept — promotable; the raw verdict misses verdict_max_words", async () => {
    const c = caseById("case_verdict_trim_mpc");
    const anchor = rowsOf(c)[0]!.id;
    const long = `Market pull is developing: the AU anchor puts SAM at A$310M [ev:${anchor}]. ${Array.from({ length: 60 }, (_, i) => `Filler${i}`).join(" ")}. ${Array.from({ length: 25 }, (_, i) => `More${i}`).join(" ")}.`;
    const raw = uncitedPayload(c, long, [`SAM A$310M cross-checks with the ABS anchor [ev:${anchor}]`], [`No persona or interview evidence yet [ev:${rowsOf(c)[1]!.id}]`]);
    expect(DimensionChapterPayload.safeParse(raw).success).toBe(true);
    expect(long.split(/\s+/).length).toBeGreaterThan(80);
    const grounded = groundPayload(c, raw);
    const words = String(grounded.verdict).split(/\s+/).length;
    expect(words).toBeLessThanOrEqual(80);
    expect(String(grounded.verdict)).toContain(`[ev:${anchor}]`);
    expect(String(grounded.verdict).endsWith("Filler59.")).toBe(true);
    const run = async (data: Record<string, unknown>) => runEval({ ...fx, cases: [c] }, pvG, { runCase: async () => ({ ok: true, data, latencyMs: 5, costUsd: 0.001, runId: c.id }) });
    const good = await run(grounded);
    expect(shouldPromote(good)).toBe(true);
    const untrimmed = await run(raw);
    expect(untrimmed.accuracy_pct).toBeLessThan(good.accuracy_pct);
  });

  it("(b) budget overrun: a good CMO answer cut mid-JSON at ~2,500 tokens is salvaged to its last complete value, parses the W4 schema (confidence defaulted) and stays promotable", async () => {
    const c = caseById("case_budget_overrun_mpc");
    const anchor = rowsOf(c)[0]!.id;
    const full = { ...uncitedPayload(c, `Market pull is developing: SAM A$310M against a TAM of A$4.2bn [ev:${anchor}].`, [`Bottom-up SAM A$310M [ev:${anchor}]`], [`No persona or interview evidence yet [ev:${rowsOf(c)[1]!.id}]`]), criterion_cards: [{ key: "market", lens: "mpc", verdict: "SAM cross-checked", strengths: [], gaps: [], next_action: "Interview 10 buyers", citations: [{ evidence_id: anchor, quote: "SAM A$310M" }] }], frameworks_used: ["TAM/SAM/SOM ABS-anchored (top-down × bottom-up cross-check)", "JTBD"] };
    delete (full as Record<string, unknown>).confidence;
    const text = JSON.stringify(full);
    const cut = text.slice(0, text.indexOf(`"frameworks_used"`) + 40);
    expect(() => JSON.parse(cut)).toThrow();
    const rescued = salvageTruncatedJson(cut);
    expect(rescued).not.toBeNull();
    const parsed = DimensionChapterPayload.safeParse(JSON.parse(rescued!));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.confidence).toBe(0.5);
    expect(parsed.data.criterion_cards).toHaveLength(1);
    const data = { ...(parsed.data as unknown as Record<string, unknown>), proposed_score: parsed.data.score_adjustment.proposed };
    const good = await runEval({ ...fx, cases: [c] }, pvG, { runCase: async () => ({ ok: true, data, latencyMs: 5, costUsd: 0.001, runId: c.id }) });
    expect(good.hard_fail).toBe(false);
    expect(shouldPromote(good)).toBe(true);
  });

  it("(d) G24-D computed facts: the fixture's calc rows carry the pipeline's stable ids; an owner quoting the CFO consensus (either spelling) and the stage p50 without an id grounds at or above 0.85 after the auto-citer; an invented consensus still hard-fails", async () => {
    const c = caseById("case_computed_facts_iri");
    const rows = rowsOf(c);
    expect(rows.map((r) => r.id)).toEqual(expect.arrayContaining([COMPUTED_FACT_IDS.valuation, COMPUTED_FACT_IDS.benchmarks, COMPUTED_FACT_IDS["svi-scores"]]));
    const raw = uncitedPayload(
      c,
      "Investor readiness is at the stage median: the CFO consensus puts the company at A$4.6M (A$3.0M–A$6.6M) and the founder's A$3.5M pre-money sits inside that band. IRI reads 55 against a stage benchmark p50 of 55.",
      ["Consensus mid A$4,622,000 with a 35% confidence", "Pre-money ask of A$3,500,000 on a A$500,000 raise, aligned with the consensus"],
      [`No signed SAFE or data room yet — the ask is unevidenced beyond the stated cap [ev:${rows[3]!.id}]`],
    );
    expect(groundedShareOf(c, raw)).toBeLessThan(0.85);
    const grounded = groundPayload(c, raw);
    expect(groundedShareOf(c, grounded)).toBeGreaterThanOrEqual(0.85);
    expect(String(grounded.verdict)).toContain(`[ev:${COMPUTED_FACT_IDS.valuation}]`);
    expect((grounded.strengths as string[])[0]).toContain(`[ev:${COMPUTED_FACT_IDS.valuation}]`);
    expect((grounded.strengths as string[])[1]).toContain(`[ev:${COMPUTED_FACT_IDS.valuation}]`);
    expect(DimensionChapterPayload.safeParse(grounded).success).toBe(true);
    const run = async (data: Record<string, unknown>) => runEval({ ...fx, cases: [c] }, pvG, { runCase: async () => ({ ok: true, data, latencyMs: 5, costUsd: 0.001, runId: c.id }) });
    const good = await run(grounded);
    expect(good.hard_fail).toBe(false);
    expect(shouldPromote(good)).toBe(true);
    const invented = await run({ ...grounded, verdict: `${grounded.verdict} The consensus is really A$9.9M.` });
    expect(invented.hard_fail).toBe(true);
  });
});

// ── G28-A: TBR-grounding-v2.5.0 — the four residual patterns of the 11:34 showcase run (0.82), pinned nightly-style (no LLM) ──
describe("TBR-grounding-v2.5.0 fixture (G28-A residual patterns)", () => {
  const fx = PromptEvalFixture.parse(JSON.parse(readFileSync(path.join(FIXTURE_DIR, "TBR-grounding-v2.5.0.json"), "utf8")));
  const pvG: PromptVersion = { ...pv("tre"), agent: "TBR-grounding", version: "2.5.0" };
  type Rows = Array<{ id: string; label: string; value?: string }>;
  const rowsOf = (c: FixtureCase) => (c.input as { evidenceRows: Rows }).evidenceRows;
  const items = (c: FixtureCase) => itemsFromEvidenceRows(rowsOf(c).map((r) => ({ evidence_id: r.id, label: r.label, value: r.value })));
  const ids = (c: FixtureCase) => rowsOf(c).map((r) => r.id);
  function payload(c: FixtureCase, verdict: string, strengths: string[], gaps: string[]): Record<string, unknown> {
    const input = c.input as { dim: DimKey; deterministicScore: number };
    return { dim: input.dim, verdict, score_adjustment: { proposed: input.deterministicScore, deterministic: input.deterministicScore, reason: "aligned" }, strengths, gaps, next_action: { title: "Add evidence", window: "30d", expected_lift: 3 }, criterion_cards: [], primary_visual: { kind: DIMENSION_OWNERS[input.dim].primaryVisual, data_state: "partial", series: [] }, frameworks_used: [], confidence: 0.7, hallucination_risk: "low", proposed_score: input.deterministicScore };
  }
  /** What buildDimensionChapter does to the text fields: auto-cite against the chapter rows, trim the verdict. */
  function ground(c: FixtureCase, p: Record<string, unknown>): Record<string, unknown> {
    const it = items(c);
    const cite = (t: string) => autoCite(t, it).text;
    return { ...p, verdict: cite(trimVerdict(p.verdict as string, VERDICT_WORD_CAPS.chapter).text), strengths: (p.strengths as string[]).map(cite), gaps: (p.gaps as string[]).map(cite) };
  }
  /** Every material sentence in the payload's text fields passes the §5.4 gate (cited or declared). */
  const gateClean = (c: FixtureCase, p: Record<string, unknown>) => findUncitedClaims([p.verdict as string, ...(p.strengths as string[]), ...(p.gaps as string[])].join("\n"), ids(c));
  const run = async (c: FixtureCase, data: Record<string, unknown>) => runEval({ ...fx, cases: [c] }, pvG, { runCase: async () => ({ ok: true, data, latencyMs: 5, costUsd: 0.001, runId: c.id }) });
  const caseById = (id: string) => fx.cases.find((c) => c.id === id)!;

  it("parses, carries the four residual-pattern cases with uuid-shaped ids, valid W4 inputs, the grounding + word-cap constraints, and knowledge rows whose text equals the pipeline's", () => {
    expect(fx.cases.map((c) => c.id)).toEqual(["case_derived_rate_tre", "case_statutory_fee_lco", "case_channel_cadence_mpc", "case_sector_entities_mpc"]);
    for (const c of fx.cases) {
      expect(DimensionChapterInput.safeParse(c.input).success).toBe(true);
      for (const r of rowsOf(c)) expect(r.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(c.expected.grounded_share_min).toBe(0.85);
      expect(c.expected.verdict_max_words).toBe(80);
      expect(c.expected.must_cite).toBeGreaterThanOrEqual(1);
    }
    // The fixture's knowledge rows are the pipeline's rows, verbatim — drift here would silently un-pin the auto-cite cases.
    const live = new Map(computedFactRows({ sviAnalysis: { totalSVI: 138, stageLabel: "Early Traction", subs: [], dimensionScores: {} }, stage: 3, rawText: "A B2B SaaS platform for evaluators." }).map((r) => [r.evidence_id, r]));
    const legal = rowsOf(caseById("case_statutory_fee_lco")).find((r) => r.id === COMPUTED_FACT_IDS["au-legal"])!;
    expect(legal.value).toBe(live.get(COMPUTED_FACT_IDS["au-legal"])!.value);
    expect(legal.label).toBe(live.get(COMPUTED_FACT_IDS["au-legal"])!.label);
    const sector = rowsOf(caseById("case_sector_entities_mpc")).find((r) => r.id === COMPUTED_FACT_IDS["sector-entities"])!;
    expect(sector.value).toBe(live.get(COMPUTED_FACT_IDS["sector-entities"])!.value);
    const saas = rowsOf(caseById("case_derived_rate_tre")).find((r) => r.id === COMPUTED_FACT_IDS["saas-benchmarks"])!;
    expect(saas.value).toBe(live.get(COMPUTED_FACT_IDS["saas-benchmarks"])!.value);
  });

  it("(1) derived rate: the bare '2.7%' payload fails the gate and grounds below 0.85; the declared-estimate payload clears the gate, cites the SaaS row for the benchmark and promotes; 'conversion is 2.7%' as a fact hard-fails", async () => {
    const c = caseById("case_derived_rate_tre");
    const bare = ground(c, payload(c, "Traction is thin: 182 startups analysed and 5 report purchases, so the trial-to-paid conversion is 2.7%, well below the 15–30% benchmark.", ["3,302 weekly SVI snapshots show usage"], ["Trial-to-paid conversion rate is critically low at ~2.7% vs the 15-30% benchmark"]));
    expect(gateClean(c, bare).length).toBeGreaterThanOrEqual(2);
    expect(groundedShareOf(c, bare)).toBeLessThan(0.85);
    expect((await run(c, bare)).hard_fail).toBe(true);
    const declared = ground(c, payload(c, "Traction is thin: 182 startups analysed, 0 active subscriptions and 5 one-off A$3 report charges. We estimate trial-to-paid at ≈ 2.7% (5 ÷ 182) [unevidenced]. The SaaS benchmark for trial → paid is 15–30%.", ["3,302 weekly SVI snapshots show usage"], ["We estimate trial-to-paid at ~2.7% vs the 15-30% SaaS benchmark [unevidenced] — no subscription yet"]));
    expect(gateClean(c, declared)).toEqual([]);
    expect(String(declared.verdict)).toContain(`[ev:${COMPUTED_FACT_IDS["saas-benchmarks"]}]`);
    expect(String(declared.verdict)).toContain("[ev:0b449430-5c8b-44e3-9a9c-7eb9f76831dd]");
    expect(groundedShareOf(c, declared)).toBeGreaterThanOrEqual(0.85);
    expect(DimensionChapterPayload.safeParse(declared).success).toBe(true);
    const good = await run(c, declared);
    expect(good.hard_fail).toBe(false);
    expect(shouldPromote(good)).toBe(true);
  });

  it("(2) statutory fee: '$290' stays uncited and hard-fails; the band quoted from the ASIC / IP Australia row is auto-cited, the premium is a declared estimate, the completed trade mark is never called missing — promotable", async () => {
    const c = caseById("case_statutory_fee_lco");
    const stale = ground(c, payload(c, "Compliance is solid. ASIC annual review is due on the anniversary — pay the $290 fee on time. You have no registered trademarks; registration costs ~$250 per class.", ["ToS and privacy policy live"], ["No D&O insurance — premiums run $1,200–$2,000 a year"]));
    expect(gateClean(c, stale).length).toBeGreaterThanOrEqual(2);
    expect((await run(c, stale)).hard_fail).toBe(true);
    const fromRow = ground(c, payload(c, "Compliance is solid: trade mark filed, SHA, vesting and ESOP documented. The ASIC annual review fee is A$321–A$329 a year, indexed each 1 July, due within 2 months of the anniversary.", ["Trade mark filed; a second class costs A$250–A$550 per class with IP Australia"], ["No D&O insurance yet — we estimate the premium at A$1,200–A$2,000 a year [unevidenced]"]));
    expect(gateClean(c, fromRow)).toEqual([]);
    expect(String(fromRow.verdict)).toContain(`[ev:${COMPUTED_FACT_IDS["au-legal"]}]`);
    expect((fromRow.strengths as string[])[0]).toContain(`[ev:${COMPUTED_FACT_IDS["au-legal"]}]`);
    expect(groundedShareOf(c, fromRow)).toBeGreaterThanOrEqual(0.85);
    expect(DimensionChapterPayload.safeParse(fromRow).success).toBe(true);
    const good = await run(c, fromRow);
    expect(good.hard_fail).toBe(false);
    expect(shouldPromote(good)).toBe(true);
  });

  it("(3) channel cadence: 'we recommend 3–5 articles of 2,000+ words' is a target the gate does not count and the case promotes; the same numbers stated as a fact about the site are a claim", async () => {
    const c = caseById("case_channel_cadence_mpc");
    const plan = ground(c, payload(c, "Market pull is developing: the technical audit is grade A with 0 broken links on 525 pages and 3,302 snapshots in the proprietary dataset, but content marketing is nascent. We recommend a content pillar strategy: 3–5 cornerstone articles, each with 2,000+ words, and outreach to accounting-firm blogs.", ["3,302 snapshots can power data-driven content"], ["No content pillars live yet — no organic acquisition measured [unevidenced]"]));
    expect(gateClean(c, plan)).toEqual([]);
    expect(String(plan.verdict)).toContain("[ev:bb8fc046-afec-442c-8660-fe98b805e14d]");
    expect(groundedShareOf(c, plan)).toBeGreaterThanOrEqual(0.85);
    const good = await run(c, plan);
    expect(good.hard_fail).toBe(false);
    expect(shouldPromote(good)).toBe(true);
    const fact = "The site already publishes 3–5 cornerstone articles a month, each with 2,000+ words.";
    expect(findUncitedClaims(fact, ids(c))).toHaveLength(1);
  });

  it("(4) sector entities: the whole-industry count cites the sector row; 'SAM is 1,400 entities' bare hard-fails; the declared EN and VI subsets clear the gate and promote", async () => {
    const c = caseById("case_sector_entities_mpc");
    const bare = ground(c, payload(c, "The bottom-up SAM is ~5,700 organisations worth A$12M. The SAM is 1,400 entities that actively screen startups, and SOM is 30–40 accounts in year one.", ["5,700 organisations counted bottom-up"], ["No buyer interviews yet"]));
    expect(gateClean(c, bare).length).toBeGreaterThanOrEqual(1);
    expect((await run(c, bare)).hard_fail).toBe(true);
    const declared = ground(c, payload(c, "The bottom-up SAM is ~5,700 organisations worth A$12M, inside a sector of 8,400 active Australian businesses on the ABS basis. We estimate the subset that actively screens startups at roughly 1,400 entities [unevidenced].", ["5,700 organisations counted bottom-up", "Chúng tôi ước tính SOM năm đầu khoảng 30–40 tài khoản (chưa có bằng chứng)."], ["No buyer interviews yet — the estimated subset is unvalidated [unevidenced]"]));
    expect(gateClean(c, declared)).toEqual([]);
    expect(String(declared.verdict)).toContain(`[ev:${COMPUTED_FACT_IDS["sector-entities"]}]`);
    expect(String(declared.verdict)).toContain("[ev:ca6821a0-4152-4247-9730-e906060131c6]");
    expect(groundedShareOf(c, declared)).toBeGreaterThanOrEqual(0.85);
    expect(DimensionChapterPayload.safeParse(declared).success).toBe(true);
    const good = await run(c, declared);
    expect(good.hard_fail).toBe(false);
    expect(shouldPromote(good)).toBe(true);
  });
});
