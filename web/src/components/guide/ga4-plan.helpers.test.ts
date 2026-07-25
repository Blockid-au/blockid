import { describe, expect, it } from "vitest";
import {
  GA4_CANONICAL_EVENTS,
  GA4_PLAN_DISCLAIMER,
  GA4_STAGE_LABEL,
  GA4_TEMPLATE_ROUTE,
  GA4_TEMPLATE_SLUG,
  computeGa4PlanProgress,
  makeEmptyGa4CheckedState,
  type Ga4CanonicalEvent,
  type Ga4EventStage,
} from "./ga4-plan.helpers";

describe("GA4_CANONICAL_EVENTS fixture", () => {
  it("carries the 9 canonical events sourced from the au-ga4-measurement-plan template", () => {
    expect(GA4_CANONICAL_EVENTS).toHaveLength(9);
    const ids = GA4_CANONICAL_EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      "page_view",
      "sign_up_initiated",
      "sign_up_completed",
      "activation_completed",
      "aha_moment",
      "feature_used",
      "purchase",
      "subscription_started",
      "referral_signup_completed",
    ]);
  });

  it("only cites known GA4EventStage values + every stage has ≥ 1 event", () => {
    const knownStages: Ga4EventStage[] = [
      "acquisition",
      "activation",
      "retention",
      "revenue",
      "referral",
    ];
    for (const ev of GA4_CANONICAL_EVENTS) {
      expect(knownStages).toContain(ev.stage);
      expect(ev.decision.en.length).toBeGreaterThan(0);
      expect(ev.decision.vi.length).toBeGreaterThan(0);
    }
    for (const stage of knownStages) {
      const count = GA4_CANONICAL_EVENTS.filter((e) => e.stage === stage).length;
      expect(count).toBeGreaterThan(0);
    }
  });

  it("declares the revenue event with GST-exclusive decision copy", () => {
    const purchase = GA4_CANONICAL_EVENTS.find((e) => e.id === "purchase");
    expect(purchase?.decision.en).toMatch(/GST-exclusive/i);
  });
});

describe("GA4_STAGE_LABEL", () => {
  it("provides EN + VI labels for every stage", () => {
    const stages: Ga4EventStage[] = [
      "acquisition",
      "activation",
      "retention",
      "revenue",
      "referral",
    ];
    for (const stage of stages) {
      const label = GA4_STAGE_LABEL[stage];
      expect(label.en.length).toBeGreaterThan(0);
      expect(label.vi.length).toBeGreaterThan(0);
    }
  });
});

describe("GA4_TEMPLATE_ROUTE + slug", () => {
  it("routes to /legal-templates/au-ga4-measurement-plan", () => {
    expect(GA4_TEMPLATE_SLUG).toBe("au-ga4-measurement-plan");
    expect(GA4_TEMPLATE_ROUTE).toBe("/legal-templates/au-ga4-measurement-plan");
  });
});

describe("makeEmptyGa4CheckedState", () => {
  it("returns a false-per-event state keyed on the canonical ids", () => {
    const state = makeEmptyGa4CheckedState();
    expect(Object.keys(state).sort()).toEqual(
      GA4_CANONICAL_EVENTS.map((e) => e.id).sort(),
    );
    for (const v of Object.values(state)) expect(v).toBe(false);
  });

  it("respects a custom event list", () => {
    const custom: Ga4CanonicalEvent[] = [
      {
        id: "only_one",
        name: "only_one",
        stage: "revenue",
        decision: { en: "x", vi: "y" },
      },
    ];
    expect(makeEmptyGa4CheckedState(custom)).toEqual({ only_one: false });
  });
});

describe("computeGa4PlanProgress", () => {
  it("empty state → 0/9 not-started + zeros per stage", () => {
    const r = computeGa4PlanProgress({});
    expect(r.wired).toBe(0);
    expect(r.total).toBe(9);
    expect(r.pct).toBe(0);
    expect(r.band).toBe("not-started");
    expect(r.by_stage.acquisition).toEqual({ wired: 0, total: 3 });
    expect(r.by_stage.activation).toEqual({ wired: 0, total: 2 });
    expect(r.by_stage.retention).toEqual({ wired: 0, total: 1 });
    expect(r.by_stage.revenue).toEqual({ wired: 0, total: 2 });
    expect(r.by_stage.referral).toEqual({ wired: 0, total: 1 });
  });

  it("all-checked → 9/9 100% investor-ready", () => {
    const state = makeEmptyGa4CheckedState();
    for (const id of Object.keys(state)) state[id] = true;
    const r = computeGa4PlanProgress(state);
    expect(r.wired).toBe(9);
    expect(r.pct).toBe(100);
    expect(r.band).toBe("investor-ready");
    expect(r.by_stage.revenue).toEqual({ wired: 2, total: 2 });
  });

  it("partial (3/9 = 33%) → in-progress", () => {
    const r = computeGa4PlanProgress({
      page_view: true,
      sign_up_initiated: true,
      purchase: true,
    });
    expect(r.wired).toBe(3);
    expect(r.pct).toBe(33);
    expect(r.band).toBe("in-progress");
    expect(r.by_stage.acquisition.wired).toBe(2);
    expect(r.by_stage.revenue.wired).toBe(1);
  });

  it("just crosses the 75% band → investor-ready (7/9 = 78%)", () => {
    const r = computeGa4PlanProgress({
      page_view: true,
      sign_up_initiated: true,
      sign_up_completed: true,
      activation_completed: true,
      aha_moment: true,
      feature_used: true,
      purchase: true,
    });
    expect(r.wired).toBe(7);
    expect(r.pct).toBe(78);
    expect(r.band).toBe("investor-ready");
  });

  it("ignores non-boolean truthy values (only strict true counts)", () => {
    const r = computeGa4PlanProgress({
      page_view: "yes" as unknown as boolean,
      purchase: 1 as unknown as boolean,
    });
    expect(r.wired).toBe(0);
    expect(r.band).toBe("not-started");
  });

  it("ignores unknown keys in the checked map", () => {
    const r = computeGa4PlanProgress({
      unknown_event_id: true,
      page_view: true,
    });
    expect(r.wired).toBe(1);
  });
});

describe("GA4_PLAN_DISCLAIMER", () => {
  it("cites Privacy Act 1988 (Cth) + APP in the EN copy", () => {
    expect(GA4_PLAN_DISCLAIMER.en).toMatch(/Privacy Act 1988/);
    expect(GA4_PLAN_DISCLAIMER.en).toMatch(/APP/);
    expect(GA4_PLAN_DISCLAIMER.vi).toMatch(/Privacy Act 1988/);
  });
});
