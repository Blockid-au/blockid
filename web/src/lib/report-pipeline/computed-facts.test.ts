// G24-D — computed facts as citable rows (SVI scores, stage benchmarks, CFO
// consensus valuation): stable ids, both number spellings, auto-cite + gate
// agreement.
import { describe, expect, it } from "vitest";
import { autoCite, itemsFromEvidenceRows } from "./auto-cite";
import { ASIC_FEES_URL, COMPUTED_FACT_IDS, COMPUTED_FACT_LABELS, COMPUTED_FACT_PROVENANCE, computedFactRows, computedFacts, formatAudBoth, formatCountBoth, IP_AUSTRALIA_FEES_URL, isComputedFactId, sectorEntitiesFor } from "./computed-facts";
import { benchmarkFor, benchmarkStageForSvi, DIM_ORDER } from "./dimension-owners";
import { evidenceIdFor } from "./evidence-ids";
import { findUncitedClaims } from "./llm-auditor";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function input(overrides: Partial<Parameters<typeof computedFacts>[0]> = {}) {
  return {
    sviAnalysis: {
      totalSVI: 138,
      stageLabel: "Early Traction",
      subs: DIM_ORDER.map((k, i) => ({ key: k, label: k.toUpperCase(), value: 40 + i * 5 })),
      dimensionScores: Object.fromEntries(DIM_ORDER.map((k, i) => [k, 40 + i * 5])),
    },
    stage: 3,
    valuationChapter: {
      currency: "AUD" as const,
      methods: [
        { method: "berkus" as const, lowAud: 2_000_000, midAud: 2_500_000, highAud: 3_000_000, weight: 0.3, rationale: "", applicable: true },
        { method: "scorecard" as const, lowAud: 3_500_000, midAud: 4_800_000, highAud: 6_100_000, weight: 0.4, rationale: "", applicable: true },
        { method: "revenue_multiple" as const, lowAud: 0, midAud: 0, highAud: 0, weight: 0, rationale: "pre-revenue", applicable: false },
      ],
      consensus: { lowAud: 3_035_400, midAud: 4_622_000, highAud: 6_595_800, confidence: 0.35 },
      ask: { preMoneyAud: 3_500_000, raiseAud: 500_000, verdict: "aligned" as const, gapPct: -24 },
      scenarios: { bear: 3_035_400, base: 4_622_000, bull: 6_595_800 },
      visuals: [],
      narrative: "",
      audit: { grounded: true, uncited: 0, revised: false, auditor: "llm-auditor" as const, at: "2026-09-21T00:00:00.000Z" },
    } as unknown as NonNullable<Parameters<typeof computedFacts>[0]["valuationChapter"]>,
    ...overrides,
  };
}

describe("computed facts — ids", () => {
  it("mints seven stable uuid-shaped ids from the calc| seeds (the same on every run, for every startup)", () => {
    expect(COMPUTED_FACT_IDS["svi-scores"]).toBe(evidenceIdFor("calc|svi-scores"));
    expect(COMPUTED_FACT_IDS.benchmarks).toBe(evidenceIdFor("calc|benchmarks"));
    expect(COMPUTED_FACT_IDS.valuation).toBe(evidenceIdFor("calc|valuation"));
    for (const id of Object.values(COMPUTED_FACT_IDS)) {
      expect(id).toMatch(UUID);
      expect(isComputedFactId(id)).toBe(true);
    }
    expect(COMPUTED_FACT_IDS["au-context"]).toBe(evidenceIdFor("calc|au-context"));
    expect(COMPUTED_FACT_IDS["au-legal"]).toBe(evidenceIdFor("calc|au-legal"));
    expect(COMPUTED_FACT_IDS["sector-entities"]).toBe(evidenceIdFor("calc|sector-entities"));
    expect(new Set(Object.values(COMPUTED_FACT_IDS)).size).toBe(7);
    expect(isComputedFactId(evidenceIdFor("market|description|Startup description"))).toBe(false);
  });

  it("labels start with a source word the auto-citer knows (svi / benchmarks / valuation)", () => {
    expect(COMPUTED_FACT_LABELS["svi-scores"]).toMatch(/^SVI /);
    expect(COMPUTED_FACT_LABELS.benchmarks).toMatch(/^Benchmarks:/);
    expect(COMPUTED_FACT_LABELS.valuation).toMatch(/^Valuation:/);
  });
});

