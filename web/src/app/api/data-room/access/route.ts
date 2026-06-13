import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// POST /api/data-room/access — Create investor access token
// GET  /api/data-room/access — List all investor access tokens
// ---------------------------------------------------------------------------

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    investorName,
    investorEmail,
    investorFirm,
    investorType = "vc",
    accessLevel = "view",
    sectionsAllowed = null,
    ndaRequired = false,
    expiresInDays = 30,
  } = body;

  // Get user's data room
  const { data: room } = await supabase
    .from("data_rooms")
    .select("id")
    .eq("account_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!room) {
    return NextResponse.json({ ok: false, error: "No data room found. Create one first." }, { status: 404 });
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const { data: accessToken, error } = await supabase
    .from("data_room_access_tokens")
    .insert({
      data_room_id: room.id,
      account_id: user.id,
      investor_name: investorName,
      investor_email: investorEmail,
      investor_firm: investorFirm,
      investor_type: investorType,
      access_level: accessLevel,
      sections_allowed: sectionsAllowed,
      nda_required: ndaRequired,
      expires_at: expiresAt.toISOString(),
      is_active: true,
    })
    .select("id, token, investor_name, investor_email, investor_firm, expires_at")
    .single();

  if (error || !accessToken) {
    return NextResponse.json({ ok: false, error: error?.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    accessToken,
    shareUrl: `/data-room/investor/${accessToken.token}`,
    message: `Investor link created for ${investorName ?? investorEmail}`,
  });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
  }

  const { data: tokens } = await supabase
    .from("data_room_access_tokens")
    .select("id, token, investor_name, investor_email, investor_firm, investor_type, access_level, access_count, first_accessed, last_accessed, expires_at, is_active, nda_signed_at")
    .eq("account_id", user.id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ ok: true, tokens: tokens ?? [] });
}
