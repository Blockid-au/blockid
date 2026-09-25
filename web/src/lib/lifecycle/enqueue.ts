// G34-BT4 — putting lifecycle rows on the one engine (`email_drips`).
//
//   * `insertLifecycleDrips` — de-duped insert shared by the scan cron: a row
//     for the same (email, campaign) inside the flow's dedupe window, in ANY
//     status, blocks a repeat (a cancelled or expired touch still counts, so
//     "stop after 2" holds even when a touch was dropped by the cap).
//   * `enqueueScoreUpdated` — EM12, called when a re-score finishes. One
//     pending row per (address, project): a second re-score before the
//     worker's next tick folds into the pending row (first "before", latest
//     "after", merged dimension moves), so five evidence uploads in an
//     afternoon are one e-mail, not five.
//   * the pure diff (`dimensionChanges`, `mergeScoreUpdate`) lives in
//     ./score-diff so non-server-only callers can compute it.
//
// Until pending-authority/0466 widens the `email_drips.campaign` CHECK every
// insert here is rejected by the database; that is logged and reported as
// `error`, never thrown into the caller's request.

import "server-only";
import { isExcludedAccountEmail } from "@/lib/traction/snapshot";
import type { LifecycleCampaign } from "./campaigns";
import type { DimensionChange, LifecyclePayload, ScoreUpdatedData } from "./payload";
import { mergeScoreUpdate } from "./score-diff";
import { lifecycleMode, type LifecycleMode } from "./mode";

export { dimensionChanges, mergeScoreUpdate } from "./score-diff";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type LifecycleDb = { from(table: string): any };

const DAY_MS = 86_400_000;

export interface LifecycleRow {
  email: string;
  user_id: string | null;
  campaign: LifecycleCampaign;
  scheduled_for: string;
  payload: {
    lifecycle: LifecyclePayload;
    project_id?: string | null;
    startup?: string | null;
    unsubscribe_token?: string | null;
  };
}

export type InsertResult = "queued" | "duplicate" | "skipped" | "error";

/** Same tombstone domain lib/email-core.ts refuses (kept local: no transport import here). */
const ERASED_DOMAIN = "erased.blockid.au";

export function normaliseRecipient(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  if (!e || !e.includes("@")) return null;
  const domain = e.slice(e.lastIndexOf("@") + 1);
  if (domain === ERASED_DOMAIN || domain.endsWith(`.${ERASED_DOMAIN}`)) return null;
  if (isExcludedAccountEmail(e)) return null;
  return e;
}

/**
 * Insert rows unless a row of the same (email, campaign) exists inside
 * `dedupeDays` (any status). All rows of one call are one flow instance:
 * when the FIRST row is a duplicate the whole set is skipped.
 */
export async function insertLifecycleDrips(
  db: LifecycleDb,
  rows: LifecycleRow[],
  opts: { dedupeDays: number; now?: Date; dedupeKey?: { path: string; value: string } },
): Promise<InsertResult> {
  if (rows.length === 0) return "skipped";
  const first = rows[0];
  const email = normaliseRecipient(first.email);
  if (!email) return "skipped";
  const now = opts.now ?? new Date();
  try {
    let q = db
      .from("email_drips")
      .select("id")
      .eq("email", email)
      .eq("campaign", first.campaign)
      .gt("created_at", new Date(now.getTime() - opts.dedupeDays * DAY_MS).toISOString());
    if (opts.dedupeKey) q = q.eq(opts.dedupeKey.path, opts.dedupeKey.value);
    const { data, error } = await q.limit(1);
    if (error) {
      console.warn("[lifecycle] dedupe lookup failed", error.message ?? error);
      return "error";
    }
    if (Array.isArray(data) && data.length > 0) return "duplicate";
    const { error: insErr } = await db.from("email_drips").insert(rows.map((r) => ({ ...r, email })));
    if (insErr) {
      console.warn("[lifecycle] insert failed (is pending-authority/0466 applied?)", insErr.message ?? insErr);
      return "error";
    }
    return "queued";
  } catch (err) {
    console.warn("[lifecycle] insert threw", err instanceof Error ? err.message : err);
    return "error";
  }
}

