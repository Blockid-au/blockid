// P12d-redomicile-wizard — helpers tests. Pin the form-state → wire input
// coercion + the band mapping so the wizard tile colour matches the pure
// assessRedomicile classification 1:1.

import { describe, expect, it } from "vitest";
import { assessRedomicile } from "@/lib/exits/redomicile-decision-check";
import {
  makeEmptyRedomicileWizardFormState,
  pickRedomicileBand,
  REDOMICILE_HEADLINE,
  REDOMICILE_MECHANISM_LABEL,
  toRedomicileInput,
} from "./redomicile-wizard.helpers";

describe("makeEmptyRedomicileWizardFormState", () => {
  it("defaults to the honest 'conservative AU founder' baseline", () => {
    const state = makeEmptyRedomicileWizardFormState();
    expect(state.has_delaware_acquirer_signal).toBe(false);
    expect(state.plans_us_listing).toBe(false);
    expect(state.wants_dual_class_founder_control).toBe(false);
    expect(state.is_pre_series_a).toBe(false);
    expect(state.has_scrip_only_offer).toBe(false);
    expect(state.ip_already_in_delaware).toBe(false);
    expect(state.us_resident_cap_table_pct).toBe("");
    expect(state.annual_burn_aud).toBe("");
  });
});

describe("toRedomicileInput", () => {
  it("collapses blank numeric fields to null", () => {
    const wire = toRedomicileInput(makeEmptyRedomicileWizardFormState());
    expect(wire.us_resident_cap_table_pct).toBeNull();
    expect(wire.annual_burn_aud).toBeNull();
  });

  it("parses populated numeric fields", () => {
    const state = {
      ...makeEmptyRedomicileWizardFormState(),
      us_resident_cap_table_pct: "60",
      annual_burn_aud: "500000",
    };
    const wire = toRedomicileInput(state);
    expect(wire.us_resident_cap_table_pct).toBe(60);
    expect(wire.annual_burn_aud).toBe(500_000);
  });

  it("drops non-finite numeric fields to null", () => {
    const state = {
      ...makeEmptyRedomicileWizardFormState(),
      us_resident_cap_table_pct: "not a number",
      annual_burn_aud: "  ",
    };
    const wire = toRedomicileInput(state);
    expect(wire.us_resident_cap_table_pct).toBeNull();
    expect(wire.annual_burn_aud).toBeNull();
  });

  it("passes booleans through", () => {
    const state = {
      ...makeEmptyRedomicileWizardFormState(),
      has_delaware_acquirer_signal: true,
      ip_already_in_delaware: true,
    };
    const wire = toRedomicileInput(state);
    expect(wire.has_delaware_acquirer_signal).toBe(true);
    expect(wire.ip_already_in_delaware).toBe(true);
  });
});

describe("pickRedomicileBand", () => {
  it("returns grey on a completely blank form", () => {
    const empty = makeEmptyRedomicileWizardFormState();
    const rec = assessRedomicile(toRedomicileInput(empty));
    expect(pickRedomicileBand(rec.recommendation, empty)).toBe("grey");
  });

  it("returns green when 'hold' is the answer AND the founder has typed something", () => {
    const state = { ...makeEmptyRedomicileWizardFormState(), is_pre_series_a: true };
    const rec = assessRedomicile(toRedomicileInput(state));
    expect(rec.recommendation).toBe("hold");
    expect(pickRedomicileBand(rec.recommendation, state)).toBe("green");
  });

  it("returns amber when the answer is 'prepare' (single trigger)", () => {
    const state = {
      ...makeEmptyRedomicileWizardFormState(),
      has_delaware_acquirer_signal: true,
      annual_burn_aud: "200000",
    };
    const rec = assessRedomicile(toRedomicileInput(state));
    expect(rec.recommendation).toBe("prepare");
    expect(pickRedomicileBand(rec.recommendation, state)).toBe("amber");
  });

  it("returns amber when the answer is 'proceed' (2+ triggers, funded)", () => {
    const state = {
      ...makeEmptyRedomicileWizardFormState(),
      has_delaware_acquirer_signal: true,
      us_resident_cap_table_pct: "60",
      annual_burn_aud: "500000",
    };
    const rec = assessRedomicile(toRedomicileInput(state));
    expect(rec.recommendation).toBe("proceed");
    expect(pickRedomicileBand(rec.recommendation, state)).toBe("amber");
  });

  it("returns red when the answer is 'reconsider' (triggers without runway)", () => {
    const state = {
      ...makeEmptyRedomicileWizardFormState(),
      has_delaware_acquirer_signal: true,
      us_resident_cap_table_pct: "60",
      annual_burn_aud: "20000",
    };
    const rec = assessRedomicile(toRedomicileInput(state));
    expect(rec.recommendation).toBe("reconsider");
    expect(pickRedomicileBand(rec.recommendation, state)).toBe("red");
  });
});

describe("copy packs", () => {
  it("REDOMICILE_HEADLINE has a distinct entry per recommendation", () => {
    const values = Object.values(REDOMICILE_HEADLINE);
    expect(values.length).toBe(4);
    expect(new Set(values).size).toBe(4);
    for (const v of values) expect(v.length).toBeGreaterThan(0);
  });

  it("REDOMICILE_MECHANISM_LABEL names the statutory anchor for each mechanism", () => {
    expect(REDOMICILE_MECHANISM_LABEL.scheme_of_arrangement_s411).toMatch(/s411/);
    expect(REDOMICILE_MECHANISM_LABEL.takeover_bid).toMatch(/s657A/);
    expect(REDOMICILE_MECHANISM_LABEL.direct_asset_transfer).toMatch(/operating/i);
  });
});
