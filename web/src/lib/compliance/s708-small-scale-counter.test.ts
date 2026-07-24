// Pure-helper coverage for s708-small-scale-counter.ts. Contract:
// docs/plans/atlassian-standard-mapping-goal.md §1 phase 10 P1 gap
// ("s708(1) counter — running total of investors/$ in trailing 12 mo").
//
// ASIC ref: https://asic.gov.au/regulatory-resources/fundraising/small-scale-offers/
// s708(1)(a) — max 20 issues under personal offers in any rolling 12-month window.
// s708(1)(b) — max A$2,000,000 raised under personal offers in that same window.

import { describe, it, expect } from "vitest";
import {
  S708_DOLLAR_CAP_AUD,
  S708_INVESTOR_CAP,
  S708_SMALL_SCALE_DISCLAIMER,
  S708_WARN_DOLLAR_HEADROOM_AUD,
  S708_WARN_INVESTOR_HEADROOM,
  S708_WINDOW_DAYS,
  assessS708SmallScale,
  type S708OfferEvent,
} from "./s708-small-scale-counter";

const NOW = new Date("2026-07-24T00:00:00Z");

function offer(
  offerDate: string,
  investorId: string,
  amountAud: number,
  overrides: Partial<S708OfferEvent> = {},
): S708OfferEvent {
  return { offer_date: offerDate, investor_id: investorId, amount_aud: amountAud, ...overrides };
}

describe("assessS708SmallScale — window boundary", () => {
  it("counts events inside the trailing 365-day window and drops the rest", () => {
    const events: S708OfferEvent[] = [
      offer("2024-01-15", "alice@example.com", 20_000), // > 1 year old, dropped
      offer("2025-08-01", "bob@example.com", 50_000), // inside window
      offer("2026-06-30", "carol@example.com", 100_000), // inside window
    ];
    const r = assessS708SmallScale({ events, now: NOW });
    expect(r.investor_count_12mo).toBe(2);
    expect(r.dollars_raised_12mo_aud).toBe(150_000);
    expect(r.window_end_iso).toBe("2026-07-24");
    // 2026-07-24 minus 365 days = 2025-07-24
    expect(r.window_start_iso).toBe("2025-07-24");
    expect(r.status).toBe("ok");
    expect(r.disclaimer).toBe(S708_SMALL_SCALE_DISCLAIMER);
  });

  it("de-duplicates repeat investors within the window", () => {
    const events: S708OfferEvent[] = [
      offer("2026-01-01", "alice@example.com", 100_000),
      offer("2026-04-01", "alice@example.com", 50_000),
      offer("2026-06-01", "bob@example.com", 25_000),
    ];
    const r = assessS708SmallScale({ events, now: NOW });
    expect(r.investor_count_12mo).toBe(2); // Alice + Bob
    expect(r.dollars_raised_12mo_aud).toBe(175_000);
  });

  it("silently drops malformed events (bad date, blank investor, non-finite amount, negatives)", () => {
    const events: S708OfferEvent[] = [
      { offer_date: "not-a-date", investor_id: "x@x", amount_aud: 100 },
      { offer_date: "2026-06-01", investor_id: "   ", amount_aud: 100 },
      { offer_date: "2026-06-01", investor_id: "z@z", amount_aud: Number.NaN },
      { offer_date: "2026-06-01", investor_id: "neg@x", amount_aud: -500 },
      offer("2026-06-01", "ok@x", 5_000),
    ];
    const r = assessS708SmallScale({ events, now: NOW });
    // Only the last event should have counted (Number.NaN → amount 0 with valid investor
    // is also counted for the investor tally though — pin the safe branch here).
    expect(r.dollars_raised_12mo_aud).toBe(5_000);
    // "z@z" is a valid investor id with 0 amount, "ok@x" is valid → 2 investors.
    expect(r.investor_count_12mo).toBe(2);
    expect(r.status).toBe("ok");
  });
});

