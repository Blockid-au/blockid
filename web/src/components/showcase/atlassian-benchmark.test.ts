// Colocated render test for the atlassian-benchmark server-component
// primitives. These components are the only surface that renders the
// stage-benchmark data on the two /showcase/atlassian mirror pages
// (summary/page.tsx + growth-phases/page.tsx), so a silent drift in the
// "case study, not an assessment" framing, the folklore verdicts, or the
// evidence-grade markers would leak into founder-facing pages that this
// goal (docs/plans/atlassian-standard-mapping-goal.md) explicitly requires
// to carry the market-reference framing on every surface.
//
// Rendered via react-dom/server's renderToStaticMarkup — cheap, no JSDOM
// dependency, matching the pattern in scn-position-hero.test.ts.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  BenchmarkNotice,
  EvidenceTag,
  FolkloreChecksSection,
  HumanReviewFlagsSection,
  PhaseBenchmarkPanel,
  SignalPill,
  SourceList,
  StageBenchmarkSection,
} from "./atlassian-benchmark";
import {
  ANALYSIS_AREAS,
  ATLASSIAN_FOLKLORE_CHECKS,
  ATLASSIAN_HUMAN_REVIEW_FLAGS,
  ATLASSIAN_STAGE_BENCHMARKS,
  BENCHMARK_DISCLAIMER,
  STAGE_CALIBRATION_NOTE,
  SRC_F1_2015,
  SRC_TC_ACCEL,
  getPhaseBenchmark,
} from "@/lib/showcase/atlassian/stage-benchmark";
import { ATLASSIAN_WALKTHROUGH } from "@/lib/showcase/atlassian/steps";
import type { PhaseKey } from "@/lib/journey-map";

// renderToStaticMarkup HTML-entity-encodes apostrophes (' → &#x27;), quotes
// and ampersands in text nodes. The stage-benchmark data is prose-heavy
// ("Atlassian's", "framework's") so a raw contain-match against the source
// constant would fail on encoding alone. Decode the small closed set of
// entities react actually emits before asserting.
function decodeEntities(html: string): string {
  return html
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&ldquo;/g, "“")
    .replace(/&rdquo;/g, "”")
    .replace(/&amp;/g, "&");
}

// ── BenchmarkNotice ─────────────────────────────────────────────────────────

describe("BenchmarkNotice", () => {
  it("carries the case-study framing headline and the full disclaimer copy", () => {
    const html = decodeEntities(renderToStaticMarkup(createElement(BenchmarkNotice)));
    expect(html).toContain('data-testid="benchmark-notice"');
    expect(html).toContain("Market reference");
    expect(html).toContain("case study, not an assessment");
    expect(decodeEntities(html)).toContain(BENCHMARK_DISCLAIMER);
  });

  it("switches to compact padding + font when compact=true", () => {
    const full = renderToStaticMarkup(createElement(BenchmarkNotice));
    const compact = renderToStaticMarkup(
      createElement(BenchmarkNotice, { compact: true }),
    );
    expect(full).toContain("p-4 text-sm");
    expect(compact).toContain("px-3 py-2 text-[11px]");
    expect(compact).not.toContain("p-4 text-sm");
  });
});

// ── EvidenceTag ─────────────────────────────────────────────────────────────

describe("EvidenceTag", () => {
  it('renders "documented" with the emerald pill and the primary-source tooltip', () => {
    const html = renderToStaticMarkup(
      createElement(EvidenceTag, { grade: "documented" }),
    );
    expect(html).toContain('data-evidence="documented"');
    expect(html).toContain(">documented<");
    expect(html).toContain("bg-emerald-100");
    expect(html).toContain("On the face of a cited public source.");
  });

  it('renders "interpretation" with the slate pill and the view-not-fact tooltip', () => {
    const html = renderToStaticMarkup(
      createElement(EvidenceTag, { grade: "interpretation" }),
    );
    expect(html).toContain('data-evidence="interpretation"');
    expect(html).toContain(">interpretation<");
    expect(html).toContain("bg-slate-200");
    expect(html).toContain("BlockID&#x27;s reading of the public record");
  });
});

// ── SignalPill ──────────────────────────────────────────────────────────────

describe("SignalPill", () => {
  it("labels every AreaSignal value with the expected human label + colour class", () => {
    const cases: Array<{ signal: "strong" | "mixed" | "weak" | "not_public"; label: string; cls: string }> = [
      { signal: "strong", label: "Strong", cls: "bg-emerald-100" },
      { signal: "mixed", label: "Mixed", cls: "bg-amber-100" },
      { signal: "weak", label: "Thin", cls: "bg-rose-100" },
      { signal: "not_public", label: "Not public", cls: "bg-slate-200" },
    ];
    for (const c of cases) {
      const html = renderToStaticMarkup(
        createElement(SignalPill, { signal: c.signal }),
      );
      expect(html).toContain(`data-signal="${c.signal}"`);
      expect(html).toContain(`>${c.label}<`);
      expect(html).toContain(c.cls);
    }
  });
});

