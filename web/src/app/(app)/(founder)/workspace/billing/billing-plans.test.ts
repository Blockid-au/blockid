import { describe, expect, it } from "vitest";
import { LEGACY_PLANS } from "@/lib/plans";
import { PLANS_V2, publicPlansForSegment } from "@/lib/plans-v2";

import {
  BILLING_TIER_RANK,
  billingPlansFor,
  billingSegmentForPlan,
  isCrossLadderRequest,
  normaliseBillingPlanId,
  resolveActivePlan,
  toBillingPlan,
} from "./billing-plans";

// S31-B (2026-09-13). /workspace/billing's grid came from LEGACY_PLANS —
// Founding 100 A$5 (checkout 410s), Growth A$99 (retired 2026-09-08), no
// Starter at all. These pin the grid to plans-v2.

describe("billingPlansFor — the grid is the public v2 ladder", () => {
  it("a free founder sees Free / Starter / Growth at plans-v2 prices, in order", () => {
    const grid = billingPlansFor("free");
    expect(grid.map((p) => p.id)).toEqual(["founder_free", "founder_starter", "founder_growth"]);
    const starter = PLANS_V2.find((p) => p.id === "founder_starter")!;
    const growth = PLANS_V2.find((p) => p.id === "founder_growth")!;
    expect(grid[1]!.price).toBe(starter.monthly_aud! * 100);
    expect(grid[2]!.price).toBe(growth.monthly_aud! * 100);
    expect(grid[1]!.cadence).toBe("monthly");
    expect(grid[0]!.cadence).toBe("free");
  });

  it("never offers the legacy or hidden SKUs", () => {
    const ids = billingPlansFor(null).map((p) => p.id);
    for (const legacy of ["founding50", "growth", "growth_annual", "founder_scale", "founder_enterprise"]) {
      expect(ids).not.toContain(legacy);
    }
    expect(ids.every((id) => PLANS_V2.some((p) => p.id === id && p.public !== false))).toBe(true);
  });

  it("no grid price is A$99 — the figure retired on 2026-09-08", () => {
    expect(billingPlansFor("free").some((p) => p.price === 9900)).toBe(false);
  });

  it("an evaluator on Scout sees the evaluator ladder, not founder plans", () => {
    expect(billingSegmentForPlan("investor_angel")).toBe("investor");
    expect(billingSegmentForPlan("investor_advisor")).toBe("advisor");
    expect(billingSegmentForPlan("accelerator_starter")).toBe("accelerator");
    const ids = billingPlansFor("investor_angel").map((p) => p.id);
    expect(ids).toContain("investor_angel");
    expect(ids).not.toContain("founder_starter");
    // Custom-priced rungs (contact sales) are excluded — checkout has no price.
    expect(ids).not.toContain("investor_vc_ent");
  });

  it("toBillingPlan keeps the catalogue feature bullets verbatim", () => {
    const growth = publicPlansForSegment("founder").find((p) => p.id === "founder_growth")!;
    expect(toBillingPlan(growth).features).toEqual(growth.features);
  });
});

describe("normaliseBillingPlanId + BILLING_TIER_RANK", () => {
  it("maps the legacy `free` row to the v2 id so the Free card reads Current", () => {
    expect(normaliseBillingPlanId("free")).toBe("founder_free");
    expect(normaliseBillingPlanId(null)).toBe("founder_free");
    expect(normaliseBillingPlanId("founder_growth")).toBe("founder_growth");
  });

  it("ranks legacy growth level with founder_growth so no Downgrade is offered", () => {
    expect(BILLING_TIER_RANK.growth).toBe(BILLING_TIER_RANK.founder_growth);
    expect(BILLING_TIER_RANK.founder_starter).toBeGreaterThan(BILLING_TIER_RANK.founder_free!);
    expect(BILLING_TIER_RANK.founder_growth).toBeGreaterThan(BILLING_TIER_RANK.founder_starter!);
  });

  it("every grid id has a rank", () => {
    for (const seg of ["free", "investor_angel", "accelerator_starter"]) {
      for (const p of billingPlansFor(seg)) {
        expect(BILLING_TIER_RANK[p.id]).toBeDefined();
      }
    }
  });
});

describe("resolveActivePlan", () => {
  const grid = billingPlansFor("free");

  it("free users get null (the card renders the Free bullets itself)", () => {
    expect(resolveActivePlan("free", grid, LEGACY_PLANS)).toBeNull();
    expect(resolveActivePlan(null, grid, LEGACY_PLANS)).toBeNull();
  });

  it("a v2 subscriber resolves to the grid row", () => {
    expect(resolveActivePlan("founder_growth", grid, LEGACY_PLANS)?.id).toBe("founder_growth");
  });

  it("a grandfathered growth / founding50 subscriber still sees their own plan", () => {
    expect(resolveActivePlan("growth", grid, LEGACY_PLANS)?.id).toBe("growth");
    expect(resolveActivePlan("founding50", grid, LEGACY_PLANS)?.id).toBe("founding50");
  });
});

// 2026-09-16: "Start 7-day free trial" on the Evaluator tab, clicked by a
// signed-in founder, bounces to /workspace/billing?plan=investor_angel. The
// grid rendered the founder ladder, the Scout row was absent, and the
// auto-checkout silently did nothing — the trial link never reached Stripe.
describe("billingPlansFor — ?plan= on another ladder switches the grid", () => {
  it("a free founder asking for Scout gets the evaluator ladder with the Scout row", () => {
    const ids = billingPlansFor("free", "investor_angel").map((p) => p.id);
    expect(ids).toContain("investor_angel");
    expect(ids).toContain("investor_advisor");
    expect(ids).toContain("investor_vc_small");
    expect(ids).not.toContain("founder_starter");
  });

  it("a founder on Growth asking for Program still gets the evaluator ladder", () => {
    const ids = billingPlansFor("founder_growth", "investor_vc_small").map((p) => p.id);
    expect(ids).toContain("investor_vc_small");
    expect(ids).not.toContain("founder_growth");
  });

  it("same-ladder, unknown, free or custom-priced requests keep the user's own ladder", () => {
    expect(billingPlansFor("free", "founder_growth").map((p) => p.id)).toEqual(
      billingPlansFor("free").map((p) => p.id),
    );
    expect(billingPlansFor("free", "nope").map((p) => p.id)).toEqual(billingPlansFor("free").map((p) => p.id));
    expect(billingPlansFor("free", "investor_vc_ent").map((p) => p.id)).toEqual(
      billingPlansFor("free").map((p) => p.id),
    );
    expect(billingPlansFor("investor_angel", "investor_advisor").map((p) => p.id)).toEqual(
      billingPlansFor("investor_angel").map((p) => p.id),
    );
  });

  it("isCrossLadderRequest — true only for a priced SKU on a different ladder", () => {
    expect(isCrossLadderRequest("free", "investor_angel")).toBe(true);
    expect(isCrossLadderRequest("founder_growth", "investor_angel")).toBe(true);
    expect(isCrossLadderRequest("investor_angel", "founder_growth")).toBe(true);
    expect(isCrossLadderRequest("investor_angel", "investor_advisor")).toBe(false);
    expect(isCrossLadderRequest("free", "founder_starter")).toBe(false);
    expect(isCrossLadderRequest("free", "investor_vc_ent")).toBe(false);
    expect(isCrossLadderRequest("free", null)).toBe(false);
  });
});
