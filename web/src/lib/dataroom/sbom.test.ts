import { describe, expect, it } from "vitest";
import { SBOM_DISCLAIMER, buildSbom } from "./sbom";

const FIXTURE = {
  name: "fixture-app",
  version: "1.2.3",
  lockfileVersion: 3,
  packages: {
    "": {
      name: "fixture-app",
      version: "1.2.3",
      dependencies: { alpha: "^1.0.0" },
    },
    "node_modules/alpha": {
      version: "1.0.0",
      license: "MIT",
      resolved: "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
    },
    "node_modules/@scope/bravo": {
      version: "2.4.1",
      license: { type: "Apache-2.0" },
      resolved: "https://registry.npmjs.org/@scope/bravo/-/bravo-2.4.1.tgz",
    },
    "node_modules/charlie": {
      version: "3.0.0",
      // no license field — should degrade to UNKNOWN
      resolved: "https://registry.npmjs.org/charlie/-/charlie-3.0.0.tgz",
      dev: true,
    },
    "node_modules/delta": {
      version: "0.9.0",
      licenses: [{ type: "MIT" }, { type: "Apache-2.0" }],
      resolved: "https://registry.npmjs.org/delta/-/delta-0.9.0.tgz",
    },
    "node_modules/alpha/node_modules/echo": {
      version: "1.1.0",
      license: "MIT",
      resolved: "https://registry.npmjs.org/echo/-/echo-1.1.0.tgz",
    },
    // duplicate of alpha@1.0.0 nested under bravo — must de-dupe
    "node_modules/@scope/bravo/node_modules/alpha": {
      version: "1.0.0",
      license: "MIT",
      resolved: "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
    },
  },
};

describe("buildSbom", () => {
  it("returns one entry per (name, version) with lockfile metadata", () => {
    const sbom = buildSbom(FIXTURE, () => new Date("2026-07-25T10:00:00Z"));
    expect(sbom.root_name).toBe("fixture-app");
    expect(sbom.root_version).toBe("1.2.3");
    expect(sbom.lockfile_version).toBe(3);
    expect(sbom.generated_at).toBe("2026-07-25T10:00:00.000Z");
    const names = sbom.entries.map((e) => `${e.name}@${e.version}`);
    expect(names).toEqual([
      "@scope/bravo@2.4.1",
      "alpha@1.0.0",
      "charlie@3.0.0",
      "delta@0.9.0",
      "echo@1.1.0",
    ]);
  });

  it("normalises license shapes (string, object, array)", () => {
    const sbom = buildSbom(FIXTURE);
    const byName = Object.fromEntries(
      sbom.entries.map((e) => [e.name, e.license]),
    );
    expect(byName["alpha"]).toBe("MIT");
    expect(byName["@scope/bravo"]).toBe("Apache-2.0");
    expect(byName["delta"]).toBe("MIT OR Apache-2.0");
    expect(byName["charlie"]).toBe("UNKNOWN");
  });

  it("flags dev-only packages and counts unknown licenses in the summary", () => {
    const sbom = buildSbom(FIXTURE);
    expect(sbom.summary.total).toBe(5);
    expect(sbom.summary.dev).toBe(1);
    expect(sbom.summary.runtime).toBe(4);
    expect(sbom.summary.unknown_license).toBe(1);
    const licenseMap = Object.fromEntries(
      sbom.summary.by_license.map((row) => [row.license, row.count]),
    );
    expect(licenseMap["MIT"]).toBe(2);
    expect(licenseMap["Apache-2.0"]).toBe(1);
    expect(licenseMap["MIT OR Apache-2.0"]).toBe(1);
    expect(licenseMap["UNKNOWN"]).toBe(1);
    // by_license is sorted by count desc
    expect(sbom.summary.by_license[0].license).toBe("MIT");
  });

  it("tolerates missing/empty lockfiles without throwing", () => {
    const empty = buildSbom({});
    expect(empty.summary.total).toBe(0);
    expect(empty.entries).toEqual([]);
    expect(empty.root_name).toBe("unknown");
    expect(empty.root_version).toBe("0.0.0");
    expect(empty.lockfile_version).toBe(0);
    expect(buildSbom(null).entries).toEqual([]);
    expect(buildSbom(undefined).entries).toEqual([]);
  });

  it("always includes the AFSL-neutral SBOM disclaimer", () => {
    const sbom = buildSbom(FIXTURE);
    expect(sbom.disclaimer).toBe(SBOM_DISCLAIMER);
    expect(SBOM_DISCLAIMER).toMatch(/not a legal opinion/i);
    expect(SBOM_DISCLAIMER).toMatch(/AGPL|GPL|SSPL/);
  });
});
