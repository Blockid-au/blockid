// G16-C — pilot lifecycle against an in-memory db, a temp ledger root and
// recording stubs: start (404 unknown user, 409 cap, idempotent on e-mail,
// plan set + previous_plan, credits, intake owned by the evaluator, welcome
// mail with the data sentence verbatim), end early (Stripe-subscriber
// guard, foreign plan guard, revert to previous plan), expiry run (T-3 d
// reminder once, expiry with revert, dry-run writes nothing) and list
// (days_left + counts + masked e-mail).

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryIntakeStore, createIntake as realCreateIntake, listMyIntakes as realListMyIntakes } from "@/lib/intake/program-intakes";
import { addDays, readLedger } from "./ledger";
import { DATA_PRINCIPLE_SENTENCE, PILOT_CAP, PILOT_MAX_APPLICANTS, PILOT_TIER, defaultPilotCredits } from "./offer";
import { endPilot, listPilots, runPilotExpiry, startPilot, validateStartInput, type PilotDb, type PilotDeps } from "./service";

const NOW = new Date("2026-09-19T04:20:00.000Z");
const ADMIN = { email: "admin@blockid.au", id: "admin-1" };

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
      return { submissions: 3, reports_run: 2, assessments: 1 };
    },
  };
  return { db, plans, subs, setPlan };
}

let root: string;
let store: ReturnType<typeof memoryIntakeStore>;
let sent: Array<{ to: string; subject: string; html: string; text?: string }>;
let alerts: string[];
let audits: Array<{ action: string; detail?: Record<string, unknown> }>;
let grants: Array<{ userId: string; amount: number; reason: string }>;
let seq: number;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "pilots-svc-"));
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

function deps(db: PilotDb | null, over: Partial<PilotDeps> = {}): PilotDeps {
  return {
    root,
    db,
    now: () => NOW,
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
      audits.push({ action: p.action, detail: p.detail });
      return { id: 1n, curr_hash: "h" };
    },
    ...over,
  };
}

describe("validateStartInput", () => {
  it("defaults days=30 and credits=trust_report×60; rejects bad e-mail / name / ranges / slug", () => {
    const ok = validateStartInput({ email: " Eval@Program.ORG ", program_name: " Demo " });
    expect(ok).toMatchObject({ ok: true, value: { email: "eval@program.org", program_name: "Demo", days: 30, credits: defaultPilotCredits(), intake_slug: null, intake_name: null } });
    expect(defaultPilotCredits()).toBe(180);
    expect(validateStartInput({ email: "nope", program_name: "x" }).ok).toBe(false);
    expect(validateStartInput({ email: "a@b.co", program_name: "" }).ok).toBe(false);
    expect(validateStartInput({ email: "a@b.co", program_name: "x", days: 0 }).ok).toBe(false);
    expect(validateStartInput({ email: "a@b.co", program_name: "x", days: 91 }).ok).toBe(false);
    expect(validateStartInput({ email: "a@b.co", program_name: "x", credits: -1 }).ok).toBe(false);
    expect(validateStartInput({ email: "a@b.co", program_name: "x", intake_slug: "Bad Slug" }).ok).toBe(false);
    expect(validateStartInput({ email: "a@b.co", program_name: "x", days: "14", credits: "60", intake_slug: "demo-abcdefgh" })).toMatchObject({ ok: true, value: { days: 14, credits: 60, intake_slug: "demo-abcdefgh" } });
  });
});

