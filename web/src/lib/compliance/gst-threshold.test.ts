// Pure-helper coverage for gst-threshold.ts. Contract: docs/plans/atlassian-standard-mapping-goal.md
// §1 phase 6 (GST A$75k threshold detector, P0 raise-blocker, spun off as P1i).
//
// ATO rule ref: https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst
// The A$75,000 threshold applies to either current 12mo turnover OR projected
// current+next 11 months. Registration is required within 21 days of realising
// either has been crossed.

import { describe, it, expect } from "vitest";
import {
  GST_THRESHOLD_AUD,
  GST_REGISTRATION_WINDOW_DAYS,
  GST_DISCLAIMER,
  assessGST,
  assessGSTFromMrr,
  deriveMonthlyTurnoverFromDaily,
} from "./gst-threshold";

describe("assessGST — branch matrix", () => {
  it("returns already_registered when the founder flags registered_for_gst", () => {
    const r = assessGST({
      monthly_turnover_last_12_months: new Array(12).fill(20_000),
      registered_for_gst: true,
      abn: "79 659 615 111",
      registration_date: "2022-06-01",
    });
    expect(r.action_required).toBe("already_registered");
    expect(r.urgency).toBe("ok");
    expect(r.reasoning).toMatch(/2022-06-01/);
    expect(r.reasoning).toMatch(/79 659 615 111/);
    expect(r.disclaimer).toBe(GST_DISCLAIMER);
  });

  it("fires urgent_register when actual trailing-12mo turnover is already at or above A$75k", () => {
    const r = assessGST({
      monthly_turnover_last_12_months: new Array(12).fill(7_000), // A$84k
      registered_for_gst: false,
    });
    expect(r.action_required).toBe("urgent_register");
    expect(r.urgency).toBe("critical");
    expect(r.is_above_threshold).toBe(true);
    expect(r.actual_12mo_turnover_aud).toBe(84_000);
    expect(r.will_cross_threshold_within_days).toBe(0);
    expect(r.reasoning).toMatch(/21 days/);
  });

  it("fires register_within_21_days when only the projected 12mo crosses the threshold", () => {
    const r = assessGST({
      monthly_turnover_last_12_months: new Array(12).fill(3_000), // A$36k trailing
      projected_next_12_months: new Array(12).fill(8_000), // A$96k projected
      registered_for_gst: false,
    });
    expect(r.action_required).toBe("register_within_21_days");
    expect(r.urgency).toBe("warning");
    expect(r.projected_12mo_turnover_aud).toBe(96_000);
    // will_cross_threshold_within_days is either a positive integer OR undefined
    // when the rolling model can't pin an exact day — pin the branch, not the
    // specific day-count (which is a heuristic).
    const days = r.will_cross_threshold_within_days;
    expect(days === undefined || days > 0).toBe(true);
  });

  it("returns none when actual + projected are both under threshold", () => {
    const r = assessGST({
      monthly_turnover_last_12_months: new Array(12).fill(1_000), // A$12k
      projected_next_12_months: new Array(12).fill(2_000), // A$24k
      registered_for_gst: false,
    });
    expect(r.action_required).toBe("none");
    expect(r.urgency).toBe("ok");
    expect(r.is_above_threshold).toBe(false);
    expect(r.will_cross_threshold_within_days).toBeUndefined();
  });

  it("tolerates NaN, negative values, and short arrays without throwing", () => {
    const r = assessGST({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      monthly_turnover_last_12_months: [Number.NaN, -100, 1_000, 2_000] as any,
      registered_for_gst: false,
    });
    // Negative values are summed (the module doesn't clamp — it's a raw sum);
    // finite entries: -100 + 1000 + 2000 = 2900.
    expect(r.actual_12mo_turnover_aud).toBe(2_900);
    expect(r.action_required).toBe("none");
  });

  it("uses the last 12 months when a longer series is supplied", () => {
    const series = new Array(24).fill(0).map((_, i) => (i < 12 ? 100_000 : 1_000));
    const r = assessGST({
      monthly_turnover_last_12_months: series,
      registered_for_gst: false,
    });
    // Only the trailing 12 (1_000 * 12 = 12_000) should be summed.
    expect(r.actual_12mo_turnover_aud).toBe(12_000);
    expect(r.action_required).toBe("none");
  });
});

