import { describe, expect, it } from "vitest";
import { computeWeeklyCohortRetention } from "@/lib/traction/cohort-chart";
import {
  COHORT_HEADLINE,
  makeEmptyCohortRetentionFormState,
  parseActivitiesCsv,
  parseReferenceDate,
  parseSignupsCsv,
  pickCohortBand,
} from "./cohort-retention-tile.helpers";

describe("cohort-retention-tile helpers", () => {
  describe("makeEmptyCohortRetentionFormState", () => {
    it("seeds empty CSV fields and no reference date", () => {
      const s = makeEmptyCohortRetentionFormState();
      expect(s.signups_csv).toBe("");
      expect(s.activities_csv).toBe("");
      expect(s.reference_date_iso).toBe("");
    });
  });

  describe("parseSignupsCsv", () => {
    it("parses two-column user_id + signup_iso rows", () => {
      const rows = parseSignupsCsv("u1,2026-01-05\nu2,2026-01-06");
      expect(rows).toEqual([
        { user_id: "u1", signup_iso: "2026-01-05" },
        { user_id: "u2", signup_iso: "2026-01-06" },
      ]);
    });

    it("silently drops malformed rows (missing id, bad date, single column, blank line, comment line)", () => {
      const rows = parseSignupsCsv(
        [
          "",
          "# comment header",
          ",2026-01-05",
          "u1,not-a-date",
          "u2",
          "u3,2026-01-07",
          "   ",
        ].join("\n"),
      );
      expect(rows).toEqual([{ user_id: "u3", signup_iso: "2026-01-07" }]);
    });

    it("accepts tab-separated and full ISO timestamps", () => {
      const rows = parseSignupsCsv("u1\t2026-01-05T09:15:00Z");
      expect(rows).toEqual([
        { user_id: "u1", signup_iso: "2026-01-05T09:15:00Z" },
      ]);
    });
  });

  describe("parseActivitiesCsv", () => {
    it("mirrors the signups shape but writes activity_iso", () => {
      const rows = parseActivitiesCsv("u1,2026-01-12\nu2,2026-01-13");
      expect(rows).toEqual([
        { user_id: "u1", activity_iso: "2026-01-12" },
        { user_id: "u2", activity_iso: "2026-01-13" },
      ]);
    });
  });

  describe("parseReferenceDate", () => {
    it("blank / non-ISO input returns undefined so the pure helper defaults to now()", () => {
      expect(parseReferenceDate("")).toBeUndefined();
      expect(parseReferenceDate("   ")).toBeUndefined();
      expect(parseReferenceDate("not-a-date")).toBeUndefined();
    });

    it("valid ISO date returns a Date pinned to that instant", () => {
      const d = parseReferenceDate("2026-02-16");
      expect(d).toBeInstanceOf(Date);
      expect(d?.toISOString().startsWith("2026-02-16")).toBe(true);
    });
  });

  describe("pickCohortBand", () => {
    it("empty matrix → grey", () => {
      const matrix = computeWeeklyCohortRetention([], [], {
        reference_date: new Date("2026-02-16T00:00:00Z"),
      });
      expect(pickCohortBand(matrix)).toBe("grey");
    });

    it("< MIN_COHORT_BUCKETS cohorts → amber even with strong retention", () => {
      const referenceDate = new Date("2026-02-16T00:00:00Z"); // Monday
      // Two cohorts, both with W0 = 100% + W1 = 80% (well above the 40% floor)
      const signups = [
        { user_id: "u1", signup_iso: "2026-01-26" },
        { user_id: "u2", signup_iso: "2026-01-26" },
        { user_id: "u3", signup_iso: "2026-02-02" },
        { user_id: "u4", signup_iso: "2026-02-02" },
      ];
      const activities = [
        { user_id: "u1", activity_iso: "2026-01-26" },
        { user_id: "u2", activity_iso: "2026-01-26" },
        { user_id: "u1", activity_iso: "2026-02-02" },
        { user_id: "u2", activity_iso: "2026-02-02" },
        { user_id: "u3", activity_iso: "2026-02-02" },
        { user_id: "u4", activity_iso: "2026-02-02" },
        { user_id: "u3", activity_iso: "2026-02-09" },
        { user_id: "u4", activity_iso: "2026-02-09" },
      ];
      const matrix = computeWeeklyCohortRetention(signups, activities, {
        reference_date: referenceDate,
      });
      expect(matrix.meets_min_buckets).toBe(false);
      expect(pickCohortBand(matrix)).toBe("amber");
    });

    it("≥ MIN_COHORT_BUCKETS cohorts with W1 below 40% → amber", () => {
      const referenceDate = new Date("2026-02-16T00:00:00Z"); // Monday
      // Four cohorts across four weeks; each has 4 signups, only 1 comes back W1 → 25%
      const signups: Array<{ user_id: string; signup_iso: string }> = [];
      const activities: Array<{ user_id: string; activity_iso: string }> = [];
      const cohortMondays = [
        "2026-01-26",
        "2026-02-02",
        "2026-02-09",
        "2026-02-16",
      ];
      cohortMondays.forEach((monday, cIdx) => {
        for (let u = 0; u < 4; u += 1) {
          const id = `c${cIdx}u${u}`;
          signups.push({ user_id: id, signup_iso: monday });
          activities.push({ user_id: id, activity_iso: monday }); // W0
        }
        // W1: only user 0 comes back
        const nextMonday = new Date(Date.parse(`${monday}T00:00:00Z`) + 7 * 86_400_000)
          .toISOString()
          .slice(0, 10);
        activities.push({ user_id: `c${cIdx}u0`, activity_iso: nextMonday });
      });
      const matrix = computeWeeklyCohortRetention(signups, activities, {
        reference_date: referenceDate,
      });
      expect(matrix.meets_min_buckets).toBe(true);
      expect(pickCohortBand(matrix)).toBe("amber");
    });

    it("≥ MIN_COHORT_BUCKETS cohorts with best W1 ≥ 40% → green", () => {
      const referenceDate = new Date("2026-02-16T00:00:00Z"); // Monday
      // Four cohorts, 4 signups each. Best W1 = 3/4 = 75%.
      const signups: Array<{ user_id: string; signup_iso: string }> = [];
      const activities: Array<{ user_id: string; activity_iso: string }> = [];
      const cohortMondays = [
        "2026-01-26",
        "2026-02-02",
        "2026-02-09",
        "2026-02-16",
      ];
      cohortMondays.forEach((monday, cIdx) => {
        for (let u = 0; u < 4; u += 1) {
          const id = `c${cIdx}u${u}`;
          signups.push({ user_id: id, signup_iso: monday });
          activities.push({ user_id: id, activity_iso: monday });
        }
        // W1: users 0..2 come back (3/4 = 75%) — but only for cohorts old enough
        const nextMonday = new Date(Date.parse(`${monday}T00:00:00Z`) + 7 * 86_400_000)
          .toISOString()
          .slice(0, 10);
        if (nextMonday <= "2026-02-16") {
          for (let u = 0; u < 3; u += 1) {
            activities.push({ user_id: `c${cIdx}u${u}`, activity_iso: nextMonday });
          }
        }
      });
      const matrix = computeWeeklyCohortRetention(signups, activities, {
        reference_date: referenceDate,
      });
      expect(matrix.meets_min_buckets).toBe(true);
      expect(pickCohortBand(matrix)).toBe("green");
    });
  });

  describe("COHORT_HEADLINE", () => {
    it("supplies distinct copy for every band", () => {
      expect(COHORT_HEADLINE.green).toMatch(/investor/i);
      expect(COHORT_HEADLINE.amber).toMatch(/below/i);
      expect(COHORT_HEADLINE.grey).toMatch(/paste/i);
    });
  });
});