describe("startPilot", () => {
  it("404 for an unknown evaluator — never creates an account, never touches the ledger", async () => {
    const { db, setPlan } = makeDb([]);
    const r = await startPilot({ email: "ghost@x.io", program_name: "Ghost" }, ADMIN, deps(db));
    expect(r).toMatchObject({ ok: false, status: 404, error: "user_not_found" });
    expect(setPlan).not.toHaveBeenCalled();
    expect((await readLedger(root)).pilots).toEqual([]);
  });

  it("503 without a db; 400 on invalid input", async () => {
    expect(await startPilot({ email: "a@b.co", program_name: "x" }, ADMIN, deps(null))).toMatchObject({ ok: false, status: 503 });
    expect(await startPilot({ email: "bad", program_name: "x" }, ADMIN, deps(makeDb([]).db))).toMatchObject({ ok: false, status: 400 });
  });

  it("happy path: plan → investor_vc_small with previous_plan, credits granted, intake owned by the evaluator, ledger row, welcome mail (data sentence verbatim), audit, alert", async () => {
    const { db, plans, setPlan } = makeDb([{ id: "u-1", email: "eval@program.org", plan: "investor_angel" }]);
    const r = await startPilot({ email: "Eval@Program.org", program_name: "Demo Accelerator" }, ADMIN, deps(db));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.existing).toBe(false);
    expect(r.pilot).toMatchObject({
      id: "p-1",
      user_id: "u-1",
      email: "eval@program.org",
      program_name: "Demo Accelerator",
      tier: PILOT_TIER,
      previous_plan: "investor_angel",
      started_at: NOW.toISOString(),
      expires_at: addDays(NOW, 30),
      credits_granted: 180,
      intake_slug: "demo-accelerator-abcdefgh",
      status: "active",
      ended_at: null,
      ended_reason: null,
      started_by: ADMIN.email,
    });
    expect(r.pilot.intake_id).toBe(store.intakes[0].id);
    expect(store.intakes[0]).toMatchObject({ ownerUserId: "u-1", maxSubmissions: PILOT_MAX_APPLICANTS, autoReport: false });
    expect(r.intake_url).toBe("https://blockid.au/apply/demo-accelerator-abcdefgh");
    expect(setPlan).toHaveBeenCalledWith("u-1", PILOT_TIER, NOW.toISOString());
    expect(plans.get("u-1")).toBe(PILOT_TIER);
    expect(grants).toEqual([{ userId: "u-1", amount: 180, reason: "pilot: Demo Accelerator" }]);
    expect((await readLedger(root)).pilots.map((p) => p.id)).toEqual(["p-1"]);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("eval@program.org");
    expect(sent[0].subject).toContain("Demo Accelerator");
    expect(sent[0].html).toContain(DATA_PRINCIPLE_SENTENCE);
    expect(sent[0].text).toContain(DATA_PRINCIPLE_SENTENCE);
    expect(sent[0].html).toContain("https://blockid.au/apply/demo-accelerator-abcdefgh");
    expect(sent[0].html).toContain("not included");
    expect(sent[0].html).toContain("no card, no Stripe");
    expect(audits).toEqual([{ action: "pilot.started", detail: expect.objectContaining({ evaluator_user_id: "u-1", previous_plan: "investor_angel", credits: 180 }) }]);
    expect(alerts[0]).toContain("Pilot started");
    expect(alerts[0]).toContain("e***@program.org");
    expect(alerts[0]).not.toContain("eval@program.org");
    expect(r.warnings).toEqual([]);
  });

  it("idempotent on e-mail: a second start returns the existing active pilot without a second plan write / grant / mail", async () => {
    const { db, setPlan } = makeDb([{ id: "u-1", email: "eval@program.org", plan: "free" }]);
    const first = await startPilot({ email: "eval@program.org", program_name: "Demo" }, ADMIN, deps(db));
    const again = await startPilot({ email: "EVAL@program.org", program_name: "Something else" }, ADMIN, deps(db));
    expect(again).toMatchObject({ ok: true, existing: true, pilot: { id: (first as { pilot: { id: string } }).pilot.id, program_name: "Demo" } });
    expect(setPlan).toHaveBeenCalledTimes(1);
    expect(grants).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect((await readLedger(root)).pilots).toHaveLength(1);
  });

  it("409 when PILOT_CAP pilots are active; an ended pilot frees a slot", async () => {
    const users = Array.from({ length: PILOT_CAP + 1 }, (_, i) => ({ id: `u-${i}`, email: `e${i}@x.io`, plan: "free" }));
    const { db } = makeDb(users);
    for (let i = 0; i < PILOT_CAP; i += 1) expect((await startPilot({ email: `e${i}@x.io`, program_name: `P${i}` }, ADMIN, deps(db))).ok).toBe(true);
    const sixth = await startPilot({ email: `e${PILOT_CAP}@x.io`, program_name: "Sixth" }, ADMIN, deps(db));
    expect(sixth).toMatchObject({ ok: false, status: 409, error: "cap_reached", active: PILOT_CAP });
    expect(await endPilot("p-1", "ended_early", { ...ADMIN, kind: "admin" }, deps(db))).toMatchObject({ ok: true });
    expect((await startPilot({ email: `e${PILOT_CAP}@x.io`, program_name: "Sixth" }, ADMIN, deps(db))).ok).toBe(true);
  });

  it("intake_slug links an existing intake the evaluator owns; a foreign / unknown slug is a warning, not a failure; credits 0 skips the grant", async () => {
    const { db } = makeDb([{ id: "u-1", email: "eval@program.org", plan: "free" }, { id: "u-2", email: "other@x.io", plan: "free" }]);
    const mine = await realCreateIntake("u-1", { name: "Mine" }, { store, suffix: () => "11111111" });
    const theirs = await realCreateIntake("u-2", { name: "Theirs" }, { store, suffix: () => "22222222" });
    if (!mine.ok || !theirs.ok) throw new Error("fixture");
    const r1 = await startPilot({ email: "eval@program.org", program_name: "Demo", intake_slug: mine.intake.slug, credits: 0 }, ADMIN, deps(db));
    expect(r1).toMatchObject({ ok: true, pilot: { intake_id: mine.intake.id, intake_slug: mine.intake.slug, credits_granted: 0 } });
    expect(grants).toEqual([]);
    expect(store.intakes).toHaveLength(2);
    await endPilot("p-1", "withdrawn", { ...ADMIN, kind: "admin" }, deps(db));
    const r2 = await startPilot({ email: "eval@program.org", program_name: "Demo 2", intake_slug: theirs.intake.slug }, ADMIN, deps(db));
    expect(r2).toMatchObject({ ok: true, pilot: { intake_id: null, intake_slug: null } });
    if (r2.ok) expect(r2.warnings.join(" ")).toContain("not found among the evaluator's intakes");
  });

  it("a failed welcome mail never rolls back the comp — it is a warning in the result and the alert", async () => {
    const { db, plans } = makeDb([{ id: "u-1", email: "eval@program.org", plan: "free" }]);
    const r = await startPilot({ email: "eval@program.org", program_name: "Demo" }, ADMIN, deps(db, { sendEmail: async () => { throw new Error("smtp down"); } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(plans.get("u-1")).toBe(PILOT_TIER);
    expect(r.warnings).toEqual(["welcome e-mail: smtp down"]);
    expect(alerts[0]).toContain("smtp down");
  });
});

describe("endPilot", () => {
  it("reverts to previous_plan, marks ended + reason + plan_reverted, mails, audits, alerts; 409 on a second end; 404 unknown", async () => {
    const { db, plans } = makeDb([{ id: "u-1", email: "eval@program.org", plan: "investor_angel" }]);
    await startPilot({ email: "eval@program.org", program_name: "Demo" }, ADMIN, deps(db));
    const r = await endPilot("p-1", "converted", { ...ADMIN, kind: "admin" }, deps(db), "signed LOI");
    expect(r).toMatchObject({ ok: true, plan_reverted: true, pilot: { status: "ended", ended_reason: "converted", ended_at: NOW.toISOString(), plan_reverted: true } });
    if (r.ok) expect(r.pilot.note).toContain("signed LOI");
    expect(plans.get("u-1")).toBe("investor_angel");
    expect(sent[1].subject).toContain("closed");
    expect(sent[1].html).toContain("investor_angel");
    expect(audits[1]).toMatchObject({ action: "pilot.ended", detail: expect.objectContaining({ reason: "converted", plan_reverted: true }) });
    expect(alerts[1]).toContain("Pilot ended");
    expect(await endPilot("p-1", "ended_early", { ...ADMIN, kind: "admin" }, deps(db))).toMatchObject({ ok: false, status: 409, error: "not_active" });
    expect(await endPilot("nope", "ended_early", { ...ADMIN, kind: "admin" }, deps(db))).toMatchObject({ ok: false, status: 404 });
  });

  it("previous_plan null → free with plan_started_at cleared", async () => {
    const { db, plans, setPlan } = makeDb([{ id: "u-1", email: "eval@program.org", plan: null }]);
    await startPilot({ email: "eval@program.org", program_name: "Demo" }, ADMIN, deps(db));
    await endPilot("p-1", "ended_early", { ...ADMIN, kind: "admin" }, deps(db));
    expect(plans.get("u-1")).toBe("free");
    expect(setPlan).toHaveBeenLastCalledWith("u-1", "free", null);
  });

  it("Stripe-subscriber guard: a trialing/active subscription keeps the plan (plan_reverted false)", async () => {
    const { db, plans, subs, setPlan } = makeDb([{ id: "u-1", email: "eval@program.org", plan: "free" }]);
    await startPilot({ email: "eval@program.org", program_name: "Demo" }, ADMIN, deps(db));
    subs.add("u-1"); // subscribed during the pilot
    const r = await endPilot("p-1", "converted", { ...ADMIN, kind: "admin" }, deps(db));
    expect(r).toMatchObject({ ok: true, plan_reverted: false, pilot: { status: "ended", plan_reverted: false } });
    expect(plans.get("u-1")).toBe(PILOT_TIER);
    expect(setPlan).toHaveBeenCalledTimes(1);
    expect(sent[1].html).toContain("subscription keeps the workspace");
  });

  it("foreign plan guard: if the plan is no longer the pilot tier it is left alone", async () => {
    const { db, plans, setPlan } = makeDb([{ id: "u-1", email: "eval@program.org", plan: "free" }]);
    await startPilot({ email: "eval@program.org", program_name: "Demo" }, ADMIN, deps(db));
    plans.set("u-1", "investor_fund");
    const r = await endPilot("p-1", "ended_early", { ...ADMIN, kind: "admin" }, deps(db));
    expect(r).toMatchObject({ ok: true, plan_reverted: false });
    expect(plans.get("u-1")).toBe("investor_fund");
    expect(setPlan).toHaveBeenCalledTimes(1);
  });
});

describe("runPilotExpiry", () => {
  it("dry run reports reminders + expiries and writes / sends nothing", async () => {
    const { db, plans, setPlan } = makeDb([{ id: "u-1", email: "a@x.io", plan: "free" }, { id: "u-2", email: "b@x.io", plan: "free" }]);
    await startPilot({ email: "a@x.io", program_name: "Soon", days: 2 }, ADMIN, deps(db));
    await startPilot({ email: "b@x.io", program_name: "Due", days: 1 }, ADMIN, deps(db));
    const later = new Date(addDays(NOW, 1));
    const r = await runPilotExpiry({ dry: true }, deps(db, { now: () => later }));
    expect(r).toMatchObject({ ok: true, dry: true, reminded: [{ id: "p-1", program_name: "Soon", email: "a***@x.io", days_left: 1 }], expired: [{ id: "p-2", program_name: "Due", email: "b***@x.io", plan_reverted: null }] });
    expect(sent).toHaveLength(2); // the two welcomes only
    expect(setPlan).toHaveBeenCalledTimes(2);
    expect(plans.get("u-2")).toBe(PILOT_TIER);
    const ledger = await readLedger(root);
    expect(ledger.pilots.every((p) => p.status === "active" && !p.reminder_sent_at)).toBe(true);
  });

  it("G16 review: an evaluator with an active Stripe subscription is never comped → 409 already_paying, no plan write", async () => {
    const { db, plans } = makeDb([{ id: "u-9", email: "pay@x.io", plan: "investor_angel", subscribed: true }]);
    const r = await startPilot({ email: "pay@x.io", program_name: "Paying", days: 30 }, ADMIN, deps(db));
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.status).toBe(409); expect(r.error).toBe("already_paying"); }
    expect(plans.get("u-9")).toBe("investor_angel");
  });

  it("live run: T-3 d reminder once (flag in ledger), expiry reverts the plan with reason expired, ops alerted", async () => {
    const { db, plans, subs } = makeDb([{ id: "u-1", email: "a@x.io", plan: "free" }, { id: "u-2", email: "b@x.io", plan: "free" }, { id: "u-3", email: "c@x.io", plan: "free" }]);
    await startPilot({ email: "a@x.io", program_name: "Soon", days: 3 }, ADMIN, deps(db));
    await startPilot({ email: "b@x.io", program_name: "Due", days: 1 }, ADMIN, deps(db));
    await startPilot({ email: "c@x.io", program_name: "Payer", days: 1 }, ADMIN, deps(db));
    // c subscribes DURING the pilot (converted) — expiry must keep the paid plan.
    subs.add("u-3");
    expect(subs.has("u-3")).toBe(true);
    const later = new Date(addDays(NOW, 1));
    const r = await runPilotExpiry({}, deps(db, { now: () => later }));
    expect(r.reminded.map((x) => x.id)).toEqual(["p-1"]);
    expect(r.expired).toEqual([
      { id: "p-2", program_name: "Due", email: "b***@x.io", plan_reverted: true },
      { id: "p-3", program_name: "Payer", email: "c***@x.io", plan_reverted: false },
    ]);
    expect(plans.get("u-2")).toBe("free");
    expect(plans.get("u-3")).toBe(PILOT_TIER);
    const ledger = await readLedger(root);
    expect(ledger.pilots.find((p) => p.id === "p-1")).toMatchObject({ status: "active", reminder_sent_at: later.toISOString() });
    expect(ledger.pilots.find((p) => p.id === "p-2")).toMatchObject({ status: "expired", ended_reason: "expired", plan_reverted: true });
    expect(ledger.pilots.find((p) => p.id === "p-3")).toMatchObject({ status: "expired", ended_reason: "expired", plan_reverted: false });
    const subjects = sent.slice(3).map((m) => m.subject);
    expect(subjects.some((s) => s.startsWith("Your BlockID pilot ends in 2 days"))).toBe(true);
    expect(subjects.filter((s) => s.startsWith("Your BlockID pilot has ended"))).toHaveLength(2);
    expect(audits.map((a) => a.action)).toEqual(["pilot.started", "pilot.started", "pilot.started", "pilot.expired", "pilot.expired"]);
    expect(alerts.some((a) => a.includes("Pilot ends in 2 d"))).toBe(true);
    expect(alerts.filter((a) => a.includes("Pilot expired"))).toHaveLength(2);

    // Second run the same day: reminder not repeated, nothing else to do.
    const again = await runPilotExpiry({}, deps(db, { now: () => later }));
    expect(again.reminded).toEqual([]);
    expect(again.expired).toEqual([]);
    expect(sent.filter((m) => m.subject.startsWith("Your BlockID pilot ends in"))).toHaveLength(1);
  });
});

describe("listPilots", () => {
  it("newest first with days_left, counts, masked e-mail and intake_url; active / cap", async () => {
    const { db } = makeDb([{ id: "u-1", email: "a@x.io", plan: "free" }]);
    await startPilot({ email: "a@x.io", program_name: "Demo" }, ADMIN, deps(db));
    const r = await listPilots(deps(db, { now: () => new Date(addDays(NOW, 10)) }));
    expect(r).toMatchObject({ active: 1, cap: PILOT_CAP });
    expect(r.pilots[0]).toMatchObject({ id: "p-1", days_left: 20, submissions: 3, reports_run: 2, assessments: 1, email_masked: "a***@x.io", intake_url: "https://blockid.au/apply/demo-abcdefgh" });
    const noDb = await listPilots(deps(null));
    expect(noDb.pilots[0]).toMatchObject({ submissions: 0, reports_run: 0, assessments: 0 });
  });
});
