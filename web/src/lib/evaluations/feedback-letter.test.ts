// Colocated vitest for the founder feedback letter (G14-S34, goal doc D3 /
// F-5). Pins: the k-floor (k < 3 → null; 3 assessors from 1 org → null; a
// NULL org counts as its own; opt-out / draft / unshared rows never count;
// highest version per seat), the aggregate (means, 25 % share rounding,
// risk buckets carry titles only, questions deduped case/space-insensitively
// and capped at 8), the forbidden-key walk (nothing from
// FOUNDER_FORBIDDEN_FIELDS, no note bodies, no seat / org ids), the EN + VI
// render (≤ 350 words, weakest dimension first, "what to add next"), and
// the next-action mapping (feedbackWeakestDim → recommender impact +
// CTO actions filtered to that dimension, top 3).

import { describe, expect, it } from "vitest";
import type { EvaluationAssessment } from "./assessments";
import {
  FEEDBACK_FORBIDDEN_KEYS,
  FEEDBACK_LETTER_MAX_WORDS,
  aggregateAssessments,
  eligibleGroups,
  findForbiddenKey,
  letterToNextActions,
  normaliseText,
  orgKeyOf,
  renderLetter,
  roundShare,
  wordCount,
} from "./feedback-letter";

let seq = 0;
function row(over: Partial<EvaluationAssessment> & { assessorUserId: string }): EvaluationAssessment {
  seq++;
  return {
    id: over.id ?? `a-${seq}`,
    evaluationId: over.evaluationId ?? `e-${over.assessorUserId}`,
    projectId: "p-1",
    orgId: null,
    snapshotId: null,
    version: 1,
    status: "submitted",
    decision: "track",
    conviction: 4,
    thesisFitPct: 60,
    dimensionRatings: { FTV: { rating: 4, stance: "agree", note: "SECRET-NOTE" }, TRE: { rating: 2, stance: "disagree", note: "SECRET-NOTE" } },
    criterionRatings: { idea: { stance: "agree", note: "SECRET-NOTE" } },
    valuationView: { low_aud: 1, high_aud: 2, method_note: "SECRET-NOTE" },
    risks: [{ title: "  no  recurring revenue ", severity: "high", dimension: "TRE", note: "SECRET-NOTE", source: "evaluator" }],
    questionsForFounder: [{ text: "What is your churn?", dimension: "TRE" }],
    privateNotes: "SECRET-PRIVATE",
    sharedNotes: "SECRET-SHARED",
    sharedFields: ["dimension_ratings", "risks", "questions_for_founder"],
    sharedWithFounderAt: "2026-09-10T00:00:00.000Z",
    submittedAt: `2026-09-1${seq % 9}T00:00:00.000Z`,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...over,
  };
}

const THREE = () => [row({ assessorUserId: "u1", orgId: "org-a" }), row({ assessorUserId: "u2", orgId: "org-a" }), row({ assessorUserId: "u3", orgId: "org-b" })];

