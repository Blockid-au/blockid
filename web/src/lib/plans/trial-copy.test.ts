// P9-trial-copy-lib-test — colocated coverage for the canonical trial +
// billing copy library. This is the single source of truth cited across
// /pricing, signup, dashboard trial banner, founder-pack + SVI report
// PDFs, welcome + trial-ending drip emails, and every marketing
// markdown surface under web/content/**. A silent drift in the trial
// length, warning-hours constant, "no free forever" copy, or price
// formatting arithmetic would leak straight into the founder ship path
// and onto legal-visible surfaces — the tests pin the constants +
// helper contracts so future rewordings cannot silently break either.

import { describe, expect, it } from "vitest";
import {
  TRIAL_COPY,
  TRIAL_DAYS,
  TRIAL_WARNING_HOURS_BEFORE,
  formatAud,
} from "./trial-copy";

describe("TRIAL_DAYS + TRIAL_WARNING_HOURS_BEFORE constants", () => {
  it("pins TRIAL_DAYS at 7 (must match plans.csv trial_days column)", () => {
    expect(TRIAL_DAYS).toBe(7);
  });

  it("pins the pre-charge warning window at 48h (drip email cadence)", () => {
    expect(TRIAL_WARNING_HOURS_BEFORE).toBe(48);
  });

  it("both constants are integers > 0", () => {
    expect(Number.isInteger(TRIAL_DAYS)).toBe(true);
    expect(Number.isInteger(TRIAL_WARNING_HOURS_BEFORE)).toBe(true);
    expect(TRIAL_DAYS).toBeGreaterThan(0);
    expect(TRIAL_WARNING_HOURS_BEFORE).toBeGreaterThan(0);
  });

  it("warning window is < a full trial (so email actually arrives during trial)", () => {
    expect(TRIAL_WARNING_HOURS_BEFORE).toBeLessThan(TRIAL_DAYS * 24);
  });
});

describe("TRIAL_COPY static strings", () => {
  it("headline mentions 7-day + card required (dual anchor)", () => {
    expect(TRIAL_COPY.headline).toBe("7-day free trial — card required");
    expect(TRIAL_COPY.headline).toMatch(/7-day/);
    expect(TRIAL_COPY.headline.toLowerCase()).toMatch(/card required/);
  });

  it("subheadline names the day-8 charge cutover", () => {
    expect(TRIAL_COPY.subheadline).toContain("day 8");
    expect(TRIAL_COPY.subheadline).toContain("7 days");
  });

  it("cta + cta_short both mention 'trial'", () => {
    expect(TRIAL_COPY.cta).toBe("Start 7-day trial");
    expect(TRIAL_COPY.cta_short).toBe("Start trial");
    expect(TRIAL_COPY.cta.toLowerCase()).toContain("trial");
    expect(TRIAL_COPY.cta_short.toLowerCase()).toContain("trial");
  });

  it("fine_print interpolates the warning-hours constant (single source of truth)", () => {
    expect(TRIAL_COPY.fine_print).toContain(
      `${TRIAL_WARNING_HOURS_BEFORE}h before`,
    );
    expect(TRIAL_COPY.fine_print.toLowerCase()).toContain("cancel anytime");
    expect(TRIAL_COPY.fine_print.toLowerCase()).toContain("card required");
  });

  it("card_required_reason names the day-8 charge and reassures no earlier charge", () => {
    expect(TRIAL_COPY.card_required_reason).toContain("day 8");
    expect(TRIAL_COPY.card_required_reason.toUpperCase()).toContain("NOT");
  });

  it("no_free_forever copy explicitly rejects an indefinite free tier", () => {
    expect(TRIAL_COPY.no_free_forever.toLowerCase()).toContain(
      "does not offer",
    );
    expect(TRIAL_COPY.no_free_forever.toLowerCase()).toContain("free tier");
    expect(TRIAL_COPY.no_free_forever).toContain("7-day trial");
  });

  it("legacy_free_grandfathered names the July 2026 cutover and reassures existing users", () => {
    expect(TRIAL_COPY.legacy_free_grandfathered).toContain("July 2026");
    expect(TRIAL_COPY.legacy_free_grandfathered.toLowerCase()).toContain(
      "grandfathered",
    );
    expect(TRIAL_COPY.legacy_free_grandfathered.toLowerCase()).toContain(
      "new signups",
    );
  });

  it("every static string is a non-empty > 10-char line (no accidental empties)", () => {
    const staticKeys = [
      "headline",
      "subheadline",
      "cta",
      "cta_short",
      "fine_print",
      "card_required_reason",
      "no_free_forever",
      "legacy_free_grandfathered",
    ] as const;
    for (const key of staticKeys) {
      const value = TRIAL_COPY[key];
      expect(typeof value).toBe("string");
      expect((value as string).length).toBeGreaterThan(10);
      expect((value as string).trim()).toBe(value);
    }
  });
});

