import { describe, it, expect } from "vitest";
import {
  LICENSE_RISK_DISCLAIMER,
  type LicenseRiskCounts,
  type LicenseRiskEntry,
  type LicenseRiskReport,
} from "@/lib/dataroom/sbom-license-risk";
import {
  countHiddenRisky,
  pickSbomTileBand,
  pickSbomTileView,
  RISK_BAND_COLOUR,
  RISK_BAND_LABEL,
  type SbomTilePayload,
} from "./sbom-license-risk-tile.helpers";

function counts(overrides: Partial<LicenseRiskCounts> = {}): LicenseRiskCounts {
  return {
    strong_copyleft: 0,
    weak_copyleft: 0,
    unknown: 0,
    permissive: 0,
    other: 0,
    ...overrides,
  };
}

function entry(
  overrides: Partial<LicenseRiskEntry> & { name: string; band: LicenseRiskEntry["band"] },
): LicenseRiskEntry {
  return {
    version: "1.0.0",
    license: "MIT",
    dev: false,
    ...overrides,
  };
}

function report(overrides: Partial<LicenseRiskReport> = {}): LicenseRiskReport {
  return {
    generated_at: "2026-07-25T00:00:00.000Z",
    root_name: "blockid",
    root_version: "0.1.0",
    counts_runtime: counts(),
    counts_dev: counts(),
    runtime_risky: [],
    disclaimer: LICENSE_RISK_DISCLAIMER,
    ...overrides,
  };
}

function payload(r: LicenseRiskReport): SbomTilePayload {
  return {
    generated_at: r.generated_at,
    root_name: r.root_name,
    root_version: r.root_version,
    license_risk: r,
  };
}

describe("pickSbomTileBand", () => {
  it("returns slate when runtime has no dependencies", () => {
    expect(pickSbomTileBand(report())).toBe("slate");
  });

  it("returns red when runtime has strong-copyleft entries", () => {
    expect(
      pickSbomTileBand(
        report({ counts_runtime: counts({ strong_copyleft: 1, permissive: 5 }) }),
      ),
    ).toBe("red");
  });

  it("returns amber when runtime has unknown-license entries", () => {
    expect(
      pickSbomTileBand(
        report({ counts_runtime: counts({ unknown: 2, permissive: 40 }) }),
      ),
    ).toBe("amber");
  });

  it("returns amber when runtime has weak-copyleft entries (no strong / unknown)", () => {
    expect(
      pickSbomTileBand(
        report({ counts_runtime: counts({ weak_copyleft: 3, permissive: 10 }) }),
      ),
    ).toBe("amber");
  });

  it("returns emerald when runtime is permissive / other only", () => {
    expect(
      pickSbomTileBand(
        report({ counts_runtime: counts({ permissive: 100, other: 4 }) }),
      ),
    ).toBe("emerald");
  });

  it("stays slate at the header when only devDependencies have strong-copyleft", () => {
    // Dev-only strong-copyleft is still surfaced in counts_dev but the
    // header band is driven by runtime — matches LICENSE_RISK_DISCLAIMER
    // ("dev-only entries usually do not trigger distribution obligations").
    expect(
      pickSbomTileBand(
        report({
          counts_dev: counts({ strong_copyleft: 1 }),
        }),
      ),
    ).toBe("slate");
  });
});

