// Trajectory loader (G21 P3-A) — the three reads behind
// components/svi/TrajectoryTimeline.tsx, fail-soft per table so a missing
// 0417 / 0427 table renders as "no evidence records" / "no outcomes", never
// an error page. Pure shaping lives in ./trajectory.ts.

import "server-only";
import { buildTrajectory, type Trajectory, type TrajectoryEvidenceInput, type TrajectoryOutcomeInput, type TrajectorySnapshotInput } from "./trajectory";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TrajectoryDb = { from(table: string): any };

export const TRAJECTORY_SNAPSHOT_LIMIT = 400;

export async function loadTrajectory(db: TrajectoryDb | null, projectId: string, opts: { verificationLevel?: string | null; now?: Date } = {}): Promise<Trajectory> {
  const empty = buildTrajectory({ snapshots: [], evidenceRecords: [], outcomes: [], verificationLevel: opts.verificationLevel ?? null, now: opts.now });
  if (!db) return empty;
  const safe = async <T,>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      console.warn(`[blockid:trajectory] ${label}`, err instanceof Error ? err.message : String(err));
      return fallback;
    }
  };
  const [snapshots, evidenceRecords, outcomes, level] = await Promise.all([
    safe(
      "svi_snapshots",
      async () => {
        const { data, error } = await db.from("svi_snapshots").select("snapshot_date, svi_total, evidence_confidence, stage").eq("project_id", projectId).order("snapshot_date", { ascending: true }).limit(TRAJECTORY_SNAPSHOT_LIMIT);
        if (error) throw new Error(error.message ?? "query failed");
        return (data ?? []) as TrajectorySnapshotInput[];
      },
      [] as TrajectorySnapshotInput[],
    ),
    safe(
      "evidence_records",
      async () => {
        const { data, error } = await db.from("evidence_records").select("evidence_type, submitted_at, status").eq("project_id", projectId).order("submitted_at", { ascending: true }).limit(2000);
        if (error) throw new Error(error.message ?? "query failed");
        return (data ?? []) as TrajectoryEvidenceInput[];
      },
      [] as TrajectoryEvidenceInput[],
    ),
    safe(
      "startup_outcomes",
      async () => {
        const { data, error } = await db.from("startup_outcomes").select("id, kind, observed_at, value, source, status").eq("project_id", projectId).eq("status", "confirmed").order("observed_at", { ascending: true }).limit(200);
        if (error) throw new Error(error.message ?? "query failed");
        return (data ?? []) as TrajectoryOutcomeInput[];
      },
      [] as TrajectoryOutcomeInput[],
    ),
    opts.verificationLevel !== undefined
      ? Promise.resolve(opts.verificationLevel)
      : safe(
          "projects.verification_level",
          async () => {
            const { data } = await db.from("projects").select("verification_level").eq("id", projectId).maybeSingle();
            return ((data as { verification_level?: string | null } | null)?.verification_level ?? null) as string | null;
          },
          null as string | null,
        ),
  ]);
  return buildTrajectory({ snapshots, evidenceRecords, outcomes, verificationLevel: level, now: opts.now });
}
