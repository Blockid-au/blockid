// G16-B — the gate card sells the right plan: name + A$ price + trial terms
// from plans-v2 and one CTA anchored on that plan's /pricing card. Evaluator-
// only features (investor.dealflow) resolve to the evaluator ladder (Scout),
// never "contact sales"; the card renders with the locked user's hooks
// mocked so the fallback branch is what is asserted.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PLANS_V2 } from "@/lib/plans-v2";

vi.mock("@/hooks/useEntitlement", () => ({ useEntitlement: () => ({ can: () => false, isLoading: false }) }));
vi.mock("@/hooks/useUpgradePrompt", () => ({ useUpgradePrompt: () => null }));

import { DefaultUpgradeCta, FeatureGate, gateCardCopy } from "./FeatureGate";

const plan = (id: string) => PLANS_V2.find((p) => p.id === id)!;

describe("gateCardCopy (G16-B)", () => {
  it("cap_table.write → Growth card: name, A$ price, trial, anchored href", () => {
    const growth = plan("founder_growth");
    const c = gateCardCopy("cap_table.write");
    expect(c.planId).toBe("founder_growth");
    expect(c.body).toContain(`the ${growth.name} plan — A$${growth.monthly_aud}/mo`);
    expect(c.body).toContain(`${growth.trial_days}-day free trial`);
    expect(c.cta).toBe(`See ${growth.name}`);
    expect(c.href).toBe("/pricing?feature=cap_table.write#tier-growth");
  });

  it("data_room.access → Starter (A$29 rung), href anchored on #tier-starter", () => {
    const starter = plan("founder_starter");
    const c = gateCardCopy("data_room.access");
    expect(c.planId).toBe("founder_starter");
    expect(c.body).toContain(`A$${starter.monthly_aud}/mo`);
    expect(c.href).toBe("/pricing?feature=data_room.access#tier-starter");
  });

  it("investor.dealflow (evaluator-only) → the evaluator ladder: Scout, not contact sales", () => {
    const scout = plan("investor_angel");
    const c = gateCardCopy("investor.dealflow", "Deal Flow Inbox");
    expect(c.planId).toBe("investor_angel");
    expect(c.title).toBe("Deal Flow Inbox");
    expect(c.body).toContain(`the ${scout.name} plan — A$${scout.monthly_aud}/mo`);
    expect(c.cta).toBe("See Scout");
    expect(c.href).toBe("/pricing?feature=investor.dealflow&segment=investor#tier-scout");
  });

  it("esop.manage → Equity add-on on Growth; sso → contact sales", () => {
    const esop = gateCardCopy("esop.manage");
    expect(esop.body).toContain("Equity add-on");
    expect(esop.body).toContain("Growth plan");
    const sso = gateCardCopy("sso");
    expect(sso.planId).toBeNull();
    expect(sso.cta).toBe("Contact sales");
    expect(sso.href).toBe("/contact?plan=enterprise&feature=sso");
  });

  it("never hard-codes a price: every A$ figure in the copy comes from plans-v2", () => {
    for (const f of ["cap_table.write", "data_room.access", "investor.dealflow", "intake.manage", "lp_export"]) {
      const c = gateCardCopy(f);
      const m = c.body.match(/A\$(\d+)/);
      expect(m, f).not.toBeNull();
      expect(plan(c.planId!).monthly_aud).toBe(Number(m![1]));
    }
  });
});

describe("<DefaultUpgradeCta> / <FeatureGate> fallback", () => {
  it("renders the plan + price + one anchored CTA", () => {
    const html = renderToStaticMarkup(<DefaultUpgradeCta feature="investor.dealflow" label="Deal Flow Inbox" />);
    expect(html).toContain('data-testid="feature-gate-card"');
    expect(html).toContain('data-plan="investor_angel"');
    expect(html).toContain("Deal Flow Inbox is locked on your plan");
    expect(html).toContain(`A$${plan("investor_angel").monthly_aud}/mo`);
    expect(html).toContain('href="/pricing?feature=investor.dealflow&amp;segment=investor#tier-scout"');
    expect((html.match(/<a /g) ?? []).length).toBe(1);
  });

  it("<FeatureGate> with can() false renders the card (children hidden)", () => {
    const html = renderToStaticMarkup(
      <FeatureGate feature="cap_table.write">
        <p>secret table</p>
      </FeatureGate>,
    );
    expect(html).not.toContain("secret table");
    expect(html).toContain('data-plan="founder_growth"');
    expect(html).toContain("#tier-growth");
  });
});
