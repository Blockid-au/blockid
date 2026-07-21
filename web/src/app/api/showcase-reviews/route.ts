// POST /api/showcase-reviews — Track B B9 Phase-9 investor review capture
// GET  /api/showcase-reviews?projectId=… — Founder-facing list (auth required)
//
// Reviewer flow authenticates via a data_room_access_tokens.token so the
// invited investor doesn't need a BlockID account (same pattern as
// /api/data-room/engage). The token resolves to data_room → project_id, and
// the reviewer_email is copied off the access-token row so the reviewer
// can't spoof an identity.
//
// Founder flow authenticates via getCurrentUser() and scopes by
// projects.user_id = user.id.
//
// The route is NOT reseller-scoped — resellers never call it directly. The
// reseller-lens rollup lives at /reseller and reads via
// resellerSupabase().showcaseReviewsAggregate() which selects only rating +
// project_id + created_at (per U.9 §5). No r-01 exemption needed because
// this file is not under /api/reseller/**.

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hashComment } from "@/lib/reseller/reviews";

export const dynamic = "force-dynamic";

interface ReviewPostBody {
  token?: unknown;
  rating?: unknown;
  comment?: unknown;
}

const MAX_COMMENT_LEN = 4000;

export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Storage not configured" }, { status: 503 });
  }

  let body: ReviewPostBody;
  try {
    body = (await req.json()) as ReviewPostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const rating = typeof body.rating === "number" ? Math.trunc(body.rating) : NaN;
  const commentRaw = typeof body.comment === "string" ? body.comment : "";
  const comment = commentRaw.trim().slice(0, MAX_COMMENT_LEN);

  if (!token) {
    return NextResponse.json({ ok: false, error: "token required" }, { status: 400 });
  }
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ ok: false, error: "rating must be 1-5" }, { status: 400 });
  }

  const { data: accessToken, error: tokenErr } = await supabase
    .from("data_room_access_tokens")
    .select("id, data_room_id, investor_email, is_active, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (tokenErr || !accessToken || !accessToken.is_active) {
    return NextResponse.json({ ok: false, error: "Invalid or expired token" }, { status: 403 });
  }
  if (accessToken.expires_at && new Date(accessToken.expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: "Link has expired" }, { status: 403 });
  }
  if (!accessToken.investor_email) {
    return NextResponse.json({ ok: false, error: "Access token missing reviewer email" }, { status: 400 });
  }

  const { data: room, error: roomErr } = await supabase
    .from("data_rooms")
    .select("project_id")
    .eq("id", accessToken.data_room_id)
    .maybeSingle();
  if (roomErr || !room?.project_id) {
    return NextResponse.json({ ok: false, error: "Data room not linked to a project" }, { status: 409 });
  }

  const { error: upsertErr } = await supabase
    .from("showcase_reviews")
    .upsert(
      {
        project_id: room.project_id,
        access_token_id: accessToken.id,
        reviewer_email: accessToken.investor_email,
        rating,
        comment: comment.length > 0 ? comment : null,
        comment_hash: hashComment(comment),
      },
      { onConflict: "project_id,reviewer_email" },
    );

  if (upsertErr) {
    return NextResponse.json({ ok: false, error: "Failed to save review" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Auth required" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ ok: false, error: "projectId required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Storage not configured" }, { status: 503 });
  }

  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (projectErr || !project || project.user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("showcase_reviews")
    .select("id, reviewer_email, rating, comment, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ ok: false, error: "Read failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reviews: data ?? [] });
}
