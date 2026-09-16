import { describe, expect, it } from "vitest";
import { canRequestReview, toEvidenceRowOut } from "./evidence-row";

describe("toEvidenceRowOut", () => {
  it("normalises a DB row and tolerates the pre-0406 shape (no review columns)", () => {
    expect(toEvidenceRowOut({ id: "e", project_id: "p", dimension: "lco", evidence_type: "abn_registration", confidence_level: "document_uploaded", is_verified: false })).toEqual({
      id: "e",
      projectId: "p",
      dimension: "lco",
      evidence_type: "abn_registration",
      confidence_level: "document_uploaded",
      is_verified: false,
      verified_at: null,
      review_status: "none",
      review_note: null,
    });
    expect(toEvidenceRowOut({ review_status: "pending" }).review_status).toBe("pending");
    expect(toEvidenceRowOut({ review_status: "weird" }).review_status).toBe("none");
  });
});

describe("canRequestReview", () => {
  it("only an unverified row that is not already pending", () => {
    expect(canRequestReview({ is_verified: false, review_status: "none" })).toBe(true);
    expect(canRequestReview({ is_verified: false, review_status: "rejected" })).toBe(true);
    expect(canRequestReview({ is_verified: false, review_status: "pending" })).toBe(false);
    expect(canRequestReview({ is_verified: true, review_status: "approved" })).toBe(false);
  });
});
