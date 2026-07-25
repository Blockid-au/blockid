import { describe, expect, it } from "vitest";
import { buildSbom } from "./sbom";
import {
  LICENSE_RISK_DISCLAIMER,
  classifyLicense,
  classifySbomLicenseRisk,
} from "./sbom-license-risk";

const FIXTURE = {
  name: "risk-fixture",
  version: "1.0.0",
  lockfileVersion: 3,
  packages: {
    "": { name: "risk-fixture", version: "1.0.0" },
    "node_modules/perm-mit": { version: "1.0.0", license: "MIT" },
    "node_modules/perm-apache": { version: "2.4.1", license: "Apache-2.0" },
    "node_modules/perm-bsd": { version: "3.0.0", license: "BSD-3-Clause" },
    "node_modules/weak-gpl": { version: "1.0.0", license: "GPL-3.0" },
    "node_modules/weak-lgpl": { version: "2.1.0", license: "LGPL-2.1-or-later" },
    "node_modules/weak-mpl": { version: "2.0.0", license: "MPL-2.0" },
    "node_modules/strong-agpl": { version: "3.0.0", license: "AGPL-3.0-or-later" },
    "node_modules/strong-sspl": { version: "1.0.0", license: "SSPL-1.0" },
    "node_modules/no-license": { version: "0.1.0" }, // → UNKNOWN
    "node_modules/dev-only-gpl": { version: "1.0.0", license: "GPL-2.0", dev: true },
    "node_modules/compound-worst-wins": {
      version: "1.2.3",
      license: "MIT OR GPL-3.0", // worst-band wins → weak_copyleft
    },
    "node_modules/other-weird": { version: "1.0.0", license: "SEE-LICENSE-IN-README" },
  },
};

describe("classifyLicense", () => {
  it("routes canonical SPDX identifiers to their bands", () => {
    expect(classifyLicense("MIT")).toBe("permissive");
    expect(classifyLicense("Apache-2.0")).toBe("permissive");
    expect(classifyLicense("BSD-3-Clause")).toBe("permissive");
    expect(classifyLicense("ISC")).toBe("permissive");
    expect(classifyLicense("GPL-3.0")).toBe("weak_copyleft");
    expect(classifyLicense("LGPL-2.1")).toBe("weak_copyleft");
    expect(classifyLicense("MPL-2.0")).toBe("weak_copyleft");
    expect(classifyLicense("AGPL-3.0")).toBe("strong_copyleft");
    expect(classifyLicense("AGPL-3.0-or-later")).toBe("strong_copyleft");
    expect(classifyLicense("SSPL-1.0")).toBe("strong_copyleft");
    expect(classifyLicense("BUSL-1.1")).toBe("strong_copyleft");
  });

  it("returns unknown for empty / UNKNOWN license strings", () => {
    expect(classifyLicense("")).toBe("unknown");
    expect(classifyLicense("   ")).toBe("unknown");
    expect(classifyLicense("UNKNOWN")).toBe("unknown");
    expect(classifyLicense("unknown")).toBe("unknown");
  });

  it("takes the worst band in a compound SPDX expression", () => {
    // `MIT OR GPL-3.0` — permissive alternative exists but a founder
    // must see the worst-case exposure.
    expect(classifyLicense("MIT OR GPL-3.0")).toBe("weak_copyleft");
    expect(classifyLicense("(MIT OR AGPL-3.0)")).toBe("strong_copyleft");
    expect(classifyLicense("Apache-2.0 WITH LLVM-exception")).toBe("permissive");
    expect(classifyLicense("MIT AND BSD-3-Clause")).toBe("permissive");
  });

  it("falls through to 'other' for recognised-but-uncategorised licenses", () => {
    expect(classifyLicense("SEE-LICENSE-IN-README")).toBe("other");
    expect(classifyLicense("Custom-Commercial")).toBe("other");
  });
});

describe("classifySbomLicenseRisk", () => {
  it("counts runtime + dev separately and lists runtime-risky entries", () => {
    const sbom = buildSbom(FIXTURE, () => new Date("2026-07-25T10:00:00Z"));
    const report = classifySbomLicenseRisk(sbom);

    expect(report.root_name).toBe("risk-fixture");
    expect(report.root_version).toBe("1.0.0");
    expect(report.generated_at).toBe("2026-07-25T10:00:00.000Z");

    expect(report.counts_runtime).toEqual({
      strong_copyleft: 2, // agpl + sspl
      weak_copyleft: 4, // gpl + lgpl + mpl + compound-worst-wins
      unknown: 1, // no-license
      permissive: 3, // mit + apache + bsd
      other: 1, // SEE-LICENSE-IN-README
    });
    // Only dev-only-gpl is a devDependency
    expect(report.counts_dev).toEqual({
      strong_copyleft: 0,
      weak_copyleft: 1,
      unknown: 0,
      permissive: 0,
      other: 0,
    });

    const riskyKeys = report.runtime_risky.map(
      (e) => `${e.name}@${e.version}:${e.band}`,
    );
    // Sorted band-desc: strong_copyleft > unknown > weak_copyleft. Within band, name-asc.
    expect(riskyKeys).toEqual([
      "strong-agpl@3.0.0:strong_copyleft",
      "strong-sspl@1.0.0:strong_copyleft",
      "no-license@0.1.0:unknown",
      "compound-worst-wins@1.2.3:weak_copyleft",
      "weak-gpl@1.0.0:weak_copyleft",
      "weak-lgpl@2.1.0:weak_copyleft",
      "weak-mpl@2.0.0:weak_copyleft",
    ]);
    // dev-only entry never appears in runtime_risky even though its band is weak_copyleft
    expect(report.runtime_risky.every((e) => !e.dev)).toBe(true);
  });

  it("returns zeroed counts and empty risky[] for an empty SBOM", () => {
    const sbom = buildSbom({}, () => new Date("2026-07-25T10:00:00Z"));
    const report = classifySbomLicenseRisk(sbom);
    expect(report.counts_runtime).toEqual({
      strong_copyleft: 0,
      weak_copyleft: 0,
      unknown: 0,
      permissive: 0,
      other: 0,
    });
    expect(report.counts_dev).toEqual(report.counts_runtime);
    expect(report.runtime_risky).toEqual([]);
  });

  it("always inlines the LICENSE_RISK_DISCLAIMER", () => {
    const sbom = buildSbom(FIXTURE);
    const report = classifySbomLicenseRisk(sbom);
    expect(report.disclaimer).toBe(LICENSE_RISK_DISCLAIMER);
    expect(LICENSE_RISK_DISCLAIMER).toMatch(/not a legal opinion/i);
    expect(LICENSE_RISK_DISCLAIMER).toMatch(/AGPL|SSPL|GPL/);
  });
});
