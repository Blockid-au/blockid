import { describe, expect, it } from "vitest";
import { describeSla } from "./sla";
import { buildReviewItems, compareQueueRows, loadVerifiedReviewDetail, loadVerifiedReviewQueue, recordClaimDecision, saveReviewNotes, type VerifiedQueueRow } from "./detail";
import { fakeDb } from "./fake-db.testkit";
import { ADMIN, CLAIM, HUB_LCO, HUB_OTHER, HUB_TRE, NOW, ORDER, ORDER_FULL, ORDER_OVERDUE, ORDER_READY, ORDER_REFUNDED, seedTables } from "./review.fixtures.testkit";

const db = () => fakeDb({ tables: seedTables(), unique: { report_review_claims: ["review_id", "claim_ref"] } });

describe("queue ordering", () => {
  const row = (id: string, due: string | null, paidAt = "2026-10-01T00:00:00Z"): VerifiedQueueRow =>
    ({ orderId: id, paidAt, sla: describeSla(due, NOW) }) as VerifiedQueueRow;

  it("overdue first (most overdue first), then earliest deadline, no SLA last", () => {
    const rows = [
      row("on-track-late", "2026-10-30T12:59:59Z"),
      row("no-sla", null),
      row("overdue-1d", "2026-10-21T12:59:59Z"),
      row("due-soon", "2026-10-22T12:59:59Z"),
      row("overdue-3d", "2026-10-19T12:59:59Z"),
      row("on-track-early", "2026-10-26T12:59:59Z"),
    ];
    expect([...rows].sort(compareQueueRows).map((r) => r.orderId)).toEqual(["overdue-3d", "overdue-1d", "due-soon", "on-track-early", "on-track-late", "no-sla"]);
  });

  it("loader lists IN_REVIEW only (refunded / delivered drop out), overdue first, with names", async () => {
    const q = await loadVerifiedReviewQueue(db() as never, { now: NOW });
    expect(q.error).toBeNull();
    expect(q.rows.map((r) => r.orderId)).toEqual([ORDER_OVERDUE, ORDER, ORDER_FULL]);
    expect(q.rows.map((r) => r.orderId)).not.toContain(ORDER_REFUNDED);
    expect(q.rows.map((r) => r.orderId)).not.toContain(ORDER_READY);
    expect(q.rows[0]).toMatchObject({ startupName: "Acme Robotics", buyerEmail: "buyer@example.test", buyerName: "Jamie Buyer", tier: "verified" });
    expect(q.rows[0].sla.state).toBe("overdue");
    expect(q.counts).toEqual({ total: 3, overdue: 1, dueSoon: 2, onTrack: 0 });
  });

  it("0474 not applied → migration_pending banner, not a crash", async () => {
    const old = fakeDb({ tables: seedTables(), missingColumns: { report_orders: ["sla_due_at"] } });
    expect((await loadVerifiedReviewQueue(old as never, { now: NOW })).error).toBe("migration_pending");
  });
});

describe("review detail", () => {
  it("lists hub rows of THIS project, the report's own evidence (gaps dropped) and claims", async () => {
    const res = await loadVerifiedReviewDetail(db() as never, ORDER, { now: NOW });
    if (!res.ok) throw new Error(res.error);
    const refs = res.detail.items.map((i) => i.ref);
    expect(refs).toContain(`hub:${HUB_TRE}`);
    expect(refs).toContain(`hub:${HUB_LCO}`);
    expect(refs).not.toContain(`hub:${HUB_OTHER}`);
    expect(refs).toContain("ev:ev-connected-revenue-stripe");
    expect(refs).not.toContain("ev:ev-missing-repo-audit");
    expect(refs).toContain(`claim:${CLAIM}`);
    const tre = res.detail.items.find((i) => i.ref === `hub:${HUB_TRE}`)!;
    expect(tre).toMatchObject({ kind: "hub", dims: ["tre"], href: "https://dashboard.stripe.com/x", level: "document_uploaded", decision: null });
    expect(res.detail.canDecide).toBe(true);
    expect(res.detail.report?.dims).toHaveLength(8);
  });

  it("a report evidence row whose id IS a hub row is shown once (as the hub row)", () => {
    const items = buildReviewItems({
      hubRows: [{ id: HUB_TRE, dimension: "tre", evidence_label: "Stripe" }],
      report: { appendix: { evidenceRegister: [{ evidence_id: HUB_TRE, source: "upload", label: "dup", status: "evidenced", dims: ["tre"] }] }, dimensions: [] } as never,
      claims: [],
      decisions: new Map(),
    });
    expect(items.map((i) => i.ref)).toEqual([`hub:${HUB_TRE}`]);
  });

  it("refunded / unknown orders", async () => {
    const r = await loadVerifiedReviewDetail(db() as never, ORDER_REFUNDED, { now: NOW });
    expect(r.ok && r.detail.canDecide).toBe(false);
    expect(await loadVerifiedReviewDetail(db() as never, "not-a-uuid")).toEqual({ ok: false, error: "not_found" });
  });
});

