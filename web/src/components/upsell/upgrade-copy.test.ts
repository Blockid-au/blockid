/**
 * Colocated tests for the upgrade-CTA copy registry
 * (src/components/upsell/upgrade-copy.ts) — shared source for
 * UpgradeModal + UpgradeBanner across the trial/credits/report/watchlist/
 * cohort/win-back triggers wired in `hooks/useUpgradePrompt.ts`.
 *
 * These pin the editorial rules a copy tweak could silently break:
 *   1. Registry completeness — every UpgradeTrigger union member has an
 *      entry, no orphans, no extras. Missing an entry crashes the modal
 *      at runtime with a TypeError because UpgradeModal does
 *      UPGRADE_COPY[trigger].headline without a fallback.
 *   2. Non-empty required fields (headline / body / primaryCta / suggestedPlan)
 *      — the shipped modal renders these directly with no guard.
 *   3. Optional secondaryCta / urgency, when present, must be non-empty.
 *   4. suggestedPlan is drawn from the shipped tier whitelist so the
 *      "Confirm plan" click can hand the caller a real Stripe SKU.
 *   5. Length caps — headline ≤ 8 words, body ≤ 30 words, primaryCta
 *      ≤ 5 words — the modal is 400px wide and copy longer than this
 *      wraps to 4+ lines and pushes the primary CTA off the fold on
 *      375px mobile.
 *   6. No marketing hyperbole (banned word list).
 *   7. Trial-day escalation: day_6 + day_7 carry `urgency`, day_5 does
 *      not (the "two days left" step is informative, not last-chance).
 *   8. Watchlist trigger maps to an investor plan; cohort trigger maps
 *      to an accelerator plan — a copy-paste dupe of `founder_growth`
 *      into either of those slots would upsell a founder Stripe SKU to
 *      an investor / accelerator user.
 *   9. Winback references the coupon code the caller applies at
 *      /pricing?coupon=… (a code rename in Stripe without updating this
 *      copy would ship a broken CTA button).
 *
 * The suite is structural — it does not attempt to judge copy quality.
 */

import { describe, expect, it } from "vitest";

import { UPGRADE_COPY, type UpgradeCopy } from "./upgrade-copy";
import type { UpgradeTrigger } from "@/hooks/useUpgradePrompt";

const EXPECTED_TRIGGERS: readonly UpgradeTrigger[] = [
  "feature_gate_hit",
  "trial_day_5",
  "trial_day_6",
  "trial_day_7",
  "credits_low",
  "credits_exhausted",
  "report_cap_hit",
  "watchlist_cap_hit",
  "cohort_seat_cap_hit",
  "post_cancel_winback",
];

const ALLOWED_PLANS = new Set([
  "founder_growth",
  "investor_advisor",
  "accelerator_growth",
]);

const HYPERBOLE_TERMS = [
  "revolutionary",
  "world-class",
  "world class",
  "cutting-edge",
  "cutting edge",
  "game-changing",
  "game changing",
  "best-in-class",
  "best in class",
  "unparalleled",
];

function wordsOf(text: string): string[] {
  return text.trim().split(/\s+/).filter((t) => t.length > 0);
}

function allSurfaceStrings(entry: UpgradeCopy): string[] {
  const out = [entry.headline, entry.body, entry.primaryCta, entry.suggestedPlan];
  if (entry.secondaryCta) out.push(entry.secondaryCta);
  if (entry.urgency) out.push(entry.urgency);
  return out;
}

describe("UPGRADE_COPY — registry completeness", () => {
  it("has exactly the ten shipped UpgradeTrigger keys — no orphans, no extras", () => {
    const actualKeys = Object.keys(UPGRADE_COPY).sort();
    const expectedKeys = [...EXPECTED_TRIGGERS].sort();
    expect(actualKeys).toEqual(expectedKeys);
  });

  it("carries an entry for every UpgradeTrigger member (guards runtime TypeError in modal)", () => {
    for (const trigger of EXPECTED_TRIGGERS) {
      expect(
        UPGRADE_COPY[trigger],
        `UPGRADE_COPY missing entry for trigger "${trigger}"`,
      ).toBeDefined();
    }
  });
});

describe("UPGRADE_COPY — required fields", () => {
  it.each(EXPECTED_TRIGGERS)("%s has non-empty headline / body / primaryCta / suggestedPlan", (trigger) => {
    const entry = UPGRADE_COPY[trigger];
    expect(entry.headline, `${trigger}.headline`).toMatch(/\S/);
    expect(entry.body, `${trigger}.body`).toMatch(/\S/);
    expect(entry.primaryCta, `${trigger}.primaryCta`).toMatch(/\S/);
    expect(entry.suggestedPlan, `${trigger}.suggestedPlan`).toMatch(/\S/);
  });

  it("optional secondaryCta is non-empty when present (no accidental empty string)", () => {
    for (const trigger of EXPECTED_TRIGGERS) {
      const entry = UPGRADE_COPY[trigger];
      if (entry.secondaryCta !== undefined) {
        expect(entry.secondaryCta, `${trigger}.secondaryCta`).toMatch(/\S/);
      }
    }
  });

  it("optional urgency is non-empty when present", () => {
    for (const trigger of EXPECTED_TRIGGERS) {
      const entry = UPGRADE_COPY[trigger];
      if (entry.urgency !== undefined) {
        expect(entry.urgency, `${trigger}.urgency`).toMatch(/\S/);
      }
    }
  });
});

