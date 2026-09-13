// Colocated vitest for lib/investor-drips/follow-up (S26-A) — the pure
// follow-up rules. Pins: business-day arithmetic across a weekend, the
// 2-business-day due time, every veto in `followUpSkipReason` (opt-out,
// already sent, inactive / revoked / expired, no or bad email, never
// viewed, too soon, room / owner missing, NDA unmet at room or link level
// and a stale-version acceptance, unsubscribed) and the happy path, plus
// the greeting helper.

import { describe, expect, it } from "vitest";
import {
  FOLLOW_UP_BUSINESS_DAYS,
  addBusinessDays,
  followUpDueAt,
  FOLLOW_UP_TIME_ZONE,
  isSydneyWeekend,
  sydneyWeekday,
  followUpSkipReason,
  investorFirstName,
  ndaUnmet,
  type FollowUpLinkRow,
  type FollowUpRoomRow,
} from "./follow-up";

const LINK: FollowUpLinkRow = {
  id: "link-1",
  token: "t".repeat(48),
  data_room_id: "room-1",
  account_id: "owner-1",
  investor_name: "Jane Chen",
  investor_email: "jane@bb.vc",
  investor_firm: "Blackbird",
  auto_follow_up: true,
  is_active: true,
  revoked_at: null,
  expires_at: null,
  first_accessed: "2026-09-07T03:00:00Z",
  last_accessed: "2026-09-07T03:00:00Z", // Monday
  nda_required: false,
  nda_signed_at: null,
  nda_signed_version: null,
};
const ROOM: FollowUpRoomRow = { id: "room-1", user_id: "owner-1", project_id: "p-1", name: "Acme", startup_name: "Acme", nda_required: false, nda_version: 1 };
const NOW = new Date("2026-09-10T21:00:00Z"); // Thursday cron

const decide = (over: Partial<FollowUpLinkRow> = {}, room: FollowUpRoomRow | null = ROOM, extra: { alreadySent?: boolean; unsubscribed?: boolean; now?: Date } = {}) =>
  followUpSkipReason({ link: { ...LINK, ...over }, room, alreadySent: extra.alreadySent ?? false, unsubscribed: extra.unsubscribed ?? false, now: extra.now ?? NOW });

describe("addBusinessDays / followUpDueAt", () => {
  it("skips Saturday and Sunday and keeps the time of day", () => {
    // Thursday 10:00 + 2 business days = Monday 10:00
    expect(addBusinessDays(new Date("2026-09-10T10:00:00Z"), 2).toISOString()).toBe("2026-09-14T10:00:00.000Z");
    // Friday + 1 = Monday
    expect(addBusinessDays(new Date("2026-09-11T10:00:00Z"), 1).toISOString()).toBe("2026-09-14T10:00:00.000Z");
    // Saturday + 1 = Monday (the weekend itself never counts)
    expect(addBusinessDays(new Date("2026-09-12T10:00:00Z"), 1).toISOString()).toBe("2026-09-14T10:00:00.000Z");
    // Monday + 2 = Wednesday
    expect(addBusinessDays(new Date("2026-09-07T10:00:00Z"), 2).toISOString()).toBe("2026-09-09T10:00:00.000Z");
    expect(addBusinessDays(new Date("2026-09-07T10:00:00Z"), 0).toISOString()).toBe("2026-09-07T10:00:00.000Z");
  });

  it("due = view + 2 business days", () => {
    expect(FOLLOW_UP_BUSINESS_DAYS).toBe(2);
    expect(followUpDueAt(new Date("2026-09-10T03:00:00Z")).toISOString()).toBe("2026-09-14T03:00:00.000Z");
  });
});

