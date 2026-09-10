// Colocated vitest for lib/funding/digest-money.ts (T0246).
// Pins: teaser shape when the founder lacks money_radar; soonest dated
// open/upcoming deadline wins (ties → score); rolling / past / closed rows
// never become the deadline; new_matches counts first_seen_at inside the
// period; the action sentence follows the T-3 / T-14 / T-30 ladder; the
// header copy is the approved D-3 string.

import { describe, expect, it } from "vitest";
import { buildDigestMoney, moneyDigestHeader, suggestMoneyAction, MONEY_DIGEST_TEASER, type DigestMoneyMatch } from "./digest-money";

const NOW = new Date("2026-09-14T09:00:00.000Z");
const PERIOD_START = new Date("2026-09-07T09:00:00.000Z");

function row(over: Partial<DigestMoneyMatch> & { ref_id: string }): DigestMoneyMatch {
  return {
    ref_kind: "grant",
    name: over.ref_id,
    score: 50,
    status_at_match: "open",
    closes_at: null,
    first_seen_at: "2026-08-01T00:00:00Z",
    ...over,
  };
}

describe("buildDigestMoney", () => {
  it("teaser when radar=false: no deadline, no action, /pricing link", () => {
    const m = buildDigestMoney([row({ ref_id: "a", closes_at: "2026-09-20" })], false, { now: NOW, siteBase: "https://blockid.au" });
    expect(m).toEqual({ radar: false, new_matches: 0, href: "https://blockid.au/pricing?from=digest_money" });
    expect(MONEY_DIGEST_TEASER).toBe("Founder Radar — see your grant deadlines");
  });

  it("picks the soonest dated open/upcoming row on or after today; ties go to the higher score", () => {
    const rows = [
      row({ ref_id: "past", closes_at: "2026-09-10" }),
      row({ ref_id: "closed", closes_at: "2026-09-15", status_at_match: "closed" }),
      row({ ref_id: "rolling", closes_at: null }),
      row({ ref_id: "b", name: "B", closes_at: "2026-09-24", score: 40 }),
      row({ ref_id: "a", name: "A", closes_at: "2026-09-24", score: 90, ref_kind: "program", official_url: "https://a" }),
      row({ ref_id: "later", closes_at: "2026-12-01" }),
    ];
    const m = buildDigestMoney(rows, true, { now: NOW, periodStart: PERIOD_START, siteBase: "https://blockid.au" });
    expect(m.radar).toBe(true);
    expect(m.next_deadline).toEqual({ name: "A", closes_at: "2026-09-24", days: 10, ref_kind: "program", ref_id: "a", official_url: "https://a" });
    expect(m.href).toBe("https://blockid.au/workspace/funding");
  });

  it("counts new matches by first_seen_at inside the period and treats today as day 0", () => {
    const rows = [
      row({ ref_id: "new1", first_seen_at: "2026-09-13T05:00:00Z", closes_at: "2026-09-14" }),
      row({ ref_id: "new2", first_seen_at: "2026-09-08T05:00:00Z" }),
      row({ ref_id: "old", first_seen_at: "2026-09-01T05:00:00Z" }),
      row({ ref_id: "bad", first_seen_at: "not a date" }),
    ];
    const m = buildDigestMoney(rows, true, { now: NOW, periodStart: PERIOD_START });
    expect(m.new_matches).toBe(2);
    expect(m.next_deadline?.days).toBe(0);
    expect(m.suggested_action).toBe("Submit new1 — it closes today");
  });

  it("no rows → no deadline, zero matches, a profile nudge", () => {
    const m = buildDigestMoney([], true, { now: NOW });
    expect(m.next_deadline).toBeUndefined();
    expect(m.new_matches).toBe(0);
    expect(m.suggested_action).toMatch(/No deadline in the next 30 days/);
  });
});

describe("suggestMoneyAction ladder", () => {
  const dl = (days: number) => ({ name: "MVP Ventures", closes_at: "2026-10-01", days, ref_kind: "grant" as const, ref_id: "x" });
  it("T-3 submit · T-14 draft · T-30 checklist · beyond calendar · none review", () => {
    expect(suggestMoneyAction(dl(1), 0)).toBe("Submit MVP Ventures — it closes in 1 day");
    expect(suggestMoneyAction(dl(3), 0)).toMatch(/^Submit MVP Ventures/);
    expect(suggestMoneyAction(dl(10), 0)).toMatch(/^Finish your MVP Ventures draft/);
    expect(suggestMoneyAction(dl(25), 0)).toBe("Work through the MVP Ventures eligibility checklist");
    expect(suggestMoneyAction(dl(60), 0)).toMatch(/^Book the MVP Ventures deadline \(2026-10-01\)/);
    expect(suggestMoneyAction(undefined, 3)).toBe("Review your 3 new matches and pick one to apply for");
    expect(suggestMoneyAction(undefined, 1)).toBe("Review your 1 new match and pick one to apply for");
  });
});

describe("moneyDigestHeader", () => {
  it("renders the approved D-3 header", () => {
    const h = moneyDigestHeader({
      radar: true,
      new_matches: 3,
      next_deadline: { name: "MVP Ventures", closes_at: "2026-09-26", days: 12, ref_kind: "grant", ref_id: "x" },
      suggested_action: "Finish your MVP Ventures draft",
      href: "https://blockid.au/workspace/funding",
    });
    expect(h).toBe("Money this week: 3 new matches · next deadline MVP Ventures in 12 days · this week's step: Finish your MVP Ventures draft");
  });

  it("singular / today / no-deadline variants", () => {
    expect(moneyDigestHeader({ radar: true, new_matches: 1, next_deadline: { name: "X", closes_at: "d", days: 0, ref_kind: "grant", ref_id: "x" }, href: "" })).toBe(
      "Money this week: 1 new match · next deadline X today",
    );
    expect(moneyDigestHeader({ radar: true, new_matches: 0, href: "", suggested_action: "Do it" })).toBe("Money this week: 0 new matches · this week's step: Do it");
  });
});
