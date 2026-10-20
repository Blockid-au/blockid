import { describe, expect, it } from "vitest";
import { fakeDb } from "./fake-db.testkit";
import { onVerifiedOrderRefunded } from "./refund";
import { loadVerifiedReviewQueue } from "./detail";
import { markReviewed } from "./mark-reviewed";
import { ADMIN, NOW, ORDER, REPORT, seedTables } from "./review.fixtures.testkit";

describe("onVerifiedOrderRefunded (W3 charge.refunded hook)", () => {
  it("revokes the badge, cancels the open review; the queue drops the order and markReviewed refuses", async () => {
    const tables = seedTables();
    tables.assembled_reports[0].reviewed = true;
    tables.report_reviews.push({ id: "rv-1", order_id: ORDER, status: "in_progress", created_at: "2026-10-21T00:00:00Z" });
    const db = fakeDb({ tables });
    // W3 moved the order to REFUNDED first.
    db.tables.report_orders.find((o) => o.id === ORDER)!.status = "REFUNDED";

    expect(await onVerifiedOrderRefunded(db as never, { orderId: ORDER, reportId: REPORT })).toEqual({ badgeRevoked: true, reviewsCancelled: true });
    expect(db.tables.assembled_reports[0].reviewed).toBe(false);
    expect(db.tables.report_reviews[0].status).toBe("cancelled");

    const q = await loadVerifiedReviewQueue(db as never, { now: NOW });
    expect(q.rows.map((r) => r.orderId)).not.toContain(ORDER);
    expect(await markReviewed(db as never, { orderId: ORDER, reviewer: { id: ADMIN, isAdmin: true } }, { now: () => NOW })).toEqual({ ok: false, error: "refunded" });

    // Idempotent.
    expect(await onVerifiedOrderRefunded(db as never, { orderId: ORDER, reportId: REPORT })).toEqual({ badgeRevoked: true, reviewsCancelled: true });
  });

  it("never throws (no report id, failing table)", async () => {
    const db = fakeDb({ tables: seedTables(), failOn: { report_reviews: { update: { message: "boom" } } } });
    expect(await onVerifiedOrderRefunded(db as never, { orderId: ORDER, reportId: null })).toEqual({ badgeRevoked: false, reviewsCancelled: false });
  });
});
