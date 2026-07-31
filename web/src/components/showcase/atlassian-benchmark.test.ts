// Colocated test for the Atlassian benchmark renderers.
//
// There is no DOM environment in this vitest config (see vitest.config.ts),
// so these are source-level invariants rather than render assertions. They
// exist to pin the ONE rule that must never regress: any surface that shows
// Atlassian benchmark data must also show the case-study framing. A silent
// removal of <BenchmarkNotice /> from a page would otherwise turn public
// reference material into what reads like a BlockID assessment.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ANALYSIS_AREAS,
  ATLASSIAN_FOLKLORE_CHECKS,
  ATLASSIAN_HUMAN_REVIEW_FLAGS,
  ATLASSIAN_STAGE_BENCHMARKS,
} from "@/lib/showcase/atlassian/stage-benchmark";
import { ATLASSIAN_WALKTHROUGH } from "@/lib/showcase/atlassian/steps";

import * as Benchmark from "./atlassian-benchmark";

const SRC = resolve(__dirname, "../..");
const read = (rel: string) => readFileSync(resolve(SRC, rel), "utf8");

const COMPONENT = "components/showcase/atlassian-benchmark.tsx";

/**
 * Every page that renders benchmark data. Adding a new surface means adding
 * it here — which is the point: the list is the contract.
 */
const BENCHMARK_SURFACES = [
  "app/showcase/atlassian/growth-phases/page.tsx",
  "app/showcase/atlassian/summary/page.tsx",
] as const;

describe("benchmark renderers", () => {
  it("exports the pieces the showcase pages consume", () => {
    for (const name of [
      "BenchmarkNotice",
      "EvidenceTag",
      "SignalPill",
      "SourceList",
      "PhaseBenchmarkPanel",
      "StageBenchmarkSection",
      "FolkloreChecksSection",
      "HumanReviewFlagsSection",
    ]) {
      expect(typeof (Benchmark as Record<string, unknown>)[name], `missing export ${name}`).toBe(
        "function",
      );
    }
  });

  it("renders the evidence grade next to every judgement it displays", () => {
    const src = read(COMPONENT);
    // Interpretation must never render bare. Each block that shows a reading
    // pairs it with <EvidenceTag />.
    expect(src).toContain("<EvidenceTag grade={r.evidence} />");
    expect(src).toContain("<EvidenceTag grade={b.verificationAnalogue.evidence} />");
    expect(src).toContain("<EvidenceTag grade={b.stagePlacementEvidence} />");
    expect(src).toContain("<EvidenceTag grade={p.evidence} />");
  });

  it("labels source tier so a reader can tell a filing from reported coverage", () => {
    const src = read(COMPONENT);
    expect(src).toContain("data-tier={s.tier}");
    expect(src).toMatch(/Company filing or company newsroom/);
  });

  it("uses no `any` casts and no ts-ignore", () => {
    const src = read(COMPONENT);
    expect(src).not.toMatch(/@ts-ignore/);
    expect(src).not.toMatch(/\bas any\b/);
    expect(src).not.toMatch(/:\s*any\b/);
  });
});

describe("case-study framing is present on every benchmark surface", () => {
  it.each(BENCHMARK_SURFACES)("%s renders <BenchmarkNotice />", (rel) => {
    const src = read(rel);
    expect(src, `${rel} does not import BenchmarkNotice`).toContain("BenchmarkNotice");
    expect(src, `${rel} imports but never renders BenchmarkNotice`).toMatch(/<BenchmarkNotice\s*\/?>/);
  });

  it.each(BENCHMARK_SURFACES)("%s imports from the benchmark component, not raw data", (rel) => {
    const src = read(rel);
    expect(src).toContain("@/components/showcase/atlassian-benchmark");
  });

  it("no showcase page presents a BlockID trust score for Atlassian", () => {
    for (const rel of BENCHMARK_SURFACES) {
      const src = read(rel);
      expect(src, `${rel} presents a Trust Score`).not.toMatch(/trust\s*score/i);
    }
  });
});

describe("growth-phases page wiring", () => {
  const src = read("app/showcase/atlassian/growth-phases/page.tsx");

  it("renders a per-phase benchmark panel inside the 12-phase strip", () => {
    expect(src).toMatch(/<PhaseBenchmarkPanel\s+ordinal=/);
  });

  it("renders the S0–S5 section and the human-review flags", () => {
    expect(src).toMatch(/<StageBenchmarkSection\s*\/?>/);
    expect(src).toMatch(/<HumanReviewFlagsSection\s*\/?>/);
  });
});

describe("summary page wiring", () => {
  const src = read("app/showcase/atlassian/summary/page.tsx");

  it("renders the folklore checks and the human-review flags", () => {
    expect(src).toMatch(/<FolkloreChecksSection\s*\/?>/);
    expect(src).toMatch(/<HumanReviewFlagsSection\s*\/?>/);
  });

  it("no longer claims zero founder dilution", () => {
    // Corrected against the prospectus: the supportable claim is retained
    // voting control via the dual-class structure, not zero dilution.
    expect(src).not.toMatch(/zero founder dilution/i);
  });
});

describe("walkthrough step copy", () => {
  it("no step's visitor-facing copy claims zero founder dilution", () => {
    // Asserted against the data, not the file text — the explanatory comment
    // in steps.ts deliberately still quotes the old wording.
    for (const step of ATLASSIAN_WALKTHROUGH) {
      expect(step.guideText, `step ${step.n}`).not.toMatch(/zero founder dilution/i);
      expect(step.title, `step ${step.n}`).not.toMatch(/zero founder dilution/i);
    }
  });
});

describe("the renderers cover the whole dataset", () => {
  it("has something to render for every stage, area, check and flag", () => {
    expect(ATLASSIAN_STAGE_BENCHMARKS.length).toBe(6);
    expect(ANALYSIS_AREAS.length).toBe(13);
    expect(ATLASSIAN_FOLKLORE_CHECKS.length).toBeGreaterThanOrEqual(5);
    expect(ATLASSIAN_HUMAN_REVIEW_FLAGS.length).toBeGreaterThanOrEqual(4);
  });
});