describe("computed facts — content", () => {
  it("SVI row: the uncapped index (never '/100'), the stage and every dimension score", () => {
    const svi = computedFacts(input()).find((f) => f.kind === "svi-scores")!;
    expect(svi.content).toContain("SVI index 138 (open-ended, base 100)");
    expect(svi.content).not.toContain("138/100");
    expect(svi.content).toContain("stage Early Traction");
    expect(svi.content).toContain("TRE (");
    expect(svi.content).toMatch(/TRE \([^)]+\) 40\/100/);
    expect(svi.content).toMatch(/SVM \([^)]+\) 75\/100/);
  });

  it("benchmarks row: p25 / p50 / p75 per dimension for the SVI stage's benchmark stage, with the signed delta vs p50", () => {
    const row = computedFacts(input()).find((f) => f.kind === "benchmarks")!;
    const b = benchmarkFor("tre", benchmarkStageForSvi(3));
    expect(row.content).toContain(`TRE p25 ${b.p25} / p50 ${b.p50} / p75 ${b.p75}`);
    const delta = 40 - b.p50;
    expect(row.content).toContain(`${delta >= 0 ? "+" : "−"}${Math.abs(delta)} points vs the p50 median`);
  });

  it("valuation row: consensus range + mid in both spellings, applicable methods only, the founder ask", () => {
    const row = computedFacts(input()).find((f) => f.kind === "valuation")!;
    expect(row.content).toContain("A$3,035,400 (≈A$3.0M)–A$6,595,800 (≈A$6.6M)");
    expect(row.content).toContain("mid A$4,622,000 (≈A$4.6M)");
    expect(row.content).toContain("confidence 35%");
    expect(row.content).toContain("Berkus mid A$2,500,000 (≈A$2.5M)");
    expect(row.content).toContain("Scorecard mid A$4,800,000 (≈A$4.8M)");
    expect(row.content).not.toContain("Revenue multiple");
    expect(row.content).toContain("pre-money A$3,500,000 (≈A$3.5M), raise A$500,000 (≈A$500K) — aligned (-24% vs consensus)");
  });

  it("no valuation chapter, no market text → five rows (scores, benchmarks, AU context, SaaS benchmarks, AU legal — never a sector row); a pending dimension prints 'pending'", () => {
    const facts = computedFacts(input({ valuationChapter: null, sviAnalysis: { totalSVI: 100, stageLabel: "Concept", subs: [], dimensionScores: {} } }));
    expect(facts.map((f) => f.kind)).toEqual(["svi-scores", "benchmarks", "au-context", "saas-benchmarks", "au-legal"]);
    for (const f of facts) expect(f.provenance.length).toBeGreaterThan(20);
    expect(facts[0]!.content).toContain("TRE (");
    expect(facts[0]!.content).toMatch(/TRE \([^)]+\) pending/);
  });

  it("formatAudBoth: exact + rounded (K / M / bn); below A$1,000 exact only", () => {
    expect(formatAudBoth(4_622_000)).toBe("A$4,622,000 (≈A$4.6M)");
    expect(formatAudBoth(500_000)).toBe("A$500,000 (≈A$500K)");
    expect(formatAudBoth(1_300_000_000)).toBe("A$1,300,000,000 (≈A$1.3bn)");
    expect(formatAudBoth(149)).toBe("A$149");
  });
});

