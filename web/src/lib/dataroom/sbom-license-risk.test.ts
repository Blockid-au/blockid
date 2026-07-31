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
    "node_modules/dual-or-licensed": {
      version: "1.2.3",
      license: "MIT OR GPL-3.0", // OR = licensee's choice → permissive
    },
    "node_modules/stacked-and-licensed": {
      version: "4.0.0",
      license: "Apache-2.0 AND LGPL-3.0-or-later", // AND stacks → weak_copyleft
    },
    "node_modules/prop-unlicensed": { version: "1.0.0", license: "UNLICENSED" },
    "node_modules/prop-see-license": {
      version: "1.0.0",
      license: "SEE LICENSE IN LICENSE.md",
    },
    "node_modules/other-cc-by": { version: "1.0.0", license: "CC-BY-4.0" },
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

  it("takes the least restrictive alternative across an SPDX OR", () => {
    // OR is the licensee's choice — taking MIT discharges the GPL branch.
    expect(classifyLicense("MIT OR GPL-3.0")).toBe("permissive");
    expect(classifyLicense("(MIT OR AGPL-3.0)")).toBe("permissive");
    expect(classifyLicense("(MIT OR GPL-3.0-or-later)")).toBe("permissive");
    expect(classifyLicense("AGPL-3.0 OR GPL-3.0")).toBe("weak_copyleft");
  });

  it("takes the worst conjunct across an SPDX AND", () => {
    expect(classifyLicense("MIT AND BSD-3-Clause")).toBe("permissive");
    expect(classifyLicense("Apache-2.0 AND LGPL-3.0-or-later")).toBe("weak_copyleft");
    expect(classifyLicense("Apache-2.0 AND LGPL-3.0-or-later AND MIT")).toBe(
      "weak_copyleft",
    );
    expect(classifyLicense("(MIT AND Zlib)")).toBe("permissive");
  });

  it("strips WITH-exception clauses without switching bands", () => {
    expect(classifyLicense("Apache-2.0 WITH LLVM-exception")).toBe("permissive");
    expect(classifyLicense("GPL-2.0 WITH Classpath-exception-2.0")).toBe(
      "weak_copyleft",
    );
  });

  it("bands proprietary and unverifiable license strings as proprietary", () => {
    expect(classifyLicense("UNLICENSED")).toBe("proprietary");
    expect(classifyLicense("SEE LICENSE IN LICENSE.md")).toBe("proprietary");
    expect(classifyLicense("SEE-LICENSE-IN-README")).toBe("proprietary");
    expect(classifyLicense("LicenseRef-Remotion")).toBe("proprietary");
    // Free-form prose is not an SPDX identifier — nothing here is verifiable.
    expect(classifyLicense("Remotion License https://remotion.dev/license")).toBe(
      "proprietary",
    );
  });

  it("falls through to 'other' for recognised-but-uncategorised SPDX ids", () => {
    expect(classifyLicense("CC-BY-4.0")).toBe("other");
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
      proprietary: 2, // UNLICENSED + SEE LICENSE IN
      weak_copyleft: 4, // gpl + lgpl + mpl + stacked-and-licensed
      unknown: 1, // no-license
      permissive: 4, // mit + apache + bsd + dual-or-licensed
      other: 1, // CC-BY-4.0
    });
    // Only dev-only-gpl is a devDependency
    expect(report.counts_dev).toEqual({
      strong_copyleft: 0,
      proprietary: 0,
      weak_copyleft: 1,
      unknown: 0,
      permissive: 0,
      other: 0,
    });

    const riskyKeys = report.runtime_risky.map(
      (e) => `${e.name}@${e.version}:${e.band}`,
    );
    // Sorted band-desc: strong_copyleft > proprietary > unknown > weak_copyleft. Within band, name-asc.
    expect(riskyKeys).toEqual([
      "strong-agpl@3.0.0:strong_copyleft",
      "strong-sspl@1.0.0:strong_copyleft",
      "prop-see-license@1.0.0:proprietary",
      "prop-unlicensed@1.0.0:proprietary",
      "no-license@0.1.0:unknown",
      "stacked-and-licensed@4.0.0:weak_copyleft",
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
      proprietary: 0,
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
