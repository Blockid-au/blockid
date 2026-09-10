// Colocated vitest for the shared notification kind registry (T0245).
// Pins: the six Money Radar kinds are registered, MONEY_KINDS ⊆ the array,
// every kind has a label, and the copy the feed + bell render for radar
// payloads reads as a founder would expect.

import { describe, expect, it } from "vitest";
import {
  KIND_LABELS,
  MONEY_KINDS,
  NOTIFICATION_KINDS,
  daysLeftPhrase,
  describeNotification,
  isNotificationKind,
  notificationAction,
  type FounderNotificationRow,
} from "./notification-kinds";

const RADAR_KINDS = ["grant_deadline", "program_intake", "event_match", "weekly_next_step", "new_matches", "analysis_refresh"] as const;

function row(kind: string, payload: Record<string, unknown> = {}): FounderNotificationRow {
  return { id: 1, project_id: null, kind, payload, read_at: null, created_at: "2026-09-13T05:00:00Z" };
}

describe("registry", () => {
  it("registers the six Money Radar kinds alongside the Wave 27C six, all labelled, no duplicates", () => {
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

describe("describeNotification / notificationAction — Money Radar payloads", () => {
  it("grant_deadline reads the tier + date", () => {
    const r = row("grant_deadline", { event: "deadline_t14", name: "MVP Ventures", closes_at: "2026-09-27", days_left: 14, url: "https://x.gov.au" });
    expect(describeNotification(r)).toBe("MVP Ventures closes in 14 days (2026-09-27)");
    expect(notificationAction(r)).toEqual({ href: "https://x.gov.au", label: "Open grant" });
  });

  it("status_changed / new_round_opened wording", () => {
    expect(describeNotification(row("grant_deadline", { event: "status_changed", name: "Ignite", status: "paused" }))).toBe("Ignite is now paused");
    expect(describeNotification(row("program_intake", { event: "new_round_opened", name: "Plus Eight" }))).toBe("Plus Eight — a new round just opened");
  });

  it("program_intake / event_match / new_matches copy", () => {
    expect(describeNotification(row("program_intake", { event: "deadline_t3", name: "Startmate", days_left: 1 }))).toBe("Startmate applications close tomorrow");
    expect(describeNotification(row("event_match", { name: "West Tech Fest", closes_at: "2026-12-01" }))).toBe("West Tech Fest — 2026-12-01");
    expect(describeNotification(row("new_matches", { count: 3, grant_count: 2, program_count: 1, startup: "Acme" }))).toBe("2 grants and 1 program now match Acme");
    expect(describeNotification(row("new_matches", { count: 1 }))).toBe("1 new match now match your startup");
    expect(notificationAction(row("new_matches", { report_id: "r1" }))).toEqual({ href: "/funding/report/r1", label: "See matches" });
    expect(notificationAction(row("event_match", {}))).toEqual({ href: "/funding", label: "See programs" });
  });

  it("weekly_next_step / analysis_refresh use payload title + href with sane defaults", () => {
    expect(describeNotification(row("weekly_next_step", { title: "Apply for MVP Ventures" }))).toBe("Apply for MVP Ventures");
    expect(notificationAction(row("weekly_next_step", { href: "/funding/report/r1" }))).toEqual({ href: "/funding/report/r1", label: "Do it now" });
    expect(notificationAction(row("analysis_refresh"))).toEqual({ href: "/workspace/business-report", label: "Read the update" });
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
