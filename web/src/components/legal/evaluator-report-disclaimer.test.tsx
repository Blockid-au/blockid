// Colocated tests for EvaluatorReportDisclaimer (T0275). Uses
// renderToStaticMarkup — this workspace does not install
// @testing-library/react (see components/analyze/stage-banner.test.tsx).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { DISCLAIMER_SURFACES } from "@/lib/legal/surfaces";
import {
  EVALUATOR_REPORT_SURFACE,
  EvaluatorReportDisclaimer,
  evaluatorReportDisclaimerText,
} from "./evaluator-report-disclaimer";

function html(el: React.ReactElement): string {
  return renderToStaticMarkup(el);
}

/** The phrases counsel asked for, in the order a reader meets them. */
const REQUIRED_PHRASES = [
  "General information only",
  "not financial, investment, or legal advice",
  "indicative",
  "eligibility",
  "valuation",
  "not",
  "an approval",
  "Australian Financial Services Licence",
  "independent professional advice",
] as const;

describe("EvaluatorReportDisclaimer — source of truth", () => {
  it("renders the registry surface, not a private copy of the text", () => {
    expect(EVALUATOR_REPORT_SURFACE).toBe(DISCLAIMER_SURFACES.evaluator_report);
  });

  it("plain-text form carries every required phrase and no markdown markers", () => {
    const text = evaluatorReportDisclaimerText();
    for (const phrase of REQUIRED_PHRASES) {
      expect(text, phrase).toContain(phrase);
    }
    expect(text).not.toContain("**");
  });

  it("says a match is not an approval, in one sentence", () => {
    expect(evaluatorReportDisclaimerText()).toMatch(
      /match to a grant, program, or investor profile is not an approval/i,
    );
  });
});

describe("EvaluatorReportDisclaimer — block variant", () => {
  const out = html(<EvaluatorReportDisclaimer />);

  it("renders an aside tagged with the surface id", () => {
    expect(out).toContain("<aside");
    expect(out).toContain('data-surface="evaluator_report"');
    expect(out).toContain('aria-label="Evaluator report disclaimer"');
  });

  it("carries every required phrase into the markup", () => {
    for (const phrase of REQUIRED_PHRASES) {
      expect(out, phrase).toContain(phrase);
    }
  });

  it("bolds the lead sentence and strips the markdown markers", () => {
    expect(out).toMatch(/<strong[^>]*>General information only/);
    expect(out).not.toContain("**");
  });

  it("links to the full disclaimers by default, and to an override when given", () => {
    expect(out).toContain('href="/legal/disclaimers"');
    const custom = html(<EvaluatorReportDisclaimer learnMoreHref="/legal/privacy" />);
    expect(custom).toContain('href="/legal/privacy"');
  });
});

describe("EvaluatorReportDisclaimer — compact variant", () => {
  const out = html(<EvaluatorReportDisclaimer variant="compact" />);

  it("renders a single note paragraph, not an aside", () => {
    expect(out).toContain('role="note"');
    expect(out).not.toContain("<aside");
  });

  it("still carries the whole text — compact means smaller type, not fewer words", () => {
    for (const phrase of REQUIRED_PHRASES) {
      expect(out, phrase).toContain(phrase);
    }
  });
});
