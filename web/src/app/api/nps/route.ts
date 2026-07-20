// /api/nps
//
// Two writers land here:
//
//   1. Legacy in-app widget (NpsWidget) — POSTs { score, comment, context }
//      from an authenticated session. Inserts a fresh row.
//
//   2. The 30-day email pulse (CCSO drip) — POSTs { token, score, comment }
//      from the /nps landing page. Updates the stub row that was
//      pre-created when the D30 email was enqueued.
//
// GET returns recent rows for the CCSO admin dashboard.

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface NpsPostBody {
  token?: unknown;
  score?: unknown;
  comment?: unknown;
  context?: unknown;
}

export async function POST(req: NextRequest) {
  let body: NpsPostBody;
  try {
    body = (await req.json()) as NpsPostBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token.trim() : "";
  const score = typeof body.score === "number" ? Math.trunc(body.score) : NaN;
  const comment =
    typeof body.comment === "string" ? body.comment.trim().slice(0, 2000) : null;

  if (!Number.isFinite(score) || score < 0 || score > 10) {
    return NextResponse.json(
      { ok: false, error: "score must be 0-10" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  // ── Token flow (D30 email pulse) ────────────────────────────────────────
  if (token) {
    if (!supabase) {
      return NextResponse.json(
        { ok: false, error: "Storage not configured" },
        { status: 503 },
      );
    }
    const { data: existing, error: lookupErr } = await supabase
      .from("nps_responses")
      .select("id")
      .eq("token", token)
      .maybeSingle();

    if (lookupErr) {
      return NextResponse.json(
        { ok: false, error: "Lookup failed" },
        { status: 500 },
      );
    }
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Token not found" },
        { status: 404 },
      );
    }

    const { error: updateErr } = await supabase
      .from("nps_responses")
      .update({
        score,
        comment,
        completed_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (updateErr) {
      return NextResponse.json(
        { ok: false, error: "Write failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true });
  }

  // ── Legacy in-app widget flow ───────────────────────────────────────────
  try {
    const context = typeof body.context === "string" ? body.context : "";
    const user = await getCurrentUser();
    if (supabase) {
      await supabase.from("nps_responses").insert({
        user_email: user?.email ?? "anonymous",
        email: user?.email ?? null,
        score,
        comment: comment ?? "",
        context,
        completed_at: new Date().toISOString(),
      });
    } else {
      console.log("[NPS]", { score, comment, user: user?.email });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // never block user
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ responses: [] });
  const { data } = await supabase
    .from("nps_responses")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  return NextResponse.json({ responses: data ?? [] });
}
