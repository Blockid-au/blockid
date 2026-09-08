// Colocated vitest for the analyses row shaper.
//
// This module is the only thing standing between "we save your analysis" and
// a table full of multi-megabyte pitch-deck rows. The size rules in migration
// 0124 are enforced HERE, not in the database, so a regression is silent:
// rows keep inserting, they just get enormous. These tests pin the three
// rules and the consent default.
//
// Regressions this suite catches:
//   - raising or dropping the 64 KB raw-text cap;
//   - losing `input_chars` / `input_truncated`, which would make a truncated
//     row indistinguishable from a complete one;
//   - duplicating `rawText` into the `intake` jsonb (doubles every row);
//   - keeping an oversized `structured` slide/page split;
//   - storing the full SVIAnalysis instead of the compact summary;
//   - a saved analysis defaulting to public_visible/investor_visible = true,
//     which would repeat exactly the consent failure migration 0122 fixed;
//   - toClientAnalysis forgetting to stitch rawText back on, which would make
//     every retrieved analysis render empty.

import { describe, expect, it } from "vitest";
import {
  MAX_INPUT_TEXT_CHARS,
  MAX_STRUCTURED_BYTES,
  MAX_STORED_ACTIONS,
  buildAnalysisRow,
  compactIntake,
  compactSvi,
  deriveCompactSvi,
  toClientAnalysis,
  truncateInputText,
  type StoredAnalysisRow,
} from "./payload";
import { computeSVI, extractSignals } from "@/lib/svi-analysis";
import { estimateValuation } from "@/lib/valuation";
import type { IntakeResult } from "@/lib/intake/analyze-input";

const SAMPLE_TEXT =
  "We are building an Australian SaaS platform for construction compliance. " +
  "Two co-founders, 300 paying customers, A$40k MRR, launched in 2024.";

function intakeFixture(over: Partial<IntakeResult> = {}): IntakeResult {
  return {
    inputKind: "existing_company_text",
    confidence: 0.9,
    rawText: SAMPLE_TEXT,
    structured: {},
    signals: extractSignals({ rawText: SAMPLE_TEXT }),
    classifierMode: "regex",
    ...over,
  } as IntakeResult;
}

// ─── truncateInputText ─────────────────────────────────────────────────────

describe("truncateInputText", () => {
  it("returns null for empty / missing text without pretending it was truncated", () => {
    for (const v of [undefined, null, ""]) {
      expect(truncateInputText(v)).toEqual({
        text: null,
        chars: 0,
        truncated: false,
      });
    }
  });

  it("passes short text through untouched", () => {
    const r = truncateInputText("hello");
    expect(r.text).toBe("hello");
    expect(r.chars).toBe(5);
    expect(r.truncated).toBe(false);
  });

  it("keeps text exactly at the cap intact (boundary is inclusive)", () => {
    const raw = "x".repeat(MAX_INPUT_TEXT_CHARS);
    const r = truncateInputText(raw);
    expect(r.text).toHaveLength(MAX_INPUT_TEXT_CHARS);
    expect(r.truncated).toBe(false);
  });

  it("truncates one char past the cap and reports the TRUE original length", () => {
    const raw = "x".repeat(MAX_INPUT_TEXT_CHARS + 5000);
    const r = truncateInputText(raw);
    expect(r.text).toHaveLength(MAX_INPUT_TEXT_CHARS);
    expect(r.chars).toBe(MAX_INPUT_TEXT_CHARS + 5000);
    expect(r.truncated).toBe(true);
  });

  it("caps at 64 KB — the documented budget in migration 0124", () => {
    expect(MAX_INPUT_TEXT_CHARS).toBe(65_536);
  });
});

// ─── compactIntake ─────────────────────────────────────────────────────────

