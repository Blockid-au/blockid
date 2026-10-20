import { describe, expect, it } from "vitest";
import { ACCEPT_QUALITY_FLOOR, aggregateCaseScores, parseModelJson, percentile, scoreModelCase, type CaseScore, type ModelEvalCase } from "./model-eval-scoring";
import { TASK_PROFILES, type EvalCandidate } from "./task-profiles";

const EVIDENCE = [
  { id: "e1", label: "Stripe export", text: "Monthly recurring revenue was A$42,300 in September 2026." },
  { id: "e2", label: "CRM export", text: "118 paying customers as of 30 September 2026." },
  { id: "e3", label: "Management accounts", text: "Gross margin was 71% for FY2026." },
];

const chapterCase: ModelEvalCase = {
  id: "rc-1",
  lang: "en",
  section: "traction",
  input: { company: "Wattle Labs", section: "traction", evidence: EVIDENCE },
  expected: { must_keep: [], must_mention_any: [], must_not_mention: ["guaranteed return"], critical_claims: [], min_citations: 2 },
};

const ok = (data: unknown, extra: Partial<{ latencyMs: number; costUsd: number }> = {}) => ({ ok: true, text: JSON.stringify(data), latencyMs: extra.latencyMs ?? 1000, costUsd: extra.costUsd ?? 0.001 });

const goodChapter = {
  verdict: "Revenue traction is early but real: MRR of A$42,300 [ev:e1].",
  strengths: ["118 paying customers [ev:e2]", "Gross margin of 71% [ev:e3]"],
  gaps: ["No cohort retention data was provided [unevidenced]."],
  criterion_cards: [
    { criterion: "Revenue", verdict: "MRR A$42,300.", citations: ["e1"] },
    { criterion: "Margin", verdict: "Gross margin 71%.", citations: ["e3"] },
  ],
};

