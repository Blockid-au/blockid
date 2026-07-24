// Pure-adapter coverage for s708-register-adapter.ts. Contract:
// docs/plans/atlassian-standard-mapping-goal.md §1 phase 10 P1 gap
// ("s708(1) counter … deferred to P10-s708counter-wire").
//
// The adapter is a normaliser between arbitrary share-register / equity-events
// row shapes and the S708OfferEvent[] shape assessS708SmallScale consumes.
// These tests pin the classification + fallback rules so downstream loaders
// can rely on a stable contract regardless of source (equity_events table,
// Form 484 CSV, dataroom ROM upload).

import { describe, it, expect } from "vitest";
import { adaptShareRegisterRows, type ShareRegisterRow } from "./s708-register-adapter";
import { assessS708SmallScale } from "./s708-small-scale-counter";

const NOW = new Date("2026-07-24T00:00:00Z");

describe("adaptShareRegisterRows — event_type classification", () => {
  it("maps issue/primary/grant/allotment to primary offer_type", () => {
    const rows: ShareRegisterRow[] = [
      { event_date: "2026-01-01", event_type: "issue", investor_email: "a@x.com", amount_aud: 1 },
      { event_date: "2026-01-02", event_type: "primary", investor_email: "b@x.com", amount_aud: 1 },
      { event_date: "2026-01-03", event_type: "grant", investor_email: "c@x.com", amount_aud: 1 },
      { event_date: "2026-01-04", event_type: "allotment", investor_email: "d@x.com", amount_aud: 1 },
    ];
    const { events, skipped } = adaptShareRegisterRows(rows);
    expect(skipped).toEqual([]);
    expect(events).toHaveLength(4);
    for (const e of events) expect(e.offer_type).toBe("primary");
  });

  it("maps transfer/secondary/on_sale to secondary_on_sale offer_type", () => {
    const rows: ShareRegisterRow[] = [
      { event_date: "2026-01-01", event_type: "transfer", investor_email: "a@x.com", amount_aud: 1 },
      { event_date: "2026-01-02", event_type: "secondary", investor_email: "b@x.com", amount_aud: 1 },
      { event_date: "2026-01-03", event_type: "on_sale", investor_email: "c@x.com", amount_aud: 1 },
    ];
    const { events, skipped } = adaptShareRegisterRows(rows);
    expect(skipped).toEqual([]);
    expect(events).toHaveLength(3);
    for (const e of events) expect(e.offer_type).toBe("secondary_on_sale");
  });

  it("blank event_type defaults to primary; unknown event_type is skipped", () => {
    const rows: ShareRegisterRow[] = [
      { event_date: "2026-01-01", event_type: "", investor_email: "a@x.com", amount_aud: 1 },
      { event_date: "2026-01-02", event_type: "dividend", investor_email: "b@x.com", amount_aud: 1 },
    ];
    const { events, skipped } = adaptShareRegisterRows(rows);
    expect(events).toHaveLength(1);
    expect(events[0].offer_type).toBe("primary");
    expect(skipped).toEqual([{ index: 1, reason: "unknown_event_type" }]);
  });
});

describe("adaptShareRegisterRows — exemption filter", () => {
  it("drops rows tagged with non-s708(1) exemptions", () => {
    const rows: ShareRegisterRow[] = [
      { event_date: "2026-01-01", event_type: "issue", exemption: "s708(8)", investor_email: "a@x.com", amount_aud: 1 },
      { event_date: "2026-01-02", event_type: "issue", exemption: "csf", investor_email: "b@x.com", amount_aud: 1 },
      { event_date: "2026-01-03", event_type: "issue", exemption: "prospectus", investor_email: "c@x.com", amount_aud: 1 },
      { event_date: "2026-01-04", event_type: "issue", exemption: "s708(1)", investor_email: "d@x.com", amount_aud: 1 },
    ];
    const { events, skipped } = adaptShareRegisterRows(rows);
    expect(events).toHaveLength(1);
    expect(events[0].investor_id).toBe("d@x.com");
    expect(skipped.map(s => s.reason)).toEqual([
      "non_s708_exemption",
      "non_s708_exemption",
      "non_s708_exemption",
    ]);
  });

  it("blank/missing exemption is treated as s708(1) personal offer", () => {
    const rows: ShareRegisterRow[] = [
      { event_date: "2026-01-01", event_type: "issue", investor_email: "a@x.com", amount_aud: 1 },
      { event_date: "2026-01-02", event_type: "issue", exemption: "", investor_email: "b@x.com", amount_aud: 1 },
      { event_date: "2026-01-03", event_type: "issue", exemption: null, investor_email: "c@x.com", amount_aud: 1 },
    ];
    const { events } = adaptShareRegisterRows(rows);
    expect(events).toHaveLength(3);
  });
});

