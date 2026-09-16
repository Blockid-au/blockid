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
import { DimensionChapterInput, DimensionChapterPayload } from "./agent-dispatcher";
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

describe("TBR-<dim>-v2.0.0 fixtures", () => {
  it("ships exactly eight TBR fixtures, one per dimension, discoverable by the nightly runner naming rule", () => {
    const files = readdirSync(FIXTURE_DIR).filter((f) => f.startsWith("TBR-")).sort();
    expect(files).toEqual([...DIM_ORDER].sort().map((d) => `TBR-${d}-v2.0.0.json`));
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
