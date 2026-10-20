import { describe, expect, it, vi } from "vitest";
import { sydneyInstant } from "./sla";
import { fakeDb } from "./fake-db.testkit";
import { runVerifiedReviewSlaAlerts, slaAlertCandidates, slaAlertEmail, slaAlertKey } from "./sla-alerts";
import { verifiedSlaDueAt } from "@/lib/time/au-business-days";

const OVERDUE_ID = "11111111-1111-4111-8111-111111111111";
const SOON_ID = "22222222-2222-4222-8222-222222222222";
const OK_ID = "33333333-3333-4333-8333-333333333333";
const REFUNDED_ID = "44444444-4444-4444-8444-444444444444";

// "Now" = Thu 22 Oct 2026, 14:00 Sydney.
const NOW = sydneyInstant("2026-10-22", 14);

function seed() {
  return {
    report_orders: [
      // Paid Fri 16 Oct → due end of Tue 20 Oct: overdue.
      { id: OVERDUE_ID, business_id: "p1", status: "IN_REVIEW", sla_due_at: verifiedSlaDueAt(sydneyInstant("2026-10-16", 11)).toISOString() },
      // Paid Tue 20 Oct → due end of Thu 22 Oct: 3 business hours left → due soon.
      { id: SOON_ID, business_id: "p2", status: "IN_REVIEW", sla_due_at: verifiedSlaDueAt(sydneyInstant("2026-10-20", 11)).toISOString() },
      // Paid Thu 22 Oct → due Mon 26 Oct (weekend skipped): on track.
      { id: OK_ID, business_id: "p3", status: "IN_REVIEW", sla_due_at: verifiedSlaDueAt(sydneyInstant("2026-10-22", 9)).toISOString() },
      // Refunded while overdue → never alerted.
      { id: REFUNDED_ID, business_id: "p4", status: "REFUNDED", sla_due_at: verifiedSlaDueAt(sydneyInstant("2026-10-14", 11)).toISOString() },
    ],
    projects: [
      { id: "p1", name: "Acme" },
      { id: "p2", name: "Beta" },
      { id: "p3", name: "Gamma" },
    ],
    founder_notifications: [] as Record<string, unknown>[],
  };
}

function deps(db: ReturnType<typeof fakeDb>) {
  const sendOpsEmail = vi.fn(async () => true);
  const track = vi.fn(async () => undefined);
  const notify = vi.fn(async (a: { userId: string; payload: Record<string, unknown>; dedupeKey: string }) => {
    db.tables.founder_notifications.push({ user_id: a.userId, kind: "verified_review_sla", payload: { ...a.payload, dedupeKey: a.dedupeKey } });
    return true;
  });
  return { sendOpsEmail, track, notify, now: () => NOW, adminUserId: async () => "admin-1", alertTo: () => "ops@example.test", siteUrl: () => "https://blockid.au" };
}

describe("slaAlertCandidates (pure)", () => {
  it("overdue + due soon only, overdue first; on-track and refunded skipped", () => {
    const c = slaAlertCandidates(seed().report_orders, NOW, new Map([["p1", "Acme"]]));
    expect(c.map((x) => [x.orderId, x.level])).toEqual([
      [OVERDUE_ID, "overdue"],
      [SOON_ID, "due_soon"],
    ]);
    expect(c[0].startupName).toBe("Acme");
    expect(c[0].sla.line).toBe("Overdue by 2 business days");
  });
});

describe("runVerifiedReviewSlaAlerts", () => {
  it("alerts each (order, level) once: notification row + one ops e-mail per run", async () => {
    const db = fakeDb({ tables: seed() });
    const d = deps(db);
    const first = await runVerifiedReviewSlaAlerts(db as never, {}, d);
    expect(first).toMatchObject({ ok: true, checked: 3, overdue: 1, dueSoon: 1, deduped: 0, emailed: true });
    expect(first.alerted.map((a) => a.orderId)).toEqual([OVERDUE_ID, SOON_ID]);
    expect(d.notify).toHaveBeenCalledTimes(2);
    expect(d.notify.mock.calls[0][0]).toMatchObject({ userId: "admin-1", dedupeKey: slaAlertKey("overdue", OVERDUE_ID) });
    expect(d.sendOpsEmail).toHaveBeenCalledTimes(1);
    const mail = d.sendOpsEmail.mock.calls[0][0] as unknown as { to: string; subject: string; text: string };
    expect(mail.to).toBe("ops@example.test");
    expect(mail.subject).toBe("Verified review SLA: 1 overdue, 1 due soon");
    expect(mail.text).toContain(`https://blockid.au/admin/verified-reviews/${OVERDUE_ID}`);
    expect(d.track).toHaveBeenCalledWith("payg_verified_sla_alert", expect.objectContaining({ order_id: OVERDUE_ID, level: "overdue" }));

    // Second run 30 minutes later: nothing new.
    const again = await runVerifiedReviewSlaAlerts(db as never, {}, { ...d, now: () => new Date(NOW.getTime() + 30 * 60_000) });
    expect(again).toMatchObject({ alerted: [], deduped: 2, emailed: false });
    expect(d.notify).toHaveBeenCalledTimes(2);
    expect(d.sendOpsEmail).toHaveBeenCalledTimes(1);
  });

  it("the due-soon order alerts AGAIN once it becomes overdue (a new level)", async () => {
    const db = fakeDb({ tables: seed() });
    const d = deps(db);
    await runVerifiedReviewSlaAlerts(db as never, {}, d);
    const later = await runVerifiedReviewSlaAlerts(db as never, {}, { ...d, now: () => sydneyInstant("2026-10-23", 9) });
    expect(later.alerted.map((a) => [a.orderId, a.level])).toEqual([[SOON_ID, "overdue"]]);
    expect(d.sendOpsEmail).toHaveBeenCalledTimes(2);
  });

  it("dry run writes and sends nothing", async () => {
    const db = fakeDb({ tables: seed() });
    const d = deps(db);
    const res = await runVerifiedReviewSlaAlerts(db as never, { dry: true }, d);
    expect(res.alerted).toHaveLength(2);
    expect(d.notify).not.toHaveBeenCalled();
    expect(d.sendOpsEmail).not.toHaveBeenCalled();
  });

  it("no admin app_user → cannot dedupe → sends nothing", async () => {
    const db = fakeDb({ tables: seed() });
    const d = deps(db);
    const res = await runVerifiedReviewSlaAlerts(db as never, {}, { ...d, adminUserId: async () => null });
    expect(res.reason).toBe("no_admin_user");
    expect(d.sendOpsEmail).not.toHaveBeenCalled();
  });

  it("0474 not applied → ok + migration_pending (no cron failure spam)", async () => {
    const db = fakeDb({ tables: seed(), missingColumns: { report_orders: ["sla_due_at"] } });
    const res = await runVerifiedReviewSlaAlerts(db as never, {}, deps(db));
    expect(res).toMatchObject({ ok: true, reason: "migration_pending", checked: 0 });
  });

  it("e-mail copy names the queue and the SLA rule", () => {
    const c = slaAlertCandidates(seed().report_orders, NOW);
    const m = slaAlertEmail(c, "https://blockid.au");
    expect(m.text).toContain("https://blockid.au/admin/verified-reviews");
    expect(m.text).toContain("2 Sydney business days");
  });
});
