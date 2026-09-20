// program-journey — the pure BlockID Cohort journey builder (G21 P2-C).
//
//   - six stages in order, `parseProgramStage` falls back to intake;
//   - completeness chips derive from the data (empty → all not started;
//     scored + decided + snapshots → done);
//   - evidence summary: completion % from EVIDENCE_CATALOG codes, highest
//     rung per dimension (L1–L6);
//   - mentor gap = weakest scored dimension × its missing catalogue items,
//     highest impact first, ≤ 5;
//   - selection: shortlisted OR submitted proceed = selected; submitted pass
//     (not shortlisted) = non-selected (feedback-letter candidates);
//   - assessment medians (SVI, confidence) and the pipeline tally.

import { describe, expect, it } from "vitest";
import { EVIDENCE_CATALOG } from "@/lib/svi-completeness";
import {
  PROGRAM_STAGES,
  buildProgramJourney,
  emptyEvidenceSummary,
  evidenceLevelIndex,
  isNonSelected,
  isSelected,
  mentorGapFor,
  parseProgramStage,
  summariseEvidence,
  verificationShort,
  type JourneyStartup,
} from "./program-journey";

let n = 0;
function startup(over: Partial<JourneyStartup> = {}): JourneyStartup {
  n += 1;
  return {
    itemId: n,
    evaluationId: `ev-${n}`,
    projectId: `p-${n}`,
    projectSlug: `slug-${n}`,
    name: `Startup ${n}`,
    status: "done",
    svi: 60,
    confidence: 50,
    verification: 2,
    stage: 3,
    delta: null,
    topStrength: "Founder & Team",
    topGap: "Traction & Revenue",
    dimensionScores: { ftv: 70, mpc: 60, ptd: 55, tre: 30, cgh: 50, iri: 45, lco: 65, svm: 58 },
    decision: null,
    assessmentStatus: null,
    shortlisted: false,
    evidence: emptyEvidenceSummary(),
    scoreHistory: [50, 55, 60],
    reportUrl: null,
    dossierUrl: `/workspace/evaluations/ev-${n}`,
    profileUrl: `/s/slug-${n}`,
    dossierProduced: false,
    feedbackLetterSent: false,
    ...over,
  };
}

describe("stages + parsing", () => {
  it("six stages in program order; unknown → intake; arrays take the first value", () => {
    expect(PROGRAM_STAGES).toEqual(["intake", "assessment", "selection", "program", "demo-day", "sponsor"]);
    expect(parseProgramStage(undefined)).toBe("intake");
    expect(parseProgramStage("nope")).toBe("intake");
    expect(parseProgramStage("demo-day")).toBe("demo-day");
    expect(parseProgramStage(["sponsor", "intake"])).toBe("sponsor");
  });

  it("evidenceLevelIndex maps the confidence ladder to L1–L6 (0 = nothing)", () => {
    expect(evidenceLevelIndex(null)).toBe(0);
    expect(evidenceLevelIndex("self_declared")).toBe(1);
    expect(evidenceLevelIndex("document_uploaded")).toBe(3);
    expect(evidenceLevelIndex("third_party_verified")).toBe(6);
    expect(evidenceLevelIndex("garbage")).toBe(0);
  });

  it("verificationShort clamps 0–5", () => {
    expect(verificationShort(0)).toBe("Not yet verified");
    expect(verificationShort(3)).toBe("BlockID Verified L3");
    expect(verificationShort(9)).toBe("BlockID Verified L5");
  });
});

describe("summariseEvidence + mentorGapFor", () => {
  it("counts catalogue items on file per dimension and the highest rung", () => {
    const s = summariseEvidence([
      { dimension: "tre", evidence_type: "revenue_proof", confidence_level: "transaction_data" },
      { dimension: "TRE", evidence_type: "customer_list", confidence_level: "document_uploaded" },
      { dimension: "ftv", evidence_type: "founder_linkedin", confidence_level: "public_url" },
      { dimension: "xyz", evidence_type: "nope", confidence_level: "public_url" },
    ]);
    expect(s.levelByDim.tre).toBe(5);
    expect(s.levelByDim.ftv).toBe(2);
    expect(s.levelByDim.mpc).toBe(0);
    expect(s.presentByDim.tre.has("revenue_proof")).toBe(true);
    const total = Object.values(EVIDENCE_CATALOG).reduce((a, b) => a + b.length, 0);
    expect(s.completionPct).toBe(Math.round((3 / total) * 100));
    expect(emptyEvidenceSummary().completionPct).toBe(0);
  });

  it("mentor gap = weakest scored dimension × missing items, highest impact first, ≤ 5, excluding what is on file", () => {
    const present = summariseEvidence([{ dimension: "tre", evidence_type: "revenue_proof", confidence_level: "transaction_data" }]).presentByDim;
    const gap = mentorGapFor({ ftv: 70, tre: 30, mpc: 60 }, present);
    expect(gap?.dimension).toBe("tre");
    expect(gap?.title).toBe("Traction & Revenue");
    expect(gap?.score).toBe(30);
    expect(gap?.missing.length).toBeLessThanOrEqual(5);
    expect(gap?.missing.map((m) => m.code)).not.toContain("revenue_proof");
    expect(gap?.missing[0].code).toBe("mrr_dashboard");
    expect(gap?.missing[0].estimatedSviImpact).toBeGreaterThanOrEqual(gap?.missing[1].estimatedSviImpact ?? 0);
    expect(mentorGapFor(null, null)).toBeNull();
    expect(mentorGapFor({}, null)).toBeNull();
  });
});