describe("computed facts — rows + the auto-citer + the gate", () => {
  it("rows carry every dimension, the platform's own maths as connector_other and public knowledge rows as external (review v3.27.0 P2), partial, full content as the value", () => {
    const rows = computedFactRows(input(), "2026-09-21T09:00:00.000Z");
    expect(rows).toHaveLength(6);
    const bySource = new Map(rows.map((r) => [r.evidence_id, r.source]));
    expect(bySource.get(COMPUTED_FACT_IDS["svi-scores"])).toBe("connector_other");
    expect(bySource.get(COMPUTED_FACT_IDS["benchmarks"])).toBe("connector_other");
    for (const k of ["au-context", "saas-benchmarks", "au-legal"] as const) expect(bySource.get(COMPUTED_FACT_IDS[k]), k).toBe("external");
    for (const r of rows) {
      expect(r.dims).toEqual([...DIM_ORDER]);
      expect(r.status).toBe("partial");
      expect(r.observedAt).toBe("2026-09-21T09:00:00.000Z");
      expect(r.value!.length).toBeGreaterThan(40);
    }
  });

  it("a sentence quoting the consensus in either spelling is auto-cited to the valuation row and clears the gate", () => {
    const items = itemsFromEvidenceRows(computedFactRows(input()));
    const ids = items.map((i) => i.id);
    const rounded = autoCite("The CFO consensus sits at A$4.6M, inside a A$3.0M–A$6.6M range.", items);
    expect(rounded.added).toBe(1);
    expect(rounded.text).toContain(`[ev:${COMPUTED_FACT_IDS.valuation}].`);
    const exact = autoCite("Consensus mid A$4,622,000 against a founder pre-money of A$3,500,000.", items);
    expect(exact.text).toContain(`[ev:${COMPUTED_FACT_IDS.valuation}]`);
    expect(findUncitedClaims(rounded.text, ids)).toEqual([]);
    expect(findUncitedClaims(exact.text, ids)).toEqual([]);
  });

  it("a weak-number benchmark sentence is cited only when it names the row ('benchmark'); a bare '+25 points' is not", () => {
    const items = itemsFromEvidenceRows(computedFactRows(input()));
    const b = benchmarkFor("tre", benchmarkStageForSvi(3));
    const named = autoCite(`TRE sits ${b.p50} at the p50 benchmark for the stage, 12.5% under the p75.`, items);
    // the % token is strong but not in the row → the sentence stays uncited (no invented match)
    expect(named.added).toBe(0);
    const only50 = autoCite(`The stage benchmark median for TRE is ${b.p50}, so a 40 reads below par (a 1.5x gap to the p75 band).`, items);
    expect(only50.added).toBe(0);
    const plain = autoCite(`TRE is ${b.p50} points against the stage benchmark median, worth A$7 today.`, items);
    expect(plain.added).toBe(0);
    const clean = autoCite(`Against the stage benchmark the TRE median is ${b.p50}.`, items);
    // not material (no money / % / big count) → nothing to cite, nothing flagged
    expect(clean.material).toBe(0);
  });

  it("AU-context row: states the R&DTI 43.5% refundable offset, ESIC 20% / A$200,000 and GST 10% — the numbers the agent prompts themselves quote", () => {
    const row = computedFacts(input()).find((f) => f.kind === "au-context")!;
    expect(row.content).toContain("43.5% refundable tax offset");
    expect(row.content).toContain("under A$20M");
    expect(row.content).toContain("20% non-refundable carry-forward tax offset capped at A$200,000");
    expect(row.content).toContain("GST: 10%");
    expect(row.label).toMatch(/platform knowledge/);
  });

  it("AU-context row: a sentence about the R&D Tax Incentive rate is cited to it; '20% growth' or 'A$200,000 MRR' never is (topic gate)", () => {
    const items = itemsFromEvidenceRows(computedFactRows(input()));
    const rd = autoCite("Engage an R&D consultant to claim up to 43.5% of eligible spend.", items);
    expect(rd.added).toBe(1);
    expect(rd.text).toContain(`[ev:${COMPUTED_FACT_IDS["au-context"]}]`);
    const esic = autoCite("ESIC investors get a 20% offset capped at A$200,000 a year.", items);
    expect(esic.added).toBe(1);
    const growth = autoCite("Sign-ups grew 20% month on month.", items);
    expect(growth.added).toBe(0);
    expect(growth.uncited).toBe(1);
    const mrr = autoCite("MRR reached A$200,000 in June.", items);
    expect(mrr.added).toBe(0);
    expect(mrr.uncited).toBe(1);
  });

  it("SaaS-benchmarks row: the CRO template's funnel / NRR / ARR bands are citable by a benchmark sentence, never by a plain traction figure (topic gate)", () => {
    const row = computedFacts(input()).find((f) => f.kind === "saas-benchmarks")!;
    expect(row.content).toContain("trial → paid 15–30%");
    expect(row.content).toContain("Series A A$500k–A$3m ARR (A$500,000–A$3,000,000), median A$1.2m (A$1,200,000)");
    const items = itemsFromEvidenceRows(computedFactRows(input()));
    const band = autoCite("At Series A the median ARR benchmark is A$1.2m.", items);
    expect(band.added).toBe(1);
    expect(band.text).toContain(`[ev:${COMPUTED_FACT_IDS["saas-benchmarks"]}]`);
    const funnel = autoCite("Trial-to-paid conversion typically runs 15–30% for SaaS.", items);
    expect(funnel.added).toBe(1);
    const own = autoCite("We closed A$1.2m ARR in June.", items);
    expect(own.added).toBe(0);
    expect(own.uncited).toBe(1);
  });

  it("an invented figure never picks up a computed row", () => {
    const items = itemsFromEvidenceRows(computedFactRows(input()));
    const r = autoCite("Revenue reached A$1.2M ARR and the valuation is A$9.9M.", items);
    expect(r.added).toBe(0);
    expect(r.uncited).toBe(1);
  });
});