describe("UPGRADE_COPY — suggestedPlan whitelist", () => {
  it.each(EXPECTED_TRIGGERS)("%s suggestedPlan is a known Stripe tier slug", (trigger) => {
    const plan = UPGRADE_COPY[trigger].suggestedPlan;
    expect(
      ALLOWED_PLANS.has(plan),
      `${trigger}.suggestedPlan "${plan}" is not in the shipped tier whitelist`,
    ).toBe(true);
  });

  it("watchlist_cap_hit maps to an investor plan (not a founder plan)", () => {
    expect(UPGRADE_COPY.watchlist_cap_hit.suggestedPlan).toBe("investor_advisor");
  });

  it("cohort_seat_cap_hit maps to an accelerator plan (not a founder plan)", () => {
    expect(UPGRADE_COPY.cohort_seat_cap_hit.suggestedPlan).toBe("accelerator_growth");
  });

  it("every founder-persona trigger maps to founder_growth (not a cross-persona SKU)", () => {
    const founderTriggers: UpgradeTrigger[] = [
      "feature_gate_hit",
      "trial_day_5",
      "trial_day_6",
      "trial_day_7",
      "credits_low",
      "credits_exhausted",
      "report_cap_hit",
      "post_cancel_winback",
    ];
    for (const trigger of founderTriggers) {
      expect(
        UPGRADE_COPY[trigger].suggestedPlan,
        `${trigger} should upsell founder_growth`,
      ).toBe("founder_growth");
    }
  });
});

describe("UPGRADE_COPY — length caps (modal is 400px wide, 375px mobile)", () => {
  it.each(EXPECTED_TRIGGERS)("%s headline is at most 8 words", (trigger) => {
    const wc = wordsOf(UPGRADE_COPY[trigger].headline).length;
    expect(
      wc,
      `${trigger}.headline has ${wc} words (limit 8): "${UPGRADE_COPY[trigger].headline}"`,
    ).toBeLessThanOrEqual(8);
  });

  it.each(EXPECTED_TRIGGERS)("%s body is at most 30 words", (trigger) => {
    const wc = wordsOf(UPGRADE_COPY[trigger].body).length;
    expect(
      wc,
      `${trigger}.body has ${wc} words (limit 30): "${UPGRADE_COPY[trigger].body}"`,
    ).toBeLessThanOrEqual(30);
  });

  it.each(EXPECTED_TRIGGERS)("%s primaryCta is at most 5 words", (trigger) => {
    const wc = wordsOf(UPGRADE_COPY[trigger].primaryCta).length;
    expect(
      wc,
      `${trigger}.primaryCta has ${wc} words (limit 5): "${UPGRADE_COPY[trigger].primaryCta}"`,
    ).toBeLessThanOrEqual(5);
  });

  it.each(EXPECTED_TRIGGERS)("%s primaryCta does not end with '!' (avoids marketing-shout)", (trigger) => {
    const cta = UPGRADE_COPY[trigger].primaryCta;
    expect(
      cta.endsWith("!"),
      `${trigger}.primaryCta ends with '!': "${cta}"`,
    ).toBe(false);
  });
});

describe("UPGRADE_COPY — editorial guard", () => {
  it("no banned hyperbole leaks into any surface string", () => {
    const joined = EXPECTED_TRIGGERS
      .flatMap((t) => allSurfaceStrings(UPGRADE_COPY[t]))
      .join("  ")
      .toLowerCase();
    for (const term of HYPERBOLE_TERMS) {
      expect(
        joined.includes(term),
        `hyperbole term "${term}" leaked into upgrade copy`,
      ).toBe(false);
    }
  });
});

describe("UPGRADE_COPY — trial-day escalation", () => {
  it("trial_day_5 has no urgency (informative, not last-chance)", () => {
    expect(UPGRADE_COPY.trial_day_5.urgency).toBeUndefined();
  });

  it("trial_day_6 carries an urgency string (approaching charge)", () => {
    expect(UPGRADE_COPY.trial_day_6.urgency).toBeDefined();
    expect(UPGRADE_COPY.trial_day_6.urgency!).toMatch(/\S/);
  });

  it("trial_day_7 carries an urgency string (last day before charge)", () => {
    expect(UPGRADE_COPY.trial_day_7.urgency).toBeDefined();
    expect(UPGRADE_COPY.trial_day_7.urgency!).toMatch(/\S/);
  });

  it("trial_day_7 headline signals the trial ends today", () => {
    // Copy tweaks are fine as long as the "today" signal survives — a
    // founder MUST know charge is imminent so downgrade / cancel lands
    // on the right side of billing.
    expect(UPGRADE_COPY.trial_day_7.headline.toLowerCase()).toMatch(/today|ends|last/);
  });
});

describe("UPGRADE_COPY — trigger-specific contracts", () => {
  it("post_cancel_winback CTA references the coupon code the pricing page applies", () => {
    // The /pricing?coupon=COMEBACK30 wire depends on this literal — a
    // Stripe coupon rename WITHOUT a copy update ships a dead button.
    expect(UPGRADE_COPY.post_cancel_winback.primaryCta).toMatch(/COMEBACK30/);
  });

  it("credits_exhausted body warns that reports pause (user impact must be explicit)", () => {
    const body = UPGRADE_COPY.credits_exhausted.body.toLowerCase();
    expect(body).toMatch(/pause|paused|stop|blocked|refresh/);
  });

  it("feature_gate_hit body mentions the trial (no-charge-until-day-7 promise)", () => {
    const body = UPGRADE_COPY.feature_gate_hit.body.toLowerCase();
    expect(body).toMatch(/trial|day 7/);
  });
});
