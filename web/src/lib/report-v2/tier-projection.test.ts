// Guard tests for the server-side tier projection (G35 Pricing v5 P2, plan §6.5).
//
// Pins: snapshot / free payloads carry NO locked section body (sentinel
// strings planted in every locked body never survive JSON serialisation, and
// `lockedBodyLeaks` is empty); full / verified return the stored document
// untouched with all 16 sections; an upgrade is only a different projection
// of the SAME stored document (no regeneration); the projected payloads still
// validate against the ReportV2 schema so every renderer keeps working.

import { describe, expect, it } from "vitest";
import { DIM_ORDER } from "@/lib/report-pipeline/dimension-owners";
import { demoReportV2, freeFixtureReportV2 } from "./fixtures";
import { isReportV2, type ReportV2 } from "./schema";
import {
  FREE_CARD_DIMS,
  PROJECTION_SECTION_IDS,
  availableSections,
  lockedBodyLeaks,
  maxTier,
  projectPersistedForTier,
  projectReportForTier,
  reportSectionIds,
  tierForStoredDocument,
} from "./tier-projection";
import { paygOrderLabelTier, paygTierLabel, resolveOrderTier, tierForOrderSku } from "./order-tier";
import { ensureInvestmentView } from "./investment-view";

const SENTINEL = "LOCKEDSENTINEL";

/** The demo document with a unique sentinel in every body field a locked tier must never ship. */
function plantedReport(base: ReportV2 = demoReportV2()): ReportV2 {
  const r = structuredClone(base);
  r.dimensions.forEach((ch) => {
    const tag = `${SENTINEL}-${ch.dim}`;
    ch.strengths = [...ch.strengths, `${tag}-chapter-strength`];
    ch.modules = [...ch.modules, { id: "cfo-module", output: { note: `${tag}-module-output` } }];
    ch.secondaryVisuals = ch.secondaryVisuals.map((v) => ({ ...v, title: `${tag}-secondary-visual` }));
    ch.evidence = ch.evidence.map((e) => ({ ...e, value: `${tag}-evidence-value` }));
    if (ch.scoreBreakdown) ch.scoreBreakdown = { ...ch.scoreBreakdown, signals: ch.scoreBreakdown.signals.map((s) => ({ ...s, signal: `${tag}-signal` })) };
    ch.criteria = ch.criteria.map((c, i) => ({
      ...c,
      verdict: `${tag}-criterion-verdict-${i}`,
      strengths: [`${tag}-criterion-strength-${i}`],
      gaps: [`${tag}-criterion-gap-${i}`],
      nextAction: `${tag}-criterion-next-${i}`,
      citations: [{ evidence_id: "ev-x", quote: `${tag}-criterion-quote-${i}` }],
      detailedAnalysis: { status: "supported", source: "post_audit_criterion", auditKind: "citation_only", narrative: `${tag}-criterion-analysis-${i}`, citations: [] },
    }));
  });
  return r;
}

/** Snapshot-only extras: bodies outside the chapters. */
function plantedSnapshotSource(): ReportV2 {
  const r = plantedReport();
  if (r.valuation.status !== "unavailable") r.valuation = { ...r.valuation, narrative: `${SENTINEL}-valuation-narrative` };
  r.moneyOnTable = { ...r.moneyOnTable, grants: [...r.moneyOnTable.grants, { ...(r.moneyOnTable.grants[0] ?? { id: "g", name: "", amountAud: 1, fitScore: 1, reason: "", url: "" }), name: `${SENTINEL}-grant` } as never] };
  r.actionPlan = { ...r.actionPlan, steps: [...r.actionPlan.steps, { day: 30, title: `${SENTINEL}-plan-step`, ownerAgent: "ceo", dimension: "tre", expectedLift: 3 }] };
  r.appendix = { ...r.appendix, evidenceRegister: [...r.appendix.evidenceRegister, { evidence_id: "ev-planted", source: "self_declared", label: `${SENTINEL}-register`, status: "evidenced", dims: ["tre"] }] };
  r.phaseGates = { ...r.phaseGates, blockers: [...r.phaseGates.blockers, { criterion: "traction", phase: r.phaseGates.current, detail: `${SENTINEL}-blocker` } as never] };
  return r;
}

const sentinelsIn = (value: unknown): string[] => JSON.stringify(value).match(new RegExp(`${SENTINEL}[-\\w]*`, "g")) ?? [];

