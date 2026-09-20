// G21 P0-C — paid Cohort Validation Pilot fulfilment against an in-memory
// `pilot_orders`, an in-memory PilotDb and a temp ledger root: the order row,
// the Cohort-tier plan for 90 days, credits = report cost × cap, the intake
// capped at the applicants, the ledger row with source "paid", the
// confirmation e-mail (what happens next + support@ from the entity config +
// data sentence), idempotency on a replayed session, the never-overwrite-a-
// payer rule, comp cap unaffected, expiry reverting the Cohort tier, and the
// desk-banner read.

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryIntakeStore, createIntake as realCreateIntake, listMyIntakes as realListMyIntakes } from "@/lib/intake/program-intakes";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";
import { PILOT_SKUS } from "@/lib/pricing/pilot-skus";
import { addDays, capReached, readLedger } from "./ledger";
import { DATA_PRINCIPLE_SENTENCE, PILOT_CAP, paidPilotCredits } from "./offer";
import { createFakePilotOrdersDb, findActivePilotOrder, fulfilPaidPilot } from "./paid-orders";
import { endPilot, listPilots, runPilotExpiry, startPilot, type PilotDb, type PilotDeps } from "./service";

const NOW = new Date("2026-09-20T09:00:00.000Z");

function makeDb(users: Array<{ id: string; email: string; plan: string | null; subscribed?: boolean }>) {
  const plans = new Map(users.map((u) => [u.id, u.plan]));
  const subs = new Set(users.filter((u) => u.subscribed).map((u) => u.id));
  const setPlan = vi.fn(async (userId: string, plan: string) => {
    plans.set(userId, plan);
  });
  const db: PilotDb = {
    async findUserByEmail(email) {
      const u = users.find((x) => x.email === email);
      return u ? { id: u.id, email: u.email, plan: plans.get(u.id) ?? null, display_name: null } : null;
    },
    async getPlan(userId) {
      return plans.get(userId) ?? null;
    },
    setPlan,
    async hasStripeSubscription(userId) {
      return subs.has(userId);
    },
    async counts() {
      return { submissions: 0, reports_run: 0, assessments: 0 };
    },
  };
  return { db, plans, setPlan };
}

let root: string;
let store: ReturnType<typeof memoryIntakeStore>;
let sent: Array<{ to: string; subject: string; html: string; text?: string }>;
let alerts: string[];
let audits: Array<{ action: string; actor: string; detail?: Record<string, unknown> }>;
let grants: Array<{ userId: string; amount: number; reason: string }>;
let seq: number;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "pilots-paid-"));
  store = memoryIntakeStore();
  sent = [];
  alerts = [];
  audits = [];
  grants = [];
  seq = 0;
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function pilotDeps(db: PilotDb | null, now: () => Date = () => NOW): PilotDeps {
  return {
    root,
    db,
    now,
    id: () => `p-${++seq}`,
    grantCredits: async (userId, amount, reason) => {
      grants.push({ userId, amount, reason });
      return { ok: true, balance: amount };
    },
    createIntake: (owner, raw) => realCreateIntake(owner, raw, { store, suffix: () => "abcdefgh" }),
    listMyIntakes: (owner) => realListMyIntakes(owner, { store }),
    sendEmail: async (args) => {
      sent.push(args);
      return { ok: true };
    },
    alert: async (text) => {
      alerts.push(text);
      return true;
    },
    audit: async (p) => {
      audits.push({ action: p.action, actor: p.actor, detail: p.detail });
      return { id: 1n, curr_hash: "h" };
    },
  };
}

function session(over: Partial<{ id: string; sku: string; cap: string; userId: string; email: string; amount: number; projectId: string }> = {}) {
  return {
    id: over.id ?? "cs_pilot_1",
    metadata: {
      kind: "cohort_pilot",
      sku: over.sku ?? "cohort_pilot_25",
      applicants_cap: over.cap ?? "25",
      blockid_user_id: over.userId ?? "u-1",
      blockid_plan: over.sku ?? "cohort_pilot_25",
      ...(over.projectId ? { project_id: over.projectId } : {}),
    },
    customer_email: over.email ?? "Program@Uni.edu.au",
    amount_total: over.amount ?? 150000,
    currency: "aud",
    payment_intent: "pi_1",
  };
}

