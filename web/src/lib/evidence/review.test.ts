// G14-S36 — reviewer decision arithmetic + persistence contract.

import { describe, expect, it, vi } from "vitest";
import { applyEvidenceReview, buildReviewPatch, isReviewDecision, linkedEvidenceId, reviewTransition } from "./review";

const NOW = new Date("2026-09-16T10:00:00Z");

describe("buildReviewPatch", () => {
  it("approve → is_verified + reviewer stamp + third_party_verified (the only path to that level)", () => {
    const p = buildReviewPatch({ decision: "approve", reviewerUserId: "admin-1", note: "  ASIC extract matches  ", currentLevel: "document_uploaded", now: NOW });
    expect(p).toEqual({
      is_verified: true,
      verified_at: NOW.toISOString(),
      verified_by_user_id: "admin-1",
      review_status: "approved",
      review_note: "ASIC extract matches",
      confidence_level: "third_party_verified",
      updated_at: NOW.toISOString(),
    });
  });

  it("reject → verification cleared and the level capped back to what a founder can file", () => {
    const p = buildReviewPatch({ decision: "reject", reviewerUserId: "admin-1", note: "blurry scan", currentLevel: "third_party_verified", now: NOW });
    expect(p).toMatchObject({ is_verified: false, verified_at: null, verified_by_user_id: null, review_status: "rejected", review_note: "blurry scan", confidence_level: "document_uploaded" });
    expect(buildReviewPatch({ decision: "reject", reviewerUserId: "a", currentLevel: "public_url", now: NOW }).confidence_level).toBe("public_url");
  });

  it("an empty note is stored as null and a long note is truncated", () => {
    expect(buildReviewPatch({ decision: "approve", reviewerUserId: "a", note: "   ", currentLevel: null, now: NOW }).review_note).toBeNull();
    expect(buildReviewPatch({ decision: "approve", reviewerUserId: "a", note: "x".repeat(2000), currentLevel: null, now: NOW }).review_note).toHaveLength(1000);
  });

  it("isReviewDecision accepts approve | reject only", () => {
    expect(isReviewDecision("approve")).toBe(true);
    expect(isReviewDecision("reject")).toBe(true);
    expect(isReviewDecision("verify")).toBe(false);
    expect(isReviewDecision(null)).toBe(false);
  });
});

describe("state-machine bridge", () => {
  it("only a validation_required Phase-3 row moves; every other state is left to the transition table", () => {
    expect(reviewTransition("validation_required", "approve")).toBe("verified");
    expect(reviewTransition("validation_required", "reject")).toBe("rejected");
    expect(reviewTransition("uploaded", "approve")).toBeNull();
    expect(reviewTransition("verified", "approve")).toBeNull();
    expect(reviewTransition("garbage", "approve")).toBeNull();
  });

  it("linkedEvidenceId reads a uuid value, ignores URLs / free text", () => {
    expect(linkedEvidenceId("6f1c2b3a-1b2c-4d5e-8f90-abcdef123456")).toBe("6f1c2b3a-1b2c-4d5e-8f90-abcdef123456");
    expect(linkedEvidenceId("https://example.com/audit.pdf")).toBeNull();
    expect(linkedEvidenceId(null)).toBeNull();
  });
});

function fakeDb(opts: { row: Record<string, unknown> | null; evidence?: Record<string, unknown> | null }) {
  const updates: Array<{ table: string; patch: Record<string, unknown>; id: string }> = [];
  const db = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: table === "svi_dimension_evidence" ? opts.row : null, error: null }),
          eq: () => ({ maybeSingle: async () => ({ data: table === "evidence" ? (opts.evidence ?? null) : null, error: null }) }),
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async (_c: string, id: string) => {
          updates.push({ table, patch, id });
          return { error: null };
        },
      }),
    }),
  };
  return { db: db as never, updates };
}

describe("applyEvidenceReview", () => {
  it("404 when the row is missing; 409-shaped not_pending when the founder never requested review", async () => {
    const missing = fakeDb({ row: null });
    expect(await applyEvidenceReview(missing.db, { evidenceId: "e", decision: "approve", reviewerUserId: "a" })).toEqual({ ok: false, error: "not_found" });
    const idle = fakeDb({ row: { id: "e", project_id: "p", dimension: "lco", evidence_type: "abn_registration", confidence_level: "document_uploaded", review_status: "none" } });
    expect(await applyEvidenceReview(idle.db, { evidenceId: "e", decision: "approve", reviewerUserId: "a" })).toEqual({ ok: false, error: "not_pending" });
    expect(idle.updates).toEqual([]);
  });

  it("approve writes the patch and, when the value points at a validation_required evidence row, moves it to verified", async () => {
    const evId = "6f1c2b3a-1b2c-4d5e-8f90-abcdef123456";
    const f = fakeDb({
      row: { id: "e", project_id: "p", dimension: "lco", evidence_type: "abn_registration", confidence_level: "document_uploaded", review_status: "pending", evidence_value_or_url: evId },
      evidence: { id: evId, verification_state: "validation_required" },
    });
    const res = await applyEvidenceReview(f.db, { evidenceId: "e", decision: "approve", reviewerUserId: "admin-1", note: "ok", now: NOW });
    expect(res).toMatchObject({ ok: true, row: { id: "e", confidence_level: "third_party_verified", review_status: "approved" }, linked: { evidenceId: evId, from: "validation_required", to: "verified" } });
    expect(f.updates[0]).toMatchObject({ table: "svi_dimension_evidence", id: "e", patch: { is_verified: true, verified_by_user_id: "admin-1", confidence_level: "third_party_verified" } });
    expect(f.updates[1]).toMatchObject({ table: "evidence", id: evId, patch: { verification_state: "verified" } });
  });

  it("reject leaves a Phase-3 row that is already verified alone (illegal transition → no write)", async () => {
    const evId = "6f1c2b3a-1b2c-4d5e-8f90-abcdef123456";
    const f = fakeDb({
      row: { id: "e", project_id: "p", dimension: "lco", evidence_type: "abn_registration", confidence_level: "document_uploaded", review_status: "pending", evidence_value_or_url: evId },
      evidence: { id: evId, verification_state: "verified" },
    });
    const res = await applyEvidenceReview(f.db, { evidenceId: "e", decision: "reject", reviewerUserId: "admin-1", note: "no", now: NOW });
    expect(res).toMatchObject({ ok: true, row: { review_status: "rejected", confidence_level: "document_uploaded" }, linked: null });
    expect(f.updates).toHaveLength(1);
  });

  it("a throwing evidence lookup never fails the decision", async () => {
    const db = {
      from: (table: string) => {
        if (table === "evidence") throw new Error("no such table");
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "e", project_id: "p", dimension: "lco", evidence_type: "x", confidence_level: "document_uploaded", review_status: "pending", evidence_value_or_url: "6f1c2b3a-1b2c-4d5e-8f90-abcdef123456" }, error: null }) }) }),
          update: () => ({ eq: vi.fn(async () => ({ error: null })) }),
        };
      },
    } as never;
    const res = await applyEvidenceReview(db, { evidenceId: "e", decision: "approve", reviewerUserId: "a" });
    expect(res).toMatchObject({ ok: true, linked: null });
  });
});
