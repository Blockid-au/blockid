import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  POOL_SHAPE_SURFACES,
  POOL_SHAPE_MODULE_PREFIX,
  modulePathForSlug,
  testPathForSlug,
  cronImportSpecifierForSlug,
  surfacesByAxis,
  axisCounts,
  type PoolShapeAxis,
} from "./pool-shape-registry";

// Repo-root anchor. Vitest runs from web/ so process.cwd() is web/;
// modulePathForSlug returns web/-prefixed paths, so join against the
// parent of cwd to reach the actual file.
const REPO_ROOT = resolve(process.cwd(), "..");

function repoAbs(relPath: string): string {
  return resolve(REPO_ROOT, relPath);
}

const CRON_ROUTE_ABS = repoAbs(
  "web/src/app/api/cron/reseller-weekly-digest/route.ts",
);

const CRON_ROUTE_SOURCE: string = readFileSync(CRON_ROUTE_ABS, "utf8");

describe("pool-shape registry — shape", () => {
  it("registers sixty pool-shape surfaces (matches on-disk file count)", () => {
    expect(POOL_SHAPE_SURFACES.length).toBe(60);
  });

  it("emits no duplicate slugs", () => {
    const slugs = POOL_SHAPE_SURFACES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("uses kebab-case slugs (lowercase + digits + hyphen only)", () => {
    for (const s of POOL_SHAPE_SURFACES) {
      expect(s.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("classifies every surface into one of the four canonical axes", () => {
    const allowed = new Set<PoolShapeAxis>([
      "DISPERSION",
      "ASYMMETRY",
      "TAIL_WEIGHT",
      "CONCENTRATION",
    ]);
    for (const s of POOL_SHAPE_SURFACES) {
      expect(allowed.has(s.axis)).toBe(true);
    }
  });
});

describe("pool-shape registry — path helpers", () => {
  it("modulePathForSlug produces the P11 pool-shape convention", () => {
    expect(modulePathForSlug("hhi")).toBe(
      `web/src/lib/reseller/${POOL_SHAPE_MODULE_PREFIX}hhi.ts`,
    );
  });

  it("testPathForSlug produces the sibling test path", () => {
    expect(testPathForSlug("gini")).toBe(
      `web/src/lib/reseller/${POOL_SHAPE_MODULE_PREFIX}gini.test.ts`,
    );
  });

  it("cronImportSpecifierForSlug uses the @/lib alias", () => {
    expect(cronImportSpecifierForSlug("l-cv")).toBe(
      `@/lib/reseller/${POOL_SHAPE_MODULE_PREFIX}l-cv`,
    );
  });
});

describe("pool-shape registry — filesystem coverage", () => {
  it("every registered surface has a pure-lib file on disk", () => {
    for (const s of POOL_SHAPE_SURFACES) {
      const abs = repoAbs(modulePathForSlug(s.slug));
      expect(existsSync(abs), `missing module: ${s.slug}`).toBe(true);
    }
  });

  it("every registered surface has a vitest sibling test file on disk", () => {
    for (const s of POOL_SHAPE_SURFACES) {
      const abs = repoAbs(testPathForSlug(s.slug));
      expect(existsSync(abs), `missing test: ${s.slug}`).toBe(true);
    }
  });
});

describe("pool-shape registry — cron-route parity", () => {
  it("every registered surface is imported by the weekly digest cron", () => {
    for (const s of POOL_SHAPE_SURFACES) {
      const spec = cronImportSpecifierForSlug(s.slug);
      expect(
        CRON_ROUTE_SOURCE.includes(spec),
        `cron route missing import: ${spec}`,
      ).toBe(true);
    }
  });

  it("the cron route imports exactly the registered surface set (no orphan imports)", () => {
    const importRegex = new RegExp(
      `@/lib/reseller/${POOL_SHAPE_MODULE_PREFIX}([a-z0-9-]+)`,
      "g",
    );
    const importedSlugs = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = importRegex.exec(CRON_ROUTE_SOURCE)) !== null) {
      importedSlugs.add(m[1]);
    }
    const registeredSlugs = new Set(POOL_SHAPE_SURFACES.map((s) => s.slug));
    const orphans = Array.from(importedSlugs).filter(
      (slug) => !registeredSlugs.has(slug),
    );
    expect(orphans).toEqual([]);
  });
});

describe("pool-shape registry — axis grouping", () => {
  it("surfacesByAxis(DISPERSION) returns only DISPERSION surfaces", () => {
    const rows = surfacesByAxis("DISPERSION");
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.axis).toBe("DISPERSION");
  });

  it("axisCounts partitions the registry (sum equals total)", () => {
    const counts = axisCounts();
    const sum =
      counts.DISPERSION +
      counts.ASYMMETRY +
      counts.TAIL_WEIGHT +
      counts.CONCENTRATION;
    expect(sum).toBe(POOL_SHAPE_SURFACES.length);
  });

  it("every axis is represented at least once (family coverage lock)", () => {
    const counts = axisCounts();
    expect(counts.DISPERSION).toBeGreaterThan(0);
    expect(counts.ASYMMETRY).toBeGreaterThan(0);
    expect(counts.TAIL_WEIGHT).toBeGreaterThan(0);
    expect(counts.CONCENTRATION).toBeGreaterThan(0);
  });

  it("L-moment triple is closed on the BOUNDED codomain (l-cv, l-skewness, l-kurtosis all registered)", () => {
    const slugs = new Set(POOL_SHAPE_SURFACES.map((s) => s.slug));
    expect(slugs.has("l-cv")).toBe(true);
    expect(slugs.has("l-skewness")).toBe(true);
    expect(slugs.has("l-kurtosis")).toBe(true);
  });

  it("Fisher-Pearson triple is closed on the UNBOUNDED codomain (cv, skewness, excess-kurtosis all registered)", () => {
    const slugs = new Set(POOL_SHAPE_SURFACES.map((s) => s.slug));
    expect(slugs.has("cv")).toBe(true);
    expect(slugs.has("skewness")).toBe(true);
    expect(slugs.has("excess-kurtosis")).toBe(true);
  });
});