describe("recordClaimDecision", () => {
  it("accepting a hub row approves it through lib/evidence/review.ts (single source) and records the decision", async () => {
    const d = db();
    const res = await recordClaimDecision(d as never, { orderId: ORDER, ref: `hub:${HUB_TRE}`, decision: "accept", note: "Checked Stripe dashboard", reviewerId: ADMIN, now: NOW });
    if (!res.ok) throw new Error(res.error);
    expect(res.item).toMatchObject({ decision: "accept", level: "third_party_verified", status: "approved", note: "Checked Stripe dashboard" });
    const ev = d.tables.svi_dimension_evidence.find((r) => r.id === HUB_TRE)!;
    expect(ev).toMatchObject({ review_status: "approved", is_verified: true, verified_by_user_id: ADMIN, confidence_level: "third_party_verified" });
    expect(d.tables.report_review_claims).toEqual([expect.objectContaining({ review_id: res.reviewId, claim_ref: `hub:${HUB_TRE}`, decision: "accept" })]);
    expect(d.tables.report_reviews).toEqual([expect.objectContaining({ order_id: ORDER, status: "in_progress", reviewer_id: ADMIN })]);

    // Changing your mind upserts the same row.
    const again = await recordClaimDecision(d as never, { orderId: ORDER, ref: `hub:${HUB_TRE}`, decision: "reject", note: "Numbers do not match", reviewerId: ADMIN, now: NOW });
    expect(again.ok).toBe(true);
    expect(d.tables.report_review_claims).toHaveLength(1);
    expect(d.tables.report_review_claims[0].decision).toBe("reject");
    expect(d.tables.svi_dimension_evidence.find((r) => r.id === HUB_TRE)).toMatchObject({ review_status: "rejected", is_verified: false });
  });

  it("report evidence + claims are recorded without touching svi_dimension_evidence", async () => {
    const d = db();
    expect((await recordClaimDecision(d as never, { orderId: ORDER, ref: "ev:ev-connected-revenue-stripe", decision: "accept", reviewerId: ADMIN, now: NOW })).ok).toBe(true);
    expect((await recordClaimDecision(d as never, { orderId: ORDER, ref: `claim:${CLAIM}`, decision: "reject", note: "Overstated", reviewerId: ADMIN, now: NOW })).ok).toBe(true);
    expect(d.calls.some((c) => c.table === "svi_dimension_evidence" && c.op === "update")).toBe(false);
    expect(d.tables.report_review_claims).toHaveLength(2);
  });

  it("refuses: reject without a note, unknown / foreign item, refunded or delivered order", async () => {
    const d = db();
    expect(await recordClaimDecision(d as never, { orderId: ORDER, ref: `hub:${HUB_TRE}`, decision: "reject", reviewerId: ADMIN })).toEqual({ ok: false, error: "note_required" });
    expect(await recordClaimDecision(d as never, { orderId: ORDER, ref: `hub:${HUB_OTHER}`, decision: "accept", reviewerId: ADMIN })).toEqual({ ok: false, error: "unknown_claim" });
    expect(await recordClaimDecision(d as never, { orderId: ORDER, ref: "ev:nope", decision: "accept", reviewerId: ADMIN })).toEqual({ ok: false, error: "unknown_claim" });
    expect(await recordClaimDecision(d as never, { orderId: ORDER, ref: `hub:${HUB_TRE}`, decision: "maybe", reviewerId: ADMIN })).toEqual({ ok: false, error: "bad_decision" });
    expect(await recordClaimDecision(d as never, { orderId: ORDER_REFUNDED, ref: `hub:${HUB_TRE}`, decision: "accept", reviewerId: ADMIN })).toEqual({ ok: false, error: "refunded" });
    expect(await recordClaimDecision(d as never, { orderId: ORDER_READY, ref: `hub:${HUB_TRE}`, decision: "accept", reviewerId: ADMIN })).toEqual({ ok: false, error: "not_in_review" });
    expect(d.tables.svi_dimension_evidence.find((r) => r.id === HUB_TRE)?.review_status).toBe("none");
    expect(d.tables.report_review_claims).toHaveLength(0);
  });
});

describe("saveReviewNotes", () => {
  it("stores admin-only notes on the review row; refused once refunded", async () => {
    const d = db();
    const res = await saveReviewNotes(d as never, { orderId: ORDER, notes: "  ABN checked on ABR.  ", reviewerId: ADMIN });
    expect(res).toMatchObject({ ok: true, notes: "ABN checked on ABR." });
    expect(d.tables.report_reviews[0]).toMatchObject({ notes: "ABN checked on ABR.", status: "in_progress" });
    expect(await saveReviewNotes(d as never, { orderId: ORDER_REFUNDED, notes: "x", reviewerId: ADMIN })).toEqual({ ok: false, error: "refunded" });
    expect(await saveReviewNotes(d as never, { orderId: ORDER, notes: "x".repeat(5001), reviewerId: ADMIN })).toEqual({ ok: false, error: "note_too_long" });
  });
});
