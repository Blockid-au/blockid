// Founder notification kinds — the ONE list every surface derives from.
//
//   • `NotificationKind` (src/lib/notifications.ts, server writer) is
//     `(typeof NOTIFICATION_KINDS)[number]`, so a kind cannot be written that
//     is not listed here.
//   • `/api/founder-notifications` builds its `KNOWN_KINDS` allow-list from
//     this array (the `?kind=` filter).
//   • `/workspace/notifications` `feed-client.tsx` and the nav
//     `NotificationBell` render titles / summaries / links through
//     `describeNotification()` below, so both show the same words.
//
// No `server-only` import: this file is shared by client components.
// Money Radar titles come from the D-3 messaging pack (lib/funding/copy.ts,
// T0248) so the feed, the bell and the emails say the same words.
//
// Wave 27C shipped the first six kinds. T0245 (Money Radar, plan §4h) adds
// the six `MONEY_KINDS`; `weekly_next_step` and `analysis_refresh` are
// registered here so T0246 (digest money block) and T0273 (evaluator radar)
// can write them without touching this list again.

import { FUNDING_COPY, fill, weekdayOf } from "@/lib/funding/copy";

export const NOTIFICATION_KINDS = [
  // Wave 27C
  "tbr_view",
  "tbr_qa_asked",
  "tbr_lead",
  "report_shared",
  "analysis_done",
  "svi_trend_alert",
  // T0245 Money Radar
  "grant_deadline",
  "program_intake",
  "event_match",
  "weekly_next_step",
  "new_matches",
  "analysis_refresh",
  // S11-A activation nudge: Radar subscriber with no grant profile / intake.
  "radar_setup_nudge",
  // S20-B outbound webhooks: endpoint auto-disabled after 20 consecutive failures.
  "webhook_disabled",
  // S25-A weekly connector resync: a Stripe/Xero token could not be opened
  // or was rejected — the founder must reconnect. One per 30 days per row.
  "connector_reconnect",
  // S26-A investor follow-up: a data-room link was opened for the first
  // time, or a viewer read ≥3 sections / dwelt ≥5 min. One per link per 24 h
  // (lib/dataroom/investor-viewed.ts); optional email on the same throttle.
  "investor_viewed",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/** The "Money" filter chip on the feed. */
export const MONEY_KINDS: readonly NotificationKind[] = [
  "grant_deadline",
  "program_intake",
  "event_match",
  "weekly_next_step",
  "new_matches",
  "analysis_refresh",
  "radar_setup_nudge",
];

/**
 * S11-A — the Founder Radar activation nudge (plan §4i D-2 `no_profile`
 * tile state, D-3 re-engagement voice). Written by the weekly sweep for
 * every subscriber with zero targets; dedupe key `radar_setup:<user>`,
 * 30-day throttle. Fixed copy rather than a FUNDING_COPY template: it is
 * 61 chars (one over the D-3 feed template cap) and carries no tokens.
 */
export const RADAR_SETUP_NUDGE_TITLE = "Your Founder Radar is on — tell us 3 things to start matching";
export const RADAR_SETUP_NUDGE_HREF = "/workspace/funding?from=radar_setup";
export const RADAR_SETUP_NUDGE_ACTION_LABEL = "Set up matching";

export function isNotificationKind(v: unknown): v is NotificationKind {
  return typeof v === "string" && (NOTIFICATION_KINDS as readonly string[]).includes(v);
}

/** Row shape as returned by GET /api/founder-notifications. */
export interface FounderNotificationRow {
  id: number;
  user_id?: string;
  project_id: string | null;
  kind: string;
  payload: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export const KIND_LABELS: Record<NotificationKind, string> = {
  tbr_view: "Report viewed",
  tbr_qa_asked: "Question asked",
  tbr_lead: "New investor lead",
  report_shared: "Report shared",
  analysis_done: "Analysis complete",
  svi_trend_alert: "SVI trend alert",
  grant_deadline: "Grant deadline",
  program_intake: "Program intake",
  event_match: "Event for you",
  weekly_next_step: "This week's money step",
  new_matches: "New matches",
  analysis_refresh: "Analysis refreshed",
  radar_setup_nudge: "Founder Radar setup",
  webhook_disabled: "Webhook disabled",
  connector_reconnect: "Reconnect needed",
  investor_viewed: "Investor viewed your data room",
};

function s(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function n(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const AUD_FMT = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 });
function formatAud(v: number): string {
  return `A$${AUD_FMT.format(Math.round(v))}`;
}

/** "in 14 days" / "today" / "tomorrow" for the deadline copy. */
export function daysLeftPhrase(days: number | null): string {
  if (days === null) return "";
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/**
 * One-line summary for the feed + bell. Money Radar payloads
 * (`radar-sweep.ts`) carry `{ event, name, ref_id, closes_at, days_left,
 * count, grants, programs, startup }`.
 */
export function describeNotification(row: FounderNotificationRow): string {
  const p = row.payload ?? {};
  switch (row.kind) {
    case "tbr_view": {
      const bits = [s(p.country), s(p.device)].filter(Boolean).join(" · ");
      return bits ? `Someone opened your shared report (${bits})` : "Someone opened your shared report";
    }
    case "tbr_qa_asked": {
      const q = s(p.question);
      return q ? `Reader asked: "${q.slice(0, 120)}${q.length > 120 ? "…" : ""}"` : "A reader asked a question";
    }
    case "tbr_lead": {
      const interest = s(p.interest);
      const label = interest === "ready_to_talk" ? "Ready to talk" : interest === "warm" ? "Warm" : "Exploring";
      const who = [s(p.name), s(p.firm)].filter(Boolean).join(", ") || "An investor";
      return `${who} — ${label}`;
    }
    case "report_shared":
      return "Report share link minted";
    case "analysis_done":
      return p.fromCache === true ? "Analysis complete (from cache)" : "Analysis complete";
    case "svi_trend_alert": {
      // T0246 writer payload: { delta, svi_total, snapshot_date, direction }.
      const delta = n(p.delta);
      const total = n(p.svi_total);
      if (delta === null) return "SVI trend alert";
      const sign = delta > 0 ? "+" : "";
      return `Your SVI moved ${sign}${delta} points this week${total !== null ? ` (now ${total})` : ""}`;
    }
    case "grant_deadline":
    case "program_intake":
    case "event_match": {
      // D-3 titles (lib/funding/copy.ts) keyed by the sweep's payload.event.
      const name = s(p.name) ?? "A matched opportunity";
      const event = s(p.event) ?? "";
      const days = n(p.days_left);
      const closes = s(p.closes_at);
      if (event === "status_changed") {
        const status = s(p.status) ?? "closed";
        const alts = Array.isArray(p.alternatives) ? p.alternatives.length : n(p.alternatives_count);
        return alts && alts > 0
          ? fill(FUNDING_COPY.notification.status_changed, { program: name, status, k: alts })
          : fill(FUNDING_COPY.notification.status_changed_noAlt, { program: name, status });
      }
      if (event === "new_round_opened") return fill(FUNDING_COPY.notification.new_round_opened, { program: name });
      if (row.kind === "event_match") {
        const city = s(p.city);
        const date = closes ?? "date to be confirmed";
        return city
          ? fill(FUNDING_COPY.notification.event_match, { event: name, city, date })
          : fill(FUNDING_COPY.notification.event_match_noCity, { event: name, date });
      }
      if (event === "deadline_t30") return fill(FUNDING_COPY.notification.deadline_t30, { program: name });
      if (event === "deadline_t14") {
        const max = n(p.amount_max_aud);
        return max
          ? fill(FUNDING_COPY.notification.deadline_t14, { program: name, max: formatAud(max) })
          : fill(FUNDING_COPY.notification.deadline_t14_noAmount, { program: name });
      }
      if (event === "deadline_t3") {
        const weekday = days !== null && days <= 0 ? "today" : days === 1 ? "tomorrow" : weekdayOf(closes);
        return fill(FUNDING_COPY.notification.deadline_t3, { program: name, weekday });
      }
      const noun = row.kind === "grant_deadline" ? "closes" : "applications close";
      return closes ? `${name} ${noun} ${daysLeftPhrase(days)} (${closes})` : `${name} ${noun} ${daysLeftPhrase(days)}`;
    }
    case "new_matches": {
      const count = n(p.count) ?? 0;
      const startup = s(p.startup) ?? "your startup";
      const g = n(p.grant_count) ?? 0;
      const pr = n(p.program_count) ?? 0;
      // "3 new grants match Acme this week" when every match is a grant;
      // otherwise the mixed line so a program is never called a grant.
      return g === count && g > 0 && pr === 0
        ? fill(FUNDING_COPY.notification.new_match, { n: count, startup })
        : fill(FUNDING_COPY.notification.new_match_mixed, { n: count || g + pr, startup });
    }
    case "weekly_next_step": {
      // T0273 Evaluator Progress Radar writes {title, movers[], deadlines[],
      // startups, moved, new_matches}; the founder digest money block (T0246)
      // writes {title}. Prefer the explicit title, then derive from the shape.
      const title = s(p.title);
      if (title) return title;
      const movers = Array.isArray(p.movers) ? p.movers.length : null;
      const startups = n(p.startups);
      if (movers != null && startups != null) {
        if (movers > 0) return `${movers} of ${startups} startup${startups === 1 ? "" : "s"} you evaluate moved this week`;
        const deadlines = Array.isArray(p.deadlines) ? p.deadlines.length : 0;
        return `No movement this week across ${startups} startup${startups === 1 ? "" : "s"} — ${deadlines} deadline${deadlines === 1 ? "" : "s"} ahead`;
      }
      return FUNDING_COPY.notification.weekly_next_step;
    }
    case "webhook_disabled": {
      // S20-B review: payload.reason distinguishes the three disable paths
      // (lib/webhooks/notify.ts). Missing reason = the original auto-disable.
      const host = s(p.host);
      const reason = s(p.reason) ?? "auto_disabled";
      const target = host ? `Webhook to ${host}` : "A webhook endpoint";
      if (reason === "creator_not_member") {
        return `${target} was disabled — the team member who created it no longer has admin access to this project. Recreate it yourself if you still need it.`;
      }
      if (reason === "secret_unreadable") {
        return `${target} was disabled — its signing secret could not be read. Delete the endpoint and create it again.`;
      }
      const failures = n(p.failures) ?? 20;
      return host
        ? `${target} was disabled after ${failures} consecutive failed deliveries — fix the receiver and re-enable it.`
        : `${target} was disabled after ${failures} consecutive failed deliveries.`;
    }
    case "connector_reconnect": {
      // S25-A: payload { provider: "stripe" | "xero" } from lib/connectors/resync.ts.
      const provider = s(p.provider);
      const name = provider === "xero" ? "Xero" : provider === "stripe" ? "Stripe" : "A revenue connector";
      return `${name} stopped syncing — reconnect it so your valuation and P&L keep updating weekly`;
    }
    case "investor_viewed": {
      // S26-A: payload { investor, trigger: "first_view" | "deep_read",
      // sections, dwell_ms } from lib/dataroom/investor-viewed.ts.
      const who = s(p.investor) ?? "An investor";
      const trigger = s(p.trigger);
      if (trigger === "deep_read") {
        const sections = n(p.sections) ?? 0;
        const mins = Math.round((n(p.dwell_ms) ?? 0) / 60_000);
        const bits: string[] = [];
        if (sections > 0) bits.push(`${sections} section${sections === 1 ? "" : "s"}`);
        if (mins > 0) bits.push(`${mins} min`);
        return bits.length ? `${who} is reading closely — ${bits.join(" · ")} in your data room` : `${who} is reading your data room closely`;
      }
      return `${who} opened your data room for the first time`;
    }
    case "radar_setup_nudge": {
      // Counts come from the sweep's catalogue so the line is never blank
      // (D-3 "always show counts"); the title alone when they are missing.
      const g = n(p.open_grants);
      const pr = n(p.open_programs);
      if (g !== null && pr !== null && g + pr > 0) {
        return `${RADAR_SETUP_NUDGE_TITLE} — ${g} grants and ${pr} programs are open right now`;
      }
      return RADAR_SETUP_NUDGE_TITLE;
    }
    case "analysis_refresh": {
      const changes = n(p.changes) ?? (Array.isArray(p.changes) ? p.changes.length : null);
      if (changes !== null && changes > 0) return fill(FUNDING_COPY.notification.analysis_refresh, { n: changes });
      return s(p.title) ?? FUNDING_COPY.notification.analysis_refresh_noCount;
    }
    default:
      return row.kind;
  }
}

/** Where the notification links. `null` = no action. */
export function notificationAction(row: FounderNotificationRow): { href: string; label: string } | null {
  const p = row.payload ?? {};
  switch (row.kind) {
    case "tbr_view":
    case "tbr_qa_asked":
    case "report_shared":
    case "analysis_done":
      return { href: "/workspace/business-report", label: "View report" };
    case "tbr_lead": {
      const email = s(p.email);
      return email
        ? { href: `mailto:${email}?subject=${encodeURIComponent("Following up on your interest in our startup")}`, label: "Reply to lead" }
        : { href: "/workspace/business-report", label: "View report" };
    }
    case "svi_trend_alert":
      return { href: "/workspace/svi-trend", label: "Open SVI trend" };
    case "grant_deadline": {
      const url = s(p.url);
      return url ? { href: url, label: "Open grant" } : { href: "/funding/grants", label: "See grants" };
    }
    case "program_intake":
    case "event_match": {
      const url = s(p.url);
      return url ? { href: url, label: "Open program" } : { href: "/funding", label: "See programs" };
    }
    case "new_matches": {
      const reportId = s(p.report_id);
      return reportId ? { href: `/funding/report/${reportId}`, label: "See matches" } : { href: "/funding", label: "See matches" };
    }
    case "weekly_next_step":
      // Evaluator radar payloads carry href=/workspace/evaluations (T0273).
      return { href: s(p.href) ?? "/dashboard", label: Array.isArray(p.movers) ? "Open Progress Radar" : "Do it now" };
    case "analysis_refresh":
      return { href: s(p.href) ?? "/workspace/business-report", label: "Read the update" };
    case "radar_setup_nudge":
      return { href: RADAR_SETUP_NUDGE_HREF, label: RADAR_SETUP_NUDGE_ACTION_LABEL };
    case "webhook_disabled":
      return { href: "/workspace/integrations#webhooks", label: "Open webhooks" };
    case "connector_reconnect":
      return { href: s(p.href) ?? "/workspace/evidence", label: "Reconnect" };
    case "investor_viewed":
      return { href: "/workspace/data-room", label: "See who read what" };
    default:
      return null;
  }
}
