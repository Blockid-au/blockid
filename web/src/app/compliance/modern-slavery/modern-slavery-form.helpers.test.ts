import { describe, expect, it } from "vitest";
import { assessModernSlavery } from "@/lib/compliance/modern-slavery-threshold";
import {
  fromModernSlaveryInput,
  makeEmptyModernSlaveryFormState,
  pickModernSlaveryBand,
  toModernSlaveryInput,
} from "./modern-slavery-form.helpers";

describe("makeEmptyModernSlaveryFormState", () => {
  it("defaults to AU-carrying-on-business = true and zero revenue", () => {
    const s = makeEmptyModernSlaveryFormState();
    expect(s.current_period_revenue_aud).toBe("0");
    expect(s.projected_full_period_revenue_aud).toBe("");
    expect(s.last_full_period_revenue_aud).toBe("");
    expect(s.current_fy_end_iso).toBe("");
    expect(s.last_statement_lodged_at).toBe("");
    expect(s.is_australian_or_carrying_on_business_in_au).toBe(true);
  });
});

describe("toModernSlaveryInput", () => {
  it("parses required current-period revenue and drops empty optional fields", () => {
    const input = toModernSlaveryInput({
      ...makeEmptyModernSlaveryFormState(),
      current_period_revenue_aud: "45000000",
    });
    expect(input.current_period_revenue_aud).toBe(45_000_000);
    expect(input.projected_full_period_revenue_aud).toBeUndefined();
    expect(input.last_full_period_revenue_aud).toBeUndefined();
    expect(input.current_fy_end_iso).toBeUndefined();
    expect(input.last_statement_lodged_at).toBeUndefined();
    expect(input.is_australian_or_carrying_on_business_in_au).toBe(true);
  });

  it("preserves all optional fields when the founder supplies them", () => {
    const input = toModernSlaveryInput({
      current_period_revenue_aud: "60000000",
      projected_full_period_revenue_aud: "120000000",
      last_full_period_revenue_aud: "115000000",
      current_fy_end_iso: "2026-06-30",
      last_statement_lodged_at: "2025-12-15",
      is_australian_or_carrying_on_business_in_au: true,
    });
    expect(input.projected_full_period_revenue_aud).toBe(120_000_000);
    expect(input.last_full_period_revenue_aud).toBe(115_000_000);
    expect(input.current_fy_end_iso).toBe("2026-06-30");
    expect(input.last_statement_lodged_at).toBe("2025-12-15");
  });

  it("falls back to zero for garbage numeric input and drops non-numeric optionals", () => {
    const input = toModernSlaveryInput({
      ...makeEmptyModernSlaveryFormState(),
      current_period_revenue_aud: "not a number",
      projected_full_period_revenue_aud: "banana",
    });
    expect(input.current_period_revenue_aud).toBe(0);
    expect(input.projected_full_period_revenue_aud).toBeUndefined();
  });

  it("honours the foreign-entity opt-out flag", () => {
    const input = toModernSlaveryInput({
      ...makeEmptyModernSlaveryFormState(),
      current_period_revenue_aud: "200000000",
      is_australian_or_carrying_on_business_in_au: false,
    });
    expect(input.is_australian_or_carrying_on_business_in_au).toBe(false);
  });
});

describe("fromModernSlaveryInput ↔ toModernSlaveryInput round-trip", () => {
  it("round-trips a fully-populated input", () => {
    const wire = {
      current_period_revenue_aud: 80_000_000,
      projected_full_period_revenue_aud: 110_000_000,
      last_full_period_revenue_aud: 105_000_000,
      current_fy_end_iso: "2026-06-30",
      last_statement_lodged_at: "2025-12-15",
      is_australian_or_carrying_on_business_in_au: true,
    };
    const rehydrated = fromModernSlaveryInput(wire);
    expect(rehydrated.current_period_revenue_aud).toBe("80000000");
    expect(rehydrated.projected_full_period_revenue_aud).toBe("110000000");
    expect(rehydrated.last_full_period_revenue_aud).toBe("105000000");
    expect(rehydrated.current_fy_end_iso).toBe("2026-06-30");
    expect(rehydrated.last_statement_lodged_at).toBe("2025-12-15");
    expect(rehydrated.is_australian_or_carrying_on_business_in_au).toBe(true);

    const back = toModernSlaveryInput(rehydrated);
    expect(back).toEqual(wire);
  });

  it("tolerates missing optional fields on rehydrate", () => {
    const rehydrated = fromModernSlaveryInput({
      current_period_revenue_aud: 30_000_000,
    });
    expect(rehydrated.projected_full_period_revenue_aud).toBe("");
    expect(rehydrated.last_full_period_revenue_aud).toBe("");
    expect(rehydrated.current_fy_end_iso).toBe("");
    expect(rehydrated.last_statement_lodged_at).toBe("");
    // Default when omitted on the wire: match the empty-form default.
    expect(rehydrated.is_australian_or_carrying_on_business_in_au).toBe(true);
  });
});

describe("pickModernSlaveryBand", () => {
  const now = new Date("2026-07-24T00:00:00Z");

  it("returns red for statement_overdue (last FY above threshold, deadline passed)", () => {
    const result = assessModernSlavery(
      {
        current_period_revenue_aud: 50_000_000,
        last_full_period_revenue_aud: 150_000_000,
        current_fy_end_iso: "2025-06-30",
        is_australian_or_carrying_on_business_in_au: true,
      },
      now,
    );
    expect(result.action_required).toBe("statement_overdue");
    expect(pickModernSlaveryBand(result)).toBe("red");
  });

  it("returns amber for approaching_threshold", () => {
    const result = assessModernSlavery(
      {
        current_period_revenue_aud: 85_000_000,
        is_australian_or_carrying_on_business_in_au: true,
      },
      now,
    );
    expect(result.action_required).toBe("approaching_threshold");
    expect(pickModernSlaveryBand(result)).toBe("amber");
  });

  it("returns amber for statement_required (projected above but not yet due)", () => {
    const result = assessModernSlavery(
      {
        current_period_revenue_aud: 60_000_000,
        projected_full_period_revenue_aud: 120_000_000,
        current_fy_end_iso: "2027-06-30",
        is_australian_or_carrying_on_business_in_au: true,
      },
      now,
    );
    expect(result.action_required).toBe("statement_required");
    expect(pickModernSlaveryBand(result)).toBe("amber");
  });

  it("returns green for already_lodged", () => {
    const result = assessModernSlavery(
      {
        current_period_revenue_aud: 150_000_000,
        last_full_period_revenue_aud: 150_000_000,
        last_statement_lodged_at: "2025-12-15",
        is_australian_or_carrying_on_business_in_au: true,
      },
      now,
    );
    expect(result.action_required).toBe("already_lodged");
    expect(pickModernSlaveryBand(result)).toBe("green");
  });

  it("returns green for not_required (foreign entity not carrying on business in AU)", () => {
    const result = assessModernSlavery(
      {
        current_period_revenue_aud: 500_000_000,
        is_australian_or_carrying_on_business_in_au: false,
      },
      now,
    );
    expect(result.action_required).toBe("not_required");
    expect(pickModernSlaveryBand(result)).toBe("green");
  });
});