describe("pickSbomTileView", () => {
  it("returns a slate loading view when the payload is null", () => {
    const view = pickSbomTileView(null);
    expect(view.colour).toBe("slate");
    expect(view.chipLabel).toBe("Loading…");
    expect(view.headline).toMatch(/license risk/i);
    expect(view.rows).toHaveLength(0);
    expect(view.runtimeTotal).toBe(0);
    expect(view.devTotal).toBe(0);
    expect(view.disclaimer).toBe("");
  });

  it("returns a slate empty view when the lockfile has zero dependencies", () => {
    const view = pickSbomTileView(payload(report()));
    expect(view.colour).toBe("slate");
    expect(view.chipLabel).toBe("No runtime deps");
    expect(view.headline).toContain("no runtime dependencies");
    expect(view.body).toMatch(/no dependencies/i);
    expect(view.rows).toHaveLength(0);
  });

  it("returns a red view with a strong-copyleft chip + rows when runtime has AGPL/SSPL", () => {
    const r = report({
      counts_runtime: counts({ strong_copyleft: 2, permissive: 100 }),
      runtime_risky: [
        entry({ name: "some-agpl-pkg", license: "AGPL-3.0", band: "strong_copyleft" }),
        entry({ name: "some-sspl-pkg", license: "SSPL-1.0", band: "strong_copyleft" }),
      ],
    });
    const view = pickSbomTileView(payload(r));
    expect(view.colour).toBe("red");
    expect(view.chipLabel).toBe("2 strong-copyleft");
    expect(view.headline).toContain("strong-copyleft in runtime");
    expect(view.body).toContain("runtime rows need");
    expect(view.body).toContain("counsel review");
    expect(view.rows).toHaveLength(2);
    expect(view.rows[0]!.name).toBe("some-agpl-pkg");
    expect(view.runtimeTotal).toBe(102);
    expect(view.disclaimer).toBe(LICENSE_RISK_DISCLAIMER);
  });

  it("returns an emerald all-permissive view with a reassuring body copy", () => {
    const r = report({
      counts_runtime: counts({ permissive: 250, other: 5 }),
    });
    const view = pickSbomTileView(payload(r));
    expect(view.colour).toBe("emerald");
    expect(view.chipLabel).toBe("All permissive");
    expect(view.headline).toMatch(/permissive/i);
    expect(view.body).toContain("No runtime rows in strong-copyleft");
    expect(view.rows).toHaveLength(0);
    expect(view.runtimeTotal).toBe(255);
  });

  it("caps rows[] at rowCap and countHiddenRisky reports the overflow", () => {
    const r = report({
      counts_runtime: counts({ unknown: 8, permissive: 40 }),
      runtime_risky: Array.from({ length: 8 }, (_, i) =>
        entry({ name: `pkg-${i}`, license: "", band: "unknown" }),
      ),
    });
    const view = pickSbomTileView(payload(r), 3);
    expect(view.rows).toHaveLength(3);
    expect(view.rows[0]!.name).toBe("pkg-0");
    expect(countHiddenRisky(r, 3)).toBe(5);
  });

  it("clamps a negative / non-integer rowCap to 0 without throwing", () => {
    const r = report({
      counts_runtime: counts({ unknown: 2 }),
      runtime_risky: [
        entry({ name: "a", license: "", band: "unknown" }),
        entry({ name: "b", license: "", band: "unknown" }),
      ],
    });
    expect(pickSbomTileView(payload(r), -1).rows).toHaveLength(0);
    expect(countHiddenRisky(r, -1)).toBe(2);
    expect(pickSbomTileView(payload(r), 1.7).rows).toHaveLength(1);
    expect(countHiddenRisky(r, 1.7)).toBe(1);
  });
});

describe("band tables", () => {
  it("covers every LicenseRiskBand with a label and a tile-band colour", () => {
    const bands: Array<keyof typeof RISK_BAND_LABEL> = [
      "strong_copyleft",
      "weak_copyleft",
      "unknown",
      "permissive",
      "other",
    ];
    for (const b of bands) {
      expect(RISK_BAND_LABEL[b]).toBeTruthy();
      expect(RISK_BAND_COLOUR[b]).toBeTruthy();
    }
    // strong_copyleft = red; unknown / weak_copyleft = amber; permissive = emerald; other = slate
    expect(RISK_BAND_COLOUR.strong_copyleft).toBe("red");
    expect(RISK_BAND_COLOUR.unknown).toBe("amber");
    expect(RISK_BAND_COLOUR.weak_copyleft).toBe("amber");
    expect(RISK_BAND_COLOUR.permissive).toBe("emerald");
    expect(RISK_BAND_COLOUR.other).toBe("slate");
  });
});
