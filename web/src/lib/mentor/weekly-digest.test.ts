import { describe, expect, it } from "vitest";
import { assembleWeeklyDigest, type MenteeDigestRow } from "./weekly-digest";
import { computeEngagement } from "./engagement-score";

const NOW = new Date("2026-07-27T00:00:00Z"); // Monday W31
const DAY_MS = 24 * 60 * 60 * 1000;

function ago(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

function mentee(
  id: string,
  name: string,
  overrides: Partial<
    Omit<MenteeDigestRow, "subject_user_id" | "display_name" | "engagement"> &
      Parameters<typeof computeEngagement>[0]
  > = {},
): MenteeDigestRow {
  const engagementInputs = {
    now: NOW,
    last_check_in_at: overrides.last_check_in_at ?? null,
    last_login_at: overrides.last_login_at ?? null,
    svi_delta_30d: overrides.svi_delta_30d ?? null,
    last_report_at: overrides.last_report_at ?? null,
  };
  const engagement = computeEngagement(engagementInputs);
  return {
    subject_user_id: id,
    display_name: name,
    engagement,
    days_since_login: overrides.days_since_login ?? null,
    svi_delta_30d: overrides.svi_delta_30d ?? null,
    latest_blocker: overrides.latest_blocker ?? "",
  };
}

describe("assembleWeeklyDigest", () => {
  it("caps must_act at 3", () => {
    const mentees = Array.from({ length: 6 }, (_, i) =>
      mentee(`u${i}`, `Cold Co ${i}`, {
        last_login_at: null, // cold
        latest_blocker: "runway",
        days_since_login: 20 + i,
      }),
    );
    const out = assembleWeeklyDigest({
      iso_week: "2026-W31",
      mentor_display_name: "Alex",
      mentees,
    });
    expect(out.must_act.length).toBe(3);
    expect(out.markdown).toContain("Must-act (3)");
  });

  it("dedupes must_act against prior week when the mentee is not still cold", () => {
    const alpha = mentee("A", "Alpha", {
      last_login_at: ago(5),
      last_check_in_at: ago(6),
      svi_delta_30d: 0,
      latest_blocker: "waiting on legal",
    });
    // Alpha is not cold (has login + check-in) but has a blocker → cool/warm.
    // Should be deduped when prior week had A.
    const out = assembleWeeklyDigest({
      iso_week: "2026-W31",
      mentor_display_name: "Alex",
      mentees: [alpha],
      prior_week: { must_act_ids: ["A"] },
    });
    expect(out.must_act.find((p) => p.subject_user_id === "A")).toBeUndefined();
  });

  it("keeps a mentee in must_act if they are still cold, even after dedup", () => {
    const cold = mentee("C", "Coldco", {
      latest_blocker: "runway",
      days_since_login: 30,
    });
    expect(cold.engagement.tier).toBe("cold");
    const out = assembleWeeklyDigest({
      iso_week: "2026-W31",
      mentor_display_name: "Alex",
      mentees: [cold],
      prior_week: { must_act_ids: ["C"] },
    });
    expect(out.must_act.find((p) => p.subject_user_id === "C")).toBeDefined();
  });

  it("wins are top 3 by +SVI delta and exclude non-positive deltas", () => {
    const mentees = [
      mentee("a", "AAA", { svi_delta_30d: 5 }),
      mentee("b", "BBB", { svi_delta_30d: 12 }),
      mentee("c", "CCC", { svi_delta_30d: 0 }),
      mentee("d", "DDD", { svi_delta_30d: -3 }),
      mentee("e", "EEE", { svi_delta_30d: 8 }),
      mentee("f", "FFF", { svi_delta_30d: 1 }),
    ];
    const out = assembleWeeklyDigest({
      iso_week: "2026-W31",
      mentor_display_name: "Alex",
      mentees,
    });
    expect(out.wins.map((p) => p.subject_user_id)).toEqual(["b", "e", "a"]);
  });

  it("quiet lists mentees with >14d no login, capped at 3, most stale first", () => {
    const mentees = [
      mentee("a", "AAA", { days_since_login: 20 }),
      mentee("b", "BBB", { days_since_login: 5 }),
      mentee("c", "CCC", { days_since_login: 45 }),
      mentee("d", "DDD", { days_since_login: 30 }),
      mentee("e", "EEE", { days_since_login: 16 }),
    ];
    const out = assembleWeeklyDigest({
      iso_week: "2026-W31",
      mentor_display_name: "Alex",
      mentees,
    });
    expect(out.quiet.map((p) => p.subject_user_id)).toEqual(["c", "d", "a"]);
  });

  it("markdown contains the ISO week and mentor name", () => {
    const out = assembleWeeklyDigest({
      iso_week: "2026-W31",
      mentor_display_name: "Alex",
      mentees: [],
    });
    expect(out.markdown).toContain("2026-W31");
    expect(out.markdown).toContain("Alex");
    expect(out.subject).toBe("Mentor digest — 2026-W31");
  });

  it("gracefully handles an empty mentee list", () => {
    const out = assembleWeeklyDigest({
      iso_week: "2026-W31",
      mentor_display_name: "Alex",
      mentees: [],
    });
    expect(out.must_act).toEqual([]);
    expect(out.wins).toEqual([]);
    expect(out.quiet).toEqual([]);
    expect(out.markdown).toContain("_No mentees need urgent attention this week._");
  });
});
