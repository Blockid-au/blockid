/**
 * The cap table is gated by two different feature flags depending on which
 * door you come in by:
 *
 *   /workspace/cap-table (the page)      → requireTierForPage("cap_table.write")
 *   /api/cap-table/* (six route handlers) → gateRequireFeature("share_management")
 *
 * Today that is harmless: every plan carries both flags or neither, and the
 * A$59 Equity add-on deliberately grants neither (see ADDON_FEATURES). So the
 * page and its own API can never disagree.
 *
 * It stops being harmless the moment anything grants one alone — a new plan
 * row, a second add-on, a support override. Then a founder loads the cap table
 * and every request it makes 403s: a page that renders and does nothing, which
 * is worse than a clean paywall because there is nothing to click.
 *
 * Renaming one of the flags would touch eleven files and change no behaviour,
 * so the invariant is pinned here instead. If this test fails, either put the
 * flags back in step or unify the two gates for real — do not delete the test.
 */

import { describe, expect, it } from "vitest";
import { GENERATED_PLANS } from "./plans.generated";
import { ADDON_FEATURES } from "@/lib/entitlements/user-grants";

const PAIR = ["cap_table.write", "share_management"] as const;

describe("cap-table gate pairing", () => {
  it("every plan grants both cap-table flags or neither", () => {
    const split = GENERATED_PLANS.filter((p) => {
      const has = PAIR.map((f) => p.feature_flags.includes(f));
      return has[0] !== has[1];
    }).map((p) => ({
      id: p.id,
      "cap_table.write": p.feature_flags.includes(PAIR[0]),
      share_management: p.feature_flags.includes(PAIR[1]),
    }));

    expect(
      split,
      `These plans grant one cap-table flag without the other, so ` +
        `/workspace/cap-table would render for them while /api/cap-table/* ` +
        `returns 403 on every call:\n${JSON.stringify(split, null, 2)}`,
    ).toEqual([]);
  });

  it("no add-on grants one cap-table flag without the other", () => {
    const split = Object.entries(ADDON_FEATURES)
      .map(([key, features]) => ({
        key,
        "cap_table.write": (features as readonly string[]).includes(PAIR[0]),
        share_management: (features as readonly string[]).includes(PAIR[1]),
      }))
      .filter((r) => r["cap_table.write"] !== r.share_management);

    expect(
      split,
      `These add-ons grant one cap-table flag without the other:\n` +
        JSON.stringify(split, null, 2),
    ).toEqual([]);
  });
});
