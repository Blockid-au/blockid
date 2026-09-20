// G21 P3-C — reviewer signature: the pure block (name / role label / org /
// en-AU date / SVI_VERSION / override sentence / humans line) and its
// label · value lines for the PDF twin.

import { describe, expect, it } from "vitest";
import { SVI_VERSION } from "@/lib/svi-analysis";
import { HUMANS_DECIDE_LINE, buildReviewerSignature, overridesLine, reviewerRoleLabel, signatureLines } from "./signature";

describe("buildReviewerSignature", () => {
  it("maps a seat role to its label, keeps the org, formats the date in en-AU, defaults the methodology to SVI_VERSION", () => {
    const sig = buildReviewerSignature({ reviewerName: "  Pat Partner ", role: "investment_partner", organisation: "Acme Ventures", generatedAt: "2026-09-16T00:00:00.000Z", overridesCount: 2 });
    expect(sig).toEqual({
      name: "Pat Partner",
      role: "Investment partner",
      organisation: "Acme Ventures",
      date: "16 September 2026",
      methodologyVersion: SVI_VERSION,
      overrides: 2,
      overridesLine: "2 reviewer overrides recorded for this startup with a reason code, shown beside the canonical SVI and never replacing it.",
      humansLine: HUMANS_DECIDE_LINE,
    });
    expect(HUMANS_DECIDE_LINE).toContain("Humans make the decision.");
  });

  it("free-text roles pass through, an unknown reviewer gets a fallback role and an empty name; overrides null = not readable, 0 = none", () => {
    expect(reviewerRoleLabel("ic_member")).toBe("IC member");
    expect(reviewerRoleLabel("Program lead")).toBe("Program lead");
    expect(reviewerRoleLabel(null)).toBe("Evaluator");
    expect(reviewerRoleLabel("", "Program reviewer")).toBe("Program reviewer");
    const anon = buildReviewerSignature({ reviewerName: null, generatedAt: "2026-09-16T00:00:00.000Z", overridesCount: null, methodologyVersion: "2.9.0" });
    expect(anon).toMatchObject({ name: "", role: "Evaluator", organisation: null, methodologyVersion: "2.9.0", overrides: null });
    expect(anon.overridesLine).toBe(overridesLine(null));
    expect(overridesLine(0)).toBe("No dimension score was overridden by a reviewer for this startup.");
    expect(overridesLine(1)).toMatch(/^1 reviewer override recorded/);
    expect(buildReviewerSignature({ reviewerName: "x", generatedAt: "nope", overridesCount: -3 }).date).toBe("");
  });

  it("signatureLines: five label · value rows; an empty name prints a rule to sign; the org rides on the role", () => {
    const sig = buildReviewerSignature({ reviewerName: "", role: "fund_admin", organisation: "Fund A", generatedAt: "2026-09-16T00:00:00.000Z", overridesCount: 0 });
    expect(signatureLines(sig)).toEqual([
      { label: "Reviewer", value: "____________________" },
      { label: "Role", value: "Fund admin · Fund A" },
      { label: "Date", value: "16 September 2026" },
      { label: "Methodology", value: `Startup Value Index v${SVI_VERSION}` },
      { label: "Overrides", value: "0" },
    ]);
    expect(signatureLines(buildReviewerSignature({ reviewerName: "a", generatedAt: "2026-09-16T00:00:00.000Z", overridesCount: null }))[4]).toEqual({ label: "Overrides", value: "not available" });
  });
});
