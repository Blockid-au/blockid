import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIDENCE, OUTCOME_KINDS, OUTCOME_KIND_META, OUTCOME_SOURCES, isOutcomeKind, outcomeSummary, parseOutcomeInput } from "./types";

const NOW = new Date("2026-09-20T10:00:00.000Z");

describe("outcome vocabulary (G21 P3-A)", () => {
  it("eight kinds, five sources, meta + default confidence for each", () => {
    expect(OUTCOME_KINDS).toHaveLength(8);
    expect(OUTCOME_SOURCES).toHaveLength(5);
    for (const k of OUTCOME_KINDS) expect(OUTCOME_KIND_META[k].fields.length).toBeGreaterThan(0);
    for (const s of OUTCOME_SOURCES) expect(DEFAULT_CONFIDENCE[s]).toBeGreaterThan(0);
    expect(isOutcomeKind("funding_raised")).toBe(true);
    expect(isOutcomeKind("ipo")).toBe(false);
  });
});

describe("parseOutcomeInput", () => {
  it("rejects a bad kind, a missing / future / ancient date, an over-long note and an out-of-range confidence", () => {
    expect(parseOutcomeInput({ kind: "ipo", observedAt: "2026-09-01" }, NOW)).toMatchObject({ ok: false, field: "kind" });
    expect(parseOutcomeInput({ kind: "survival" }, NOW)).toMatchObject({ ok: false, field: "observedAt" });
    expect(parseOutcomeInput({ kind: "survival", observedAt: "2027-01-01" }, NOW)).toMatchObject({ ok: false, field: "observedAt" });
    expect(parseOutcomeInput({ kind: "survival", observedAt: "1999-01-01" }, NOW)).toMatchObject({ ok: false, field: "observedAt" });
    expect(parseOutcomeInput({ kind: "survival", observedAt: "2026-09-01", note: "x".repeat(2001) }, NOW)).toMatchObject({ ok: false, field: "note" });
    expect(parseOutcomeInput({ kind: "survival", observedAt: "2026-09-01", confidence: 120 }, NOW)).toMatchObject({ ok: false, field: "confidence" });
  });

  it("enforces per-kind required fields and coerces numbers / links; unknown value keys are dropped", () => {
    expect(parseOutcomeInput({ kind: "funding_raised", observedAt: "2026-09-01", value: {} }, NOW)).toMatchObject({ ok: false, field: "value.amount_aud" });
    const r = parseOutcomeInput({ kind: "funding_raised", observedAt: "2026-09-01", value: { amount_aud: "1,500,000", round: " seed ", source_url: "https://example.com/news", evil: "<script>" }, note: " closed in Aug " }, NOW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.input).toEqual({ kind: "funding_raised", observedAt: "2026-09-01T00:00:00.000Z", value: { amount_aud: 1_500_000, round: "seed", source_url: "https://example.com/news" }, note: "closed in Aug", confidence: null });
    expect(parseOutcomeInput({ kind: "funding_raised", observedAt: "2026-09-01", value: { amount_aud: 10, source_url: "javascript:alert(1)" } }, NOW)).toMatchObject({ ok: false, field: "value.source_url" });
    expect(parseOutcomeInput({ kind: "funding_raised", observedAt: "2026-09-01", value: { amount_aud: -5 } }, NOW)).toMatchObject({ ok: false, field: "value.amount_aud" });
  });

  it("derives growth_pct for revenue_growth and refuses shrinking headcount", () => {
    const r = parseOutcomeInput({ kind: "revenue_growth", observedAt: "2026-06-30", value: { mrr_from_aud: 1000, mrr_to_aud: 1300 } }, NOW);
    expect(r.ok && r.input.value.growth_pct).toBe(30);
    expect(parseOutcomeInput({ kind: "headcount_growth", observedAt: "2026-06-30", value: { fte_from: 5, fte_to: 3 } }, NOW)).toMatchObject({ ok: false, field: "value.fte_to" });
  });
});

describe("outcomeSummary", () => {
  it("one line per kind, with a fallback when the value is empty", () => {
    expect(outcomeSummary({ kind: "funding_raised", value: { amount_aud: 500000, round: "pre-seed" } })).toBe("A$500,000 · pre-seed");
    expect(outcomeSummary({ kind: "funding_raised", value: {} })).toBe("Round closed");
    expect(outcomeSummary({ kind: "revenue_growth", value: { growth_pct: 30, mrr_from_aud: 1000, mrr_to_aud: 1300 } })).toBe("+30% · A$1,000 → A$1,300 MRR");
    expect(outcomeSummary({ kind: "next_stage", value: { from_stage: 2, to_stage: 3 } })).toBe("Stage 2 → 3");
    expect(outcomeSummary({ kind: "grant_success", value: { program: "AEA", amount_aud: 250000 } })).toBe("AEA · A$250,000");
    expect(outcomeSummary({ kind: "accelerator_selection", value: { program: "Startmate" } })).toBe("Selected — Startmate");
    expect(outcomeSummary({ kind: "headcount_growth", value: { fte_from: 3, fte_to: 7 } })).toBe("3 → 7 FTE");
    expect(outcomeSummary({ kind: "product_release", value: { tag: "v2.1.0", repo: "acme/app" } })).toBe("Release v2.1.0 (acme/app)");
    expect(outcomeSummary({ kind: "survival", value: { months_since_assessment: 12 } })).toBe("Operating 12 months after first assessment");
  });
});
