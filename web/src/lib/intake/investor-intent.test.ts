import { describe, expect, it } from "vitest";
import { captureInvestorIntent } from "./investor-intent";

const at = "2026-09-23T00:00:00.000Z";

describe("captureInvestorIntent", () => {
  it("captures Vietnamese investor outputs without turning them into business facts", () => {
    const text = "Đánh giá doanh nghiệp cho nhà đầu tư: định giá, điểm mạnh, điểm yếu, rủi ro và các điểm cần làm rõ. So sánh với đối thủ tại thị trường Úc.";
    const result = captureInvestorIntent({ userText: text, submittedAt: at, locale: "vi" });
    expect(result.requestedOutputs.map((x) => x.output)).toEqual(expect.arrayContaining([
      "investment_view", "valuation", "strengths", "weaknesses", "risks", "points_to_clarify", "competitors", "market",
    ]));
    expect(result.geography).toMatchObject({ value: ["Australia"], provenance: "explicit" });
    expect(result.requestedOutputs.every((x) => x.spans.every((span) => text.slice(span.start, span.end) === span.text))).toBe(true);
  });

  it("records explicit questions and stage with exact spans", () => {
    const text = "We are at Series A. Is somebody already doing this better? Analyse valuation and downside risk.";
    const result = captureInvestorIntent({ userText: text, submittedAt: at, locale: "en" });
    expect(result.stage).toMatchObject({ value: "series_a", provenance: "explicit" });
    expect(result.userQuestions.map((x) => x.text)).toContain("Is somebody already doing this better?");
    expect(result.requestedOutputs.map((x) => x.output)).toEqual(expect.arrayContaining(["valuation", "risks"]));
  });

  it("recognises a natural-language request for points that need clarification", () => {
    const result = captureInvestorIntent({
      userText: "Assess valuation, risks and what should be clarified?",
      submittedAt: at,
      locale: "en",
    });
    expect(result.requestedOutputs.map((x) => x.output)).toEqual(expect.arrayContaining([
      "valuation", "risks", "points_to_clarify",
    ]));
  });

  it("uses an explicitly labelled inferred investor view when no request is stated", () => {
    const result = captureInvestorIntent({ userText: "We sell workflow software to clinics.", submittedAt: at });
    expect(result.requestedOutputs).toEqual([{ output: "investment_view", provenance: "inferred", spans: [] }]);
    expect(result.stage).toMatchObject({ value: null, provenance: "unknown" });
    expect(result.geography).toMatchObject({ value: null, provenance: "unknown" });
  });

  it("is deterministic for the same user authority payload", () => {
    const input = { userText: "Review risks and valuation for an Australian seed company.", submittedAt: at };
    expect(captureInvestorIntent(input).digestSha256).toBe(captureInvestorIntent(input).digestSha256);
    expect(captureInvestorIntent({ ...input, userText: `${input.userText} Compare competitors.` }).digestSha256).not.toBe(captureInvestorIntent(input).digestSha256);
  });
});