describe("fulfilPaidPilot", () => {
  it("skips a session that is not a pilot or has bad metadata — no order, no grant", async () => {
    const orders = createFakePilotOrdersDb();
    const { db, setPlan } = makeDb([{ id: "u-1", email: "program@uni.edu.au", plan: "free" }]);
    const notPilot = await fulfilPaidPilot({ id: "cs_x", metadata: { plan: "founder_package" } }, { orders, pilot: pilotDeps(db) });
    expect(notPilot).toMatchObject({ ok: false, skipped: "not_a_pilot" });
    const badSku = await fulfilPaidPilot({ ...session(), metadata: { kind: "cohort_pilot", sku: "cohort_pilot_999", blockid_user_id: "u-1" } }, { orders, pilot: pilotDeps(db) });
    expect(badSku).toMatchObject({ ok: false, skipped: "bad_metadata" });
    expect(orders.rows).toEqual([]);
    expect(setPlan).not.toHaveBeenCalled();
  });

  it("happy path (25): order row, Cohort 25 plan for 90 d, 75 credits, intake capped at 25, ledger source=paid, confirmation e-mail, audit by stripe, alert", async () => {
    const orders = createFakePilotOrdersDb();
    const { db, plans } = makeDb([{ id: "u-1", email: "program@uni.edu.au", plan: "free" }]);
    const r = await fulfilPaidPilot(session({ projectId: "11111111-2222-4333-8444-555555555555" }), { orders, now: () => NOW, pilot: pilotDeps(db) });
    expect(r.ok).toBe(true);
    if (!r.ok || r.duplicate) return;
    expect(r.sku).toBe("cohort_pilot_25");
    expect(r.entitlement_until).toBe(addDays(NOW, 90));

    // pilot_orders row
    expect(orders.rows).toHaveLength(1);
    expect(orders.rows[0]).toMatchObject({
      user_id: "u-1",
      project_id: "11111111-2222-4333-8444-555555555555",
      buyer_email: "program@uni.edu.au",
      sku: "cohort_pilot_25",
      applicants_cap: 25,
      amount_cents: 150000,
      currency: "aud",
      stripe_session_id: "cs_pilot_1",
      stripe_payment_intent: "pi_1",
      status: "paid",
      entitlement_until: addDays(NOW, 90),
    });

    // entitlement = the Cohort 25 tier, exactly as the comp sets the plan column
    expect(plans.get("u-1")).toBe("accelerator_starter");
    expect(r.pilot).toMatchObject({ ok: true, existing: false, plan_set: true });
    expect(grants).toEqual([{ userId: "u-1", amount: paidPilotCredits(25), reason: "paid pilot: cohort_pilot_25" }]);
    expect(paidPilotCredits(25)).toBe(75);

    // intake owned by the buyer, capped at the applicants
    const mine = await realListMyIntakes("u-1", { store });
    expect(mine).toHaveLength(1);
    expect(mine[0]!.maxSubmissions).toBe(25);

    // ledger row
    const ledger = await readLedger(root);
    expect(ledger.pilots).toHaveLength(1);
    expect(ledger.pilots[0]).toMatchObject({
      user_id: "u-1",
      source: "paid",
      order_id: r.order_id,
      tier: "accelerator_starter",
      applicants_cap: 25,
      previous_plan: "free",
      credits_granted: 75,
      started_by: "stripe",
      status: "active",
      expires_at: addDays(NOW, 90),
    });

    // confirmation e-mail: what happens next, support@ from the entity config, data sentence
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe("program@uni.edu.au");
    expect(sent[0]!.subject).toMatch(/Cohort Validation Pilot is confirmed/);
    expect(sent[0]!.html).toContain("Within 2 business days");
    expect(sent[0]!.html).toContain(LEGAL_ENTITY.supportEmail);
    expect(sent[0]!.html).toContain("A$1,500 inc. GST");
    expect(sent[0]!.html).toContain(DATA_PRINCIPLE_SENTENCE.replace(/'/g, "&#39;"));
    expect(sent[0]!.text).toContain("Within 2 business days");
    expect(sent[0]!.html).not.toMatch(/comped|free/i);

    // audit + alert
    expect(audits).toEqual([{ action: "pilot.started", actor: "stripe", detail: expect.objectContaining({ source: "paid", sku: "cohort_pilot_25", tier: "accelerator_starter", plan_set: true }) }]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toContain("Paid pilot started");
    expect(alerts[0]).not.toContain("program@uni.edu.au");
  });

  it("the 50 size grants Cohort 100 and 150 credits", async () => {
    const orders = createFakePilotOrdersDb();
    const { db, plans } = makeDb([{ id: "u-2", email: "ops@accel.io", plan: "investor_angel" }]);
    const r = await fulfilPaidPilot(session({ id: "cs_50", sku: "cohort_pilot_50", cap: "50", userId: "u-2", email: "ops@accel.io", amount: 250000 }), { orders, now: () => NOW, pilot: pilotDeps(db) });
    expect(r).toMatchObject({ ok: true, duplicate: false, sku: "cohort_pilot_50" });
    expect(plans.get("u-2")).toBe(PILOT_SKUS.cohort_pilot_50.planTier);
    expect(plans.get("u-2")).toBe("accelerator_growth");
    expect(grants[0]!.amount).toBe(150);
    expect(orders.rows[0]!.applicants_cap).toBe(50);
    expect((await readLedger(root)).pilots[0]!.previous_plan).toBe("investor_angel");
  });

  it("replaying the same session is a no-op: one order, one plan write, one e-mail", async () => {
    const orders = createFakePilotOrdersDb();
    const { db, setPlan } = makeDb([{ id: "u-1", email: "program@uni.edu.au", plan: "free" }]);
    const first = await fulfilPaidPilot(session(), { orders, now: () => NOW, pilot: pilotDeps(db) });
    const again = await fulfilPaidPilot(session(), { orders, now: () => NOW, pilot: pilotDeps(db) });
    expect(first).toMatchObject({ ok: true, duplicate: false });
    expect(again).toMatchObject({ ok: true, duplicate: true, order_id: orders.rows[0]!.id });
    expect(orders.rows).toHaveLength(1);
    expect(setPlan).toHaveBeenCalledTimes(1);
    expect(sent).toHaveLength(1);
    expect((await readLedger(root)).pilots).toHaveLength(1);
  });

  it("a retry after a recorded order re-runs the idempotent grant (review P1: money taken, entitlement missing)", async () => {
    const orders = createFakePilotOrdersDb();
    // First attempt: the order row lands but the grant has no DB → not ok.
    const first = await fulfilPaidPilot(session(), { orders, now: () => NOW, pilot: pilotDeps(null) });
    expect(first).toMatchObject({ ok: true, duplicate: false });
    expect(orders.rows).toHaveLength(1);
    // Stripe retries: the duplicate path must still grant.
    const { db, setPlan } = makeDb([{ id: "u-1", email: "program@uni.edu.au", plan: "free" }]);
    const again = await fulfilPaidPilot(session(), { orders, now: () => NOW, pilot: pilotDeps(db) });
    expect(again).toMatchObject({ ok: true, duplicate: true, order_id: orders.rows[0]!.id });
    expect((again as { pilot?: { ok: boolean } }).pilot?.ok).toBe(true);
    expect(setPlan).toHaveBeenCalledTimes(1);
    expect(orders.rows).toHaveLength(1);
  });

  it("never overwrites a payer: a buyer with an active Stripe subscription keeps their plan and ops is warned", async () => {
    const orders = createFakePilotOrdersDb();
    const { db, plans, setPlan } = makeDb([{ id: "u-3", email: "fund@vc.com", plan: "investor_fund", subscribed: true }]);
    const r = await fulfilPaidPilot(session({ id: "cs_3", userId: "u-3", email: "fund@vc.com" }), { orders, now: () => NOW, pilot: pilotDeps(db) });
    expect(r).toMatchObject({ ok: true, duplicate: false });
    if (!r.ok || r.duplicate) return;
    expect(setPlan).not.toHaveBeenCalled();
    expect(plans.get("u-3")).toBe("investor_fund");
    expect(r.pilot).toMatchObject({ ok: true, plan_set: false });
    expect(r.pilot.ok && r.pilot.warnings.join(" ")).toMatch(/plan kept/);
    expect(alerts[0]).toContain("plan kept");
    expect(orders.rows).toHaveLength(1); // the order is still recorded
  });

  it("a paid pilot never counts against the comp cap, and the comp cap never blocks a paid pilot", async () => {
    const orders = createFakePilotOrdersDb();
    const users = Array.from({ length: PILOT_CAP + 1 }, (_, i) => ({ id: `c-${i}`, email: `c${i}@x.io`, plan: "free" as string | null }));
    users.push({ id: "u-1", email: "program@uni.edu.au", plan: "free" });
    const { db } = makeDb(users);
    for (let i = 0; i < PILOT_CAP; i += 1) {
      const c = await startPilot({ email: `c${i}@x.io`, program_name: `Comp ${i}` }, { email: "admin@blockid.au" }, pilotDeps(db));
      expect(c.ok).toBe(true);
    }
    expect(capReached((await readLedger(root)).pilots)).toBe(true);
    const paid = await fulfilPaidPilot(session(), { orders, now: () => NOW, pilot: pilotDeps(db) });
    expect(paid).toMatchObject({ ok: true, duplicate: false });
    const list = await listPilots(pilotDeps(db));
    expect(list.pilots).toHaveLength(PILOT_CAP + 1);
    expect(list.active).toBe(PILOT_CAP);
    expect(list.pilots.find((p) => p.source === "paid")?.tier).toBe("accelerator_starter");
    // the sixth comp is still refused — the paid row did not widen the cap
    const sixth = await startPilot({ email: `c${PILOT_CAP}@x.io`, program_name: "Sixth" }, { email: "admin@blockid.au" }, pilotDeps(db));
    expect(sixth).toMatchObject({ ok: false, status: 409, error: "cap_reached" });
  });

  it("expiry after 90 days reverts the Cohort tier to the previous plan; ending early does the same", async () => {
    const orders = createFakePilotOrdersDb();
    const { db, plans } = makeDb([{ id: "u-1", email: "program@uni.edu.au", plan: "free" }]);
    await fulfilPaidPilot(session(), { orders, now: () => NOW, pilot: pilotDeps(db) });
    expect(plans.get("u-1")).toBe("accelerator_starter");
    const later = new Date(addDays(NOW, 91));
    const run = await runPilotExpiry({}, pilotDeps(db, () => later));
    expect(run.expired).toHaveLength(1);
    expect(run.expired[0]!.plan_reverted).toBe(true);
    expect(plans.get("u-1")).toBe("free");

    // end early on a fresh one
    const { db: db2, plans: plans2 } = makeDb([{ id: "u-9", email: "nine@x.io", plan: "investor_advisor" }]);
    const r = await fulfilPaidPilot(session({ id: "cs_9", userId: "u-9", email: "nine@x.io" }), { orders, now: () => NOW, pilot: pilotDeps(db2) });
    if (!r.ok || r.duplicate) throw new Error("expected a fresh order");
    const ended = await endPilot(r.pilot.ok ? r.pilot.pilot.id : "", "converted", { email: "admin@blockid.au", kind: "admin" }, pilotDeps(db2));
    expect(ended).toMatchObject({ ok: true, plan_reverted: true });
    expect(plans2.get("u-9")).toBe("investor_advisor");
  });
});

describe("findActivePilotOrder", () => {
  it("returns the live paid order, ignores expired / refunded rows, null without a db, never throws", async () => {
    const orders = createFakePilotOrdersDb();
    const { db } = makeDb([{ id: "u-1", email: "program@uni.edu.au", plan: "free" }]);
    expect(await findActivePilotOrder("u-1", { orders, now: () => NOW })).toBeNull();
    await fulfilPaidPilot(session(), { orders, now: () => NOW, pilot: pilotDeps(db) });
    const live = await findActivePilotOrder("u-1", { orders, now: () => NOW });
    expect(live).toMatchObject({ sku: "cohort_pilot_25", applicants_cap: 25, status: "paid" });
    expect(await findActivePilotOrder("u-1", { orders, now: () => new Date(addDays(NOW, 91)) })).toBeNull();
    orders.rows[0]!.status = "refunded";
    expect(await findActivePilotOrder("u-1", { orders, now: () => NOW })).toBeNull();
    expect(await findActivePilotOrder("u-1", { orders: null })).toBeNull();
    const throwing = { insert: orders.insert, findActive: async () => { throw new Error("boom"); } };
    expect(await findActivePilotOrder("u-1", { orders: throwing })).toBeNull();
  });
});
