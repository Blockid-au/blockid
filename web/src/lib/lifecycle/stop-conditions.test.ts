// G34-BT4 — send-time stop conditions (plan §9.2 "Dừng khi"): goal reached
// → cancel, unreadable → defer (never send a commercial nudge on a guess).
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

import { hasPurchased, lifecycleStopDecision } from "./stop-conditions";
import { createFakeDb } from "./testing/fake-db";

const drip = (campaign: string, extra: Record<string, unknown> = {}) => ({
  campaign,
  email: "sam@example.com",
  user_id: "u1",
  created_at: "2026-09-20T00:00:00Z",
  payload: { project_id: "p1" },
  ...extra,
});

describe("lifecycleStopDecision", () => {
  it("non-lifecycle campaigns and the T / digest flows always send", async () => {
    const db = createFakeDb();
    expect(await lifecycleStopDecision(drip("onboarding_d1"), db)).toEqual({ action: "send" });
    expect(await lifecycleStopDecision(drip("score_updated"), db)).toEqual({ action: "send" });
    expect(await lifecycleStopDecision(drip("monthly_digest"), db)).toEqual({ action: "send" });
  });

  it("no db: T sends, C defers", async () => {
    expect(await lifecycleStopDecision(drip("score_updated"), null)).toEqual({ action: "send" });
    expect((await lifecycleStopDecision(drip("evidence_gap_1"), null)).action).toBe("defer");
  });

  it("EM14: evidence on the account cancels; none sends; unreadable defers", async () => {
    const db = createFakeDb({ svi_accounts: [{ id: "a1", email: "sam@example.com", project_id: "p1" }], svi_evidence: [] });
    expect(await lifecycleStopDecision(drip("evidence_gap_2"), db)).toEqual({ action: "send" });
    db.tables.svi_evidence.push({ id: "e1", account_id: "a1" });
    expect(await lifecycleStopDecision(drip("evidence_gap_2"), db)).toEqual({ action: "cancel", reason: "goal reached: evidence added" });
    db.failing.add("svi_evidence");
    expect((await lifecycleStopDecision(drip("evidence_gap_1"), db)).action).toBe("defer");
  });

  it("EM13: completed or resumed onboarding cancels", async () => {
    const idle = { payload: { lifecycle: { intake: { steps_done: 1, steps_total: 3, next_step_label: "x", idle_since: "2026-09-20T00:00:00Z" } } } };
    const db = createFakeDb({ app_users: [{ id: "u1", onboarding_completed: false, onboarding_state: { updated_at: "2026-09-20T00:00:00Z" } }] });
    expect(await lifecycleStopDecision(drip("intake_abandoned_1", idle), db)).toEqual({ action: "send" });
    db.tables.app_users[0].onboarding_state = { updated_at: "2026-09-21T00:00:00Z" };
    expect(await lifecycleStopDecision(drip("intake_abandoned_2", idle), db)).toEqual({ action: "cancel", reason: "goal reached: onboarding resumed" });
    db.tables.app_users[0].onboarding_completed = true;
    expect(await lifecycleStopDecision(drip("intake_abandoned_2", idle), db)).toEqual({ action: "cancel", reason: "goal reached: onboarding completed" });
  });

  it("EM15: a newer analysis for the project cancels (re-run started)", async () => {
    const d = drip("rerun_prompt", { payload: { project_id: "p1", lifecycle: { rerun: { new_evidence_count: 1, last_scored_at: "2026-09-10T00:00:00Z", evidence_labels: [] } } } });
    const db = createFakeDb({ svi_analyses: [{ id: "x", email: "sam@example.com", project_id: "p1", created_at: "2026-09-10T00:00:00Z" }] });
    expect(await lifecycleStopDecision(d, db)).toEqual({ action: "send" });
    db.tables.svi_analyses.push({ id: "y", email: "sam@example.com", project_id: "p1", created_at: "2026-09-22T00:00:00Z" });
    expect(await lifecycleStopDecision(d, db)).toEqual({ action: "cancel", reason: "goal reached: re-run started" });
  });

  it("EM16: a paid plan, a credit pack or a paid report cancels; unreadable defers", async () => {
    const db = createFakeDb({ app_users: [{ id: "u1", plan: "founder_free" }], revenue_events: [], report_orders: [] });
    expect(await lifecycleStopDecision(drip("free_quota_used"), db)).toEqual({ action: "send" });
    db.tables.revenue_events.push({ user_id: "u1", kind: "credit_pack" });
    expect((await lifecycleStopDecision(drip("free_quota_used"), db)).action).toBe("cancel");
    db.tables.revenue_events = [];
    db.tables.report_orders.push({ user_id: "u1", status: "READY" });
    expect(await hasPurchased(db, "u1")).toBe(true);
    db.tables.report_orders = [];
    db.tables.app_users[0].plan = "founder_starter";
    expect(await hasPurchased(db, "u1")).toBe(true);
    db.failing.add("app_users");
    expect((await lifecycleStopDecision(drip("free_quota_used"), db)).action).toBe("defer");
  });

  it("EM20: a sign-in after the question was queued cancels", async () => {
    const db = createFakeDb({ sessions: [{ user_id: "u1", last_used_at: "2026-09-01T00:00:00Z" }] });
    expect(await lifecycleStopDecision(drip("sunset_check"), db)).toEqual({ action: "send" });
    db.tables.sessions.push({ user_id: "u1", last_used_at: "2026-09-21T00:00:00Z" });
    expect(await lifecycleStopDecision(drip("sunset_check"), db)).toEqual({ action: "cancel", reason: "goal reached: signed in again" });
  });
});