describe("TRIAL_COPY.after_trial", () => {
  it("default interval renders as /mo suffix", () => {
    const line = TRIAL_COPY.after_trial({ planName: "Pro", price: "A$29" });
    expect(line).toBe("After 7 days, you'll pay A$29/mo for Pro. Cancel anytime.");
  });

  it("month interval renders as /mo suffix (explicit)", () => {
    const line = TRIAL_COPY.after_trial({
      planName: "Pro",
      price: "A$29",
      interval: "month",
    });
    expect(line).toContain("A$29/mo");
  });

  it("year interval renders as /year suffix", () => {
    const line = TRIAL_COPY.after_trial({
      planName: "Growth",
      price: "A$290",
      interval: "year",
    });
    expect(line).toBe(
      "After 7 days, you'll pay A$290/year for Growth. Cancel anytime.",
    );
  });

  it("interpolates plan name + price verbatim (no accidental transform)", () => {
    const line = TRIAL_COPY.after_trial({
      planName: "Enterprise Plus",
      price: "A$999.99",
    });
    expect(line).toContain("Enterprise Plus");
    expect(line).toContain("A$999.99");
  });

  it("always references TRIAL_DAYS in the copy (single source of truth for 7)", () => {
    const line = TRIAL_COPY.after_trial({ planName: "Pro", price: "A$29" });
    expect(line).toContain(`${TRIAL_DAYS} days`);
  });
});

describe("TRIAL_COPY.card_disclosure", () => {
  it("interpolates the trial-end date verbatim", () => {
    const line = TRIAL_COPY.card_disclosure("2026-08-15");
    expect(line).toContain("2026-08-15");
  });

  it("cites the warning-hours constant (48h before)", () => {
    const line = TRIAL_COPY.card_disclosure("2026-08-15");
    expect(line).toContain(`${TRIAL_WARNING_HOURS_BEFORE}h before`);
  });

  it("promises no charge until the disclosed date", () => {
    const line = TRIAL_COPY.card_disclosure("2026-08-15");
    expect(line.toLowerCase()).toContain("will not be charged");
  });
});

describe("TRIAL_COPY.banner_headline", () => {
  it("uses TRIAL_DAYS as the default total", () => {
    expect(TRIAL_COPY.banner_headline(3)).toBe(
      `You're on day 3 of ${TRIAL_DAYS} of your free trial.`,
    );
  });

  it("respects an explicit totalDays override (legacy grandfathered users)", () => {
    expect(TRIAL_COPY.banner_headline(2, 14)).toBe(
      "You're on day 2 of 14 of your free trial.",
    );
  });

  it("renders day 1 correctly (first-day boundary)", () => {
    expect(TRIAL_COPY.banner_headline(1)).toContain("day 1 of");
  });

  it("renders the final-day case (day === total)", () => {
    expect(TRIAL_COPY.banner_headline(TRIAL_DAYS)).toContain(
      `day ${TRIAL_DAYS} of ${TRIAL_DAYS}`,
    );
  });
});