// ── G28-A: the two residual-pattern rows (ASIC / IP Australia fees, sector entity count) + provenance ──
describe("computed facts — G28-A AU legal row", () => {
  it("states the ASIC annual review fee as the published band with its source URL (indexed each 1 July, never one 'current' figure) and the trade mark fee per class from clo-compliance", () => {
    const row = computedFacts(input()).find((f) => f.kind === "au-legal")!;
    expect(row.label).toMatch(/^ASIC /);
    expect(row.label).toMatch(/platform knowledge/);
    expect(row.content).toContain("A$321 (FY2024-25) to A$329 (FY2025-26)");
    expect(row.content).toContain("indexed each 1 July");
    expect(row.content).toContain(ASIC_FEES_URL);
    expect(row.content).toContain("A$250–A$550 per class");
    expect(row.content).toContain(IP_AUSTRALIA_FEES_URL);
    expect(row.content).not.toMatch(/\$290\b/);
    expect(row.provenance).toContain(ASIC_FEES_URL);
    expect(COMPUTED_FACT_PROVENANCE["au-legal"]).toMatch(/indexed each 1 July/);
  });

  it("a sentence about the ASIC annual review fee or a trade mark class fee is cited to it; a plain 'A$321 MRR' or 'A$250 CAC' never is (topic gate)", () => {
    const items = itemsFromEvidenceRows(computedFactRows(input()));
    const asic = autoCite("Budget for the ASIC annual review fee of A$321–A$329 a year, due within 2 months of the anniversary.", items);
    expect(asic.added).toBe(1);
    expect(asic.text).toContain(`[ev:${COMPUTED_FACT_IDS["au-legal"]}]`);
    const tm = autoCite("Registering the two trade mark classes costs A$500–A$1,100 with IP Australia.", items);
    expect(tm.added).toBe(1);
    expect(tm.text).toContain(`[ev:${COMPUTED_FACT_IDS["au-legal"]}]`);
    const mrr = autoCite("MRR reached A$321 in June.", items);
    expect(mrr.added).toBe(0);
    expect(mrr.uncited).toBe(1);
    const cac = autoCite("Blended CAC came in at A$250 last quarter.", items);
    expect(cac.added).toBe(0);
    expect(cac.uncited).toBe(1);
    // The remembered "$290" the 11:34 showcase wrote is not in the band → stays uncited, never mis-cited.
    const stale = autoCite("Pay the ASIC annual review fee of $290 on time.", items);
    expect(stale.added).toBe(0);
  });
});

