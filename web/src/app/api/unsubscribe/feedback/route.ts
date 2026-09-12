// POST /api/unsubscribe/feedback — Save unsubscribe feedback
// Body: { token, reason, detail? }

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute } from "@/lib/audit/api-route";
import { readJsonBody } from "@/lib/security/request-guards";

export const dynamic = "force-dynamic";

const VALID_REASONS = ["too_many", "not_relevant", "didnt_signup", "using_competitor", "project_ended", "other"];

async function POST_handler(request: Request) {
  try {
    // QA-4 P2-b — an empty / malformed body is a 400, never a 500.
    const parsed = await readJsonBody<Record<string, unknown>>(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body && typeof parsed.body === "object" ? parsed.body : {};
    const { token, reason, detail } = body;

    if (!token || typeof token !== "string") {
      return NextResponse.json({ ok: false, error: "Token required" }, { status: 400 });
    }
    if (typeof reason !== "string" || !VALID_REASONS.includes(reason)) {
      return NextResponse.json({ ok: false, error: "Valid reason required" }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 503 });
    }

    // Find preferences by token
    const { data: prefs } = await supabase
      .from("email_preferences")
      .select("id, email")
      .eq("unsubscribe_token", token)
      .maybeSingle();

    if (!prefs) {
      return NextResponse.json({ ok: false, error: "Token not found" }, { status: 404 });
    }

    // Save feedback
    await supabase
      .from("email_preferences")
      .update({
        unsubscribe_reason: reason,
        unsubscribe_feedback: typeof detail === "string" ? detail.slice(0, 500) : null,
        unsubscribed_at: new Date().toISOString(),
      })
      .eq("id", prefs.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[unsubscribe:feedback] error:", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/unsubscribe/feedback/route.ts", method: "POST" }, POST_handler);
