// Static-render tests for the founder profile Execution section (G14-S37).
// renderToStaticMarkup — no @testing-library/react in this workspace.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import en from "@/lib/i18n/messages/en.json";
import vi from "@/lib/i18n/messages/vi.json";
import { EMPTY_PROFILE, type FounderProfile } from "@/lib/founder-profile-types";
import { pickExecutionLabels } from "./execution-labels";
import { FounderExecutionSection, fillTemplate } from "./founder-execution-section";

const EN = en as Record<string, string>;
const VI = vi as Record<string, string>;
const labels = pickExecutionLabels(EN, EN);

function profile(over: Partial<FounderProfile> = {}): FounderProfile {
  return { ...EMPTY_PROFILE("acct-1", "founder@example.com"), ...over };
}

const noop = () => {};

describe("<FounderExecutionSection>", () => {
  it("renders the section with the score preview (0 for an empty profile), the import button, the four role inputs and the commitment fields", () => {
    const html = renderToStaticMarkup(<FounderExecutionSection p={profile()} setP={noop} labels={labels} />);
    expect(html).toContain('data-testid="founder-execution-section"');
    expect(html).toContain('data-execution-score="0"');
    expect(html).toContain('data-testid="linkedin-import-button"');
    expect(html).toContain("Import from LinkedIn PDF");
    for (const k of ["ceo", "cto", "cpo", "cfo"]) expect(html).toContain(`id="exec-role-${k}"`);
    expect(html).toContain('id="exec-full-time"');
    expect(html).toContain('id="exec-worked-together"');
    expect(html).toContain('id="exec-github"');
    expect(html).toContain('data-testid="add-exit"');
    expect(html).toContain('data-testid="add-raise"');
    expect(html).not.toContain('data-testid="execution-cap-notice"');
    // Every label came from the catalogue, never a raw key.
    expect(html).not.toMatch(/execution\.[a-z_.]+</);
  });

  it("renders exit + raise rows from the profile and the live rubric score with the 70 cap notice when self-reported", () => {
    const p = profile({
      prior_exits: [{ company: "Loom", year: 2020, type: "acquisition", value_band: "1m-10m" }, { company: "Weave", year: 2016, type: "ipo", value_band: "50m+" }],
      prior_raises: [{ company: "Loom", round: "series_b_plus", amount_aud_band: "20m+", year: 2019 }],
      years_in_domain: 12,
      roles: { ceo: "Ada", cto: "Charles", cpo: "Grace", cfo: "Alan" },
      full_time_pct: 100,
      worked_together_before: true,
      github_url: "https://github.com/ada",
    });
    const html = renderToStaticMarkup(<FounderExecutionSection p={p} setP={noop} labels={labels} />);
    expect((html.match(/data-testid="exit-row"/g) ?? []).length).toBe(2);
    expect((html.match(/data-testid="raise-row"/g) ?? []).length).toBe(1);
    expect(html).toContain('value="Loom"');
    expect(html).toContain('data-execution-score="70"');
    expect(html).toContain('data-testid="execution-cap-notice"');
    expect(html).toContain("70 cap");
    expect(html).toContain('value="https://github.com/ada"');
  });

  it("shows the lifted-cap line when a field is parser-confirmed (execution_source = linkedin_parser)", () => {
    const p = profile({ years_in_domain: 12, prior_exits: [{ company: "Loom", year: 2020, type: "acquisition", value_band: "undisclosed" }, { company: "Weave", year: 2016, type: "ipo", value_band: "undisclosed" }], prior_raises: [{ company: "Loom", round: "series_b_plus", amount_aud_band: "20m+", year: 2019 }], roles: { ceo: "Ada", cto: "Charles", cpo: "Grace", cfo: "Alan" }, full_time_pct: 100, worked_together_before: true, execution_source: { years_in_domain: "linkedin_parser" } });
    const html = renderToStaticMarkup(<FounderExecutionSection p={p} setP={noop} labels={labels} />);
    expect(html).toContain('data-execution-score="95"');
    expect(html).not.toContain('data-testid="execution-cap-notice"');
    expect(html).toContain("confirmed by your LinkedIn export");
  });

  it("Vietnamese labels render when the locale catalogue is merged over EN", () => {
    const html = renderToStaticMarkup(<FounderExecutionSection p={profile()} setP={noop} labels={pickExecutionLabels(EN, VI)} />);
    expect(html).toContain(VI["execution.title"]);
    expect(html).toContain(VI["execution.import.button"]);
  });
});

describe("fillTemplate / pickExecutionLabels", () => {
  it("substitutes {tokens} and leaves unknown ones empty; the label picker keeps only execution.* and prefers the locale value", () => {
    expect(fillTemplate("Imported: {fields}. {missing}", { fields: "a, b" })).toBe("Imported: a, b. ");
    const picked = pickExecutionLabels({ "execution.title": "Execution", "solutions.x": "no" }, { "execution.title": "Thực thi", "execution.empty": "" });
    expect(picked).toEqual({ "execution.title": "Thực thi" });
  });
});