describe("eligibleGroups — the k-floor (D3 / F-5)", () => {
  it("k < 3 → null; 3 assessors from ONE org → null", () => {
    expect(eligibleGroups([row({ assessorUserId: "u1" }), row({ assessorUserId: "u2", orgId: "org-b" })])).toBeNull();
    expect(eligibleGroups([row({ assessorUserId: "u1", orgId: "org-a" }), row({ assessorUserId: "u2", orgId: "org-a" }), row({ assessorUserId: "u3", orgId: "org-a" })])).toBeNull();
  });

  it("3 assessors, 2 orgs → group; a NULL org counts as its own organisation", () => {
    const g = eligibleGroups(THREE());
    expect(g).not.toBeNull();
    expect(g!.k).toBe(3);
    expect(g!.orgCount).toBe(2);
    const nulls = eligibleGroups([row({ assessorUserId: "u1" }), row({ assessorUserId: "u2" }), row({ assessorUserId: "u3" })]);
    expect(nulls?.orgCount).toBe(3);
    expect(orgKeyOf({ orgId: null, assessorUserId: "u9" })).toBe("seat:u9");
    expect(orgKeyOf({ orgId: "o", assessorUserId: "u9" })).toBe("org:o");
  });

  it("drafts, opted-out, unshared and ratings-not-shared rows never count; the highest version per seat wins", () => {
    const base = THREE();
    expect(eligibleGroups([...base.slice(0, 2), row({ assessorUserId: "u3", orgId: "org-b", status: "draft" })])).toBeNull();
    expect(eligibleGroups([...base.slice(0, 2), row({ assessorUserId: "u3", orgId: "org-b", feedbackOptOut: true })])).toBeNull();
    expect(eligibleGroups([...base.slice(0, 2), row({ assessorUserId: "u3", orgId: "org-b", sharedWithFounderAt: null, sharedFields: [] })])).toBeNull();
    expect(eligibleGroups([...base.slice(0, 2), row({ assessorUserId: "u3", orgId: "org-b", sharedFields: ["risks"] })])).toBeNull();
    // same seat twice = one assessor (v2 wins)
    const dup = eligibleGroups([...base, row({ assessorUserId: "u1", orgId: "org-a", version: 2, dimensionRatings: { FTV: { rating: 1, stance: "disagree" } } })]);
    expect(dup!.k).toBe(3);
    expect(dup!.rows.find((r) => r.assessorUserId === "u1")!.version).toBe(2);
    // an opted-out v2 hides the seat entirely (never falls back to v1)
    expect(eligibleGroups([...base, row({ assessorUserId: "u1", orgId: "org-a", version: 2, feedbackOptOut: true })])).toBeNull();
  });
});

