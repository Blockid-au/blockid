// /api/fundraise/[roundId]/commitments — the cheques on a round (S26-A).
//
//   GET  → list (viewer+)
//   POST → record one (editor+). Optional `accessTokenId` ties the row to a
//          data-room investor link (`data_room_access_tokens`) — verified to
//          belong to the same owner, so a member cannot attach a stranger's
//          link. Totals roll up onto the round after the insert.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute, auditNote } from "@/lib/audit/api-route";
import { parseCommitmentInput, stampStatusDates, summariseCommitments, type CommitmentInput } from "@/lib/fundraise/commitments";
import {
  COMMITMENT_COLUMNS,
  listCommitments,
  recomputeRoundTotals,
  resolveRoundForCaller,
} from "@/lib/fundraise/rounds-server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ roundId: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { roundId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const access = await resolveRoundForCaller(supabase, user, roundId, "viewer");
  if (!access.ok) return access.response;
  const commitments = await listCommitments(supabase, access.round.id);
  return NextResponse.json({
    ok: true,
    commitments,
    summary: summariseCommitments(commitments, access.round.target_amount),
  });
}

async function POST_handler(req: NextRequest, ctx: Ctx) {
  const { roundId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const parsed = parseCommitmentInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const input = parsed.value as CommitmentInput;

  const access = await resolveRoundForCaller(supabase, user, roundId, "editor");
  if (!access.ok) return access.response;
  const { round, ownerUserId } = access;
  if (round.status === "closed") {
    return NextResponse.json({ ok: false, error: "round_closed", message: "A closed round does not take new commitments" }, { status: 409 });
  }

  if (input.accessTokenId) {
    const { data: link } = await supabase
      .from("data_room_access_tokens")
      .select("id")
      .eq("id", input.accessTokenId)
      .eq("account_id", ownerUserId)
      .maybeSingle();
    if (!link) return NextResponse.json({ ok: false, error: "accessTokenId does not belong to this project" }, { status: 400 });
  }

  const dates = stampStatusDates(null, input.status);
  const { data, error } = await supabase
    .from("fundraise_commitments")
    .insert({
      round_id: round.id,
      account_id: ownerUserId,
      investor_name: input.investorName,
      investor_email: input.investorEmail,
      investor_org: input.investorOrg,
      amount_aud: input.amountAud,
      status: input.status,
      instrument: input.instrument,
      notes: input.notes,
      access_token_id: input.accessTokenId,
      ...dates,
      created_by: user.id,
    })
    .select(COMMITMENT_COLUMNS)
    .single();
  if (error) {
    console.error("[fundraise] commitment insert failed", error);
    return NextResponse.json({ ok: false, error: "Failed to record commitment" }, { status: 500 });
  }

  const summary = await recomputeRoundTotals(supabase, round);
  const created = data as { id?: string } | null;
  auditNote(created?.id ?? null, { round_id: round.id, status: input.status, amount_aud: input.amountAud });
  return NextResponse.json({ ok: true, commitment: data, summary }, { status: 201 });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/fundraise/[roundId]/commitments/route.ts", method: "POST" }, POST_handler);
