import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// S31-B (2026-09-13). The /svi entrance (the first-analysis page every trial
// user lands on) still sold the Founding 100 "A$5 lifetime, only 100 spots"
// promo — a pricing card, the paywall's option C, a navbar link and a
// "Sign in" link carrying `?plan=founding50` — three weeks after the promo
// closed (2026-09-01) and the checkout route began answering 410. The
// component is 2,000+ lines of client JSX with hooks, so this pins the
// source text rather than a render: no route may point at /founding-50 and
// no price literal may be typed where plans-v2 / credit-packs supply it.

const SRC = readFileSync(join(__dirname, "svi-entrance.tsx"), "utf8");

describe("svi-entrance sells the live ladder, not the retired Founding 100 promo", () => {
  it("never links to /founding-50 or passes plan=founding50", () => {
    expect(SRC).not.toMatch(/href=["'`]\/founding-50/);
    expect(SRC).not.toContain("plan=founding50");
    expect(SRC).not.toContain('window.location.href = "/founding-50"');
  });

  it("reads Starter and the credit packs from the catalogues", () => {
    expect(SRC).toContain('import { PLANS_V2, formatAud } from "@/lib/plans-v2"');
    expect(SRC).toContain('import { CREDIT_PACKS } from "@/lib/credit-packs"');
    expect(SRC).toContain('PLANS_V2.find((p) => p.id === "founder_starter")');
    expect(SRC).toContain("/pricing?feature=svi.run#tier-starter");
  });

  it("has no typed pack or lifetime prices left in the pricing surfaces", () => {
    expect(SRC).not.toContain("Buy 5 credits (A$5)");
    expect(SRC).not.toContain("Buy 25 credits (A$20");
    expect(SRC).not.toContain("Lifetime access");
    expect(SRC).not.toContain("Only 100 spots");
  });
});
