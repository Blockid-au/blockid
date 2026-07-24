// P6a-ir-pack — pin the ch09 investor-readiness pack ESOP section shape
// so the Div 83A qualifying tests + gate envelope stay in lockstep with
// the shared module (web/src/lib/compliance/div83a-qualifying-tests.ts).

import { describe, it, expect } from "vitest";
import {
  buildEsopEligibilitySection,
  type EsopEligibilitySection,
} from "./esop-eligibility-section";
import {
  DIV83A_QUALIFYING_TESTS,
  DIV83A_QUALIFYING_TESTS_DISCLAIMER,
  div83aQualifyingTestsFor,
} from "@/lib/compliance/div83a-qualifying-tests";

// Mirror of GATE_DISCLAIMER (re-export of the qualifying-tests
// disclaimer). Inlined here to avoid pulling in the gate module's
// analytics/server "server-only" import at vitest boot.
const GATE_DISCLAIMER = DIV83A_QUALIFYING_TESTS_DISCLAIMER;

const OK_GATE = { ok: true, disclaimer: GATE_DISCLAIMER } as const;
const WARN_GATE = {
  ok: true,
  warn: {
    reason: "unchecked_grants" as const,
    message: "2 active ESOP grants have never been run through the Div 83A checker.",
    url_to_fix: "/workspace/esop/grants",
  },
  disclaimer: GATE_DISCLAIMER,
} as const;
const BLOCK_GATE = {
  ok: false as const,
  reason: "grants_ineligible" as const,
  url_to_fix: "/workspace/esop/grants",
  message: "1 active ESOP grant failed the Div 83A start-up concession check.",
  disclaimer: GATE_DISCLAIMER,
};

describe("buildEsopEligibilitySection", () => {
  it("returns the 8 Div 83A qualifying tests in canonical statute order", () => {
    const section = buildEsopEligibilitySection(OK_GATE, "en");
    expect(section.tests).toHaveLength(8);
    expect(section.tests.map((t) => t.key)).toEqual(
      DIV83A_QUALIFYING_TESTS.map((t) => t.key),
    );
    expect(section.tests.map((t) => t.section)).toEqual(
      DIV83A_QUALIFYING_TESTS.map((t) => t.section),
    );
  });

  it("maps ok gate (no warn) to status:'ok' with null message + url", () => {
    const section: EsopEligibilitySection = buildEsopEligibilitySection(
      OK_GATE,
      "en",
    );
    expect(section.status).toBe("ok");
    expect(section.message).toBeNull();
    expect(section.urlToFix).toBeNull();
    expect(section.disclaimer).toBe(DIV83A_QUALIFYING_TESTS_DISCLAIMER);
  });

  it("maps warn envelope to status:'warn' with the gate reason + url", () => {
    const section = buildEsopEligibilitySection(WARN_GATE, "en");
    expect(section.status).toBe("warn");
    expect(section.message).toContain("2 active ESOP grants");
    expect(section.urlToFix).toBe("/workspace/esop/grants");
  });

  it("maps ok:false envelope to status:'block' with the block message + url", () => {
    const section = buildEsopEligibilitySection(BLOCK_GATE, "en");
    expect(section.status).toBe("block");
    expect(section.message).toContain("failed the Div 83A start-up concession");
    expect(section.urlToFix).toBe("/workspace/esop/grants");
  });

  it("switches description strings by locale but keeps keys stable", () => {
    const en = buildEsopEligibilitySection(OK_GATE, "en");
    const vi = buildEsopEligibilitySection(OK_GATE, "vi");
    expect(en.tests.map((t) => t.key)).toEqual(vi.tests.map((t) => t.key));
    expect(en.tests.map((t) => t.description)).toEqual([
      ...div83aQualifyingTestsFor("en"),
    ]);
    expect(vi.tests.map((t) => t.description)).toEqual([
      ...div83aQualifyingTestsFor("vi"),
    ]);
  });
});