describe("business days run on the Australia/Sydney calendar (S26 review P3-9)", () => {
  it("reads the weekday in Sydney, not UTC — AEST and AEDT alike", () => {
    expect(FOLLOW_UP_TIME_ZONE).toBe("Australia/Sydney");
    // Fri 11 Sep 22:00Z is already Sat 12 Sep 08:00 AEST.
    expect(sydneyWeekday(new Date("2026-09-11T22:00:00Z"))).toBe("Sat");
    expect(isSydneyWeekend(new Date("2026-09-11T22:00:00Z"))).toBe(true);
    // Sun 13 Sep 22:00Z is Mon 14 Sep 08:00 AEST.
    expect(sydneyWeekday(new Date("2026-09-13T22:00:00Z"))).toBe("Mon");
    expect(isSydneyWeekend(new Date("2026-09-13T22:00:00Z"))).toBe(false);
    // December is AEDT (UTC+11): Fri 11 Dec 13:30Z is Sat 12 Dec 00:30 AEDT.
    expect(sydneyWeekday(new Date("2026-12-11T13:30:00Z"))).toBe("Sat");
    expect(sydneyWeekday(new Date("2026-12-11T12:30:00Z"))).toBe("Fri");
  });

  it("a Friday-evening AEST view is due Tuesday evening — never on the weekend", () => {
    // Fri 11 Sep 19:00 AEST = 09:00Z → Sat, Sun skipped → Mon (1) → Tue (2) 19:00 AEST.
    const due = followUpDueAt(new Date("2026-09-11T09:00:00Z"));
    expect(due.toISOString()).toBe("2026-09-15T09:00:00.000Z");
    expect(sydneyWeekday(due)).toBe("Tue");
    expect(isSydneyWeekend(due)).toBe(false);
  });

  it("UTC/AEST boundary: a Saturday-morning AEST view (still Friday in UTC) counts from Monday", () => {
    // Sat 12 Sep 08:00 AEST = Fri 11 Sep 22:00Z. UTC maths would call this a Friday view and
    // land on Wed 16 Sep 08:00 AEST; the Sydney calendar lands on Tue 15 Sep 08:00 AEST.
    const due = followUpDueAt(new Date("2026-09-11T22:00:00Z"));
    expect(due.toISOString()).toBe("2026-09-14T22:00:00.000Z");
    expect(sydneyWeekday(due)).toBe("Tue");
    // Sun 13 Sep 08:00 AEST (Sat 22:00Z) → Mon (1) → Tue (2) 08:00 AEST.
    expect(followUpDueAt(new Date("2026-09-12T22:00:00Z")).toISOString()).toBe("2026-09-14T22:00:00.000Z");
    // AEDT: Sat 12 Dec 00:30 AEDT (Fri 13:30Z) → Tue 15 Dec 00:30 AEDT = Mon 14 Dec 13:30Z.
    expect(followUpDueAt(new Date("2026-12-11T13:30:00Z")).toISOString()).toBe("2026-12-14T13:30:00.000Z");
    // …whereas one hour earlier it is still Friday in Sydney → Tue 15 Dec 23:30 AEDT = Tue 12:30Z.
    expect(followUpDueAt(new Date("2026-12-11T12:30:00Z")).toISOString()).toBe("2026-12-15T12:30:00.000Z");
  });

  it("the 21:00 UTC cron: a Saturday-AEST view is sent on the Wednesday-morning tick, not Thursday", () => {
    const link = { ...LINK, last_accessed: "2026-09-11T22:00:00Z" };
    const at = (iso: string) => followUpSkipReason({ link, room: ROOM, alreadySent: false, unsubscribed: false, now: new Date(iso) });
    expect(at("2026-09-14T21:00:00Z")).toBe("too_soon"); // Tue 07:00 AEST — due 08:00
    expect(at("2026-09-15T21:00:00Z")).toBeNull(); // Wed 07:00 AEST
  });
});

