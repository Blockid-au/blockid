import { beforeEach, describe, expect, it, vi } from "vitest";

// The Verified price includes the Investor Pack: this flow must never touch
// the credit ledger. Any import + call of lib/credits would show up here.
const credits = vi.hoisted(() => ({ canAfford: vi.fn(), debitCredits: vi.fn(), deductCredits: vi.fn(), spendCredits: vi.fn() }));
vi.mock("@/lib/credits", () => credits);

import { fakeDb, type FakeDb } from "./fake-db.testkit";
import { markReviewed, reviewedEvidence, type MarkReviewedDeps } from "./mark-reviewed";
import { recordClaimDecision } from "./detail";
import { attachReviewBadge, readReviewBadgeState } from "./badge";
import { recomputeAfterReview } from "./recompute";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { ADMIN, BUYER, CLAIM, HUB_LCO, HUB_TRE, NOW, ORDER, ORDER_FULL, ORDER_READY, ORDER_REFUNDED, PROJECT, REPORT, seedTables } from "./review.fixtures.testkit";

const reviewer = { id: ADMIN, displayName: "Long Do", isAdmin: true };

function mkDeps() {
  return {
    now: () => NOW,
    renderInvestorPack: vi.fn(async () => Buffer.from("%PDF-1.4 fake investor pack")),
    sendReviewedEmail: vi.fn(async () => ({ ok: true })),
    track: vi.fn(async () => undefined),
    audit: vi.fn(async () => ({ ok: true })),
    siteUrl: () => "https://blockid.au",
  } satisfies MarkReviewedDeps;
}

let db: FakeDb;
let deps: ReturnType<typeof mkDeps>;

beforeEach(async () => {
  for (const f of Object.values(credits)) f.mockReset();
  db = fakeDb({ tables: seedTables(), unique: { report_review_claims: ["review_id", "claim_ref"] } });
  deps = mkDeps();
  // The reviewer's decisions: accept the Stripe (TRE) hub row, reject the IP row, reject a claim.
  for (const [ref, decision, note] of [
    [`hub:${HUB_TRE}`, "accept", "Matches Stripe"],
    [`hub:${HUB_LCO}`, "reject", "Unsigned copy"],
    [`claim:${CLAIM}`, "reject", "Overstated"],
  ] as const) {
    const r = await recordClaimDecision(db as never, { orderId: ORDER, ref, decision, note, reviewerId: ADMIN, now: NOW });
    if (!r.ok) throw new Error(r.error);
  }
});

const order = (id = ORDER) => db.tables.report_orders.find((o) => o.id === id)!;

describe("markReviewed — happy path", () => {
  it("IN_REVIEW → READY with reviewer + delivered stamps, badge on, review completed", async () => {
    const res = await markReviewed(db as never, { orderId: ORDER, reviewer }, deps);
    if (!res.ok) throw new Error(res.error);
    expect(res).toMatchObject({ alreadyReviewed: false, repaired: false, emailSent: true, slaMet: true, warnings: [] });
    expect(order()).toMatchObject({ status: "READY", reviewed_by: ADMIN, reviewed_at: NOW.toISOString(), delivered_at: NOW.toISOString() });
    expect(db.tables.assembled_reports[0]).toMatchObject({ reviewed: true, reviewed_by: ADMIN, reviewed_at: NOW.toISOString(), payg_tier: "verified" });
    expect(db.tables.report_reviews[0]).toMatchObject({ status: "completed", completed_at: NOW.toISOString() });
    expect(res.badgeLabel).toBe("BlockID Reviewed · 22 Oct 2026 · Long Do");

    // The read path now attaches the badge (Verified only).
    const state = await readReviewBadgeState(db as never, REPORT);
    expect(attachReviewBadge(demoReportV2(), "verified", state).reviewBadge?.label).toBe(res.badgeLabel);
  });

  it("recomputes verification level (L2 → L3 on accepted financials) and evidence confidence via the engines", async () => {
    const res = await markReviewed(db as never, { orderId: ORDER, reviewer }, deps);
    if (!res.ok) throw new Error(res.error);
    expect(res.previousLevel).toBe(2);
    expect(res.verificationLevel).toBe(3);
    expect(db.tables.projects.find((p) => p.id === PROJECT)).toMatchObject({ verification_level: 3, last_verified_at: NOW.toISOString() });
    const snap = db.tables.svi_snapshots[0];
    expect(snap.evidence_confidence).toBe(res.evidenceConfidence);
    const baseline = recomputeAfterReview({ currentLevel: 2, items: [], analysis: seedTables().svi_snapshots[0].analysis_json as never });
    expect(res.evidenceConfidence).toBeGreaterThan(baseline.evidenceConfidence.score);
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "verification.level_recomputed", subjectId: PROJECT, fields: expect.objectContaining({ from: 2, to: 3 }) }));
  });

  it("claims are recorded but not graded; accepted hub rows count as third_party_verified", () => {
    const ev = reviewedEvidence([
      { ref: "hub:x", kind: "hub", dims: ["tre"], decision: "accept", level: "document_uploaded", source: "evidence_hub" },
      { ref: "claim:y", kind: "claim", dims: ["tre"], decision: "reject", level: null, source: "claim" },
      { ref: "ev:z", kind: "report", dims: ["mpc"], decision: null, level: "public_url", source: "external" },
    ] as never);
    expect(ev).toEqual([{ decision: "accept", dims: ["tre"], level: "third_party_verified", source: "evidence_hub" }]);
  });

  it("Investor Pack rendered from the reviewed report WITHOUT credits, attached to the buyer e-mail", async () => {
    await markReviewed(db as never, { orderId: ORDER, reviewer }, deps);
    expect(deps.renderInvestorPack).toHaveBeenCalledTimes(1);
    const data = (deps.renderInvestorPack.mock.calls[0] as unknown[])[0] as Record<string, any>;
    expect(data.reviewBadge).toBe("BlockID Reviewed · 22 Oct 2026 · Long Do");
    expect(data.svi.scoreSuffix).toBe("SVI");
    expect(data.evidenceCompleteness.rows.length).toBeGreaterThan(0);
    for (const f of Object.values(credits)) expect(f).not.toHaveBeenCalled();

    expect(deps.sendReviewedEmail).toHaveBeenCalledTimes(1);
    const mail = (deps.sendReviewedEmail.mock.calls[0] as unknown[])[0] as Record<string, any>;
    expect(mail.to).toBe("buyer@example.test");
    expect(mail.input.reportUrl).toBe(`https://blockid.au/workspace/reports/business?order=${ORDER}`);
    expect(mail.input).toMatchObject({ startupName: "Acme Robotics", accepted: 1, reviewed: 2, name: "Jamie Buyer" });
    expect(Buffer.isBuffer(mail.investorPack)).toBe(true);
  });

  it("emits analytics + the completion audit row", async () => {
    await markReviewed(db as never, { orderId: ORDER, reviewer }, deps);
    expect(deps.track).toHaveBeenCalledWith("payg_verified_reviewed", expect.objectContaining({ order_id: ORDER, sla_met: true, accepted: 1, rejected: 1, verification_level: 3 }), expect.objectContaining({ userId: BUYER }));
    expect(deps.audit).toHaveBeenCalledWith(expect.objectContaining({ userId: ADMIN, action: "verified_review.completed", subjectType: "report_order", subjectId: ORDER }));
  });
});

