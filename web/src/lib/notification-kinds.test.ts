// Colocated vitest for the shared notification kind registry (T0245).
// Pins: the six Money Radar kinds are registered, MONEY_KINDS ⊆ the array,
// every kind has a label, and the copy the feed + bell render for radar
// payloads reads as a founder would expect.

import { describe, expect, it } from "vitest";
import {
  KIND_LABELS,
  MONEY_KINDS,
  NOTIFICATION_KINDS,
  RADAR_SETUP_NUDGE_HREF,
  RADAR_SETUP_NUDGE_TITLE,
  daysLeftPhrase,
  describeNotification,
  isNotificationKind,
  notificationAction,
  type FounderNotificationRow,
} from "./notification-kinds";

// T0245's six + the S11-A activation nudge (all under the "Money" chip).
const RADAR_KINDS = ["grant_deadline", "program_intake", "event_match", "weekly_next_step", "new_matches", "analysis_refresh", "radar_setup_nudge"] as const;

function row(kind: string, payload: Record<string, unknown> = {}): FounderNotificationRow {
  return { id: 1, project_id: null, kind, payload, read_at: null, created_at: "2026-09-13T05:00:00Z" };
}

describe("registry", () => {
  it("registers the Money Radar kinds (six + the setup nudge) alongside the Wave 27C six, all labelled, no duplicates", () => {
    for (const k of RADAR_KINDS) expect(NOTIFICATION_KINDS).toContain(k);
    for (const k of ["tbr_view", "tbr_qa_asked", "tbr_lead", "report_shared", "analysis_done", "svi_trend_alert"]) {
      expect(NOTIFICATION_KINDS).toContain(k);
    }
    expect(new Set(NOTIFICATION_KINDS).size).toBe(NOTIFICATION_KINDS.length);
    for (const k of NOTIFICATION_KINDS) expect(KIND_LABELS[k]).toBeTruthy();
    expect(MONEY_KINDS).toEqual(RADAR_KINDS);
    for (const k of MONEY_KINDS) expect(isNotificationKind(k)).toBe(true);
    expect(isNotificationKind("bogus")).toBe(false);
  });
});

describe("describeNotification / notificationAction — Money Radar payloads (D-3 titles, T0248)", () => {
  it("grant_deadline reads the tier: T-30 / T-14 (with A$ when known) / T-3 (weekday)", () => {
    const r = row("grant_deadline", { event: "deadline_t14", name: "MVP Ventures", closes_at: "2026-09-27", days_left: 14, url: "https://x.gov.au" });
    expect(describeNotification(r)).toBe("14 days left: MVP Ventures");
    expect(describeNotification(row("grant_deadline", { event: "deadline_t14", name: "MVP Ventures", amount_max_aud: 75000 }))).toBe("14 days left: MVP Ventures (A$75,000)");
    expect(describeNotification(row("grant_deadline", { event: "deadline_t30", name: "MVP Ventures", days_left: 28 }))).toBe(
      "MVP Ventures closes in 30 days — start your application",
    );
    expect(describeNotification(row("grant_deadline", { event: "deadline_t3", name: "MVP Ventures", closes_at: "2026-09-11", days_left: 3 }))).toBe(
      "Last call: MVP Ventures closes Friday",
    );
    expect(describeNotification(row("grant_deadline", { event: "deadline_t3", name: "MVP Ventures", days_left: 0 }))).toBe("Last call: MVP Ventures closes today");
    expect(notificationAction(r)).toEqual({ href: "https://x.gov.au", label: "Open grant" });
    // Unknown event → the generic line, never blank.
    expect(describeNotification(row("grant_deadline", { name: "MVP Ventures", closes_at: "2026-09-27", days_left: 14 }))).toBe(
      "MVP Ventures closes in 14 days (2026-09-27)",
    );
  });

  it("status_changed / new_round_opened wording", () => {
    expect(describeNotification(row("grant_deadline", { event: "status_changed", name: "Ignite", status: "paused" }))).toBe("Ignite paused — see your alternatives");
    expect(describeNotification(row("grant_deadline", { event: "status_changed", name: "Ignite", status: "paused", alternatives: ["a", "b"] }))).toBe(
      "Ignite paused — here are 2 alternatives",
    );
    expect(describeNotification(row("program_intake", { event: "new_round_opened", name: "Plus Eight" }))).toBe("Plus Eight just opened a new round");
  });

  it("program_intake / event_match / new_matches copy", () => {
    expect(describeNotification(row("program_intake", { event: "deadline_t3", name: "Startmate", days_left: 1 }))).toBe("Last call: Startmate closes tomorrow");
    expect(describeNotification(row("event_match", { name: "West Tech Fest", closes_at: "2026-12-01" }))).toBe(
      "West Tech Fest (2026-12-01) — founders at your stage go to this",
    );
    expect(describeNotification(row("event_match", { name: "West Tech Fest", closes_at: "2026-12-01", city: "Perth" }))).toBe(
      "West Tech Fest (Perth, 2026-12-01) — founders at your stage go to this",
    );
    expect(describeNotification(row("new_matches", { count: 3, grant_count: 3, program_count: 0, startup: "Acme" }))).toBe("3 new grants match Acme this week");
    expect(describeNotification(row("new_matches", { count: 3, grant_count: 2, program_count: 1, startup: "Acme" }))).toBe("3 new matches for Acme this week");
    expect(describeNotification(row("new_matches", { count: 1 }))).toBe("1 new matches for your startup this week");
    expect(notificationAction(row("new_matches", { report_id: "r1" }))).toEqual({ href: "/funding/report/r1", label: "See matches" });
    expect(notificationAction(row("event_match", {}))).toEqual({ href: "/funding", label: "See programs" });
  });

  it("weekly_next_step / analysis_refresh use payload title + href with sane defaults", () => {
    expect(describeNotification(row("weekly_next_step", { title: "Apply for MVP Ventures" }))).toBe("Apply for MVP Ventures");
    expect(notificationAction(row("weekly_next_step", { href: "/funding/report/r1" }))).toEqual({ href: "/funding/report/r1", label: "Do it now" });
    expect(notificationAction(row("analysis_refresh"))).toEqual({ href: "/workspace/business-report", label: "Read the update" });
    expect(describeNotification(row("analysis_refresh", { changes: 2 }))).toBe("Your funding plan was refreshed — 2 changes");
    expect(describeNotification(row("analysis_refresh"))).toBe("Your funding plan was refreshed");
    expect(describeNotification(row("weekly_next_step"))).toBe("Your next money step this week");
  });

  it("T0273: weekly_next_step evaluator radar payloads {movers, deadlines, startups} derive a summary and open the workspace", () => {
    const moved = { movers: [{ name: "Acme" }, { name: "Beta" }], deadlines: [], startups: 5, href: "/workspace/evaluations" };
    expect(describeNotification(row("weekly_next_step", moved))).toBe("2 of 5 startups you evaluate moved this week");
    expect(notificationAction(row("weekly_next_step", moved))).toEqual({ href: "/workspace/evaluations", label: "Open Progress Radar" });
    const still = { movers: [], deadlines: [{ name: "MVP Ventures" }], startups: 1 };
    expect(describeNotification(row("weekly_next_step", still))).toBe("No movement this week across 1 startup — 1 deadline ahead");
    // An explicit title always wins (the cron writes one).
    expect(describeNotification(row("weekly_next_step", { ...moved, title: "Your weekly progress radar — 2 of 5 startups moved" }))).toBe(
      "Your weekly progress radar — 2 of 5 startups moved",
    );
  });

  it("legacy kinds keep their Wave 27C words; unknown kinds fall back to the kind", () => {
    expect(describeNotification(row("tbr_lead", { name: "Jo", firm: "Fund", interest: "warm" }))).toBe("Jo, Fund — Warm");
    expect(describeNotification(row("report_shared"))).toBe("Report share link minted");
    expect(describeNotification(row("mystery"))).toBe("mystery");
    expect(notificationAction(row("mystery"))).toBeNull();
  });

  it("daysLeftPhrase", () => {
    expect(daysLeftPhrase(null)).toBe("");
    expect(daysLeftPhrase(0)).toBe("today");
    expect(daysLeftPhrase(1)).toBe("tomorrow");
    expect(daysLeftPhrase(30)).toBe("in 30 days");
  });
});