describe("free tier — locked chapter bodies are removed server-side", () => {
  const source = plantedReport(freeFixtureReportV2());
  const projected = projectReportForTier(source, "free");
  const lockedDims = new Set(FREE_CARD_DIMS);

  it("locks exactly the owner `freeTier: card` chapters (cgh, iri, lco, svm) and keeps tre / mpc / ftv / ptd full", () => {
    expect([...FREE_CARD_DIMS].sort()).toEqual(["cgh", "iri", "lco", "svm"]);
    expect(projected.projection?.tier).toBe("free");
    expect(projected.projection?.lockedDims.sort()).toEqual(["cgh", "iri", "lco", "svm"]);
    for (const ch of projected.dimensions) expect(ch.renderAs, ch.dim).toBe(lockedDims.has(ch.dim) ? "card" : "full");
  });

  it("serialises no sentinel planted in a locked chapter body", () => {
    // The investment view is the UNLOCKED sections 2 / 13 / 14 (investment
    // view, risk matrix, 90-day plan) — derived from every chapter and shown
    // on the free page today; it is compared with the full-document build below.
    const rest = { ...projected, investmentView: undefined };
    const leaked = sentinelsIn(rest).filter((s) => [...lockedDims].some((d) => s.startsWith(`${SENTINEL}-${d}-`)));
    expect(leaked).toEqual([]);
    expect(lockedBodyLeaks(projected)).toEqual([]);
    // No criterion verdict / bullet / analysis / quote / module / evidence value / ledger label of a locked chapter anywhere.
    const bodyKinds = /-(criterion-verdict|criterion-strength|criterion-analysis|criterion-quote|chapter-strength|module-output|evidence-value|signal|secondary-visual)/;
    expect(sentinelsIn(projected).filter((s) => [...lockedDims].some((d) => s.startsWith(`${SENTINEL}-${d}-`)) && bodyKinds.test(s))).toEqual([]);
  });

  it("keeps the unlocked chapters byte-for-byte (their sentinels survive)", () => {
    for (const dim of DIM_ORDER.filter((d) => !lockedDims.has(d))) {
      const before = source.dimensions.find((c) => c.dim === dim)!;
      const after = projected.dimensions.find((c) => c.dim === dim)!;
      expect({ ...after, renderAs: before.renderAs }).toEqual(before);
    }
  });

  it("keeps the locked card's metadata — score, band, benchmark, weight, primary visual, verdict ≤ 40 words, criterion keys", () => {
    for (const dim of FREE_CARD_DIMS) {
      const before = source.dimensions.find((c) => c.dim === dim)!;
      const after = projected.dimensions.find((c) => c.dim === dim)!;
      expect(after.score).toBe(before.score);
      expect(after.band).toBe(before.band);
      expect(after.weight).toBe(before.weight);
      expect(after.benchmark).toEqual(before.benchmark);
      expect(after.primaryVisual).toEqual(before.primaryVisual);
      expect(after.verdict.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(41);
      expect(after.criteria.map((c) => c.key)).toEqual(before.criteria.map((c) => c.key));
      expect(after.evidence.map((e) => [e.evidence_id, e.status, e.confidence])).toEqual(before.evidence.map((e) => [e.evidence_id, e.status, e.confidence]));
    }
  });

  it("stores the investment view computed from the FULL document, so the free page renders the same derived blocks", () => {
    expect(projected.investmentView).toBeDefined();
    const fromFull = projectReportForTier(source, "full");
    expect(fromFull).toBe(source);
    // The derived view on the projection is the one the full document yields.
    expect(projected.investmentView).toEqual(ensureInvestmentView(source).investmentView);
  });

  it("still validates as a ReportV2 (renderers keep working) and is idempotent", () => {
    expect(isReportV2(projected)).toBe(true);
    const twice = projectReportForTier(projected, "free");
    expect(twice.dimensions).toEqual(projected.dimensions);
    expect(lockedBodyLeaks(twice)).toEqual([]);
  });

  it("serves an uncharged standard document (deck analyser, G16 P1-2) at the free cut too", () => {
    const std = plantedReport();
    expect(std.tier).toBe("standard");
    const cut = projectReportForTier(std, "free");
    expect(cut.tier).toBe("free");
    expect(lockedBodyLeaks(cut)).toEqual([]);
    const rest = { ...cut, investmentView: undefined };
    expect(sentinelsIn(rest).filter((s) => /-(cgh|iri|lco|svm)-/.test(s))).toEqual([]);
  });
});

describe("snapshot tier — summary only", () => {
  const source = plantedSnapshotSource();
  const snap = projectReportForTier(source, "snapshot");

  it("carries no locked body anywhere (every planted sentinel is gone)", () => {
    expect(sentinelsIn(snap)).toEqual([]);
    expect(lockedBodyLeaks(snap)).toEqual([]);
  });

  it("keeps the executive summary, the SVI and the 8-dimension radar data", () => {
    expect(snap.executive.thesis).toBe(source.executive.thesis);
    expect(snap.cover.svi).toEqual(source.cover.svi);
    expect(snap.cover.dims).toEqual(source.cover.dims);
    expect(snap.dimensions.map((d) => [d.dim, d.score, d.band])).toEqual(source.dimensions.map((d) => [d.dim, d.score, d.band]));
    expect(snap.dimensions.every((d) => d.renderAs === "card")).toBe(true);
  });

  it("exposes top 3 strengths + top 3 risks, the evidence-confidence % and an upgrade CTA marker", () => {
    const p = snap.projection!;
    expect(p.tier).toBe("snapshot");
    expect(p.highlights!.strengths.length).toBeGreaterThan(0);
    expect(p.highlights!.strengths.length).toBeLessThanOrEqual(3);
    expect(p.highlights!.risks.length).toBeLessThanOrEqual(3);
    expect(p.evidenceConfidence).toBeGreaterThanOrEqual(0);
    expect(p.evidenceConfidence).toBeLessThanOrEqual(100);
    expect(snap.investmentView!.evidenceConfidence).toBe(p.evidenceConfidence);
    expect(p.upgrade).toEqual({ to: "full", sku: "upgrade_snapshot_full" });
    expect(snap.executive.strengths.length).toBeLessThanOrEqual(3);
    expect(snap.executive.gaps.length).toBeLessThanOrEqual(3);
  });

  it("locks valuation, the 8 chapters, risk matrix, plan, money and appendix (4 of 16 sections available)", () => {
    expect(snap.valuation.status).toBe("unavailable");
    expect(availableSections(snap)).toEqual([PROJECTION_SECTION_IDS.dashboard, PROJECTION_SECTION_IDS.investmentView]);
    expect(snap.projection!.lockedSections).toHaveLength(14);
    // The legal disclaimer and data principle always ship.
    expect(snap.appendix.disclaimer).toBe(source.appendix.disclaimer);
    expect(snap.appendix.dataPrinciple).toBe(source.appendix.dataPrinciple);
  });

  it("still validates as a ReportV2", () => {
    expect(isReportV2(snap)).toBe(true);
  });
});

describe("full / verified — everything, untouched", () => {
  it("returns the stored document itself with all 16 sections", () => {
    const stored = plantedReport();
    for (const tier of ["full", "verified"] as const) {
      const out = projectReportForTier(stored, tier);
      expect(out).toBe(stored);
      expect(out.projection).toBeUndefined();
      expect(availableSections(out)).toHaveLength(16);
      expect(reportSectionIds()).toHaveLength(16);
      expect(out.dimensions).toHaveLength(8);
      expect(lockedBodyLeaks(out)).toEqual([]);
      // every planted body is still there
      expect(sentinelsIn(out).length).toBeGreaterThan(0);
    }
  });
});

describe("upgrade = a different projection of the same stored report", () => {
  it("Snapshot → Full re-projects the one stored document; nothing is regenerated", () => {
    const stored = plantedReport();
    const frozen = structuredClone(stored);
    const snapshot = projectReportForTier(stored, "snapshot");
    const afterUpgrade = projectReportForTier(stored, maxTier(["snapshot", "full"]));
    // projecting never mutates the stored document
    expect(stored).toEqual(frozen);
    expect(afterUpgrade).toBe(stored);
    // same document identity on both sides
    expect(snapshot.reportId).toBe(stored.reportId);
    expect(snapshot.generatedAt).toBe(stored.generatedAt);
    expect(snapshot.snapshotId).toBe(stored.snapshotId);
    expect(snapshot.cover.svi.total).toBe(afterUpgrade.cover.svi.total);
  });

  it("the order tier rises with the stored report's payg_tier (upgrade webhook) without a new document", () => {
    expect(resolveOrderTier({ product_sku: "report_snapshot" }, null)).toBe("snapshot");
    expect(resolveOrderTier({ product_sku: "report_snapshot" }, "full")).toBe("full");
    expect(resolveOrderTier({ product_sku: "report_full" }, "verified")).toBe("verified");
    expect(resolveOrderTier({ product_sku: "upgrade_snapshot_full" }, null)).toBe("full");
    expect(resolveOrderTier({ product_sku: "upgrade_full_verified" }, null)).toBe("verified");
    // legacy A$3 / credits orders keep the full document
    expect(resolveOrderTier({ product_sku: "sku_trust_report_5aud" }, null)).toBe("full");
    expect(resolveOrderTier({ product_sku: "sku_trust_report_credits" }, null)).toBe("full");
    // unknown SKU never defaults to full
    expect(resolveOrderTier({ product_sku: "sku_bogus" }, null)).toBe("snapshot");
    expect(tierForOrderSku("report_funding")).toBeNull();
    expect(tierForOrderSku("toString")).toBeNull();
  });

  it("D26 follow-up: only a PAYG order is labelled with its tier", () => {
    expect(paygOrderLabelTier({ product_sku: "report_snapshot" }, null)).toBe("snapshot");
    expect(paygOrderLabelTier({ product_sku: "report_snapshot" }, "full")).toBe("full");
    expect(paygOrderLabelTier({ product_sku: "report_full" }, null)).toBe("full");
    expect(paygOrderLabelTier({ product_sku: "upgrade_full_verified" }, null)).toBe("verified");
    // legacy A$3 / credits / Money Finder / unknown: no label
    expect(paygOrderLabelTier({ product_sku: "sku_trust_report_5aud" }, null)).toBeNull();
    expect(paygOrderLabelTier({ product_sku: "sku_trust_report_credits" }, null)).toBeNull();
    expect(paygOrderLabelTier({ product_sku: "report_funding" }, null)).toBeNull();
    expect(paygOrderLabelTier({ product_sku: "sku_bogus" }, "bogus")).toBeNull();
    expect(paygTierLabel("snapshot")).toBe("Snapshot report");
    expect(paygTierLabel("full")).toBe("Full report");
    expect(paygTierLabel("verified")).toBe("Verified report");
  });
});

describe("tierForStoredDocument (share / e-mail readers)", () => {
  it("free documents → free cut; documents generated for a paying caller → full", () => {
    expect(tierForStoredDocument({ tier: "free" })).toBe("free");
    for (const t of ["standard", "premium", "investor_memo"] as const) expect(tierForStoredDocument({ tier: t })).toBe("full");
  });
});

describe("projectPersistedForTier (v1 dim_results / criterion_results)", () => {
  const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
  const state = {
    dimStates: Object.fromEntries(DIM_ORDER.map((d) => [d, { status: "complete", score: 60, markdown: `${SENTINEL}-${d} ${long}`, insights: [`${SENTINEL}-${d}-insight`], priority: null, marketBenchmark: null }])),
    criterionStates: [
      { key: "team_strength", title: "Team", primary_dimension: "cgh", weight: 1, score: 50, verdict: `${SENTINEL}-cgh-verdict`, strengths: [`${SENTINEL}-cgh-s`], gaps: [`${SENTINEL}-cgh-g`], next_action: `${SENTINEL}-cgh-n` },
      { key: "traction", title: "Traction", primary_dimension: "tre", weight: 1, score: 70, verdict: "tre verdict", strengths: ["tre s"], gaps: ["tre g"], next_action: "tre n" },
    ],
  };

  it("free: card dimensions keep ≤ 40 words of narrative and lose insights + criterion findings", () => {
    const out = projectPersistedForTier(state, "free");
    for (const d of FREE_CARD_DIMS) {
      expect(out.dimStates[d].insights).toEqual([]);
      expect(out.dimStates[d].markdown!.split(/\s+/).length).toBeLessThanOrEqual(40);
    }
    expect(out.dimStates.tre).toBe(state.dimStates.tre);
    expect(out.criterionStates![0]).toMatchObject({ verdict: "", strengths: [], gaps: [], next_action: "", score: 50 });
    expect(out.criterionStates![1]).toBe(state.criterionStates[1]);
    expect(sentinelsIn(out.criterionStates)).toEqual([]);
  });

  it("snapshot: every dimension's narrative is removed", () => {
    const out = projectPersistedForTier(state, "snapshot");
    expect(sentinelsIn(out)).toEqual([]);
    for (const d of DIM_ORDER) expect(out.dimStates[d].markdown).toBeNull();
  });

  it("full: unchanged (same object)", () => {
    expect(projectPersistedForTier(state, "full")).toBe(state);
  });
});
