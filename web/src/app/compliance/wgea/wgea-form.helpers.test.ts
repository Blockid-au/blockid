import { describe, expect, it } from "vitest";
import { assessWGEA } from "@/lib/compliance/wgea-threshold";
import {
  fromWgeaInput,
  makeEmptyWgeaFormState,
  pickWgeaBand,
  toWgeaInput,
} from "./wgea-form.helpers";

describe("makeEmptyWgeaFormState", () => {
  it("returns a zeroed state with sensible defaults", () => {
    const empty = makeEmptyWgeaFormState();
    expect(empty.current_headcount_au).toBe("0");
    expect(empty.has_previously_reported).toBe(false);
    expect(empty.monthly_headcount_last_12_months).toBe("");
    expect(empty.last_report_lodged_at).toBe("");
    expect(empty.reporting_periods_since_last_over_threshold).toBe("");
  });
});

describe("toWgeaInput", () => {
  it("parses numeric strings and drops empty history / dates", () => {
    const input = toWgeaInput({
      ...makeEmptyWgeaFormState(),
      current_headcount_au: "85",
    });
    expect(input.current_headcount_au).toBe(85);
    expect(input.has_previously_reported).toBe(false);
    expect(input.monthly_headcount_last_12_months).toBeUndefined();
    expect(input.last_report_lodged_at).toBeUndefined();
    expect(input.reporting_periods_since_last_over_threshold).toBeUndefined();
  });

  it("splits a whitespace-and-comma CSV of monthly headcounts", () => {
    const input = toWgeaInput({
      ...makeEmptyWgeaFormState(),
      current_headcount_au: "72",
      monthly_headcount_last_12_months: "60, 62 65,68 70 72 74 76 78 80 82 84",
    });
    expect(input.monthly_headcount_last_12_months).toEqual([
      60, 62, 65, 68, 70, 72, 74, 76, 78, 80, 82, 84,
    ]);
  });

  it("drops non-numeric and negative history entries silently", () => {
    const input = toWgeaInput({
      ...makeEmptyWgeaFormState(),
      current_headcount_au: "50",
      monthly_headcount_last_12_months: "50, banana, -10, 55",
    });
    expect(input.monthly_headcount_last_12_months).toEqual([50, 55]);
  });

  it("preserves grace-period metadata when the founder has previously reported", () => {
    const input = toWgeaInput({
      current_headcount_au: "90",
      monthly_headcount_last_12_months: "",
      has_previously_reported: true,
      last_report_lodged_at: "2025-05-30",
      reporting_periods_since_last_over_threshold: "1",
    });
    expect(input.has_previously_reported).toBe(true);
    expect(input.last_report_lodged_at).toBe("2025-05-30");
    expect(input.reporting_periods_since_last_over_threshold).toBe(1);
  });

  it("falls back to zero for garbage numeric input", () => {
    const input = toWgeaInput({
      ...makeEmptyWgeaFormState(),
      current_headcount_au: "not a number",
    });
    expect(input.current_headcount_au).toBe(0);
  });
});

describe("fromWgeaInput ↔ toWgeaInput round-trip", () => {
  it("round-trips a fully-populated input", () => {
    const wire = {
      current_headcount_au: 105,
      monthly_headcount_last_12_months: [90, 95, 100, 105],
      has_previously_reported: true,
      last_report_lodged_at: "2025-05-31",
      reporting_periods_since_last_over_threshold: 0,
    };
    const rehydrated = fromWgeaInput(wire);
    expect(rehydrated.current_headcount_au).toBe("105");
    expect(rehydrated.monthly_headcount_last_12_months).toBe("90, 95, 100, 105");
    expect(rehydrated.has_previously_reported).toBe(true);
    expect(rehydrated.last_report_lodged_at).toBe("2025-05-31");
    expect(rehydrated.reporting_periods_since_last_over_threshold).toBe("0");

    const back = toWgeaInput(rehydrated);
    expect(back).toEqual(wire);
  });

  it("tolerates missing optional fields on rehydrate", () => {
    const rehydrated = fromWgeaInput({
      current_headcount_au: 30,
      has_previously_reported: false,
    });
    expect(rehydrated.monthly_headcount_last_12_months).toBe("");
    expect(rehydrated.last_report_lodged_at).toBe("");
    expect(rehydrated.reporting_periods_since_last_over_threshold).toBe("");
  });
});

describe("pickWgeaBand", () => {
  const now = new Date("2026-07-24T00:00:00Z");

  it("returns red for report_required (peak headcount at threshold)", () => {
    const result = assessWGEA(
      { current_headcount_au: 105, has_previously_reported: false },
      now,
    );
    expect(result.action_required).toBe("report_required");
    expect(pickWgeaBand(result)).toBe("red");
  });

  it("returns amber for approaching_threshold", () => {
    const result = assessWGEA(
      { current_headcount_au: 85, has_previously_reported: false },
      now,
    );
    expect(result.action_required).toBe("approaching_threshold");
    expect(pickWgeaBand(result)).toBe("amber");
  });

  it("returns amber for grace_period (previously reported, now below threshold)", () => {
    const result = assessWGEA(
      {
        current_headcount_au: 60,
        has_previously_reported: true,
        reporting_periods_since_last_over_threshold: 1,
      },
      now,
    );
    expect(result.action_required).toBe("grace_period");
    expect(pickWgeaBand(result)).toBe("amber");
  });

  it("returns green for already_reporting", () => {
    const result = assessWGEA(
      {
        current_headcount_au: 200,
        has_previously_reported: true,
        last_report_lodged_at: "2025-05-31",
      },
      now,
    );
    expect(result.action_required).toBe("already_reporting");
    expect(pickWgeaBand(result)).toBe("green");
  });

  it("returns green for not_required (well below threshold)", () => {
    const result = assessWGEA(
      { current_headcount_au: 15, has_previously_reported: false },
      now,
    );
    expect(result.action_required).toBe("not_required");
    expect(pickWgeaBand(result)).toBe("green");
  });
});