describe("selection helpers", () => {
  it("selected = shortlisted or submitted proceed; non-selected = submitted pass and not shortlisted", () => {
    expect(isSelected(startup({ shortlisted: true }))).toBe(true);
    expect(isSelected(startup({ decision: "proceed", assessmentStatus: "submitted" }))).toBe(true);
    expect(isSelected(startup({ decision: "proceed", assessmentStatus: "draft" }))).toBe(false);
    expect(isNonSelected(startup({ decision: "pass", assessmentStatus: "submitted" }))).toBe(true);
    expect(isNonSelected(startup({ decision: "pass", assessmentStatus: "submitted", shortlisted: true }))).toBe(false);
    expect(isNonSelected(startup({ decision: "pass", assessmentStatus: "draft" }))).toBe(false);
  });
});

describe("buildProgramJourney", () => {
  it("empty account: every stage not started, empty panels, no batch", () => {
    const v = buildProgramJourney({ batch: null, batches: [], startups: [], intake: null, snapshots: [], overridesCount: 0 });
    expect(v.stages.map((s) => s.state)).toEqual(["not_started", "not_started", "not_started", "not_started", "not_started", "not_started"]);
    expect(v.assessment).toMatchObject({ total: 0, scored: 0, pending: 0, medianSvi: null, medianConfidence: null });
    expect(v.selection.decisions).toEqual({ pass: 0, track: 0, proceed: 0, undecided: 0 });
    expect(v.demoDay.rows).toEqual([]);
    expect(v.sponsor.n).toBe(0);
    expect(v.stages[5].summary).toBe("Nothing to report yet");
  });

  it("intake link only → intake in progress", () => {
    const v = buildProgramJourney({ batch: null, batches: [], startups: [], intake: { links: 1, submissions: 0, publicUrl: "https://blockid.au/apply/x", openLinks: 1 }, snapshots: [], overridesCount: 0 });
    expect(v.stages[0].state).toBe("in_progress");
    expect(v.stages[0].summary).toBe("0 applications · 1 link");
  });

  it("a scored, decided cohort with two snapshots and dossiers: done through the journey", () => {
    const batch = { id: "b-1", name: "Cohort 5", status: "done" as const, createdAt: "2026-09-01T00:00:00Z" };
    const startups = [
      startup({ svi: 72, confidence: 60, decision: "proceed", assessmentStatus: "submitted", dossierProduced: true, evidence: summariseEvidence([{ dimension: "tre", evidence_type: "revenue_proof", confidence_level: "transaction_data" }]) }),
      startup({ svi: 55, confidence: 40, decision: "pass", assessmentStatus: "submitted", feedbackLetterSent: true }),
      startup({ svi: 61, confidence: null, decision: "track", assessmentStatus: "submitted", shortlisted: true, dossierProduced: true }),
    ];
    const v = buildProgramJourney({
      batch,
      batches: [batch],
      startups,
      intake: { links: 1, submissions: 3, publicUrl: null, openLinks: 0 },
      snapshots: [
        { id: "s1", takenAt: "2026-09-02T00:00:00Z", n: 3, medianSvi: 58 },
        { id: "s2", takenAt: "2026-09-10T00:00:00Z", n: 3, medianSvi: 61 },
      ],
      overridesCount: 2,
    });
    expect(v.stages.map((s) => s.state)).toEqual(["done", "done", "done", "done", "done", "done"]);
    expect(v.assessment).toMatchObject({ batchStatus: "done", total: 3, scored: 3, pending: 0, medianSvi: 61, medianConfidence: 50 });
    expect(v.selection.decisions).toEqual({ pass: 1, track: 1, proceed: 1, undecided: 0 });
    expect(v.selection.shortlisted).toBe(1);
    expect(v.selection.nonSelected.map((s) => s.name)).toEqual([startups[1].name]);
    // demo day: the proceed + the shortlisted one, readiness from evidence + verification
    expect(v.demoDay.rows.map((r) => r.startup.name)).toEqual([startups[0].name, startups[2].name]);
    expect(v.demoDay.rows[0].readiness).toBe("gaps");
    expect(v.demoDay.rows[0].verificationLabel).toBe("BlockID Verified L2");
    // program: mentor gap per startup
    expect(v.program.startups[0].mentorGap?.dimension).toBe("tre");
    expect(v.program.startups[0].mentorGap?.missing.map((m) => m.code)).not.toContain("revenue_proof");
    expect(v.sponsor).toMatchObject({ n: 3, scored: 3, snapshots: 2, overrides: 2, lettersSent: 1, dossiers: 2 });
    expect(v.stages[4].summary).toBe("2 of 2 dossiers");
  });

  it("queued items keep assessment in progress; a partial decision set keeps selection in progress", () => {
    const batch = { id: "b-1", name: "Cohort 5", status: "running" as const, createdAt: "2026-09-01T00:00:00Z" };
    const v = buildProgramJourney({
      batch,
      batches: [batch],
      startups: [startup({ svi: 70, decision: "proceed", assessmentStatus: "submitted" }), startup({ svi: 50 }), startup({ status: "queued", svi: null })],
      intake: null,
      snapshots: [],
      overridesCount: 0,
    });
    expect(v.stages[1].state).toBe("in_progress");
    expect(v.stages[1].summary).toBe("2 scored · 1 pending");
    expect(v.stages[2].state).toBe("in_progress");
    expect(v.stages[3].state).toBe("in_progress");
    expect(v.stages[4].state).toBe("in_progress");
    expect(v.stages[5].state).toBe("in_progress");
    expect(v.assessment.pending).toBe(1);
  });
});