describe("adaptShareRegisterRows — investor_id + amount fallbacks", () => {
  it("prefers investor_id, then email, then normalised name", () => {
    const rows: ShareRegisterRow[] = [
      { event_date: "2026-01-01", event_type: "issue", investor_id: "uuid-1", investor_email: "a@x.com", amount_aud: 1 },
      { event_date: "2026-01-02", event_type: "issue", investor_email: "B@X.com", amount_aud: 1 },
      { event_date: "2026-01-03", event_type: "issue", investor_name: "  Carol Smith  ", amount_aud: 1 },
    ];
    const { events } = adaptShareRegisterRows(rows);
    expect(events.map(e => e.investor_id)).toEqual([
      "uuid-1",
      "b@x.com",
      "carol smith",
    ]);
  });

  it("skips rows with no usable investor id", () => {
    const rows: ShareRegisterRow[] = [
      { event_date: "2026-01-01", event_type: "issue", amount_aud: 1 },
      { event_date: "2026-01-02", event_type: "issue", investor_id: "   ", investor_email: "", amount_aud: 1 },
    ];
    const { events, skipped } = adaptShareRegisterRows(rows);
    expect(events).toEqual([]);
    expect(skipped.map(s => s.reason)).toEqual([
      "missing_investor_id",
      "missing_investor_id",
    ]);
  });

  it("uses shares × price_per_share_aud when amount_aud is missing", () => {
    const rows: ShareRegisterRow[] = [
      { event_date: "2026-01-01", event_type: "issue", investor_email: "a@x.com", shares: 1000, price_per_share_aud: 1.5 },
      { event_date: "2026-01-02", event_type: "issue", investor_email: "b@x.com", consideration_aud: 42 },
    ];
    const { events } = adaptShareRegisterRows(rows);
    expect(events[0].amount_aud).toBe(1500);
    expect(events[1].amount_aud).toBe(42);
  });

  it("skips missing_amount and negative_amount with distinct reasons", () => {
    const rows: ShareRegisterRow[] = [
      { event_date: "2026-01-01", event_type: "issue", investor_email: "a@x.com" },
      { event_date: "2026-01-02", event_type: "issue", investor_email: "b@x.com", amount_aud: -50 },
    ];
    const { events, skipped } = adaptShareRegisterRows(rows);
    expect(events).toEqual([]);
    expect(skipped.map(s => s.reason)).toEqual([
      "missing_amount",
      "negative_amount",
    ]);
  });
});

describe("adaptShareRegisterRows — date normalisation", () => {
  it("accepts YYYY-MM-DD and full ISO timestamps, drops garbage", () => {
    const rows: ShareRegisterRow[] = [
      { event_date: "2026-01-01", event_type: "issue", investor_email: "a@x.com", amount_aud: 1 },
      { event_date: "2026-01-02T10:30:00Z", event_type: "issue", investor_email: "b@x.com", amount_aud: 1 },
      { event_date: "not-a-date", event_type: "issue", investor_email: "c@x.com", amount_aud: 1 },
      { event_type: "issue", investor_email: "d@x.com", amount_aud: 1 },
    ];
    const { events, skipped } = adaptShareRegisterRows(rows);
    expect(events.map(e => e.offer_date)).toEqual([
      "2026-01-01",
      "2026-01-02",
    ]);
    expect(skipped.map(s => s.reason)).toEqual([
      "invalid_date",
      "missing_date",
    ]);
  });
});

describe("adaptShareRegisterRows — end-to-end with assessS708SmallScale", () => {
  it("adapter output feeds the counter to produce a valid classification", () => {
    // 19 investors + a$1.8M in the window — one investor and a$200k headroom left,
    // so the counter should classify as `warn` on BOTH the investor-headroom and
    // dollar-headroom guards.
    const rows: ShareRegisterRow[] = [];
    for (let i = 0; i < 19; i++) {
      rows.push({
        event_date: "2026-03-01",
        event_type: "issue",
        investor_email: `person-${i}@example.com`,
        amount_aud: 1_800_000 / 19,
      });
    }
    // Add a non-s708 wholesale round that must NOT eat into headroom.
    rows.push({
      event_date: "2026-03-02",
      event_type: "issue",
      exemption: "s708(8)",
      investor_email: "wholesale@example.com",
      amount_aud: 5_000_000,
    });

    const { events, skipped } = adaptShareRegisterRows(rows);
    expect(events).toHaveLength(19);
    expect(skipped).toEqual([{ index: 19, reason: "non_s708_exemption" }]);

    const r = assessS708SmallScale({ events, now: NOW });
    expect(r.investor_count_12mo).toBe(19);
    expect(r.dollars_raised_12mo_aud).toBeCloseTo(1_800_000, 0);
    expect(r.investors_remaining).toBe(1);
    expect(r.dollars_remaining_aud).toBeCloseTo(200_000, 0);
    expect(r.status).toBe("warn");
  });
});
