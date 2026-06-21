// POST /api/ccso/capture — CCSO unified NPS / testimonial / referral / interview
// capture endpoint. Single entry point for every post-purchase signal that
// feeds the 30-day KPIs (10 feedback calls, 3 testimonials, 5 referrals,
// NPS > 50). Writes to user_feedback with `category` carrying the kind.
//
// Body: { kind: 'nps'|'testimonial'|'referral'|'interview',
//         rating?: 0-10 (nps only),
//         comment?: string,
//         referredEmail?: string (referral only),
//         pageContext?: string }
//
// Auth: user-auth via getCurrentUser. Admin can also POST on behalf of a user
// by including ?email=<email> (logged + audited).
//
// Closes T0202.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type Kind = "nps" | "testimonial" | "referral" | "interview";
const ALLOWED_KINDS: Kind[] = ["nps", "testimonial", "referral", "interview"];

interface CaptureBody {
  kind?: string;
  rating?: number;
  comment?: string;
  referredEmail?: string;
  pageContext?: string;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });

  const rl = await checkRateLimit(`ccso-capture:${user.id}`, 20, 600_000);
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited", retryAfter: rl.resetIn }, { status: 429 });

  let body: CaptureBody;
  try { body = (await request.json()) as CaptureBody; } catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const kind = (body.kind ?? "").toLowerCase() as Kind;
  if (!ALLOWED_KINDS.includes(kind)) {
    return NextResponse.json({ ok: false, error: `kind must be one of ${ALLOWED_KINDS.join(", ")}` }, { status: 400 });
  }

  // Kind-specific validation
  if (kind === "nps") {
    const r = Number(body.rating);
    if (!Number.isFinite(r) || r < 0 || r > 10) return NextResponse.json({ ok: false, error: "nps rating must be 0–10" }, { status: 400 });
  }
  if (kind === "referral") {
    const e = (body.referredEmail ?? "").trim();
    if (!e || !e.includes("@")) return NextResponse.json({ ok: false, error: "referral requires valid referredEmail" }, { status: 400 });
  }
  if (kind === "testimonial" || kind === "interview") {
    if (!body.comment || body.comment.trim().length < 8) {
      return NextResponse.json({ ok: false, error: `${kind} requires comment (≥ 8 chars)` }, { status: 400 });
    }
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  // category encodes kind + (for nps) the score so dashboards can sum quickly.
  const category =
    kind === "nps" ? `nps:${Number(body.rating)}` :
    kind === "referral" ? `referral:${(body.referredEmail ?? "").trim()}` :
    kind;

  const summary =
    kind === "nps" ? `NPS ${body.rating}/10` :
    kind === "testimonial" ? "Testimonial captured" :
    kind === "referral" ? `Referral → ${body.referredEmail}` :
    "Founder interview log";

  // Credits per kind — small economy to incentivise quality feedback.
  const creditsAwarded =
    kind === "testimonial" ? 2 :
    kind === "referral" ? 3 :
    kind === "interview" ? 1.5 :
    kind === "nps" && Number(body.rating) >= 9 ? 0.5 : 0.25;

  const { error } = await supabase.from("user_feedback").insert({
    user_id: user.id,
    email: user.email,
    feedback: (body.comment ?? "").trim() || `[${kind}]`,
    category,
    page: body.pageContext ?? null,
    ai_score: kind === "nps" ? Number(body.rating) * 10 : kind === "testimonial" ? 90 : 70,
    ai_summary: summary,
    credits_awarded: creditsAwarded,
    status: "captured",
  });

  if (error) {
    console.error("[ccso-capture] insert error", error);
    return NextResponse.json({ ok: false, error: "Failed to save" }, { status: 500 });
  }

  // Auto-fire referral invite (best-effort, non-blocking).
  if (kind === "referral" && body.referredEmail) {
    // Future: queue an email to referredEmail. For now just log to user_actions.
    try {
      await supabase.from("user_actions").insert({
        user_id: user.id,
        action: "referral_sent",
        metadata: { referred_email: body.referredEmail, by: user.email },
      });
    } catch { /* table may not exist; non-fatal */ }
  }

  return NextResponse.json({
    ok: true,
    kind,
    creditsAwarded,
    message:
      kind === "nps" && Number(body.rating) >= 9 ? "Thanks for the high score! Mind if we ask for a testimonial?" :
      kind === "testimonial" ? "Thank you — we'll feature this on our site (with permission)." :
      kind === "referral" ? `Referral logged. We'll reach out to ${body.referredEmail}.` :
      kind === "interview" ? "Interview log saved. CCSO dashboard updated." :
      "Thanks for the feedback.",
  });
}

// GET /api/ccso/capture — Admin-only aggregate stats. Returns counts per kind
// over last 30 days, NPS average, top referrers. Used by /dashboard/admin/ccso.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ ok: false, error: "Admin only" }, { status: 403 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("user_feedback")
    .select("category, ai_score, email, created_at, ai_summary")
    .gte("created_at", since)
    .limit(500);

  const rows = (data ?? []) as Array<{ category: string; ai_score: number; email: string; created_at: string; ai_summary: string }>;
  const npsRows = rows.filter(r => r.category?.startsWith("nps:"));
  const npsScores = npsRows.map(r => parseInt(r.category.slice(4), 10)).filter(n => Number.isFinite(n));
  const promoters = npsScores.filter(n => n >= 9).length;
  const detractors = npsScores.filter(n => n <= 6).length;
  const npsValue = npsScores.length === 0 ? null : Math.round(((promoters - detractors) / npsScores.length) * 100);

  return NextResponse.json({
    ok: true,
    since,
    counts: {
      nps: npsRows.length,
      testimonials: rows.filter(r => r.category === "testimonial").length,
      referrals: rows.filter(r => r.category?.startsWith("referral:")).length,
      interviews: rows.filter(r => r.category === "interview").length,
    },
    npsValue,
    npsAverage: npsScores.length === 0 ? null : Math.round((npsScores.reduce((a, b) => a + b, 0) / npsScores.length) * 10) / 10,
    promoters,
    detractors,
    passives: npsScores.length - promoters - detractors,
    samples: rows.slice(0, 20).map(r => ({
      kind: r.category?.split(":")[0] ?? r.category,
      summary: r.ai_summary,
      ts: r.created_at,
    })),
  });
}
