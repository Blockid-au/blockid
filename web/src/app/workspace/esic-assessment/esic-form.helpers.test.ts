import { describe, expect, it } from "vitest";
import {
  fromEsicInput,
  makeEmptyFormState,
  pickResultBand,
  toEsicInput,
} from "./esic-form.helpers";
import { assessESIC } from "@/lib/compliance/esic-eligibility";

describe("esic-form.helpers — toEsicInput", () => {
  it("maps a filled form to the ESICInput wire shape", () => {
    const state = {
      ...makeEmptyFormState(),
      company_incorporated_year: "2024",
      company_incorporated_month: "6",
      turnover_prior_year_aud: "150000",
      total_expenses_prior_year_aud: "800000",
      is_listed: false,
      has_r_and_d_expenditure: true,
      points_australian_patent: true,
      points_accelerator_alumni: true,
      points_third_party_capital_raised_aud: "60000",
      points_r_and_d_expenditure_pct: "22",
      principles_high_growth: true,
    };

    const input = toEsicInput(state);
    expect(input.company_incorporated_year).toBe(2024);
    expect(input.company_incorporated_month).toBe(6);
    expect(input.turnover_prior_year_aud).toBe(150_000);
    expect(input.total_expenses_prior_year_aud).toBe(800_000);
    expect(input.is_listed).toBe(false);
    expect(input.has_r_and_d_expenditure).toBe(true);
    expect(input.points_100_test?.australian_patent).toBe(true);
    expect(input.points_100_test?.accelerator_alumni).toBe(true);
    expect(input.points_100_test?.third_party_capital_raised_aud).toBe(60_000);
    expect(input.points_100_test?.r_and_d_expenditure_pct).toBe(22);
    expect(input.principles_test?.high_growth_potential).toBe(true);
    expect(
      input.principles_test?.is_genuinely_focused_on_developing_new_or_improved,
    ).toBe(false);
  });

  it("falls back to zero for blank / non-numeric strings", () => {
    const state = {
      ...makeEmptyFormState(),
      turnover_prior_year_aud: "",
      total_expenses_prior_year_aud: "not-a-number",
      points_third_party_capital_raised_aud: "",
      points_r_and_d_expenditure_pct: "",
    };
    const input = toEsicInput(state);
    expect(input.turnover_prior_year_aud).toBe(0);
    expect(input.total_expenses_prior_year_aud).toBe(0);
    expect(input.points_100_test?.third_party_capital_raised_aud).toBe(0);
    expect(input.points_100_test?.r_and_d_expenditure_pct).toBe(0);
  });
});

describe("esic-form.helpers — fromEsicInput round-trip", () => {
  it("re-hydrates a state that toEsicInput maps back to the same values", () => {
    const original = {
      ...makeEmptyFormState(),
      company_incorporated_year: "2023",
      turnover_prior_year_aud: "42000",
      has_r_and_d_expenditure: true,
      points_australian_patent: true,
      points_r_and_d_expenditure_pct: "60",
      principles_new_or_improved: true,
      principles_broader_market: true,
    };
    const input = toEsicInput(original);
    const rehydrated = fromEsicInput(input);
    const roundTripped = toEsicInput(rehydrated);
    expect(roundTripped).toEqual(input);
  });
});

describe("esic-form.helpers — pickResultBand", () => {
  it("returns green when the two limbs pass", () => {
    const result = assessESIC({
      company_incorporated_year: new Date().getUTCFullYear() - 1,
      turnover_prior_year_aud: 50_000,
      total_expenses_prior_year_aud: 300_000,
      is_listed: false,
      has_r_and_d_expenditure: true,
      points_100_test: {
        australian_patent: true,
        innovation_patent: false,
        plant_breeder_rights: false,
        trademarks: false,
        accelerator_alumni: true,
        third_party_capital_raised_aud: 0,
        r_and_d_expenditure_pct: 0,
        licensed_technology_from_university: false,
      },
    });
    expect(result.is_esic).toBe(true);
    expect(pickResultBand(result)).toBe("green");
  });

  it("returns amber when early-stage passes but innovation is close (75/100)", () => {
    const result = assessESIC({
      company_incorporated_year: new Date().getUTCFullYear() - 1,
      turnover_prior_year_aud: 50_000,
      total_expenses_prior_year_aud: 300_000,
      is_listed: false,
      has_r_and_d_expenditure: true,
      points_100_test: {
        australian_patent: true,
        innovation_patent: true,
        plant_breeder_rights: false,
        trademarks: false,
        accelerator_alumni: false,
        third_party_capital_raised_aud: 0,
        r_and_d_expenditure_pct: 0,
        licensed_technology_from_university: false,
      },
    });
    expect(result.is_esic).toBe(false);
    expect(result.eligible_early_stage).toBe(true);
    expect(result.eligible_innovation_100pt).toBe(75);
    expect(pickResultBand(result)).toBe("amber");
  });

  it("returns red when early-stage fails outright", () => {
    const result = assessESIC({
      company_incorporated_year: 2000, // >6y old
      turnover_prior_year_aud: 500_000, // >200k
      total_expenses_prior_year_aud: 2_000_000, // >1M
      is_listed: true,
      has_r_and_d_expenditure: false,
    });
    expect(result.is_esic).toBe(false);
    expect(result.eligible_early_stage).toBe(false);
    expect(pickResultBand(result)).toBe("red");
  });
});
