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
//   3. G19-S45 (D6) — the Trusted Business Report clarity survey
//      (components/tbr/tbr-clarity-survey.tsx) POSTs { score, comment,
//      context: "tbr_clarity:<snapshotId>", surface }. Same insert as (1);
//      the route additionally emits the server-side `tbr_clarity_answered`
//      analytics twin. The public share page has no session, so the row is
//      stored as "anonymous" — the KPI reads the context prefix, not the user.
//
// GET returns recent rows for the CCSO admin dashboard.

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute } from "@/lib/audit/api-route";
import { emitEventSafe } from "@/lib/analytics/server";
import { qaFlag } from "@/lib/analytics/events";

export const TBR_CLARITY_CONTEXT_PREFIX = "tbr_clarity:";

export const dynamic = "force-dynamic";

interface NpsPostBody {
  token?: unknown;
  score?: unknown;
  comment?: unknown;
  context?: unknown;
  /** G19-S45: where the clarity survey was answered (founder page or public share). */
  surface?: unknown;
}

async function POST_handler(req: NextRequest) {
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
      // Supabase not configured — silently drop (no PII/comment to logs).
    }
    // G19-S45 (D6): server twin of the client `tbr_clarity_answered` event.
    if (context.startsWith(TBR_CLARITY_CONTEXT_PREFIX)) {
      const snapshotId = context.slice(TBR_CLARITY_CONTEXT_PREFIX.length).slice(0, 80);
      emitEventSafe({
        name: "tbr_clarity_answered",
        params: {
          score,
          surface: body.surface === "share" ? "share" : "founder",
          has_comment: Boolean(comment && comment.length > 0),
          ...(snapshotId ? { snapshot_id: snapshotId } : {}),
          ...qaFlag(user?.email),
        },
        userId: user?.id ?? null,
        source: "server",
      });
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

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/nps/route.ts", method: "POST" }, POST_handler);