describe("aggregateAssessments", () => {
  it("throws under the floor; carries k, orgCount and the evaluation ids (never seat ids)", () => {
    expect(() => aggregateAssessments([row({ assessorUserId: "u1" })])).toThrow(/k-floor/);
    const agg = aggregateAssessments(THREE(), { now: new Date("2026-09-20T22:00:00Z") });
    expect(agg.k).toBe(3);
    expect(agg.orgCount).toBe(2);
    expect(agg.evaluationIds.sort()).toEqual(["e-u1", "e-u2", "e-u3"]);
    expect(agg.generatedAt).toBe("2026-09-20T22:00:00.000Z");
  });

  it("per-dimension mean + agree share rounded to 25 % steps; weakest / strongest resolved", () => {
    const rows = [
      row({ assessorUserId: "u1", orgId: "a", dimensionRatings: { FTV: { rating: 5, stance: "agree" }, TRE: { rating: 1, stance: "disagree" }, MPC: { rating: 3, stance: "unsure" } } }),
      row({ assessorUserId: "u2", orgId: "a", dimensionRatings: { FTV: { rating: 4, stance: "agree" }, TRE: { rating: 2, stance: "agree" }, MPC: { rating: 3, stance: "agree" } } }),
      row({ assessorUserId: "u3", orgId: "b", dimensionRatings: { FTV: { rating: 4, stance: "disagree" }, TRE: { rating: 2, stance: "unsure" }, MPC: { rating: 4, stance: "agree" } } }),
    ];
    const agg = aggregateAssessments(rows);
    const by = Object.fromEntries(agg.dimensions.map((d) => [d.key, d]));
    expect(by.FTV).toMatchObject({ n: 3, mean: 4.3, agreePct: 75, disagreePct: 25 }); // 2/3 → 66.7 → 75; 1/3 → 25
    expect(by.TRE).toMatchObject({ n: 3, mean: 1.7, agreePct: 25, disagreePct: 25 });
    expect(by.MPC).toMatchObject({ n: 3, mean: 3.3, agreePct: 75, disagreePct: 0 });
    expect(by.PTD).toMatchObject({ n: 0, mean: null, agreePct: null, disagreePct: null });
    expect(agg.weakestDim).toBe("TRE");
    expect(agg.strongestDim).toBe("FTV");
    for (const d of agg.dimensions) {
      if (d.agreePct != null) expect([0, 25, 50, 75, 100]).toContain(d.agreePct);
    }
    expect(roundShare(0.34)).toBe(25);
    expect(roundShare(0.38)).toBe(50);
    expect(roundShare(1)).toBe(100);
    expect(roundShare(-1)).toBe(0);
  });

  it("risks bucket by dimension with counts + normalised titles only; questions dedupe case/space-insensitively and cap at 8", () => {
    const rows = THREE();
    rows[1].risks = [
      { title: "No recurring revenue", severity: "critical", dimension: "TRE", note: "SECRET", source: "ai" },
      { title: "Key-person risk", severity: "low", source: "evaluator" },
    ];
    rows[2].risks = [{ title: "Key-Person Risk", severity: "medium", note: "SECRET", source: "evaluator" }];
    rows[0].questionsForFounder = Array.from({ length: 9 }, (_, i) => ({ text: `Question number ${i}?` }));
    rows[1].questionsForFounder = [{ text: "what   is your CHURN ?" }];
    const agg = aggregateAssessments(rows);
    const tre = agg.risks.find((b) => b.dimension === "TRE")!;
    // rows[0] + rows[1] file a TRE risk (rows[2] only the general one); "  no  recurring revenue " normalises onto "No recurring revenue"
    expect(tre).toEqual({ dimension: "TRE", count: 2, highOrCritical: 2, titles: ["No recurring revenue"] });
    const general = agg.risks.find((b) => b.dimension === "general")!;
    expect(general).toMatchObject({ dimension: "general", count: 2, highOrCritical: 0 });
    expect(general.titles.map(normaliseText)).toEqual(["key person risk"]); // "Key-person risk" + "Key-Person Risk" collapse to one title
    expect(agg.risks[0].dimension).toBe("TRE"); // most high/critical first
    expect(agg.questions.length).toBe(8);
    const churn = agg.questions.find((q) => normaliseText(q.text) === "what is your churn");
    // rows[1] ("what   is your CHURN ?") + rows[2] ("What is your churn?") merge; rows[0]'s questions were replaced above
    expect(churn).toEqual({ text: "What is your churn?", dimension: "TRE", asked: 2 });
    expect(agg.questions[0]).toBe(churn); // most-asked first
    expect(JSON.stringify(agg)).not.toContain("SECRET");
  });

  it("the JSON walk carries nothing from FOUNDER_FORBIDDEN_FIELDS, no note body and no seat / org id", () => {
    const agg = aggregateAssessments(THREE());
    const json = JSON.stringify(agg);
    for (const k of FEEDBACK_FORBIDDEN_KEYS) expect(json, k).not.toContain(`"${k}"`);
    // seat ids / org ids never appear (evaluation ids "e-u1" are allowed — they name the evaluation, not the seat)
    expect(json).not.toMatch(/SECRET|"u[123]"|org-a|org-b/);
    expect(json).not.toContain('"a-');
    expect(findForbiddenKey(agg)).toBeNull();
    expect(findForbiddenKey({ dimensions: [{ key: "FTV", note: "x" }] })).toBe("dimensions[0].note");
    expect(findForbiddenKey({ a: { assessorUserId: "u" } })).toBe("a.assessorUserId");
    expect(findForbiddenKey({ a: { shared_notes: "u" } })).toBe("a.shared_notes");
  });
});