// ── SourceList ──────────────────────────────────────────────────────────────

describe("SourceList", () => {
  it("emits one external <a> per source with target=_blank + noreferrer noopener + tier tag", () => {
    const html = renderToStaticMarkup(
      createElement(SourceList, { sources: [SRC_F1_2015, SRC_TC_ACCEL] }),
    );
    // Two link elements.
    expect(html.match(/<a /g)?.length).toBe(2);
    // Both open in a new tab with a hardened rel string.
    expect(html.match(/target="_blank"/g)?.length).toBe(2);
    expect(html.match(/rel="noreferrer noopener"/g)?.length).toBe(2);
    // Both hrefs point at the exact source URL.
    expect(html).toContain(`href="${SRC_F1_2015.url}"`);
    expect(html).toContain(`href="${SRC_TC_ACCEL.url}"`);
    // Tier is exposed as a data attribute so a reader can tell primary from secondary.
    expect(html).toContain('data-tier="primary"');
    expect(html).toContain('data-tier="secondary"');
  });

  it("renders an empty <ul> for a zero-source list without throwing", () => {
    const html = renderToStaticMarkup(
      createElement(SourceList, { sources: [] }),
    );
    expect(html).toContain("<ul");
    expect(html).not.toContain("<li");
    expect(html).not.toContain("<a ");
  });
});

// ── StageBenchmarkSection ───────────────────────────────────────────────────

describe("StageBenchmarkSection", () => {
  const html = decodeEntities(renderToStaticMarkup(createElement(StageBenchmarkSection)));

  it("exposes the section testid and the calibration-note copy", () => {
    expect(html).toContain('data-testid="stage-benchmark-section"');
    expect(html).toContain(STAGE_CALIBRATION_NOTE);
  });

  it("renders exactly one StageCard per ATLASSIAN_STAGE_BENCHMARKS entry", () => {
    const cardCount = (html.match(/data-testid="stage-benchmark-card"/g) ?? []).length;
    expect(cardCount).toBe(ATLASSIAN_STAGE_BENCHMARKS.length);
    for (const b of ATLASSIAN_STAGE_BENCHMARKS) {
      expect(html).toContain(`data-stage="${b.stage}"`);
      expect(html).toContain(b.label);
      expect(html).toContain(b.period);
      expect(html).toContain(b.whatItLookedLike);
      expect(html).toContain(`Verification-ladder analogue: L${b.verificationAnalogue.level}`);
    }
  });

  it("shows the empty-state 'None. A private company at this stage publishes nothing.' for S0", () => {
    // S0 has publiclyVisibleArtefacts: [] by fixture — verify the empty-state
    // copy is present rather than a bare empty <ul>.
    expect(html).toContain("None. A private company at this stage publishes nothing.");
  });

  it("emits every declared analysis-area label inside each stage's 13-area table", () => {
    for (const area of ANALYSIS_AREAS) {
      expect(html).toContain(area.label);
    }
  });
});

// ── PhaseBenchmarkPanel ─────────────────────────────────────────────────────

describe("PhaseBenchmarkPanel", () => {
  it("stamps data-phase + data-stage from getPhaseBenchmark for the requested ordinal", () => {
    const ordinal = 10 as PhaseKey;
    const phase = getPhaseBenchmark(ordinal);
    const html = decodeEntities(
      renderToStaticMarkup(createElement(PhaseBenchmarkPanel, { ordinal })),
    );
    expect(html).toContain('data-testid="phase-benchmark-panel"');
    expect(html).toContain(`data-phase="${phase.phase}"`);
    expect(html).toContain(`data-stage="${phase.stage}"`);
    expect(decodeEntities(html)).toContain(phase.atlassianAtThisPhase);
    // Expected-artefacts row is present and joined with ' · '.
    expect(html).toContain("Artefacts expected here:");
    expect(decodeEntities(html)).toContain(phase.expectedArtefacts.join(" · "));
  });

  it("omits the 'Evidenced strength' + 'Thin or unevidenced' rows when the arrays are empty", () => {
    // Walk every phase and confirm the invariant: the section is only emitted
    // when the corresponding array is non-empty. Guards against a silent
    // render of an empty ':' label if the underlying arrays are wiped.
    for (const p of Array.from({ length: 12 }, (_, i) => (i + 1) as PhaseKey)) {
      const phase = getPhaseBenchmark(p);
      const html = renderToStaticMarkup(
        createElement(PhaseBenchmarkPanel, { ordinal: p }),
      );
      if (phase.strongAreas.length === 0) {
        expect(html).not.toContain("Evidenced strength:");
      } else {
        expect(html).toContain("Evidenced strength:");
      }
      if (phase.weakOrUnevidencedAreas.length === 0) {
        expect(html).not.toContain("Thin or unevidenced:");
      } else {
        expect(html).toContain("Thin or unevidenced:");
      }
    }
  });
});

// ── FolkloreChecksSection ───────────────────────────────────────────────────