describe("assessGSTFromMrr — Stripe-MRR shortcut", () => {
  it("crosses the threshold when MRR × 12 ≥ A$75k", () => {
    // A$6,300 MRR × 12 = A$75,600 → threshold crossed.
    const r = assessGSTFromMrr(6_300, { registered_for_gst: false });
    expect(r.action_required).toBe("urgent_register");
    expect(r.actual_12mo_turnover_aud).toBe(75_600);
  });

  it("stays under threshold when MRR × 12 < A$75k", () => {
    const r = assessGSTFromMrr(6_000, { registered_for_gst: false }); // A$72k
    expect(r.action_required).toBe("none");
    expect(r.urgency).toBe("ok");
  });

  it("honours registered_for_gst even when MRR is very high", () => {
    const r = assessGSTFromMrr(50_000, {
      registered_for_gst: true,
      abn: "79 659 615 111",
    });
    expect(r.action_required).toBe("already_registered");
    expect(r.reasoning).toMatch(/79 659 615 111/);
  });

  it("clamps invalid MRR inputs to zero rather than propagating NaN", () => {
    const r = assessGSTFromMrr(Number.NaN, { registered_for_gst: false });
    expect(r.actual_12mo_turnover_aud).toBe(0);
    expect(r.action_required).toBe("none");
  });
});

describe("deriveMonthlyTurnoverFromDaily", () => {
  const NOW = new Date("2026-07-15T00:00:00Z");

  it("bucketizes events into 12 trailing monthly totals ending in the anchor month", () => {
    const buckets = deriveMonthlyTurnoverFromDaily(
      [
        // Current month (July 2026) → bucket[11].
        { occurred_at: "2026-07-01T00:00:00Z", amount_aud: 500 },
        { occurred_at: "2026-07-14T12:00:00Z", amount_aud: 250 },
        // Previous month (June 2026) → bucket[10].
        { occurred_at: "2026-06-05T00:00:00Z", amount_aud: 1_000 },
        // 11 months ago (August 2025) → bucket[0].
        { occurred_at: "2025-08-15T00:00:00Z", amount_aud: 40 },
      ],
      NOW,
    );
    expect(buckets).toHaveLength(12);
    expect(buckets[11]).toBe(750);
    expect(buckets[10]).toBe(1_000);
    expect(buckets[0]).toBe(40);
  });

  it("drops events outside the trailing 12-month window", () => {
    const buckets = deriveMonthlyTurnoverFromDaily(
      [
        // Older than the 12-month window.
        { occurred_at: "2025-06-01T00:00:00Z", amount_aud: 9_999 },
        // Future — after `now` — must not backfill any bucket.
        { occurred_at: "2027-01-01T00:00:00Z", amount_aud: 9_999 },
      ],
      NOW,
    );
    expect(buckets.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it("returns 12 zeros for an empty or malformed input", () => {
    expect(deriveMonthlyTurnoverFromDaily([], NOW)).toEqual(new Array(12).fill(0));
    expect(
      deriveMonthlyTurnoverFromDaily(
        [
          { occurred_at: "not-a-date", amount_aud: 100 },
          { occurred_at: "2026-06-01T00:00:00Z", amount_aud: Number.NaN },
        ],
        NOW,
      ),
    ).toEqual(new Array(12).fill(0));
  });

  it("feeds cleanly into assessGST — a Stripe stream over A$75k trips urgent_register", () => {
    // Simulate 12 months of A$7,000 per month → A$84,000 trailing turnover.
    const events = [] as Array<{ occurred_at: string; amount_aud: number }>;
    for (let m = 0; m < 12; m += 1) {
      const d = new Date(NOW);
      d.setUTCMonth(d.getUTCMonth() - m);
      events.push({
        occurred_at: d.toISOString(),
        amount_aud: 7_000,
      });
    }
    const monthly = deriveMonthlyTurnoverFromDaily(events, NOW);
    const r = assessGST({
      monthly_turnover_last_12_months: monthly,
      registered_for_gst: false,
    });
    expect(r.actual_12mo_turnover_aud).toBe(84_000);
    expect(r.action_required).toBe("urgent_register");
  });
});

describe("constants", () => {
  it("pins the A$75k ATO threshold + 21-day window", () => {
    expect(GST_THRESHOLD_AUD).toBe(75_000);
    expect(GST_REGISTRATION_WINDOW_DAYS).toBe(21);
  });
});
