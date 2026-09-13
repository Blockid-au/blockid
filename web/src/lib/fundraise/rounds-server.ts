// Fundraise rounds — the server half (S26-A).
//
// Everything under api/fundraise/[roundId]/** resolves the caller the same
// way: session → `projectScopeOrDeny(minRole)` (403 below the role) → the
// round row keyed on the project OWNER's id (`fundraise_rounds.account_id`
// is the owner's app_users id, never the member's) and, for rounds created
// after 0355, the active project. A stranger, a wrong project and a missing
// id all answer the same 404 — a round id is not an oracle.
//
// The totals on the round (`soft_aud` / `committed_aud` / `funded_aud`) are
// recomputed from the commitment rows after every write here (never by a
// trigger) so the list page can read them without a join.

import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AppUser } from "@/lib/auth";
import type { ProjectMemberRole, ProjectScope } from "@/lib/projects";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { compileDataRoom, findRoomForScope } from "@/lib/dataroom/generate-room";
import { grantCredits, spendCredits } from "@/lib/credits";
import {
  roundTotalsFromSummary,
  summariseCommitments,
  type CommitmentRowLike,
  type RoundSummary,
} from "./commitments";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = SupabaseClient<any, any, any>;

export interface RoundRow {
  id: string;
  account_id: string;
  project_id: string | null;
  round_name: string;
  target_amount: number | string;
  pre_money_valuation: number | string | null;
  instrument_type: string;
  status: string;
  data_room_id: string | null;
  soft_aud: number | string | null;
  committed_aud: number | string | null;
  funded_aud: number | string | null;
  activated_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface CommitmentRow extends CommitmentRowLike {
  id: string;
  round_id: string;
  account_id: string;
  investor_name: string;
  investor_email: string | null;
  investor_org: string | null;
  instrument: string;
  notes: string | null;
  access_token_id: string | null;
  committed_at: string | null;
  signed_at: string | null;
  funded_at: string | null;
  withdrawn_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const ROUND_COLUMNS =
  "id, account_id, project_id, round_name, target_amount, pre_money_valuation, instrument_type, share_price, new_shares, dilution_pct, status, data_room_id, soft_aud, committed_aud, funded_aud, activated_at, closed_at, created_at, updated_at";

export const COMMITMENT_COLUMNS =
  "id, round_id, account_id, investor_name, investor_email, investor_org, amount_aud, status, instrument, notes, access_token_id, committed_at, signed_at, funded_at, withdrawn_at, created_by, created_at, updated_at";

export type RoundAccess =
  | { ok: true; round: RoundRow; scope: ProjectScope | null; ownerUserId: string }
  | { ok: false; response: NextResponse };

const notFound = () => NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

/** FEATURE_COSTS.data_room_generate — the figure the round page prints before the click. */
export const DATA_ROOM_GENERATE_COST = 3;

/**
 * Resolve the caller's access to a round at `minRole`. The round must belong
 * to the resolved project's OWNER and — when the round carries a
 * `project_id` — to the active project; a legacy round (null project_id)
 * is reachable by its owner and the owner's project members.
 */
export async function resolveRoundForCaller(
  supabase: Db,
  user: Pick<AppUser, "id" | "email">,
  roundId: string,
  minRole: ProjectMemberRole,
): Promise<RoundAccess> {
  if (!roundId || roundId.length > 64) return { ok: false, response: notFound() };
  const { scope, denied } = await projectScopeOrDeny(minRole);
  if (denied) return { ok: false, response: denied };
  const ownerUserId = scope?.ownerUserId ?? user.id;

  const { data } = await supabase
    .from("fundraise_rounds")
    .select(ROUND_COLUMNS)
    .eq("id", roundId)
    .eq("account_id", ownerUserId)
    .maybeSingle();
  const round = data as RoundRow | null;
  if (!round) return { ok: false, response: notFound() };
  if (round.project_id && scope?.projectId && round.project_id !== scope.projectId) {
    return { ok: false, response: notFound() };
  }
  return { ok: true, round, scope, ownerUserId };
}

export async function listCommitments(supabase: Db, roundId: string): Promise<CommitmentRow[]> {
  const { data } = await supabase
    .from("fundraise_commitments")
    .select(COMMITMENT_COLUMNS)
    .eq("round_id", roundId)
    .order("created_at", { ascending: true });
  return (data ?? []) as CommitmentRow[];
}

/**
 * Re-read the commitments, roll them up, and write the three totals back
 * onto the round. Returns the summary the caller answers with. A failed
 * write is logged, not thrown — the commitment row itself already landed.
 */
export async function recomputeRoundTotals(supabase: Db, round: Pick<RoundRow, "id" | "target_amount">): Promise<RoundSummary> {
  const rows = await listCommitments(supabase, round.id);
  const summary = summariseCommitments(rows, round.target_amount);
  const { error } = await supabase
    .from("fundraise_rounds")
    .update({ ...roundTotalsFromSummary(summary), updated_at: new Date().toISOString() })
    .eq("id", round.id);
  if (error) console.error("[fundraise] round totals update failed", error);
  return summary;
}

export type ActivationDataRoom =
  | { id: string; attached: "existing" }
  | { id: string; attached: "generated"; creditsUsed: number }
  | {
      id: null;
      attached: "none";
      reason: "insufficient_credits" | "feature_locked" | "generate_failed";
      cost?: number;
      /** generate_failed only — whether the 3 credits went back to the caller. */
      refunded?: boolean;
    };

export interface ActivateRoundResult {
  round: RoundRow;
  alreadyActive: boolean;
  dataRoom: ActivationDataRoom;
}

/**
 * Move a draft round to `active` and attach the project's data room:
 * an existing room is linked as-is (never regenerated); with none, the
 * same compile the manual "Generate data room" button runs is charged to
 * the CALLER's credits (3.00, `data_room_generate`) and attached. No
 * credits → the round still activates, `dataRoom.attached = "none"` tells
 * the UI why. A compile that persists nothing (`generate_failed`) refunds
 * the 3 credits — the founder must never pay for a room that does not
 * exist (S26 review P1). Idempotent: an active round with a room is
 * returned untouched; an active round without one only gets the room
 * attached.
 */
export async function activateRound(
  supabase: Db,
  args: {
    round: RoundRow;
    user: Pick<AppUser, "id" | "email" | "displayName">;
    scope: ProjectScope | null;
    ownerUserId: string;
    /** false when the owner plan lacks data_room.access — link an existing room, never compile. */
    canGenerate: boolean;
    now?: Date;
  },
): Promise<ActivateRoundResult> {
  const { round, user, scope, ownerUserId, canGenerate } = args;
  const now = args.now ?? new Date();
  const alreadyActive = round.status === "active";
  const projectId = round.project_id ?? scope?.projectId ?? null;
  const dataEmail = scope?.dataEmail ?? user.email;

  let dataRoom: ActivationDataRoom;
  if (round.data_room_id) {
    dataRoom = { id: round.data_room_id, attached: "existing" };
  } else {
    const existing = await findRoomForScope(supabase, { ownerUserId, projectId });
    if (existing) {
      dataRoom = { id: existing.id, attached: "existing" };
    } else if (!canGenerate) {
      dataRoom = { id: null, attached: "none", reason: "feature_locked" };
    } else {
      const spend = await spendCredits(user.id, "data_room_generate", {
        email: user.email,
        project_id: projectId,
        source: "fundraise_round_activate",
        round_id: round.id,
      });
      if (!spend.ok) {
        dataRoom = { id: null, attached: "none", reason: "insufficient_credits", cost: DATA_ROOM_GENERATE_COST };
      } else {
        const compiled = await compileDataRoom(supabase, {
          user: { email: user.email, displayName: user.displayName ?? null },
          ownerUserId,
          dataEmail,
          projectId,
        });
        if (compiled.dataRoomId) {
          dataRoom = { id: compiled.dataRoomId, attached: "generated", creditsUsed: DATA_ROOM_GENERATE_COST };
        } else {
          // Nothing was written — give the charge back (same "refund" ledger
          // reason as api/funding/draft and api/board-resolutions).
          const refund = await grantCredits(user.id, DATA_ROOM_GENERATE_COST, "refund", {
            feature: "data_room_generate",
            project_id: projectId,
            round_id: round.id,
            reason: "data_room_generate_failed",
          });
          if (!refund.ok) console.error("[fundraise] refund after failed data-room compile did not land", { user: user.id, round: round.id });
          dataRoom = { id: null, attached: "none", reason: "generate_failed", cost: DATA_ROOM_GENERATE_COST, refunded: refund.ok };
        }
      }
    }
  }

  const patch: Record<string, unknown> = { updated_at: now.toISOString() };
  if (!alreadyActive) {
    patch.status = "active";
    patch.activated_at = now.toISOString();
  }
  if (dataRoom.id && dataRoom.id !== round.data_room_id) patch.data_room_id = dataRoom.id;
  if (!round.project_id && projectId) patch.project_id = projectId;

  const needsWrite = Object.keys(patch).length > 1;
  let updated: RoundRow = { ...round, ...patch } as RoundRow;
  if (needsWrite) {
    const { data, error } = await supabase
      .from("fundraise_rounds")
      .update(patch)
      .eq("id", round.id)
      .eq("account_id", ownerUserId)
      .select(ROUND_COLUMNS)
      .maybeSingle();
    if (error) throw new Error(`fundraise round activation failed: ${error.message}`);
    if (data) updated = data as RoundRow;
  }

  return { round: updated, alreadyActive, dataRoom };
}
