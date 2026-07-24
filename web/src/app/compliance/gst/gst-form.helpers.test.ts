import { describe, expect, it } from "vitest";
import { assessGST } from "@/lib/compliance/gst-threshold";
import {
  fromGstInput,
  makeEmptyGstFormState,
  pickGstBand,
  toGstInput,
} from "./gst-form.helpers";

describe("makeEmptyGstFormState", () => {
  it("defaults to empty CSVs, unregistered, no ABN, no registration date", () => {
    const s = makeEmptyGstFormState();
    expect(s.monthly_turnover_last_12_months).toBe("");
    expect(s.projected_next_12_months).toBe("");
    expect(s.registered_for_gst).toBe(false);
    expect(s.abn).toBe("");
    expect(s.registration_date).toBe("");
  });
});

describe("toGstInput", () => {
  it("parses CSV monthly turnover (comma + space separated) and drops garbage/negatives", () => {
    const wire = toGstInput({
      monthly_turnover_last_12_months:
        "1000, 1500 2000, three thousand, -50, 4000",
      projected_next_12_months: "",
      registered_for_gst: false,
      registration_date: "",
      abn: "",
    });
    expect(wire.monthly_turnover_last_12_months).toEqual([
      1000, 1500, 2000, 4000,
    ]);
    expect(wire.projected_next_12_months).toBeUndefined();
  });

  it("preserves projected_next_12_months when present", () => {
    const wire = toGstInput({
      monthly_turnover_last_12_months: "500",
      projected_next_12_months: "6000 6500 7000",
      registered_for_gst: false,
      registration_date: "",
      abn: "",
    });
    expect(wire.projected_next_12_months).toEqual([6000, 6500, 7000]);
  });

  it("drops empty optional strings (abn, registration_date) to undefined", () => {
    const wire = toGstInput({
      monthly_turnover_last_12_months: "",
      projected_next_12_months: "",
      registered_for_gst: false,
      registration_date: "   ",
      abn: "   ",
    });
    expect(wire.abn).toBeUndefined();
    expect(wire.registration_date).toBeUndefined();
    expect(wire.monthly_turnover_last_12_months).toEqual([]);
  });

  it("preserves ABN + registration_date when supplied and trims whitespace", () => {
    const wire = toGstInput({
      monthly_turnover_last_12_months: "",
      projected_next_12_months: "",
      registered_for_gst: true,
      registration_date: "  2024-07-01  ",
      abn: "  79 659 615 111  ",
    });
    expect(wire.abn).toBe("79 659 615 111");
    expect(wire.registration_date).toBe("2024-07-01");
    expect(wire.registered_for_gst).toBe(true);
  });
});

describe("fromGstInput ↔ toGstInput", () => {
  it("round-trips a fully-populated wire body without drift", () => {
    const wire = {
      monthly_turnover_last_12_months: [500, 600, 700, 800],
      projected_next_12_months: [900, 1000, 1100],
      registered_for_gst: true,
      registration_date: "2024-07-01",
      abn: "79 659 615 111",
    } as const;
    const state = fromGstInput({ ...wire });
    const round = toGstInput(state);
    expect(round.monthly_turnover_last_12_months).toEqual([500, 600, 700, 800]);
    expect(round.projected_next_12_months).toEqual([900, 1000, 1100]);
    expect(round.registered_for_gst).toBe(true);
    expect(round.registration_date).toBe("2024-07-01");
    expect(round.abn).toBe("79 659 615 111");
  });

  it("round-trips a minimal wire body (no projection, no ABN)", () => {
    const state = fromGstInput({
      monthly_turnover_last_12_months: [100],
      registered_for_gst: false,
    });
    expect(state.projected_next_12_months).toBe("");
    expect(state.abn).toBe("");
    expect(state.registration_date).toBe("");
    const round = toGstInput(state);
    expect(round.monthly_turnover_last_12_months).toEqual([100]);
    expect(round.projected_next_12_months).toBeUndefined();
    expect(round.abn).toBeUndefined();
    expect(round.registration_date).toBeUndefined();
  });
});

describe("pickGstBand", () => {
  it("returns red for urgent_register (actual trailing-12mo already over A$75k)", () => {
    const result = assessGST({
      monthly_turnover_last_12_months: new Array(12).fill(10_000),
      registered_for_gst: false,
    });
    expect(result.action_required).toBe("urgent_register");
    expect(pickGstBand(result)).toBe("red");
  });

  it("returns amber for register_within_21_days (projection crosses)", () => {
    const result = assessGST({
      monthly_turnover_last_12_months: new Array(12).fill(1000),
      projected_next_12_months: new Array(12).fill(10_000),
      registered_for_gst: false,
    });
    expect(result.action_required).toBe("register_within_21_days");
    expect(pickGstBand(result)).toBe("amber");
  });

  it("returns green for already_registered", () => {
    const result = assessGST({
      monthly_turnover_last_12_months: new Array(12).fill(10_000),
      registered_for_gst: true,
      registration_date: "2024-07-01",
      abn: "79 659 615 111",
    });
    expect(result.action_required).toBe("already_registered");
    expect(pickGstBand(result)).toBe("green");
  });

  it("returns green for none (below threshold)", () => {
    const result = assessGST({
      monthly_turnover_last_12_months: new Array(12).fill(500),
      registered_for_gst: false,
    });
    expect(result.action_required).toBe("none");
    expect(pickGstBand(result)).toBe("green");
  });
});
