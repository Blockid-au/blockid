import { describe, expect, it } from "vitest";
import {
  CORRECTION_KINDS,
  CORRECTION_KIND_LABEL,
  DIMENSION_TARGETS,
  PROFILE_TARGETS,
  composeResolution,
  isTargetRef,
  parseCorrectionInput,
  plannedChangeFor,
  targetLabel,
} from "./model";

const PID = "11111111-2222-4333-8444-555555555555";

describe("corrections model — vocabulary", () => {
  it("six kinds, each with a label + hint; eight dimension targets in report order", () => {
    expect(CORRECTION_KINDS).toEqual(["incorrect_data", "stale_data", "misunderstood_evidence", "duplicate_company", "wrong_sector_stage", "unsupported_statement"]);
    for (const k of CORRECTION_KINDS) {
      expect(CORRECTION_KIND_LABEL[k].label.length).toBeGreaterThan(3);
      expect(CORRECTION_KIND_LABEL[k].hint.length).toBeGreaterThan(10);
    }
    expect(DIMENSION_TARGETS).toHaveLength(8);
    expect(DIMENSION_TARGETS[0]).toEqual({ ref: "dimension:tre", label: "Traction & Revenue Evidence" });
    expect(PROFILE_TARGETS.map((t) => t.ref)).toEqual(["profile:sector", "profile:stage", "profile:company", "report:latest"]);
  });

  it("target refs: dimension / claim / report#section / profile / evidence; nothing else", () => {
    expect(isTargetRef("dimension:tre")).toBe(true);
    expect(isTargetRef("claim:0d8f3c2a-1111-4222-8333-444455556666")).toBe(true);
    expect(isTargetRef("report:rep_123#valuation")).toBe(true);
    expect(isTargetRef("profile:sector")).toBe(true);
    expect(isTargetRef("evidence:abc")).toBe(true);
    expect(isTargetRef("random text")).toBe(false);
    expect(isTargetRef("dimension:")).toBe(false);
    expect(isTargetRef("<script>")).toBe(false);
    expect(isTargetRef(`dimension:${"x".repeat(200)}`)).toBe(false);
  });

  it("targetLabel maps known refs to human labels and echoes unknown refs", () => {
    expect(targetLabel("dimension:ftv")).toBe("Founder & Team Value");
    expect(targetLabel("profile:stage")).toBe("Growth stage on the startup record");
    expect(targetLabel("claim:abc")).toBe("claim:abc");
    expect(targetLabel(null)).toBe("General");
  });
});

describe("parseCorrectionInput", () => {
  it("accepts a minimal valid body and trims", () => {
    const r = parseCorrectionInput({ projectId: PID, kind: "stale_data", message: "  MRR is now A$12k, not A$4k.  " });
    expect(r).toEqual({ ok: true, input: { projectId: PID, kind: "stale_data", targetRef: null, message: "MRR is now A$12k, not A$4k.", proposed: {} } });
  });

  it("rejects a bad project id, kind, target ref, empty / long message", () => {
    expect(parseCorrectionInput({ projectId: "nope", kind: "stale_data", message: "x" })).toMatchObject({ ok: false, field: "projectId" });
    expect(parseCorrectionInput({ projectId: PID, kind: "made_up", message: "x" })).toMatchObject({ ok: false, field: "kind" });
    expect(parseCorrectionInput({ projectId: PID, kind: "stale_data", targetRef: "???", message: "x" })).toMatchObject({ ok: false, field: "targetRef" });
    expect(parseCorrectionInput({ projectId: PID, kind: "stale_data", message: "   " })).toMatchObject({ ok: false, field: "message" });
    expect(parseCorrectionInput({ projectId: PID, kind: "stale_data", message: "x".repeat(4001) })).toMatchObject({ ok: false, field: "message" });
    expect(parseCorrectionInput(null)).toMatchObject({ ok: false, field: "projectId" });
  });

  it("parses a proposed sector / stage and validates the stage range", () => {
    const ok = parseCorrectionInput({ projectId: PID, kind: "wrong_sector_stage", targetRef: "profile:sector", message: "We are fintech.", proposed: { industry: " fintech ", stage: "3" } });
    expect(ok).toMatchObject({ ok: true, input: { proposed: { industry: "fintech", stage: 3 } } });
    expect(parseCorrectionInput({ projectId: PID, kind: "wrong_sector_stage", message: "x", proposed: { stage: 9 } })).toMatchObject({ ok: false, field: "proposed.stage" });
    expect(parseCorrectionInput({ projectId: PID, kind: "wrong_sector_stage", message: "x", proposed: { stage: 1.5 } })).toMatchObject({ ok: false, field: "proposed.stage" });
    expect(parseCorrectionInput({ projectId: PID, kind: "wrong_sector_stage", message: "x", proposed: { industry: "x".repeat(81) } })).toMatchObject({ ok: false, field: "proposed.industry" });
  });

  it("a sector / stage correction needs a target or a proposal", () => {
    expect(parseCorrectionInput({ projectId: PID, kind: "wrong_sector_stage", message: "wrong" })).toMatchObject({ ok: false, field: "targetRef" });
    expect(parseCorrectionInput({ projectId: PID, kind: "wrong_sector_stage", targetRef: "profile:stage", message: "wrong" })).toMatchObject({ ok: true });
  });
});

describe("plannedChangeFor / composeResolution — accept never overwrites silently", () => {
  it("only wrong_sector_stage with a proposal plans a change, and only through the matching target", () => {
    expect(plannedChangeFor({ kind: "incorrect_data", target_ref: "profile:sector", proposed: { industry: "fintech" } })).toBeNull();
    expect(plannedChangeFor({ kind: "wrong_sector_stage", target_ref: "profile:sector", proposed: { industry: "fintech" } })).toEqual({ field: "industry", value: "fintech" });
    expect(plannedChangeFor({ kind: "wrong_sector_stage", target_ref: null, proposed: { stage: 3 } })).toEqual({ field: "stage", value: 3 });
    expect(plannedChangeFor({ kind: "wrong_sector_stage", target_ref: "profile:stage", proposed: { industry: "fintech" } })).toBeNull();
    expect(plannedChangeFor({ kind: "wrong_sector_stage", target_ref: "profile:sector", proposed: {} })).toBeNull();
  });

  it("resolution text records what was (or was not) changed", () => {
    expect(composeResolution("reject", "Evidence contradicts it.", null, false)).toBe("Evidence contradicts it.");
    expect(composeResolution("reject", null, null, false)).toBe("Rejected — no change made.");
    expect(composeResolution("accept", "Thanks.", null, false)).toBe("Thanks. Accepted — recorded against the record; the underlying data is corrected by re-uploading the evidence or re-running the analysis (no value was overwritten).");
    expect(composeResolution("accept", null, { field: "industry", value: "fintech" }, true)).toBe("Accepted — industry → fintech written through the project update path (versioned, audit-logged).");
    expect(composeResolution("accept", "ok", { field: "stage", value: 3 }, false)).toBe("ok Accepted — stage → 3 could NOT be written through the project update path; apply manually.");
  });
});
