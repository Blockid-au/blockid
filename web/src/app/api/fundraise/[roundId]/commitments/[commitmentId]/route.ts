// /api/fundraise/[roundId]/commitments/[commitmentId] — one cheque (S26-A).
//
//   PATCH  → partial update (editor+); a status change stamps / clears the
//            milestone dates (lib/fundraise/commitments `stampStatusDates`)
//   DELETE → remove (editor+) — for a row entered in error; a cheque that
//            fell through is `status: "withdrawn"`, which keeps the history
//
// Both re-roll the round totals afterwards. The row must belong to the
// round AND the round to the caller's project owner — the id pair is not
// an oracle.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute, auditNote } from "@/lib/audit/api-route";
import { parseCommitmentInput, stampStatusDates, type CommitmentPatch } from "@/lib/fundraise/commitments";
import {
  COMMITMENT_COLUMNS,
  recomputeRoundTotals,
  resolveRoundForCaller,
  type CommitmentRow,
} from "@/lib/fundraise/rounds-server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ roundId: string; commitmentId: string }> };

const notFound = () => NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

async function PATCH_handler(req: NextRequest, ctx: Ctx) {
  const { roundId, commitmentId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const parsed = parseCommitmentInput(await req.json().catch(() => null), { partial: true });
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const patch = parsed.value as CommitmentPatch;

  const access = await resolveRoundForCaller(supabase, user, roundId, "editor");
  if (!access.ok) return access.response;
  const { round, ownerUserId } = access;

  const { data: existingRow } = await supabase
    .from("fundraise_commitments")
    .select(COMMITMENT_COLUMNS)
    .eq("id", commitmentId)
    .eq("round_id", round.id)
    .maybeSingle();
  const existing = existingRow as CommitmentRow | null;
  if (!existing) return notFound();

  if (patch.accessTokenId) {
    const { data: link } = await supabase
      .from("data_room_access_tokens")
      .select("id")
      .eq("id", patch.accessTokenId)
      .eq("account_id", ownerUserId)
      .maybeSingle();
    if (!link) return NextResponse.json({ ok: false, error: "accessTokenId does not belong to this project" }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.investorName !== undefined) update.investor_name = patch.investorName;
  if (patch.investorEmail !== undefined) update.investor_email = patch.investorEmail;
  if (patch.investorOrg !== undefined) update.investor_org = patch.investorOrg;
  if (patch.amountAud !== undefined) update.amount_aud = patch.amountAud;
  if (patch.instrument !== undefined) update.instrument = patch.instrument;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.accessTokenId !== undefined) update.access_token_id = patch.accessTokenId;
  if (patch.status !== undefined && patch.status !== existing.status) {
    update.status = patch.status;
    Object.assign(update, stampStatusDates(existing, patch.status));
  }

  const { data, error } = await supabase
    .from("fundraise_commitments")
    .update(update)
    .eq("id", commitmentId)
    .eq("round_id", round.id)
    .select(COMMITMENT_COLUMNS)
    .maybeSingle();
  if (error) {
    console.error("[fundraise] commitment patch failed", error);
    return NextResponse.json({ ok: false, error: "Failed to update commitment" }, { status: 500 });
  }

  const summary = await recomputeRoundTotals(supabase, round);
  auditNote(commitmentId, { round_id: round.id, status: update.status ?? null });
  return NextResponse.json({ ok: true, commitment: data ?? { ...existing, ...update }, summary });
}

async function DELETE_handler(_req: NextRequest, ctx: Ctx) {
  const { roundId, commitmentId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const access = await resolveRoundForCaller(supabase, user, roundId, "editor");
  if (!access.ok) return access.response;
  const { round } = access;

  const { data: existing } = await supabase
    .from("fundraise_commitments")
    .select("id")
    .eq("id", commitmentId)
    .eq("round_id", round.id)
    .maybeSingle();
  if (!existing) return notFound();

  const { error } = await supabase.from("fundraise_commitments").delete().eq("id", commitmentId).eq("round_id", round.id);
  if (error) {
    console.error("[fundraise] commitment delete failed", error);
    return NextResponse.json({ ok: false, error: "Failed to delete commitment" }, { status: 500 });
  }

  const summary = await recomputeRoundTotals(supabase, round);
  auditNote(commitmentId, { round_id: round.id });
  return NextResponse.json({ ok: true, deleted: true, summary });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const PATCH = apiRoute({ route: "api/fundraise/[roundId]/commitments/[commitmentId]/route.ts", method: "PATCH" }, PATCH_handler);
export const DELETE = apiRoute({ route: "api/fundraise/[roundId]/commitments/[commitmentId]/route.ts", method: "DELETE" }, DELETE_handler);
