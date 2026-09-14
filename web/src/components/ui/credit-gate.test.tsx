import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CREDIT_PACKS } from "@/lib/credit-packs";
import { PLANS_V2 } from "@/lib/plans-v2";

import { CreditGate, creditGatePacks, perCreditLabel } from "./credit-gate";

// S31-B (2026-09-13): the gate used to hard-code 10 credits for A$5, 25 for
// A$9 and 50 for A$15 while /api/credits charged A$9 / A$20 / A$35, and it
// still sold the Founding 100 A$5 deal that checkout has 410'd since
// 2026-09-01. Every price on the card is now read from the catalogues, and
// this test pins that.

describe("CreditGate prices track lib/credit-packs and plans-v2", () => {
  it("offers the 10 / 25 / 50 bundles at the catalogue price", () => {
    const packs = creditGatePacks();
    expect(packs.map((p) => p.credits)).toEqual([10, 25, 50]);
    for (const pack of packs) {
      const canonical = CREDIT_PACKS.find((p) => p.credits === pack.credits)!;
      expect(pack.price).toBe(canonical.price);
    }
  });

  it("per-credit copy is arithmetic on the catalogue, not a typed string", () => {
    const ten = CREDIT_PACKS.find((p) => p.credits === 10)!;
    expect(perCreditLabel(ten)).toBe(`A$${(ten.price / 10).toFixed(2)} per credit — save 10%`);
  });

  it("renders the live pack prices and the Starter plan, never the retired copy", () => {
    const html = renderToStaticMarkup(
      <CreditGate isOpen onClose={() => {}} feature="svi_analysis" cost={0.5} balance={0} />,
    );
    for (const pack of creditGatePacks()) {
      expect(html).toContain(`A$${pack.price}`);
    }
    const starter = PLANS_V2.find((p) => p.id === "founder_starter")!;
    expect(html).toContain(`${starter.name} plan — A$${starter.monthly_aud}/mo`);
    expect(html).toContain("/pricing?feature=svi.run#tier-starter");
    expect(html).not.toContain("Founding 100");
    expect(html).not.toContain("A$0.50 per credit");
    expect(html).not.toContain("A$0.36 per credit");
    expect(html).not.toContain("A$0.30 per credit");
  });

  it("renders nothing while closed", () => {
    const html = renderToStaticMarkup(
      <CreditGate isOpen={false} onClose={() => {}} feature="svi_analysis" cost={0.5} balance={3} />,
    );
    expect(html).toBe("");
  });
});