describe("parseModelJson", () => {
  it("reads plain, fenced and prose-wrapped JSON; null otherwise", () => {
    expect(parseModelJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseModelJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(parseModelJson('Sure! {"a":3} hope it helps')).toEqual({ a: 3 });
    expect(parseModelJson("[1,2]")).toBeNull();
    expect(parseModelJson("no json")).toBeNull();
    expect(parseModelJson("")).toBeNull();
  });
});

describe("scoreModelCase — report chapter", () => {
  const p = TASK_PROFILES.report_chapter;

  it("a fully cited answer is accepted with groundedShare 1", () => {
    const s = scoreModelCase(p, chapterCase, ok(goodChapter));
    expect(s).toMatchObject({ ok: true, schemaOk: true, critical: [], numericOk: true, accepted: true });
    expect(s.groundedShare).toBe(1);
    expect(s.quality).toBe(1);
  });

  it("a citation id the input never offered is a CRITICAL error (quality 0, not accepted)", () => {
    const bad = { ...goodChapter, strengths: ["118 paying customers [ev:e9]"] };
    const s = scoreModelCase(p, chapterCase, ok(bad));
    expect(s.critical).toContain("fabricated_citation: e9");
    expect(s.quality).toBe(0);
    expect(s.accepted).toBe(false);
  });

  it("an invented figure fails the numeric check and grounding", () => {
    const bad = { ...goodChapter, verdict: "MRR of A$55,000 [ev:e1] is strong." };
    const s = scoreModelCase(p, chapterCase, ok(bad));
    expect(s.numericOk).toBe(false);
    expect(s.groundedShare).toBeLessThan(1);
    expect(s.accepted).toBe(false);
  });

  it("uncited material claims lower groundedShare below the 0.85 gate", () => {
    const bad = { verdict: "MRR is A$42,300.", strengths: ["118 customers", "71% margin"], gaps: ["Churn unknown"], criterion_cards: [{ criterion: "x", verdict: "A$42,300 MRR", citations: [] }] };
    const s = scoreModelCase(p, chapterCase, ok(bad));
    expect(s.groundedShare).not.toBeNull();
    expect(s.groundedShare!).toBeLessThan(0.85);
    expect(s.accepted).toBe(false);
  });

  it("forbidden content is critical", () => {
    const s = scoreModelCase(p, chapterCase, ok({ ...goodChapter, gaps: ["A guaranteed return for investors."] }));
    expect(s.critical[0]).toMatch(/forbidden/);
  });

  it("schema failure and transport failure are distinguished", () => {
    const schema = scoreModelCase(p, chapterCase, ok({ verdict: "x" }));
    expect(schema).toMatchObject({ ok: true, schemaOk: false, accepted: false, quality: 0 });
    const notJson = scoreModelCase(p, chapterCase, { ok: true, text: "I cannot", latencyMs: 5, costUsd: 0 });
    expect(notJson).toMatchObject({ ok: true, schemaOk: false, error: "not JSON" });
    const dead = scoreModelCase(p, chapterCase, { ok: false, text: "", latencyMs: 5, costUsd: 0, error: "HTTP 404" });
    expect(dead).toMatchObject({ ok: false, schemaOk: false, error: "HTTP 404" });
  });

  it("an answer over the per-output cost ceiling is not accepted", () => {
    const s = scoreModelCase(p, chapterCase, ok(goodChapter, { costUsd: 0.5 }));
    expect(s.quality).toBe(1);
    expect(s.accepted).toBe(false);
  });
});

describe("scoreModelCase — other tasks", () => {
  it("grounding judge: accuracy vs labels; passing an invented figure is critical", () => {
    const c: ModelEvalCase = {
      id: "gj", lang: "en", section: "grounding",
      input: { evidence: EVIDENCE, claims: [] },
      expected: { must_keep: [], must_mention_any: [], must_not_mention: [], claim_labels: { c1: true, c2: false }, critical_claims: ["c2"] },
    };
    const good = scoreModelCase(TASK_PROFILES.grounding_judge, c, ok({ verdicts: [{ id: "c1", supported: true, reason: "" }, { id: "c2", supported: false, reason: "" }] }));
    expect(good).toMatchObject({ quality: 1, accepted: true, numericOk: true });
    const bad = scoreModelCase(TASK_PROFILES.grounding_judge, c, ok({ verdicts: [{ id: "c1", supported: true }, { id: "c2", supported: true }] }));
    expect(bad.critical).toEqual(["passed_invented_figure: c2"]);
    expect(bad.accepted).toBe(false);
  });

  it("extraction: a value the document never stated is critical; numbers within 1 %", () => {
    const c: ModelEvalCase = {
      id: "ex", lang: "vi", section: "fields", input: { document: "..." },
      expected: { must_keep: [], must_mention_any: [], must_not_mention: [], critical_claims: [], fields: { company_name: "Wattle Labs", founded_year: 2021, employees: null, revenue_aud: 1_200_000, funding_raised_aud: null, sector: "agritech" } },
    };
    const good = scoreModelCase(TASK_PROFILES.extraction, c, ok({ company_name: "Wattle Labs Pty Ltd", founded_year: 2021, employees: null, revenue_aud: 1_200_000, funding_raised_aud: null, sector: "agritech" }));
    expect(good).toMatchObject({ quality: 1, accepted: true, numericOk: true });
    const fab = scoreModelCase(TASK_PROFILES.extraction, c, ok({ company_name: "Wattle Labs", founded_year: 2021, employees: 12, revenue_aud: 1_200_000, funding_raised_aud: null, sector: "agritech" }));
    expect(fab.critical).toEqual(["fabricated_field: employees"]);
    const wrongNum = scoreModelCase(TASK_PROFILES.extraction, c, ok({ company_name: "Wattle Labs", founded_year: 2021, employees: null, revenue_aud: 120_000, funding_raised_aud: null, sector: "agritech" }));
    expect(wrongNum.numericOk).toBe(false);
    expect(wrongNum.accepted).toBe(false);
  });

  it("classify: sector 0.6 + stage 0.4; enum enforced by the schema gate", () => {
    const c: ModelEvalCase = { id: "cl", lang: "en", section: "saas", input: { text: "x" }, expected: { must_keep: [], must_mention_any: [], must_not_mention: [], critical_claims: [], label: { sector: "saas", stage: "seed" } } };
    expect(scoreModelCase(TASK_PROFILES.classify, c, ok({ sector: "saas", stage: "seed" })).quality).toBe(1);
    expect(scoreModelCase(TASK_PROFILES.classify, c, ok({ sector: "saas", stage: "idea" })).quality).toBe(0.6);
    expect(scoreModelCase(TASK_PROFILES.classify, c, ok({ sector: "saas", stage: "idea" })).accepted).toBe(true);
    expect(scoreModelCase(TASK_PROFILES.classify, c, ok({ sector: "fintech", stage: "seed" })).accepted).toBe(false);
    expect(scoreModelCase(TASK_PROFILES.classify, c, ok({ sector: "crypto", stage: "seed" })).schemaOk).toBe(false);
  });

  it("translation: figures + markers kept verbatim; a new marker is critical", () => {
    const text = "MRR of A$42,300 [ev:e1] and margin 71% [ev:e3] per BlockID SVI.";
    const c: ModelEvalCase = { id: "tr", lang: "vi", section: "en->vi", input: { source_lang: "en", target_lang: "vi", text }, expected: { must_keep: ["A$42,300", "71%", "[ev:e1]", "[ev:e3]", "BlockID", "SVI"], must_mention_any: ["biên lợi nhuận"], must_not_mention: [], critical_claims: [] } };
    const good = scoreModelCase(TASK_PROFILES.translation, c, ok({ translation: "MRR đạt A$42,300 [ev:e1] và biên lợi nhuận 71% [ev:e3] theo BlockID SVI." }));
    expect(good).toMatchObject({ quality: 1, numericOk: true, accepted: true });
    const lost = scoreModelCase(TASK_PROFILES.translation, c, ok({ translation: "MRR đạt 42.300 đô la [ev:e1] và biên lợi nhuận 71% [ev:e3] theo BlockID SVI." }));
    expect(lost.numericOk).toBe(false);
    const added = scoreModelCase(TASK_PROFILES.translation, c, ok({ translation: "MRR A$42,300 [ev:e1] [ev:e7], biên lợi nhuận 71% [ev:e3] BlockID SVI." }));
    expect(added.critical).toEqual(["fabricated_citation: e7"]);
  });

  it("vision: values by label within tolerance", () => {
    const c: ModelEvalCase = { id: "v", lang: "en", section: "monthly", input: { image: "img/x.png" }, expected: { must_keep: [], must_mention_any: [], must_not_mention: [], critical_claims: [], values: [{ label: "Jan", value: 42.5, tol: 0.05 }, { label: "Feb", value: 30, tol: 0.05 }] } };
    expect(scoreModelCase(TASK_PROFILES.vision, c, ok({ title: "t", values: [{ label: "jan", value: 42.5 }, { label: "Feb", value: 30 }] }))).toMatchObject({ quality: 1, numericOk: true, accepted: true });
    const half = scoreModelCase(TASK_PROFILES.vision, c, ok({ values: [{ label: "Jan", value: 42.5 }, { label: "Feb", value: 31 }] }));
    expect(half.quality).toBe(0.5);
    expect(half.accepted).toBe(false);
    expect(ACCEPT_QUALITY_FLOOR).toBe(0.6);
  });
});

describe("aggregateCaseScores", () => {
  const cand: EvalCandidate = { provider: "deepinfra", model: "m", family: "f", billing: "paid", tier: "primary", vision: false };
  const s = (o: Partial<CaseScore>): CaseScore => ({ caseId: "x", lang: "en", section: "a", ok: true, schemaOk: true, critical: [], groundedShare: null, numericOk: null, quality: 1, accepted: true, latencyMs: 1000, costUsd: 0.001, ...o });

  it("rolls up quality, accept rate, schema-fail (answered only), p95, cost/accepted, language + section detail", () => {
    const rows = [
      s({ caseId: "1", lang: "en", section: "a", latencyMs: 1000 }),
      s({ caseId: "2", lang: "vi", section: "b", latencyMs: 2000, quality: 0.5, accepted: false }),
      s({ caseId: "3", lang: "vi", section: "b", ok: false, schemaOk: false, quality: 0, accepted: false, latencyMs: 0, costUsd: 0 }),
      s({ caseId: "4", lang: "en", section: "a", schemaOk: false, quality: 0, accepted: false, latencyMs: 9000 }),
    ];
    const a = aggregateCaseScores(TASK_PROFILES.classify, cand, rows);
    expect(a.n).toBe(4);
    expect(a.transportFails).toBe(1);
    expect(a.schemaFails).toBe(1);
    expect(a.schemaFailRate).toBeCloseTo(1 / 3, 3);
    expect(a.quality).toBe(0.375);
    expect(a.accepted).toBe(1);
    expect(a.costPerAccepted).toBeCloseTo(0.003, 8);
    expect(a.p95LatencyMs).toBe(9000);
    expect(a.byLanguage.en?.n).toBe(2);
    expect(a.byLanguage.vi?.quality).toBe(0.25);
    expect(Object.keys(a.bySection)).toEqual(["a", "b"]);
    expect(a.passesProfile).toBe(false);
    expect(a.failReasons.join(" ")).toMatch(/schema fail/);
    expect(a.dead).toBe(false);
  });

  it("dead = every call failed with a DEFINITIVE error (n ≥ 3); our own 429s / timeouts never make a model dead", () => {
    const fail = (error: string) => [1, 2, 3].map((i) => s({ caseId: String(i), ok: false, schemaOk: false, quality: 0, accepted: false, error }));
    const a = aggregateCaseScores(TASK_PROFILES.classify, cand, fail("HTTP 404: model not found"));
    expect(a).toMatchObject({ dead: true, transientFails: 0, schemaFailRate: 0, costPerAccepted: null });
    for (const e of ["HTTP 429: rate limit reached", "Worker timeout after 30000ms", "HTTP 503: overloaded", "empty content"]) {
      const t = aggregateCaseScores(TASK_PROFILES.classify, cand, fail(e));
      expect(t.dead, e).toBe(false);
      expect(t.transientFails, e).toBe(3);
    }
  });

  it("percentile is nearest-rank", () => {
    expect(percentile([], 95)).toBeNull();
    expect(percentile([5], 95)).toBe(5);
    expect(percentile(Array.from({ length: 20 }, (_, i) => i + 1), 95)).toBe(19);
    expect(percentile(Array.from({ length: 20 }, (_, i) => i + 1), 50)).toBe(10);
  });
});