describe("ndaUnmet", () => {
  it("false when neither the room nor the link asks", () => {
    expect(ndaUnmet(LINK, ROOM)).toBe(false);
    expect(ndaUnmet(LINK, null)).toBe(false);
  });
  it("true when required and never signed, or signed on an older version; false on the current version", () => {
    expect(ndaUnmet({ ...LINK, nda_required: true }, ROOM)).toBe(true);
    expect(ndaUnmet(LINK, { ...ROOM, nda_required: true })).toBe(true);
    expect(ndaUnmet({ ...LINK, nda_signed_at: "2026-09-01T00:00:00Z", nda_signed_version: 1 }, { ...ROOM, nda_required: true, nda_version: 2 })).toBe(true);
    expect(ndaUnmet({ ...LINK, nda_signed_at: "2026-09-01T00:00:00Z", nda_signed_version: 2 }, { ...ROOM, nda_required: true, nda_version: 2 })).toBe(false);
    expect(ndaUnmet({ ...LINK, nda_required: true, nda_signed_at: "2026-09-01T00:00:00Z", nda_signed_version: 1 }, null)).toBe(false);
  });
});

describe("followUpSkipReason", () => {
  it("happy path: opted in, active, emailed, viewed ≥ 2 business days ago, NDA not required → null", () => {
    expect(decide()).toBeNull();
  });

  it("vetoes in order: opt-out, already sent, inactive / revoked / expired, no or bad email", () => {
    expect(decide({ auto_follow_up: false })).toBe("opt_out");
    expect(decide({ auto_follow_up: null })).toBe("opt_out");
    expect(decide({}, ROOM, { alreadySent: true })).toBe("already_sent");
    expect(decide({ is_active: false })).toBe("link_inactive");
    expect(decide({ revoked_at: "2026-09-08T00:00:00Z" })).toBe("link_inactive");
    expect(decide({ expires_at: "2026-09-09T00:00:00Z" })).toBe("link_inactive");
    expect(decide({ investor_email: null })).toBe("no_email");
    expect(decide({ investor_email: "not-an-email" })).toBe("no_email");
  });

  it("never viewed / too soon: the clock runs from the LAST view, in business days", () => {
    expect(decide({ last_accessed: null })).toBe("never_viewed");
    expect(decide({ last_accessed: "garbage" })).toBe("never_viewed");
    // viewed Wednesday 09 Sep 03:00 → due Friday 11 Sep 03:00; Thursday cron is too soon
    expect(decide({ last_accessed: "2026-09-09T03:00:00Z" })).toBe("too_soon");
    // viewed Thursday 10 Sep → due Monday 14 Sep; Saturday / Sunday crons are too soon, Monday 21:00 is due
    expect(decide({ last_accessed: "2026-09-10T03:00:00Z" }, ROOM, { now: new Date("2026-09-12T21:00:00Z") })).toBe("too_soon");
    expect(decide({ last_accessed: "2026-09-10T03:00:00Z" }, ROOM, { now: new Date("2026-09-13T21:00:00Z") })).toBe("too_soon");
    expect(decide({ last_accessed: "2026-09-10T03:00:00Z" }, ROOM, { now: new Date("2026-09-14T21:00:00Z") })).toBeNull();
  });

  it("room / owner missing, NDA unmet (room-level, link-level, stale version), unsubscribed", () => {
    expect(decide({}, null)).toBe("no_room");
    expect(decide({}, { ...ROOM, user_id: null })).toBe("no_owner");
    expect(decide({}, { ...ROOM, nda_required: true })).toBe("nda_unmet");
    expect(decide({ nda_required: true })).toBe("nda_unmet");
    expect(decide({ nda_signed_at: "2026-09-08T00:00:00Z", nda_signed_version: 1 }, { ...ROOM, nda_required: true, nda_version: 3 })).toBe("nda_unmet");
    expect(decide({ nda_signed_at: "2026-09-08T00:00:00Z", nda_signed_version: 3 }, { ...ROOM, nda_required: true, nda_version: 3 })).toBeNull();
    expect(decide({}, ROOM, { unsubscribed: true })).toBe("unsubscribed");
  });
});

describe("investorFirstName", () => {
  it("first word of the name, or null", () => {
    expect(investorFirstName("Jane Chen")).toBe("Jane");
    expect(investorFirstName("  Jane ")).toBe("Jane");
    expect(investorFirstName("")).toBeNull();
    expect(investorFirstName(null)).toBeNull();
  });
});
