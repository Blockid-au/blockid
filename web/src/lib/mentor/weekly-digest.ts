// Mentor weekly digest — pure lib (no DB, no IO).
//
// assembleWeeklyDigest() piggybacks on the existing Monday 08:00 AEST reseller
// digest — it doesn't send a new email, it renders a mentor-section markdown
// block that the reseller cron appends per mentor. Returns three lists:
//
//   must_act — up to 3 cold + blocker-present mentees, deduped week-over-week
//              against the prior payload so mentors aren't chased with the
//              same name twice unless the mentee is *still* cold.
//   wins     — up to 3 mentees with the strongest +SVI delta over 30d.
//   quiet    — up to 3 mentees with no login >14d (early churn signal).
//
// The caller supplies each mentee's engagement score + recent check-in so
// this file stays free of DB assumptions.

import type { EngagementResult, EngagementTier } from "./engagement-score";

export interface MenteeDigestRow {
  subject_user_id: string;
  display_name: string;
  engagement: EngagementResult;
  /** Days since last login. null = never / unknown. */
  days_since_login: number | null;
  /** 30-day SVI delta. null = unknown. */
  svi_delta_30d: number | null;
  /** Free-text blocker from the most recent check-in, empty if none. */
  latest_blocker: string;
}

export interface PriorWeekPayload {
  /** subject_user_ids that appeared in must_act last week. */
  must_act_ids: string[];
}

export interface DigestPick {
  subject_user_id: string;
  display_name: string;
  reason: string;
}

export interface WeeklyDigestPayload {
  iso_week: string;
  must_act: DigestPick[];
  wins: DigestPick[];
  quiet: DigestPick[];
  subject: string;
  markdown: string;
}

const MUST_ACT_CAP = 3;
const WINS_CAP = 3;
const QUIET_CAP = 3;

export interface AssembleInputs {
  iso_week: string;
  mentor_display_name: string;
  mentees: MenteeDigestRow[];
  prior_week?: PriorWeekPayload;
}

/**
 * Score-order comparator: coldest first, then blocker present, then oldest
 * login. Deterministic across ties by trailing on subject_user_id.
 */
function orderMustAct(a: MenteeDigestRow, b: MenteeDigestRow): number {
  if (a.engagement.score !== b.engagement.score) return a.engagement.score - b.engagement.score;
  const aHasBlocker = a.latest_blocker.trim().length > 0 ? 1 : 0;
  const bHasBlocker = b.latest_blocker.trim().length > 0 ? 1 : 0;
  if (aHasBlocker !== bHasBlocker) return bHasBlocker - aHasBlocker;
  const aLogin = a.days_since_login ?? Number.POSITIVE_INFINITY;
  const bLogin = b.days_since_login ?? Number.POSITIVE_INFINITY;
  if (aLogin !== bLogin) return bLogin - aLogin;
  return a.subject_user_id.localeCompare(b.subject_user_id);
}

function orderWins(a: MenteeDigestRow, b: MenteeDigestRow): number {
  const av = a.svi_delta_30d ?? Number.NEGATIVE_INFINITY;
  const bv = b.svi_delta_30d ?? Number.NEGATIVE_INFINITY;
  if (av !== bv) return bv - av;
  return a.subject_user_id.localeCompare(b.subject_user_id);
}

function orderQuiet(a: MenteeDigestRow, b: MenteeDigestRow): number {
  const av = a.days_since_login ?? -1;
  const bv = b.days_since_login ?? -1;
  if (av !== bv) return bv - av;
  return a.subject_user_id.localeCompare(b.subject_user_id);
}

function isColdOrCool(tier: EngagementTier): boolean {
  return tier === "cold" || tier === "cool";
}

function toPick(m: MenteeDigestRow, reason: string): DigestPick {
  return {
    subject_user_id: m.subject_user_id,
    display_name: m.display_name,
    reason,
  };
}

export function assembleWeeklyDigest(inputs: AssembleInputs): WeeklyDigestPayload {
  const prior = new Set(inputs.prior_week?.must_act_ids ?? []);

  // Must-act: cold or cool + a blocker present. Dedupe against last week
  // UNLESS the mentee is still cold — repeated coldness overrides dedup.
  const mustActCandidates = inputs.mentees
    .filter((m) => isColdOrCool(m.engagement.tier))
    .filter((m) => m.latest_blocker.trim().length > 0 || m.engagement.tier === "cold")
    .sort(orderMustAct)
    .filter((m) => {
      if (m.engagement.tier === "cold") return true;
      return !prior.has(m.subject_user_id);
    })
    .slice(0, MUST_ACT_CAP)
    .map((m) =>
      toPick(
        m,
        m.engagement.tier === "cold"
          ? `Cold (${m.engagement.score}/100)${m.latest_blocker ? " — blocker: " + m.latest_blocker : ""}`
          : `Blocker: ${m.latest_blocker}`,
      ),
    );

  const wins = inputs.mentees
    .filter((m) => (m.svi_delta_30d ?? 0) > 0)
    .sort(orderWins)
    .slice(0, WINS_CAP)
    .map((m) => toPick(m, `+${m.svi_delta_30d} SVI over 30d`));

  const quiet = inputs.mentees
    .filter((m) => (m.days_since_login ?? 0) > 14)
    .sort(orderQuiet)
    .slice(0, QUIET_CAP)
    .map((m) => toPick(m, `No login for ${m.days_since_login}d`));

  const subject = `Mentor digest — ${inputs.iso_week}`;

  const md: string[] = [
    `## Mentor digest — ${inputs.mentor_display_name} (${inputs.iso_week})`,
    "",
  ];
  md.push(`### Must-act (${mustActCandidates.length})`);
  if (mustActCandidates.length === 0) {
    md.push("_No mentees need urgent attention this week._");
  } else {
    for (const p of mustActCandidates) md.push(`- **${p.display_name}** — ${p.reason}`);
  }
  md.push("", `### Wins (${wins.length})`);
  if (wins.length === 0) {
    md.push("_No standout SVI progress this week._");
  } else {
    for (const p of wins) md.push(`- **${p.display_name}** — ${p.reason}`);
  }
  md.push("", `### Quiet (${quiet.length})`);
  if (quiet.length === 0) {
    md.push("_Everyone logged in this week._");
  } else {
    for (const p of quiet) md.push(`- **${p.display_name}** — ${p.reason}`);
  }

  return {
    iso_week: inputs.iso_week,
    must_act: mustActCandidates,
    wins,
    quiet,
    subject,
    markdown: md.join("\n"),
  };
}