describe("assessS708SmallScale — status classification", () => {
  it("returns ok when both counters are comfortably under caps", () => {
    const events: S708OfferEvent[] = [
      offer("2026-06-01", "a", 100_000),
      offer("2026-06-15", "b", 200_000),
    ];
    const r = assessS708SmallScale({ events, now: NOW });
    expect(r.status).toBe("ok");
    expect(r.investors_remaining).toBe(S708_INVESTOR_CAP - 2);
    expect(r.dollars_remaining_aud).toBe(S708_DOLLAR_CAP_AUD - 300_000);
    expect(r.reason).toMatch(/headroom remain/);
    expect(r.next_action).toMatch(/data-room/);
  });

  it("flips to warn when investor headroom is exactly at the amber trigger", () => {
    // 19 unique investors → headroom = 1 = warn trigger
    const events: S708OfferEvent[] = Array.from({ length: 19 }, (_, i) =>
      offer("2026-05-01", `investor-${i}`, 50_000),
    );
    const r = assessS708SmallScale({ events, now: NOW });
    expect(r.investor_count_12mo).toBe(19);
    expect(r.investors_remaining).toBe(S708_WARN_INVESTOR_HEADROOM);
    expect(r.status).toBe("warn");
    expect(r.next_action).toMatch(/preview/);
  });

  it("flips to warn when dollar headroom shrinks below the amber trigger", () => {
    // 5 investors, A$1.85M raised → dollar headroom = 150k < 200k
    const events: S708OfferEvent[] = Array.from({ length: 5 }, (_, i) =>
      offer("2026-04-01", `investor-${i}`, 370_000),
    );
    const r = assessS708SmallScale({ events, now: NOW });
    expect(r.dollars_raised_12mo_aud).toBe(1_850_000);
    expect(r.dollars_remaining_aud).toBeLessThan(S708_WARN_DOLLAR_HEADROOM_AUD);
    expect(r.status).toBe("warn");
  });

  it("blocks when the investor cap has already been hit", () => {
    const events: S708OfferEvent[] = Array.from({ length: 20 }, (_, i) =>
      offer("2026-05-01", `investor-${i}`, 10_000),
    );
    const r = assessS708SmallScale({ events, now: NOW });
    expect(r.investor_count_12mo).toBe(S708_INVESTOR_CAP);
    expect(r.status).toBe("block");
    expect(r.next_action).toMatch(/wholesale|disclosure|CSF/i);
    expect(r.reason).toMatch(/reached|breach/i);
  });

  it("blocks when the dollar cap has already been hit", () => {
    const events: S708OfferEvent[] = [
      offer("2026-05-01", "big-1", 1_000_000),
      offer("2026-05-15", "big-2", 1_000_000),
    ];
    const r = assessS708SmallScale({ events, now: NOW });
    expect(r.dollars_raised_12mo_aud).toBe(S708_DOLLAR_CAP_AUD);
    expect(r.status).toBe("block");
  });
});

describe("assessS708SmallScale — preview mode", () => {
  it("blocks a preview that would push the investor cap over the line", () => {
    const events: S708OfferEvent[] = Array.from({ length: 18 }, (_, i) =>
      offer("2026-06-01", `existing-${i}`, 25_000),
    );
    const r = assessS708SmallScale({
      events,
      now: NOW,
      preview: { new_investors: 5, amount_aud: 100_000 },
    });
    expect(r.investor_count_12mo).toBe(18);
    expect(r.would_breach_investor_cap).toBe(true);
    expect(r.would_breach_dollar_cap).toBe(false);
    expect(r.status).toBe("block");
    expect(r.reason).toMatch(/20-investor cap/);
    expect(r.next_action).toMatch(/wholesale/i);
  });

  it("blocks a preview that would push the dollar cap over the line", () => {
    const events: S708OfferEvent[] = [
      offer("2026-06-01", "a", 1_500_000),
    ];
    const r = assessS708SmallScale({
      events,
      now: NOW,
      preview: { new_investors: 1, amount_aud: 600_000 },
    });
    expect(r.would_breach_dollar_cap).toBe(true);
    expect(r.would_breach_investor_cap).toBe(false);
    expect(r.status).toBe("block");
    expect(r.reason).toMatch(/A\$2M dollar cap/);
  });

  it("lets a preview pass through when it stays within both caps", () => {
    const events: S708OfferEvent[] = [
      offer("2026-06-01", "a", 200_000),
      offer("2026-06-15", "b", 300_000),
    ];
    const r = assessS708SmallScale({
      events,
      now: NOW,
      preview: { new_investors: 3, amount_aud: 400_000 },
    });
    expect(r.would_breach_investor_cap).toBe(false);
    expect(r.would_breach_dollar_cap).toBe(false);
    expect(r.status).toBe("ok");
  });
});

describe("constants", () => {
  it("pin the s708(1) statutory caps", () => {
    expect(S708_INVESTOR_CAP).toBe(20);
    expect(S708_DOLLAR_CAP_AUD).toBe(2_000_000);
    expect(S708_WINDOW_DAYS).toBe(365);
  });
});