describe("compactIntake", () => {
  it("never duplicates rawText into the jsonb (it lives in input_text)", () => {
    const out = compactIntake(intakeFixture());
    expect(out).not.toHaveProperty("rawText");
  });

  it("hoists context out of the blob (it has its own column)", () => {
    const out = compactIntake(intakeFixture());
    expect(out).not.toHaveProperty("context");
  });

  it("keeps signals — they are what makes the full analysis recomputable", () => {
    const out = compactIntake(intakeFixture());
    expect(out.signals).toBeTruthy();
  });

  it("keeps a small structured payload verbatim", () => {
    const structured = { slides: ["one", "two"] };
    const out = compactIntake(intakeFixture({ structured }));
    expect(out.structured).toEqual(structured);
  });

  it("drops an oversized structured payload and says so", () => {
    const slides = Array.from({ length: 400 }, () => "y".repeat(500));
    const out = compactIntake(intakeFixture({ structured: { slides } }));
    expect(JSON.stringify({ slides }).length).toBeGreaterThan(
      MAX_STRUCTURED_BYTES,
    );
    expect(out.structured).toBeUndefined();
    expect(out.structuredDropped).toBe(true);
    expect(out.structuredBytes).toBeGreaterThan(MAX_STRUCTURED_BYTES);
  });
});

// ─── compactSvi / deriveCompactSvi ─────────────────────────────────────────

describe("compactSvi", () => {
  it("stores a summary, not the whole SVIAnalysis", () => {
    const analysis = computeSVI(extractSignals({ rawText: SAMPLE_TEXT }));
    const valuation = estimateValuation(analysis.totalSVI, analysis.stage, {}, {});
    const out = compactSvi(analysis, valuation);
    expect(out).not.toHaveProperty("subs");
    expect(out).not.toHaveProperty("signals");
    expect(out).not.toHaveProperty("evidenceGaps");
    expect(out.totalSVI).toBe(analysis.totalSVI);
    expect(out.valuation.mid).toBe(valuation.mid);
  });

  it("caps stored next actions so a chatty analysis cannot bloat the row", () => {
    const analysis = computeSVI(extractSignals({ rawText: SAMPLE_TEXT }));
    analysis.nextActions = Array.from({ length: 20 }, (_, i) => ({
      priority: "P1" as const,
      title: `a${i}`,
      detail: "d",
      impact: "i",
    }));
    const valuation = estimateValuation(analysis.totalSVI, analysis.stage, {}, {});
    expect(compactSvi(analysis, valuation).nextActions).toHaveLength(
      MAX_STORED_ACTIONS,
    );
  });

  it("falls back to subs when dimensionScores is absent", () => {
    const analysis = computeSVI(extractSignals({ rawText: SAMPLE_TEXT }));
    delete analysis.dimensionScores;
    const valuation = estimateValuation(analysis.totalSVI, analysis.stage, {}, {});
    const out = compactSvi(analysis, valuation);
    expect(Object.keys(out.dimensions).length).toBe(analysis.subs.length);
  });
});

describe("deriveCompactSvi", () => {
  it("derives the same score the UI shows from the same signals", () => {
    const result = intakeFixture();
    const derived = deriveCompactSvi(result);
    const expected = computeSVI(result.signals);
    expect(derived?.totalSVI).toBe(expected.totalSVI);
    expect(derived?.stage).toBe(expected.stage);
  });

  it("produces a valuation range that is ordered low <= mid <= high", () => {
    const d = deriveCompactSvi(intakeFixture());
    expect(d).not.toBeNull();
    expect(d!.valuation.low).toBeLessThanOrEqual(d!.valuation.mid);
    expect(d!.valuation.mid).toBeLessThanOrEqual(d!.valuation.high);
  });

  it("returns null rather than throwing when signals are missing", () => {
    const broken = { ...intakeFixture(), signals: undefined } as unknown as IntakeResult;
    expect(deriveCompactSvi(broken)).toBeNull();
  });
});

// ─── buildAnalysisRow ──────────────────────────────────────────────────────

