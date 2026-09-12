// S23-B — Ga4DimensionsPanelView (pure half of the /admin/growth panel).
// No @testing-library here; renderToStaticMarkup over the three states the
// admin needs to tell apart: blocked (operator steps shown, no button),
// missing (button with the count), all registered (green line).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GA4_CUSTOM_DIMENSIONS } from "@/lib/analytics/ga4-dimensions";
import { Ga4DimensionsPanelView, type PanelResult } from "./ga4-dimensions-panel";

const noop = () => {};

function render(result: PanelResult | null, extra: Partial<{ loading: boolean; applying: boolean; error: string | null }> = {}) {
  return renderToStaticMarkup(
    <Ga4DimensionsPanelView result={result} loading={false} applying={false} error={null} onReload={noop} onApply={noop} {...extra} />,
  );
}

function base(overrides: Partial<PanelResult> = {}): PanelResult {
  return {
    ok: true,
    dryRun: true,
    property: "properties/538350801",
    serviceAccount: "sa@x.iam.gserviceaccount.com",
    created: [],
    existing: ["arm", "plan"],
    missing: GA4_CUSTOM_DIMENSIONS.map((d) => d.parameterName).filter((p) => p !== "arm" && p !== "plan"),
    unmanaged: ["legacy_thing"],
    blocked: null,
    error: null,
    ...overrides,
  };
}

describe("Ga4DimensionsPanelView", () => {
  it("lists every declared dimension with its display name", () => {
    const html = render(null, { loading: true });
    for (const d of GA4_CUSTOM_DIMENSIONS) {
      expect(html).toContain(`>${d.parameterName}<`);
      expect(html).toContain(d.displayName);
    }
    expect(html).toContain("Hero variant");
    expect(html).not.toContain("Register ");
  });

  it("blocked: renders the reason label and both operator steps verbatim, hides the register button", () => {
    const steps = [
      "1. Enable the Google Analytics Admin API (analyticsadmin.googleapis.com) in GCP project 990415480608: open https://console.developers.google.com/apis/api/analyticsadmin.googleapis.com/overview?project=990415480608 …",
      "2. In GA4 → Admin → Property access management (property 538350801), add sa@x.iam.gserviceaccount.com with the Editor role …",
    ];
    const html = render(base({ ok: false, existing: [], blocked: { reason: "api_disabled", steps, message: "has not been used in project 990415480608" } }));
    expect(html).toContain('data-testid="ga4-dimensions-blocked"');
    expect(html).toContain("Google Analytics Admin API is disabled in the GCP project");
    expect(html).toContain("has not been used in project 990415480608");
    expect(html).toContain("Operator steps");
    expect(html).toContain("overview?project=990415480608");
    expect(html).toContain("Editor role");
    expect(html).not.toContain("Register ");
    // Every row is "unknown" while blocked — nothing is claimed as registered.
    expect(html).not.toContain(">registered<");
    expect((html.match(/>unknown</g) ?? []).length).toBe(GA4_CUSTOM_DIMENSIONS.length);
  });

  it("missing: shows the register button with the count and marks rows registered / missing", () => {
    const r = base();
    const html = render(r);
    expect(html).toContain(`Register ${r.missing.length} missing`);
    expect((html.match(/>registered</g) ?? []).length).toBe(2);
    expect((html.match(/>missing</g) ?? []).length).toBe(r.missing.length);
    expect(html).toContain("legacy_thing");
    expect(html).toContain("properties/538350801");
    expect(html).not.toContain('data-testid="ga4-dimensions-blocked"');
  });

  it("all registered: green line, no button; counts just-created ones", () => {
    const all = GA4_CUSTOM_DIMENSIONS.map((d) => d.parameterName);
    const html = render(base({ dryRun: false, existing: all.slice(0, 3), created: all.slice(3), missing: [], unmanaged: [] }));
    expect(html).toContain('data-testid="ga4-dimensions-ok"');
    expect(html).toContain(`All ${all.length} dimensions are registered`);
    expect(html).toContain(`(${all.length - 3} created just now)`);
    expect(html).not.toContain("Register ");
    expect((html.match(/>registered</g) ?? []).length).toBe(all.length);
  });

  it("surfaces fetch errors and unknown blocked reasons without crashing", () => {
    const html = render(base({ blocked: { reason: "something_new", steps: ["x"], message: "" } }), { error: "HTTP 500" });
    expect(html).toContain('role="alert"');
    expect(html).toContain("HTTP 500");
    expect(html).toContain("Blocked — something_new");
  });

  it("applying state relabels the button", () => {
    expect(render(base(), { applying: true })).toContain("Registering…");
  });
});