describe("TRIAL_COPY.banner_subline", () => {
  it("names the trial-end date and the charge amount", () => {
    const line = TRIAL_COPY.banner_subline("2026-08-15", "A$29");
    expect(line).toContain("2026-08-15");
    expect(line).toContain("A$29");
  });

  it("mentions the cancel escape hatch", () => {
    const line = TRIAL_COPY.banner_subline("2026-08-15", "A$29");
    expect(line.toLowerCase()).toContain("unless you cancel");
  });
});

describe("TRIAL_COPY.email_subject", () => {
  it("interpolates hoursLeft + price + date verbatim (drip email contract)", () => {
    const subject = TRIAL_COPY.email_subject(48, "A$29", "August 15");
    expect(subject).toBe(
      "Your BlockID trial ends in 48 hours — you'll be charged A$29 on August 15",
    );
  });

  it("uses an em dash between clauses (typography anchor)", () => {
    const subject = TRIAL_COPY.email_subject(24, "A$29", "August 15");
    expect(subject).toContain("—");
  });

  it("supports arbitrary hoursLeft values (24, 12, 1)", () => {
    for (const hours of [24, 12, 1]) {
      const subject = TRIAL_COPY.email_subject(hours, "A$29", "August 15");
      expect(subject).toContain(`${hours} hours`);
    }
  });
});

describe("formatAud", () => {
  it("renders whole-dollar amounts without decimals (A$29)", () => {
    expect(formatAud(2900)).toBe("A$29");
    expect(formatAud(100)).toBe("A$1");
    expect(formatAud(0)).toBe("A$0");
    expect(formatAud(29900)).toBe("A$299");
  });

  it("renders fractional cents with exactly 2dp (A$29.50)", () => {
    expect(formatAud(2950)).toBe("A$29.50");
    expect(formatAud(2999)).toBe("A$29.99");
    expect(formatAud(50)).toBe("A$0.50");
    expect(formatAud(1)).toBe("A$0.01");
  });

  it("uses toFixed(2) — a trailing zero is preserved (A$0.50 not A$0.5)", () => {
    expect(formatAud(50)).toBe("A$0.50");
    expect(formatAud(250)).toBe("A$2.50");
  });

  it("negative cents render with a leading minus (refund line)", () => {
    // Negative amounts are unusual but should not throw — refund / credit
    // line items pass negative cents through this helper.
    expect(formatAud(-2900)).toBe("A$-29");
    expect(formatAud(-2950)).toBe("A$-29.50");
  });

  it("always emits the A$ prefix (never $ or AUD)", () => {
    for (const cents of [0, 1, 99, 100, 2900, 100000]) {
      expect(formatAud(cents)).toMatch(/^A\$/);
    }
  });

  it("large amounts render without thousands separators (raw toFixed output)", () => {
    // Pins a semantic contract: this helper is a low-level primitive,
    // not a locale-aware formatter — callers wanting "A$1,000" must add
    // grouping themselves. A silent switch to Intl.NumberFormat would
    // break every downstream string comparison in signup/checkout tests.
    expect(formatAud(100000)).toBe("A$1000");
    expect(formatAud(1234500)).toBe("A$12345");
  });
});

describe("TRIAL_COPY is `as const` (immutable at the type level)", () => {
  it("exposes every documented key (no missing / no accidental extras)", () => {
    // Pin the exported key set so a rename of one field surfaces here
    // (all consumers cited in the module doc rely on these exact names).
    const expected = new Set([
      "headline",
      "subheadline",
      "cta",
      "cta_short",
      "fine_print",
      "card_required_reason",
      "no_free_forever",
      "legacy_free_grandfathered",
      "after_trial",
      "card_disclosure",
      "banner_headline",
      "banner_subline",
      "email_subject",
    ]);
    expect(new Set(Object.keys(TRIAL_COPY))).toEqual(expected);
  });
});