describe("buildAnalysisRow", () => {
  it("defaults BOTH consent flags to false — 0122 precedent, never assumed", () => {
    const row = buildAnalysisRow({ anonKey: "k", result: intakeFixture() });
    expect(row.public_visible).toBe(false);
    expect(row.investor_visible).toBe(false);
  });

  it("writes the anon key and leaves user_id null for an anonymous run", () => {
    const row = buildAnalysisRow({ anonKey: "anon123", result: intakeFixture() });
    expect(row.anon_key).toBe("anon123");
    expect(row.user_id).toBeNull();
    expect(row.claimed_at).toBeNull();
  });

  it("stamps claimed_at when the run is already owned by a user", () => {
    const row = buildAnalysisRow({
      anonKey: "anon123",
      userId: "u1",
      result: intakeFixture(),
    });
    expect(row.user_id).toBe("u1");
    expect(typeof row.claimed_at).toBe("string");
  });

  it("carries file/url provenance so the run can be described later", () => {
    const row = buildAnalysisRow({
      anonKey: "k",
      result: intakeFixture({ inputKind: "pitch_deck" }),
      url: "https://example.com",
      filename: "deck.pdf",
      mimeType: "application/pdf",
      bytes: 1234,
    });
    expect(row.input_url).toBe("https://example.com");
    expect(row.input_filename).toBe("deck.pdf");
    expect(row.input_mime).toBe("application/pdf");
    expect(row.input_bytes).toBe(1234);
  });

  it("denormalises score + valuation for the list view", () => {
    const result = intakeFixture();
    const svi = deriveCompactSvi(result)!;
    const row = buildAnalysisRow({ anonKey: "k", result, svi });
    expect(row.svi_total).toBeCloseTo(Math.round(svi.totalSVI * 100) / 100, 5);
    expect(row.stage).toBe(svi.stage);
    expect(row.stage_label).toBe(svi.stageLabel);
    expect(row.valuation_mid_aud).toBe(Math.round(svi.valuation.mid));
  });

  it("still builds a row when scoring produced nothing", () => {
    const row = buildAnalysisRow({ anonKey: "k", result: intakeFixture(), svi: null });
    expect(row.svi).toBeNull();
    expect(row.svi_total).toBeNull();
    expect(row.input_kind).toBe("existing_company_text");
  });

  it("keeps the whole row small even for a deck-sized input", () => {
    const huge = "z".repeat(400_000);
    const row = buildAnalysisRow({
      anonKey: "k",
      result: intakeFixture({ rawText: huge }),
    });
    expect((row.input_text as string).length).toBe(MAX_INPUT_TEXT_CHARS);
    expect(row.input_chars).toBe(400_000);
    expect(row.input_truncated).toBe(true);
  });
});

// ─── toClientAnalysis ──────────────────────────────────────────────────────

describe("toClientAnalysis", () => {
  const row: StoredAnalysisRow = {
    id: "11111111-1111-1111-1111-111111111111",
    anon_key: "anon123",
    user_id: null,
    input_kind: "idea_text",
    input_text: "an idea",
    input_chars: 7,
    input_truncated: false,
    input_url: null,
    input_filename: null,
    intake: { confidence: 0.8, classifierMode: "regex" },
    context: { stage: 1 } as unknown as Record<string, unknown>,
    svi: null,
    svi_total: 118.5,
    stage: 1,
    stage_label: "Validated Idea",
    valuation_mid_aud: 4_000_000,
    created_at: "2026-09-08T00:00:00.000Z",
  };

  it("stitches rawText back on so the payload matches an IntakeResult", () => {
    const out = toClientAnalysis(row) as { intake: Record<string, unknown> };
    expect(out.intake.rawText).toBe("an idea");
    expect(out.intake.inputKind).toBe("idea_text");
  });

  it("never leaks the anon key to the client", () => {
    expect(JSON.stringify(toClientAnalysis(row))).not.toContain("anon123");
  });

  it("reports whether the run is owned by an account", () => {
    expect((toClientAnalysis(row) as { owned: boolean }).owned).toBe(false);
    expect(
      (toClientAnalysis({ ...row, user_id: "u1" }) as { owned: boolean }).owned,
    ).toBe(true);
  });

  it("re-attaches the detected context inside intake for the UI", () => {
    const out = toClientAnalysis(row) as { intake: Record<string, unknown> };
    expect(out.intake.context).toEqual({ stage: 1 });
  });
});
