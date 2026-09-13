// GET /api/fundraise/[roundId]/summary — the progress numbers only (S26-A).
//
// Target vs soft vs committed vs funded, counts per status and the
// percentages the progress bar draws — for the dashboard tiles and the
// investor-update drafts that do not need the commitment rows. viewer+.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { summariseCommitments } from "@/lib/fundraise/commitments";
import { listCommitments, resolveRoundForCaller } from "@/lib/fundraise/rounds-server";

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
  const { round } = access;

  const commitments = await listCommitments(supabase, round.id);
  const summary = summariseCommitments(commitments, round.target_amount);
  return NextResponse.json({
    ok: true,
    roundId: round.id,
    roundName: round.round_name,
    status: round.status,
    dataRoomId: round.data_room_id ?? null,
    summary,
  });
}