describe("FolkloreChecksSection", () => {
  const html = decodeEntities(renderToStaticMarkup(createElement(FolkloreChecksSection)));

  it("renders one folklore card per ATLASSIAN_FOLKLORE_CHECKS entry with its verdict data attribute", () => {
    const cardCount = (html.match(/data-testid="folklore-check"/g) ?? []).length;
    expect(cardCount).toBe(ATLASSIAN_FOLKLORE_CHECKS.length);
    for (const f of ATLASSIAN_FOLKLORE_CHECKS) {
      expect(html).toContain(`data-verdict="${f.verdict}"`);
      // Popular claim rendered inside curly quotes — spot-check the raw text
      // is present even after entity encoding of the surrounding &ldquo;/&rdquo;.
      expect(html).toContain(f.popularClaim);
      expect(html).toContain(f.whatTheRecordShows);
    }
  });

  it("uses only the three declared verdict values", () => {
    const verdicts = Array.from(html.matchAll(/data-verdict="([a-z_]+)"/g)).map((m) => m[1]);
    for (const v of verdicts) {
      expect(["accurate", "needs_nuance", "unsupported"]).toContain(v);
    }
  });
});

// ── HumanReviewFlagsSection ─────────────────────────────────────────────────

describe("HumanReviewFlagsSection", () => {
  const html = decodeEntities(renderToStaticMarkup(createElement(HumanReviewFlagsSection)));

  it("exposes the section testid and the 'not self-certified' framing headline", () => {
    expect(html).toContain('data-testid="human-review-flags"');
    expect(html).toContain("Flagged for human review — not self-certified");
  });

  it("renders one <li> per ATLASSIAN_HUMAN_REVIEW_FLAGS entry with its surface path", () => {
    const flagCount = (html.match(/data-flag="/g) ?? []).length;
    expect(flagCount).toBe(ATLASSIAN_HUMAN_REVIEW_FLAGS.length);
    for (const f of ATLASSIAN_HUMAN_REVIEW_FLAGS) {
      expect(html).toContain(`data-flag="${f.id}"`);
      expect(html).toContain(f.what);
      // Surface (e.g. ATLASSIAN_STAGE_BENCHMARKS[].stage) is rendered inside
      // a <code> so a reviewer can jump straight to the module.
      expect(html).toContain(f.surface);
    }
  });
});

// ── Page-level framing contract ─────────────────────────────────────────────
//
// The render tests above prove the components behave. These prove the PAGES
// still use them. Dropping <BenchmarkNotice /> from a surface would turn
// public reference material into what reads like a BlockID assessment, and no
// component-level test would catch it.

const SRC_DIR = resolve(__dirname, "../..");
const readSrc = (rel: string) => readFileSync(resolve(SRC_DIR, rel), "utf8");

/** Every page that renders benchmark data. The list IS the contract. */
const BENCHMARK_SURFACES = [
  "app/showcase/atlassian/growth-phases/page.tsx",
  "app/showcase/atlassian/summary/page.tsx",
] as const;

describe("case-study framing is present on every benchmark surface", () => {
  it.each(BENCHMARK_SURFACES)("%s renders <BenchmarkNotice />", (rel) => {
    const src = readSrc(rel);
    expect(src, `${rel} does not import BenchmarkNotice`).toContain("BenchmarkNotice");
    expect(src, `${rel} imports but never renders BenchmarkNotice`).toMatch(
      /<BenchmarkNotice\s*\/?>/,
    );
    expect(src).toContain("@/components/showcase/atlassian-benchmark");
  });

  it("no showcase surface presents a BlockID trust score for Atlassian", () => {
    for (const rel of BENCHMARK_SURFACES) {
      expect(readSrc(rel), `${rel} presents a Trust Score`).not.toMatch(/trust\s*score/i);
    }
  });

  it("growth-phases wires the per-phase panel, the S0-S5 section and the review flags", () => {
    const src = readSrc("app/showcase/atlassian/growth-phases/page.tsx");
    expect(src).toMatch(/<PhaseBenchmarkPanel\s+ordinal=/);
    expect(src).toMatch(/<StageBenchmarkSection\s*\/?>/);
    expect(src).toMatch(/<HumanReviewFlagsSection\s*\/?>/);
  });

  it("summary wires the folklore checks and the review flags", () => {
    const src = readSrc("app/showcase/atlassian/summary/page.tsx");
    expect(src).toMatch(/<FolkloreChecksSection\s*\/?>/);
    expect(src).toMatch(/<HumanReviewFlagsSection\s*\/?>/);
  });

  it("no visitor-facing walkthrough copy claims zero founder dilution", () => {
    // Corrected 2026-07-31: the prospectus supports retained voting control
    // via the dual-class structure, not zero dilution.
    for (const step of ATLASSIAN_WALKTHROUGH) {
      expect(step.guideText, `step ${step.n}`).not.toMatch(/zero founder dilution/i);
      expect(step.title, `step ${step.n}`).not.toMatch(/zero founder dilution/i);
    }
    expect(readSrc("app/showcase/atlassian/summary/page.tsx")).not.toMatch(
      /zero founder dilution/i,
    );
  });
});