describe("markReviewed — idempotency + refusals", () => {
  it("a second call answers alreadyReviewed and sends nothing", async () => {
    await markReviewed(db as never, { orderId: ORDER, reviewer }, deps);
    const second = await markReviewed(db as never, { orderId: ORDER, reviewer }, deps);
    expect(second).toMatchObject({ ok: true, alreadyReviewed: true, emailSent: false });
    expect(deps.sendReviewedEmail).toHaveBeenCalledTimes(1);
    expect(deps.renderInvestorPack).toHaveBeenCalledTimes(1);
  });

  it("refused for a non-admin reviewer", async () => {
    expect(await markReviewed(db as never, { orderId: ORDER, reviewer: { ...reviewer, isAdmin: false } }, deps)).toEqual({ ok: false, error: "forbidden" });
    expect(order().status).toBe("IN_REVIEW");
  });

  it("refused when refunded (W3 set REFUNDED) — no badge, no e-mail", async () => {
    expect(await markReviewed(db as never, { orderId: ORDER_REFUNDED, reviewer }, deps)).toEqual({ ok: false, error: "refunded" });
    expect(deps.sendReviewedEmail).not.toHaveBeenCalled();
    expect(db.tables.assembled_reports[0].reviewed).toBe(false);
  });

  it("refused for a non-Verified order, a delivered-but-never-reviewed order, an unknown id", async () => {
    expect(await markReviewed(db as never, { orderId: ORDER_FULL, reviewer }, deps)).toEqual({ ok: false, error: "not_verified" });
    expect(await markReviewed(db as never, { orderId: ORDER_READY, reviewer }, deps)).toEqual({ ok: false, error: "not_in_review" });
    expect(await markReviewed(db as never, { orderId: "ffffffff-ffff-4fff-8fff-ffffffffffff", reviewer }, deps)).toEqual({ ok: false, error: "not_found" });
  });

  it("a refund racing the click wins the compare-and-set: refused, nothing customer-visible written", async () => {
    const racing = {
      from(table: string) {
        // latestSnapshot() is the last read before the CAS — the refund lands then.
        if (table === "svi_snapshots") order().status = "REFUNDED";
        return db.from(table);
      },
    };
    expect(await markReviewed(racing as never, { orderId: ORDER, reviewer }, deps)).toEqual({ ok: false, error: "refunded" });
    expect(db.tables.assembled_reports[0].reviewed).toBe(false);
    expect(deps.sendReviewedEmail).not.toHaveBeenCalled();
    expect(deps.renderInvestorPack).not.toHaveBeenCalled();
  });

  it("repairs a READY order whose badge write failed earlier (re-run finishes the job)", async () => {
    const failing = fakeDb({ tables: db.tables, failOn: { assembled_reports: { update: { code: "57014", message: "timeout" } } } });
    const first = await markReviewed(failing as never, { orderId: ORDER, reviewer }, deps);
    expect(first.ok && first.warnings).toEqual(["badge:57014"]);
    expect(failing.tables.report_orders.find((o) => o.id === ORDER)?.status).toBe("READY");

    const healthy = fakeDb({ tables: failing.tables });
    const second = await markReviewed(healthy as never, { orderId: ORDER, reviewer }, deps);
    expect(second).toMatchObject({ ok: true, repaired: true, alreadyReviewed: false });
    expect(healthy.tables.assembled_reports[0].reviewed).toBe(true);
    // The repair keeps the original review stamps.
    expect(healthy.tables.assembled_reports[0].reviewed_at).toBe(NOW.toISOString());
  });
});
