// Barrel exports for the digest-snapshots registry module (P1).
//
// ADDITIVE only — importing from this barrel is safe; the legacy
// `digest-snapshot-per-*.ts` stubs remain untouched and their
// consumers (weekly-digest cron, admin dashboards, reseller emails)
// keep resolving to the existing files. P2 migrates the stubs to
// 1-line re-exports of `getSnapshotBySlug(slug)`.

export {
  computeSnapshot,
  computeSnapshots,
  extractValues,
  type MetricFn,
  type SnapshotInputRow,
  type SnapshotRow,
} from "./compute";

export {
  DIGEST_SNAPSHOT_REGISTRY,
  REGISTRY_DIMENSIONS,
  REGISTRY_KINDS,
  getSnapshotBySlug,
  getSnapshotsByDimension,
  getSnapshotsByKind,
  type DigestSnapshotRegistryEntry,
  type RegistryDimension,
  type RegistryKind,
} from "./registry";

export * as moment from "./metrics/moment";
export * as percentile from "./metrics/percentile";
export * as dispersion from "./metrics/dispersion";
export * as streak from "./metrics/streak";