// ── EM12 ─────────────────────────────────────────────────────────────────────

export interface ScoreUpdatedInput {
  email: string;
  userId: string | null;
  projectId: string | null;
  startup?: string | null;
  previousSvi: number;
  newSvi: number;
  changes: DimensionChange[];
  source: ScoreUpdatedData["source"];
  now?: Date;
  /** Rollout switch (lib/lifecycle/mode.ts); defaults to LIFECYCLE_EMAIL. */
  mode?: LifecycleMode;
}

export type ScoreUpdatedResult = "queued" | "merged" | "unchanged" | "skipped" | "dry" | "error";

/**
 * EM12 — queue (or fold into the pending) "score updated" mail. T-class:
 * due immediately, the hourly worker sends it. Nothing is queued when
 * neither the total nor any dimension moved.
 */
export async function enqueueScoreUpdated(db: LifecycleDb | null, input: ScoreUpdatedInput): Promise<ScoreUpdatedResult> {
  const mode = input.mode ?? lifecycleMode();
  if (mode === "off" || !db) return "skipped";
  const email = normaliseRecipient(input.email);
  if (!email) return "skipped";
  if (mode === "dry") {
    if (Math.round(input.previousSvi) === Math.round(input.newSvi) && input.changes.length === 0) return "unchanged";
    console.info("[lifecycle] dry score_updated", JSON.stringify({ from: Math.round(input.previousSvi), to: Math.round(input.newSvi), moved: input.changes.length }));
    return "dry";
  }
  const now = input.now ?? new Date();
  const data: ScoreUpdatedData = {
    previous_svi: Math.round(input.previousSvi),
    new_svi: Math.round(input.newSvi),
    changes: input.changes,
    source: input.source,
    scored_at: now.toISOString(),
  };
  try {
    let q = db
      .from("email_drips")
      .select("id, payload")
      .eq("email", email)
      .eq("campaign", "score_updated")
      .eq("status", "pending")
      .is("sent_at", null);
    q = input.projectId ? q.eq("payload->>project_id", input.projectId) : q;
    const { data: pending, error } = await q.limit(1);
    if (error) {
      console.warn("[lifecycle] score_updated lookup failed", error.message ?? error);
      return "error";
    }
    const row = Array.isArray(pending) ? (pending[0] as { id: string; payload?: LifecycleRow["payload"] } | undefined) : undefined;
    if (row) {
      const merged = mergeScoreUpdate(row.payload?.lifecycle?.score, data);
      // The score went back to where it started: nothing to report any more.
      const netZero = merged.previous_svi === merged.new_svi && merged.changes.length === 0;
      const { error: upErr } = await db
        .from("email_drips")
        .update(
          netZero
            ? { status: "cancelled", last_error: "score_updated: net change zero after merge" }
            : { payload: { ...(row.payload ?? {}), lifecycle: { ...(row.payload?.lifecycle ?? {}), score: merged } } },
        )
        .eq("id", row.id)
        .eq("status", "pending")
        .is("sent_at", null);
      if (upErr) {
        console.warn("[lifecycle] score_updated merge failed", upErr.message ?? upErr);
        return "error";
      }
      return "merged";
    }
    if (data.previous_svi === data.new_svi && data.changes.length === 0) return "unchanged";
    const { error: insErr } = await db.from("email_drips").insert({
      email,
      user_id: input.userId,
      campaign: "score_updated",
      scheduled_for: now.toISOString(),
      payload: { lifecycle: { score: data }, project_id: input.projectId, startup: input.startup ?? null },
    });
    if (insErr) {
      console.warn("[lifecycle] score_updated insert failed (is pending-authority/0466 applied?)", insErr.message ?? insErr);
      return "error";
    }
    return "queued";
  } catch (err) {
    console.warn("[lifecycle] score_updated threw", err instanceof Error ? err.message : err);
    return "error";
  }
}