describe("computed facts — G28-A sector entity count row", () => {
  it("is present only when the AU market anchor matches an industry: SaaS text → 8,400 (≈8.4k) with the ABS source; unrelated text → no row", () => {
    const withAnchor = computedFacts(input({ rawText: "A B2B SaaS platform for Australian accounting firms." }));
    const row = withAnchor.find((f) => f.kind === "sector-entities")!;
    expect(row).toBeDefined();
    expect(row.label).toMatch(/^Sector entity count/);
    expect(row.content).toContain("8,400 (≈8.4k) active Australian businesses in Software Publishing (SaaS) (ANZSIC J5810)");
    expect(row.content).toMatch(/source: ABS, 8155\.0 [^)]+\(\d{4}\) https:\/\/www\.abs\.gov\.au/);
    expect(row.content).toContain("any subset of it");
    expect(row.provenance).toContain("ABS 8165.0");
    // The market criterion text joins the lookup, as the dispatcher's anchor does.
    expect(computedFacts(input({ rawText: "We help founders.", criteriaData: { market: { textInput: "Fintech payments for SMEs" } } })).find((f) => f.kind === "sector-entities")?.content).toContain("1,150 (≈1.2k)");
    expect(computedFacts(input({ rawText: "We help founders raise capital." })).some((f) => f.kind === "sector-entities")).toBe(false);
    expect(computedFacts(input()).some((f) => f.kind === "sector-entities")).toBe(false);
    expect(sectorEntitiesFor({ rawText: "" })).toBeNull();
    expect(sectorEntitiesFor({ rawText: "ANZSIC J5810 software" })?.anzsicCode).toBe("J5810");
  });

  it("the whole-industry count is cited to it (either spelling); a subset the writer derives ('roughly 1,400 entities') is not, and the declared-estimate form clears the gate", () => {
    const rows = computedFactRows(input({ rawText: "A B2B SaaS platform for Australian accounting firms." }));
    const items = itemsFromEvidenceRows(rows);
    const ids = rows.map((r) => r.evidence_id);
    const whole = autoCite("The sector holds 8,400 active Australian businesses on the ABS basis.", items);
    expect(whole.added).toBe(1);
    expect(whole.text).toContain(`[ev:${COMPUTED_FACT_IDS["sector-entities"]}]`);
    // "8.4k" is not a material shape for the gate (no money / % / 4-digit count) — nothing to cite, nothing flagged.
    const rounded = autoCite("Roughly 8.4k businesses operate in the SaaS sector.", items);
    expect(rounded.material).toBe(0);
    expect(rounded.uncited).toBe(0);
    const subset = autoCite("The SAM is the subset that actively screens startups, roughly 1,400 entities.", items);
    expect(subset.added).toBe(0);
    expect(subset.uncited).toBe(1);
    expect(findUncitedClaims(subset.text, ids)).toHaveLength(1);
    const declared = "We estimate the subset that actively screens startups at roughly 1,400 entities (unevidenced).";
    expect(findUncitedClaims(declared, ids)).toEqual([]);
    // A count in a different topic ("8,400 sessions") never picks the row up.
    const sessions = autoCite("GA4 recorded 8,400 sessions in August.", items);
    expect(sessions.added).toBe(0);
  });

  it("formatCountBoth: exact + rounded k spelling above 1,000; exact below", () => {
    expect(formatCountBoth(8_400)).toBe("8,400 (≈8.4k)");
    expect(formatCountBoth(24_600)).toBe("24,600 (≈24.6k)");
    expect(formatCountBoth(2_000)).toBe("2,000 (≈2k)");
    expect(formatCountBoth(640)).toBe("640");
  });
});

it("V01 does not turn unavailable valuation into a citable numeric fact", async () => {
  const { unavailableValuation } = await import("@/lib/report-v2/schema");
  const facts = computedFacts(input({ valuationChapter: unavailableValuation("missing_or_invalid_revenue", new Date(0).toISOString()) }));
  expect(facts.some((fact) => fact.kind === "valuation")).toBe(false);
  expect(facts.some((fact) => fact.kind === "svi-scores")).toBe(true);
});