describe("renderLetter", () => {
  const agg = aggregateAssessments(THREE(), { now: new Date("2026-09-20T22:00:00Z") });

  it("EN: mentoring tone, ≤ 350 words, weakest dimension first, 'what to add next', privacy line, no leak", () => {
    const md = renderLetter(agg, "en", { startupName: "Acme" });
    expect(md.startsWith("## What investors said")).toBe(true);
    expect(md).toContain("3 evaluators from 2 organisations recorded a verdict on Acme");
    // weakest (TRE 2.0) appears before the strongest (FTV 4.0)
    expect(md.indexOf("Traction")).toBeLessThan(md.indexOf("Founder"));
    expect(md).toContain("### Start here");
    expect(md).toContain("**Traction & Revenue Evidence** lowest — 2.0/5");
    expect(md).toContain("### What to add next");
    expect(md).toContain("No recurring revenue");
    expect(md).toContain("What is your churn?");
    expect(md).toContain("Individual evaluators are never identified");
    expect(wordCount(md)).toBeLessThanOrEqual(FEEDBACK_LETTER_MAX_WORDS);
    expect(md).not.toMatch(/SECRET|u1|org-a|track|conviction/);
  });

  it("VI: the Vietnamese catalogue + titleVi dimension names, same structure, ≤ 350 words", () => {
    const md = renderLetter(agg, "vi");
    expect(md.startsWith("## Nhà đầu tư nói gì")).toBe(true);
    expect(md).toContain("3 người đánh giá từ 2 tổ chức");
    expect(md).toContain("startup của bạn");
    expect(md).toContain("### Bắt đầu từ đây");
    expect(md).toContain("### Nên bổ sung gì tiếp theo");
    expect(md).not.toContain("What investors said");
    expect(wordCount(md)).toBeLessThanOrEqual(FEEDBACK_LETTER_MAX_WORDS);
  });

  it("a worst case (8 dims, 3 buckets with 3 titles, 8 questions) still fits the word ceiling", () => {
    const rows = THREE().map((r) => ({
      ...r,
      dimensionRatings: Object.fromEntries(["FTV", "MPC", "PTD", "TRE", "CGH", "IRI", "LCO", "SVM"].map((k) => [k, { rating: 3, stance: "agree" }])) as EvaluationAssessment["dimensionRatings"],
      risks: ["FTV", "MPC", "TRE"].flatMap((d) => [1, 2, 3].map((i) => ({ title: `A fairly long risk title about ${d} number ${i}`, severity: "high" as const, dimension: d as "FTV", source: "ai" as const }))),
      questionsForFounder: Array.from({ length: 8 }, (_, i) => ({ text: `Could you walk us through question number ${i} in some detail please?` })),
    }));
    const md = renderLetter(aggregateAssessments(rows), "en");
    expect(wordCount(md)).toBeLessThanOrEqual(FEEDBACK_LETTER_MAX_WORDS);
  });
});

describe("letterToNextActions", () => {
  const agg = aggregateAssessments(THREE());

  it("maps the weakest dimension into the recommender signal + impact and filters the CTO library to that dimension (top 3, with hrefs)", () => {
    const out = letterToNextActions(agg, { totalSVI: 62, stage: 2, subs: { tre: 80, ftv: 40 }, growthPhaseId: "customer_dev" });
    expect(out.feedbackWeakestDim).toBe("TRE");
    expect(out.signals).toEqual({ feedbackWeakestDim: "TRE" });
    expect(out.step.impact?.feedbackWeakestDim).toBe("TRE");
    expect(out.step.href).toBe("/workspace/evidence"); // customer_dev step
    expect(out.actions.length).toBeGreaterThan(0);
    expect(out.actions.length).toBeLessThanOrEqual(3);
    for (const a of out.actions) {
      expect(a.dimension).toBe("TRE");
      expect(a.href).toBe("/workspace/finance/revenue");
      expect(a.sviBenefit).toBeGreaterThan(0);
      expect(a.title).toBeTruthy();
    }
    // sorted P0 first / benefit desc — the first is the biggest lift
    expect(out.actions[0].sviBenefit).toBeGreaterThanOrEqual(out.actions[out.actions.length - 1].sviBenefit);
  });

  it("no SVI yet → phase-0 step, actions still surfaced for the weakest dimension; nothing rated → no actions", () => {
    const out = letterToNextActions(agg, null);
    expect(out.step.href).toBe("/analyze");
    expect(out.actions.length).toBe(3);
    const none = letterToNextActions({ ...agg, weakestDim: null, dimensions: agg.dimensions.map((d) => ({ ...d, mean: null, n: 0 })) }, null);
    expect(none.feedbackWeakestDim).toBeNull();
    expect(none.actions).toEqual([]);
    expect(none.step.impact?.feedbackWeakestDim).toBeUndefined();
  });
});
