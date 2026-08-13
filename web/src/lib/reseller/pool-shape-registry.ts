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
  { slug: "peak-to-midhinge", axis: "DISPERSION" },
  { slug: "peak-to-trimean", axis: "DISPERSION" },
  { slug: "peak-to-quartile-mean", axis: "DISPERSION" },
  { slug: "peak-to-cubic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quartic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-sextic-mean", axis: "DISPERSION" },
  { slug: "peak-to-septic-mean", axis: "DISPERSION" },
  { slug: "peak-to-octic-mean", axis: "DISPERSION" },
  { slug: "peak-to-nonic-mean", axis: "DISPERSION" },
  { slug: "peak-to-decic-mean", axis: "DISPERSION" },
  { slug: "peak-to-undecic-mean", axis: "DISPERSION" },
  { slug: "peak-to-duodecic-mean", axis: "DISPERSION" },
  { slug: "peak-to-tredecic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quattuordecic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quindecic-mean", axis: "DISPERSION" },
  { slug: "peak-to-sedecic-mean", axis: "DISPERSION" },
  { slug: "peak-to-septendecic-mean", axis: "DISPERSION" },
  { slug: "peak-to-octodecic-mean", axis: "DISPERSION" },
  { slug: "peak-to-novemdecic-mean", axis: "DISPERSION" },
  { slug: "peak-to-vigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-unvigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-duovigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-tresvigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quattuorvigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quinvigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-sesvigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-septemvigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-octovigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-novemvigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-trigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-untrigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-duotrigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-tretrigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-tetratrigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-pentatrigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-hexatrigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-heptatrigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-octatrigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-novemtrigintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quadragintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-unquadragintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-duoquadragintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-tresquadragintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quattuorquadragintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quinquaquadragintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-sexquadragintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-septquadragintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-octoquadragintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-nonquadragintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quinquagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-unquinquagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-duoquinquagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-tresquinquagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quattuorquinquagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quinquequinquagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-sesquinquagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-septemquinquagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-octoquinquagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-novemquinquagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-sexagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-unsexagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-duosexagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-tresexagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quattuorsexagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quinquasexagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-sesexagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-septensexagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-octosexagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-novemsexagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-septuagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-unseptuagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-duoseptuagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-treseptuagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quattuorseptuagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quinquaseptuagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-seseptuagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-septenseptuagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-octoseptuagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-novenseptuagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-octogintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-unoctogintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-duooctogintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-tresoctogintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quattuoroctogintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quinquoctogintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-sexoctogintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-septoctogintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-octoctogintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-novemoctogintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-nonagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-unnonagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-duononagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-tresnonagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quattuornonagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quinquonagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-sexnonagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-septennonagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-octononagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-novenonagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-centinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-uncentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-ducentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-trecentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quattuorcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quincentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-sexcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-septcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-octocentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-novecentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-decicentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-undecicentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-duodecicentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-tredecicentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quattuordecicentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quindecicentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-sedecicentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-septdecicentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-octodecicentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-novedecicentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-vigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-unvigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-duovigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-trevigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quattuorvigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quinvigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-sesvigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-septvigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-octvigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-novemvigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-trigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-untrigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-duotrigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-tretrigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quattuortrigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quintrigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-sestrigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-septtrigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-octotrigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-novemtrigintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quadragintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-unquadragintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-duoquadragintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-trequadragintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quattuorquadragintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quinquadragintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-sesquadragintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-septquadragintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-octoquadragintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-novemquadragintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quinquagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-unquinquagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-duoquinquagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-trequinquagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quattuorquinquagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quinquinquagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-sesquinquagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-septquinquagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-octoquinquagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-novemquinquagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-sexagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-unsexagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-duosexagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-tresexagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quattuorsexagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quinsexagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-sexsexagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-septsexagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-octosexagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-novemsexagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-septuagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-unseptuagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-duoseptuagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-treseptuagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quattuorseptuagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-quinseptuagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-sexseptuagintcentinagintic-mean", axis: "DISPERSION" },
  { slug: "peak-to-septseptuagintcentinagintic-mean", axis: "DISPERSION" },
];

export const POOL_SHAPE_MODULE_PREFIX =
  "digest-snapshot-per-modules/digest-snapshot-per-transition-magnitude-top3-pool-";

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