// S11-A — the Founder Radar activation nudge the weekly sweep writes for a
// subscriber with no grant profile / intake. Title is the approved D-3-style
// line; the action lands on the intake, open and focused.
describe("radar_setup_nudge (S11-A activation nudge)", () => {
  it("title is the approved line, with live counts appended when the sweep supplied them", () => {
    expect(RADAR_SETUP_NUDGE_TITLE).toBe("Your Founder Radar is on — tell us 3 things to start matching");
    expect(describeNotification(row("radar_setup_nudge"))).toBe(RADAR_SETUP_NUDGE_TITLE);
    expect(describeNotification(row("radar_setup_nudge", { open_grants: 14, open_programs: 6, touch: 1 }))).toBe(
      "Your Founder Radar is on — tell us 3 things to start matching — 14 grants and 6 programs are open right now",
    );
    // Never "0 grants and 0 programs".
    expect(describeNotification(row("radar_setup_nudge", { open_grants: 0, open_programs: 0 }))).toBe(RADAR_SETUP_NUDGE_TITLE);
    expect(KIND_LABELS.radar_setup_nudge).toBe("Founder Radar setup");
  });

  it("action opens /workspace/funding?from=radar_setup", () => {
    expect(RADAR_SETUP_NUDGE_HREF).toBe("/workspace/funding?from=radar_setup");
    expect(notificationAction(row("radar_setup_nudge", { touch: 2 }))).toEqual({ href: "/workspace/funding?from=radar_setup", label: "Set up matching" });
    expect(isNotificationKind("radar_setup_nudge")).toBe(true);
    expect(MONEY_KINDS).toContain("radar_setup_nudge");
  });
});

// T0246 — svi_trend_alert finally has a writer (svi-snapshot cron via
// lib/svi-trend-alert.ts). The summary reads its payload; a legacy row with
// no delta keeps the generic label.
describe("describeNotification — svi_trend_alert (T0246 writer payload)", () => {
  it("reads delta + total, signed", () => {
    expect(describeNotification(row("svi_trend_alert", { delta: 6, svi_total: 66, snapshot_date: "2026-09-13", direction: "up" }))).toBe(
      "Your SVI moved +6 points this week (now 66)",
    );
    expect(describeNotification(row("svi_trend_alert", { delta: -5.5 }))).toBe("Your SVI moved -5.5 points this week");
    expect(describeNotification(row("svi_trend_alert", {}))).toBe("SVI trend alert");
    expect(notificationAction(row("svi_trend_alert", { delta: 6 }))).toEqual({ href: "/workspace/svi-trend", label: "Open SVI trend" });
  });
});
