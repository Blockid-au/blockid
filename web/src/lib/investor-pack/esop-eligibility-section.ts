// ESOP (Div 83A) eligibility section for the ch09 investor-readiness pack.
//
// Closes the P6a-ir-pack follow-up in
// docs/plans/atlassian-standard-mapping-goal.md §P6: the 8-point Div 83A
// start-up concession qualifying tests already fed Chapter 8 (guide body)
// and the Div 83A funding gate; the investor pack assembled at Chapter 9
// needs the same list surfaced so an investor reading the pack sees the
// scheme the founder is claiming under.
//
// Pure — takes the Div 83A gate result envelope and returns the JSON
// section the pack renders. Never hits Supabase / network. The assembler
// stays responsible for calling the gate and passing the result in.
//
// Legal: identical disclaimer surface as the Chapter 8 checklist + the
// funding gate. General information only; every consumer must render the
// disclaimer alongside the tests.

import {
  DIV83A_QUALIFYING_TESTS,
  DIV83A_QUALIFYING_TESTS_DISCLAIMER,
  type Div83AQualifyingTest,
} from "@/lib/compliance/div83a-qualifying-tests";
import type { Div83AGateResult } from "@/lib/compliance/div83a-funding-gate";

export type EsopEligibilityStatus = "ok" | "warn" | "block";

export interface EsopEligibilityTest {
  key: Div83AQualifyingTest["key"];
  section: Div83AQualifyingTest["section"];
  description: string;
}

export interface EsopEligibilitySection {
  status: EsopEligibilityStatus;
  /** Human-readable warn/block explanation. Empty on the ok happy path. */
  message: string | null;
  /** Fix-me URL from the gate (workspace deep-link), null on the ok path. */
  urlToFix: string | null;
  /** 8-point Div 83A qualifying tests in canonical statute order. */
  tests: ReadonlyArray<EsopEligibilityTest>;
  disclaimer: string;
}

/**
 * Map a Div 83A gate result to the pack section. Locale switches only the
 * plain-language description string — key + statute section stay stable so
 * the pack can be filtered / linked by test key regardless of locale.
 */
export function buildEsopEligibilitySection(
  gateResult: Div83AGateResult,
  locale: "en" | "vi" = "en",
): EsopEligibilitySection {
  const tests: EsopEligibilityTest[] = DIV83A_QUALIFYING_TESTS.map((t) => ({
    key: t.key,
    section: t.section,
    description: locale === "vi" ? t.vi : t.en,
  }));

  if (gateResult.ok === false) {
    return {
      status: "block",
      message: gateResult.message,
      urlToFix: gateResult.url_to_fix,
      tests,
      disclaimer: DIV83A_QUALIFYING_TESTS_DISCLAIMER,
    };
  }

  if (gateResult.warn) {
    return {
      status: "warn",
      message: gateResult.warn.message,
      urlToFix: gateResult.warn.url_to_fix,
      tests,
      disclaimer: DIV83A_QUALIFYING_TESTS_DISCLAIMER,
    };
  }

  return {
    status: "ok",
    message: null,
    urlToFix: null,
    tests,
    disclaimer: DIV83A_QUALIFYING_TESTS_DISCLAIMER,
  };
}
