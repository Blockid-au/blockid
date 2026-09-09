import { describe, expect, it } from "vitest";

import {
  FREE_SUMMARY_PAGES,
  FREE_SUMMARY_PAGE_COUNT,
} from "@/lib/analyses/free-summary";
import { ONE_CLICK_REPORT_3AUD } from "@/lib/pricing/v3-skus";
import { GENERATED_PLANS_BY_ID } from "@/config/pricing/plans.generated";

import {
  HOMEPAGE_TIERS,
  audLabel,
  heroTierChips,
  requireCents,
} from "./tiers";

// The homepage's provenance gate, extended to prices. A price shown to a
// visitor that differs from what Stripe charges is a compliance problem, so
// each label is asserted against the module that actually owns the number.

describe("audLabel", () => {
  it("drops the cents on a whole dollar amount", () => {
    expect(audLabel(300)).toBe("A$3");
    expect(audLabel(2900)).toBe("A$29");
    expect(audLabel(0)).toBe("A$0");
  });

  it("keeps them when there are any", () => {
    expect(audLabel(1250)).toBe("A$12.50");
  });
});

describe("requireCents", () => {
  it("passes a real price through", () => {
    expect(requireCents(300, "report")).toBe(300);
    expect(requireCents(0, "free")).toBe(0);
  });

  it("refuses to invent a price when the source has none", () => {
    // Printing "A$0" for something we charge for is the failure this exists
    // to prevent, so it throws rather than degrading.
    expect(() => requireCents(null, "report")).toThrow(/no price/);
    expect(() => requireCents(Number.NaN, "report")).toThrow(/no price/);
  });
});

describe("HOMEPAGE_TIERS", () => {
  it("is the three rungs, in ladder order", () => {
    expect(HOMEPAGE_TIERS.map((t) => t.id)).toEqual([
      "free",
      "report",
      "workspace",
    ]);
  });

  it("prices the report rung from the Stripe SKU, not by hand", () => {
    const report = HOMEPAGE_TIERS.find((t) => t.id === "report")!;
    expect(report.price).toBe(
      audLabel(requireCents(ONE_CLICK_REPORT_3AUD.unit_amount_incl_gst_cents, "report")),
    );
    expect(ONE_CLICK_REPORT_3AUD.unit_amount_incl_gst_cents).toBe(300);
    // GST-inclusive, because that is how Stripe charges it.
    expect(report.priceSuffix).toContain("inc GST");
  });

  it("prices the workspace rung from the generated plan ladder", () => {
    const workspace = HOMEPAGE_TIERS.find((t) => t.id === "workspace")!;
    const plan = GENERATED_PLANS_BY_ID.founder_starter;
    expect(workspace.price).toBe(
      audLabel(requireCents(plan.price_aud_cents, "workspace")),
    );
    expect(workspace.priceSuffix).toBe("a month");
    // The run allowance is quoted, so it has to be the real one.
    expect(workspace.includes[0]).toContain(
      String(plan.usage_limits.svi_per_month),
    );
  });

  // The rung may only promise things the plan behind it actually grants.
  // This is the guard that would have caught the ESOP bullet: A$29 sold
  // "cap table, vesting and an ESOP you can actually issue" while
  // `founder_starter` held neither `cap_table.write` nor `esop.manage`, so
  // four of its five bullets redirected the subscriber to /pricing.
  it("promises the workspace rung nothing its plan does not grant", () => {
    const workspace = HOMEPAGE_TIERS.find((t) => t.id === "workspace")!;
    const flags = GENERATED_PLANS_BY_ID.founder_starter.feature_flags;
    const text = workspace.includes.join(" | ").toLowerCase();

    // The data room and the investor link are sold, so they must be granted.
    expect(text).toContain("data room");
    expect(flags).toContain("data_room.access");
    expect(text).toContain("live link");
    expect(flags).toContain("investor_links.premium");

    // Equity lives one rung up. If it is ever granted to Starter this
    // assertion is the place to change, and the copy follows.
    expect(flags).not.toContain("cap_table.write");
    expect(flags).not.toContain("share_management");
    expect(flags).not.toContain("esop.manage");
    for (const equityWord of ["cap table", "esop", "vesting", "issue equity"]) {
      expect(text).not.toContain(equityWord);
    }
    expect(workspace.gist.toLowerCase()).not.toContain("equity");
  });

  it("says the free rung costs nothing", () => {
    const free = HOMEPAGE_TIERS.find((t) => t.id === "free")!;
    expect(free.price).toBe("A$0");
    expect(free.priceSuffix).toBeNull();
  });

  it("takes the free rung's page count from the one definition", () => {
    const free = HOMEPAGE_TIERS.find((t) => t.id === "free")!;
    expect(free.gist).toContain(`${FREE_SUMMARY_PAGE_COUNT}-page`);
    // The page titles are one line, not five bullets, but they are still
    // generated — the card cannot name a page the PDF does not contain.
    const pageLine = free.includes.find((l) =>
      l.startsWith(`The ${FREE_SUMMARY_PAGE_COUNT} pages:`),
    );
    expect(pageLine).toBeDefined();
    for (const page of FREE_SUMMARY_PAGES) {
      expect(pageLine!.toLowerCase()).toContain(page.title.toLowerCase());
    }
  });

  it("emphasises exactly one rung", () => {
    expect(HOMEPAGE_TIERS.filter((t) => t.emphasis)).toHaveLength(1);
    expect(HOMEPAGE_TIERS.find((t) => t.emphasis)!.id).toBe("report");
  });

  it("gives every rung an ask, a gist, a list and a destination", () => {
    for (const tier of HOMEPAGE_TIERS) {
      expect(tier.name.trim().length).toBeGreaterThan(0);
      expect(tier.ask.trim().length).toBeGreaterThan(0);
      expect(tier.gist.trim().length).toBeGreaterThan(0);
      expect(tier.includes.length).toBeGreaterThanOrEqual(4);
      expect(tier.cta.label.trim().length).toBeGreaterThan(0);
      expect(tier.cta.href.trim().length).toBeGreaterThan(0);
    }
  });

  it("uses no scarcity, urgency or popularity language", () => {
    // The emphasised rung is marked because of where it sits in the ladder,
    // not because of an unverifiable claim about what other people chose.
    const text = JSON.stringify(HOMEPAGE_TIERS).toLowerCase();
    for (const banned of [
      "most popular",
      "limited",
      "hurry",
      "spots",
      "% off",
      "discount",
      "expires",
      "act now",
    ]) {
      expect(text).not.toContain(banned);
    }
    // "only N left" is the scarcity shape; "only if you want it" is not.
    expect(text).not.toMatch(/only \d+/);
  });
});

describe("heroTierChips", () => {
  it("is the same three rungs, in the same order", () => {
    expect(heroTierChips().map((c) => c.id)).toEqual([
      "free",
      "report",
      "workspace",
    ]);
  });

  it("labels the ladder as Free / A$3 / A$29 a month", () => {
    expect(heroTierChips().map((c) => c.label)).toEqual([
      "Free",
      "A$3",
      "A$29/mo",
    ]);
  });

  it("carries a gist for each so the strip says what you get, not just a price", () => {
    for (const chip of heroTierChips()) {
      expect(chip.gist.trim().length).toBeGreaterThan(10);
    }
  });
});
