// accelerator/applicant-consent — the applicant consent screen text (G21 P2-C, moved by G25).
import { describe, expect, it } from "vitest";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";
import { APPLICANT_CONSENT_LABEL, APPLICANT_CONSENT_POINTS, APPLICANT_CONSENT_TEXT, APPLICANT_REVIEW_SENTENCE } from "./applicant-consent";

describe("APPLICANT_CONSENT_TEXT", () => {
  it("opens with the approved data sentence verbatim and says the program reviews on the Startup Value Index; you keep your data", () => {
    expect(APPLICANT_CONSENT_TEXT.startsWith(DATA_PRINCIPLE_SENTENCE)).toBe(true);
    expect(APPLICANT_CONSENT_TEXT).toContain("Your program is reviewing you on the Startup Value Index; you keep your data.");
    expect(APPLICANT_CONSENT_TEXT).toBe(`${DATA_PRINCIPLE_SENTENCE} ${APPLICANT_REVIEW_SENTENCE}`);
    expect(APPLICANT_CONSENT_LABEL).toMatch(/keep my data/);
    expect(APPLICANT_CONSENT_POINTS).toHaveLength(3);
  });
});
