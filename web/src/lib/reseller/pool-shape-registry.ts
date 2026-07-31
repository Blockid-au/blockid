// Weekly digest pool-shape surface REGISTRY (P11.227).
//
// Single canonical source for every P11 pool-shape metric wired into
// the reseller weekly digest. Each entry names the metric slug, the
// underlying pool-shape AXIS (DISPERSION, ASYMMETRY, TAIL_WEIGHT, or
// CONCENTRATION), and pins the on-disk pure-lib module path plus the
// cron-route import path so a future edit that adds or removes a
// pool-shape surface without keeping the trio in lockstep is caught
// by the accompanying vitest coverage suite.
//
// The registry is intentionally the ONLY place that enumerates the
// pool-shape family — the coverage test walks the registry against
// the filesystem (module + test file both exist) and against the
// cron-route imports (route imports the module and only registered
// modules are imported). This is the P11 sibling of the P10
// feature-gates.manifest.test.ts completeness suite for /api/reseller
// gated routes: registry-first coverage that surfaces drift the
// moment it is introduced rather than waiting for a downstream
// symptom.
//
// AXIS taxonomy (matches the docblocks on the underlying pure-lib
// modules — each classification is derivable from that source of
// truth, so the registry serves as a compact index rather than a
// competing schema):
//   DISPERSION      — reads the SPREAD of the pool (uniform vs
//                     concentrated) via a scale/range/deviation
//                     read on the entire pool or interior hinges.
//   ASYMMETRY       — reads the LEAN of the pool (right/left of
//                     centre) via a third-moment or hinge-gap read.
//   TAIL_WEIGHT     — reads the TAIL SHAPE of the pool (heavy vs
//                     light) via a fourth-moment or extreme-hinge
//                     read.
//   CONCENTRATION   — reads WHERE THE MASS SITS (top-heavy vs
//                     bottom-heavy vs middle-heavy) via a share,
//                     ratio, index, or entropy read.

export type PoolShapeAxis =
  | "DISPERSION"
  | "ASYMMETRY"
  | "TAIL_WEIGHT"
  | "CONCENTRATION";

export interface PoolShapeSurface {
  readonly slug: string;
  readonly axis: PoolShapeAxis;
}

// Ordered by the sequence the cron route imports the modules (see
// web/src/app/api/cron/reseller-weekly-digest/route.ts around L400
// where the digest-snapshot-per-transition-magnitude-top3-pool-*
// import block starts). Preserving import order keeps the registry
// legible as a straight-line reading of the cron surface.
export const POOL_SHAPE_SURFACES: readonly PoolShapeSurface[] = [
  { slug: "hhi", axis: "CONCENTRATION" },
  { slug: "gini", axis: "CONCENTRATION" },
  { slug: "theil", axis: "CONCENTRATION" },
  { slug: "atkinson", axis: "CONCENTRATION" },
  { slug: "cv", axis: "DISPERSION" },
  { slug: "normalized-entropy", axis: "CONCENTRATION" },
  { slug: "top1-share", axis: "CONCENTRATION" },
  { slug: "top2-share", axis: "CONCENTRATION" },
  { slug: "bottom1-share", axis: "CONCENTRATION" },
  { slug: "range", axis: "DISPERSION" },
  { slug: "bottom2-share", axis: "CONCENTRATION" },
  { slug: "top1-bottom1-ratio", axis: "CONCENTRATION" },
  { slug: "top2-bottom2-ratio", axis: "CONCENTRATION" },
  { slug: "mid-mass-share", axis: "CONCENTRATION" },
  { slug: "top1-bottom2-ratio", axis: "CONCENTRATION" },
  { slug: "top2-bottom1-ratio", axis: "CONCENTRATION" },
  { slug: "median-mean-ratio", axis: "CONCENTRATION" },
  { slug: "mean-median-absolute-gap", axis: "DISPERSION" },
  { slug: "mean-absolute-deviation", axis: "DISPERSION" },
  { slug: "median-absolute-deviation", axis: "DISPERSION" },
  { slug: "skewness", axis: "ASYMMETRY" },
  { slug: "excess-kurtosis", axis: "TAIL_WEIGHT" },
  { slug: "iqr", axis: "DISPERSION" },
  { slug: "iqr-ratio", axis: "DISPERSION" },
  { slug: "qcd", axis: "DISPERSION" },
  { slug: "coefficient-of-range", axis: "DISPERSION" },
  { slug: "bowley-skewness", axis: "ASYMMETRY" },
  { slug: "moors-kurtosis", axis: "TAIL_WEIGHT" },
  { slug: "crow-siddiqui-kurtosis", axis: "TAIL_WEIGHT" },
  { slug: "l-skewness", axis: "ASYMMETRY" },
  { slug: "l-kurtosis", axis: "TAIL_WEIGHT" },
  { slug: "l-cv", axis: "DISPERSION" },
  { slug: "kelly-skewness", axis: "ASYMMETRY" },
  { slug: "palma", axis: "CONCENTRATION" },
  { slug: "hoover", axis: "CONCENTRATION" },
  { slug: "rosenbluth", axis: "CONCENTRATION" },
  { slug: "studentized-range", axis: "DISPERSION" },
  { slug: "gini-mean-difference", axis: "DISPERSION" },
  { slug: "peak-to-median", axis: "DISPERSION" },
  { slug: "peak-to-q1", axis: "DISPERSION" },
  { slug: "peak-to-q3", axis: "DISPERSION" },
  { slug: "peak-to-mean", axis: "DISPERSION" },
  { slug: "peak-to-geomean", axis: "DISPERSION" },
  { slug: "peak-to-harmean", axis: "DISPERSION" },
  { slug: "peak-to-rms", axis: "DISPERSION" },
];

export const POOL_SHAPE_MODULE_PREFIX =
  "digest-snapshot-per-transition-magnitude-top3-pool-";

export function modulePathForSlug(slug: string): string {
  return `web/src/lib/reseller/${POOL_SHAPE_MODULE_PREFIX}${slug}.ts`;
}

export function testPathForSlug(slug: string): string {
  return `web/src/lib/reseller/${POOL_SHAPE_MODULE_PREFIX}${slug}.test.ts`;
}

export function cronImportSpecifierForSlug(slug: string): string {
  return `@/lib/reseller/${POOL_SHAPE_MODULE_PREFIX}${slug}`;
}

export function surfacesByAxis(
  axis: PoolShapeAxis,
): readonly PoolShapeSurface[] {
  return POOL_SHAPE_SURFACES.filter((s) => s.axis === axis);
}

export function axisCounts(): Record<PoolShapeAxis, number> {
  const counts: Record<PoolShapeAxis, number> = {
    DISPERSION: 0,
    ASYMMETRY: 0,
    TAIL_WEIGHT: 0,
    CONCENTRATION: 0,
  };
  for (const s of POOL_SHAPE_SURFACES) counts[s.axis] += 1;
  return counts;
}
