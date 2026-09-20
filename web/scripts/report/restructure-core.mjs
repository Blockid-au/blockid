// G19-S47 — restructure a STORED report_v2 without a new AI run (pure core).
//
// `restructureStoredReport({ db, lib, snapshotId, force, log })`
//   1. reads `svi_snapshots.report_v2` for the snapshot,
//   2. rebuilds `executive.strengths / gaps` from the criterion cards
//      (S44 `executiveFromChapters` — the pre-S44 score restatements go),
//   3. parses `executive.thesis` into `executive.structured`
//      (`structureExecutive`; kept when a valid block already exists unless
//      `force`),
//   4. validates the whole document (`assertReportV2`) and writes it back.
//
// Idempotent: a second run with the same input changes nothing (`changed:
// false`, no write). `db` is the two-method interface below so the unit
// test can pass a fake; `lib` is the tsx-loaded src/lib surface.

/**
 * @typedef {{ readReportV2(snapshotId: string): Promise<unknown | null>; writeReportV2(snapshotId: string, report: unknown): Promise<void> }} RestructureDb
 * @typedef {{ structureExecutive: Function; executiveFromChapters: Function; hasValidExecutiveStructured: Function; assertReportV2: Function }} RestructureLib
 */

const SCORE_RESTATEMENT = /\b\d{1,3}\s*\/\s*100\b|below the (strong |developing )?band|points below|\bscores? \d{1,3}\b/i;

/** Supabase client → the two-method db. */
export function makeSupabaseRestructureDb(sb) {
  return {
    async readReportV2(snapshotId) {
      const { data, error } = await sb.from("svi_snapshots").select("id, report_v2").eq("id", snapshotId).maybeSingle();
      if (error) throw new Error(`svi_snapshots read failed: ${error.message}`);
      return data?.report_v2 ?? null;
    },
    async writeReportV2(snapshotId, report) {
      const { error } = await sb.from("svi_snapshots").update({ report_v2: report }).eq("id", snapshotId);
      if (error) throw new Error(`svi_snapshots write failed: ${error.message}`);
    },
  };
}

/** Pure: the restructured document + what changed (null when nothing changed). */
export function restructureReportV2(stored, lib, { force = false } = {}) {
  if (!stored || typeof stored !== "object") throw new Error("no report_v2 to restructure");
  const report = stored;
  const changes = [];
  const executive = { ...report.executive };

  // S44: strengths / gaps from the criterion cards — never a score restatement.
  const fromCards = lib.executiveFromChapters(report.dimensions, report.locale);
  const restated = [...(executive.strengths ?? []), ...(executive.gaps ?? [])].some((s) => SCORE_RESTATEMENT.test(s));
  if (fromCards.strengths.length && (force || restated || !executive.strengths?.length)) {
    executive.strengths = fromCards.strengths;
    changes.push("strengths");
  }
  if (fromCards.gaps.length && (force || restated || !executive.gaps?.length)) {
    executive.gaps = fromCards.gaps;
    changes.push("gaps");
  }

  // S47: the structured executive from the stored thesis (chapters / valuation / phase / plan as fallback).
  if (force || !lib.hasValidExecutiveStructured(report)) {
    executive.structured = lib.structureExecutive(executive.thesis ?? "", report.dimensions, report.valuation, executive.phaseNow, {
      locale: report.locale,
      cover: { startupName: report.cover.startupName, svi: report.cover.svi },
      actionPlan: report.actionPlan.steps,
      confidence: executive.confidence,
    });
    changes.push("structured");
  }

  if (!changes.length) return { report, changes: [], changed: false };
  const next = lib.assertReportV2({ ...report, executive });
  return { report: next, changes, changed: true };
}

export async function restructureStoredReport({ db, lib, snapshotId, force = false, dryRun = false, log = () => {} }) {
  const stored = await db.readReportV2(snapshotId);
  if (!stored) {
    log(`snapshot ${snapshotId}: no report_v2 stored — nothing to restructure`);
    return { snapshotId, found: false, changed: false, changes: [], written: false };
  }
  const { report, changes, changed } = restructureReportV2(stored, lib, { force });
  const s = report.executive.structured;
  log(`snapshot ${snapshotId}: ${changed ? `changed (${changes.join(", ")})` : "already structured — no change"}`);
  if (s) log(`  headline "${s.headline}" · ${s.summary.length} paragraphs · ${s.reasonsToBack.length} reasons · ${s.criticalGaps.length} gaps · verdict ${s.verdict.label} (${Math.round(s.verdict.confidence * 100)}%) · ${s.actions.length} actions`);
  if (changed && !dryRun) {
    await db.writeReportV2(snapshotId, report);
    log("  written back to svi_snapshots.report_v2");
  }
  return { snapshotId, found: true, changed, changes, written: changed && !dryRun, structured: s ?? null };
}
