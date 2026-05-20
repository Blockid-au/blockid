import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { hashIp, clientIpFromHeaders } from "@/lib/iphash";
import { sendScoreViewed } from "@/lib/email";

export const dynamic = "force-dynamic";

/**
 * POST /api/track/view
 *
 * Client-side engagement tracker sends periodic updates with scroll depth,
 * sections viewed, and time spent. No auth required (public tracking).
 *
 * Body: { slug, timeSpent, sectionsViewed, scrollDepth, deviceType }
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 200 });
  }

  let body: {
    slug?: string;
    timeSpent?: number;
    sectionsViewed?: string[];
    scrollDepth?: number;
    deviceType?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const { slug, timeSpent, sectionsViewed, scrollDepth, deviceType } = body;
  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ ok: false, reason: "missing_slug" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 200 });
  }

  // Hash the viewer IP (same pattern as existing score_views)
  const h = await headers();
  const ip = clientIpFromHeaders(h);
  const viewerHash = hashIp(ip);

  // Clamp/sanitise values
  const safeTimeSpent = Math.max(0, Math.min(7200, Math.round(timeSpent ?? 0)));
  const safeScrollDepth = Math.max(0, Math.min(100, Math.round(scrollDepth ?? 0)));
  const safeSections = Array.isArray(sectionsViewed)
    ? sectionsViewed.filter((s): s is string => typeof s === "string").slice(0, 20)
    : [];
  const safeDeviceType = ["desktop", "mobile", "tablet"].includes(deviceType ?? "")
    ? deviceType!
    : "desktop";

  // 1. Update the most recent score_views row for this viewer+slug with engagement data
  //    (the server-side recordView already inserted the row on page load).
  if (viewerHash) {
    const { data: recentView } = await supabase
      .from("score_views")
      .select("id")
      .eq("score_id", slug)
      .eq("viewer_ip_hash", viewerHash)
      .order("viewed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentView) {
      await supabase
        .from("score_views")
        .update({
          time_spent_seconds: safeTimeSpent,
          sections_viewed: safeSections,
          scroll_depth_pct: safeScrollDepth,
          device_type: safeDeviceType,
          referrer: h.get("referer")?.slice(0, 512) ?? null,
        })
        .eq("id", recentView.id);
    }
  }

  // 2. Upsert investor_heat
  if (viewerHash) {
    const timeMinutes = safeTimeSpent / 60;

    // Read existing heat row
    const { data: existing } = await supabase
      .from("investor_heat")
      .select("id, total_views, total_time_seconds, heat_score")
      .eq("slug", slug)
      .eq("viewer_hash", viewerHash)
      .maybeSingle();

    if (existing) {
      const newTotalTime = existing.total_time_seconds + safeTimeSpent;
      const newTotalViews = existing.total_views; // views incremented on page load, not here
      const newTimeMinutes = newTotalTime / 60;
      const newHeatScore = Math.min(
        100,
        Math.round(newTotalViews * 15 + newTimeMinutes * 5 + safeScrollDepth * 0.3),
      );

      await supabase
        .from("investor_heat")
        .update({
          total_time_seconds: newTotalTime,
          heat_score: newHeatScore,
          last_viewed_at: new Date().toISOString(),
        })
        .eq("id", existing.id);

      // Notify founder if heat crossed the 50+ threshold
      if (newHeatScore >= 50 && existing.heat_score < 50) {
        void notifyFounderHotInvestor(supabase, slug, viewerHash, newHeatScore);
      }
    } else {
      // First engagement update for this viewer — create heat row
      const heatScore = Math.min(
        100,
        Math.round(1 * 15 + timeMinutes * 5 + safeScrollDepth * 0.3),
      );

      const { error } = await supabase.from("investor_heat").insert({
        slug,
        viewer_hash: viewerHash,
        heat_score: heatScore,
        total_views: 1,
        total_time_seconds: safeTimeSpent,
        last_viewed_at: new Date().toISOString(),
      });

      // Handle unique constraint race condition (another request may have inserted)
      if (error && error.code === "23505") {
        // Retry as update
        await supabase
          .from("investor_heat")
          .update({
            total_time_seconds: safeTimeSpent,
            heat_score: heatScore,
            last_viewed_at: new Date().toISOString(),
          })
          .eq("slug", slug)
          .eq("viewer_hash", viewerHash);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

/** Fire-and-forget: email the founder when an investor heat score crosses 50. */
async function notifyFounderHotInvestor(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  slug: string,
  _viewerHash: string,
  heatScore: number,
) {
  try {
    // Look up the founder email from the scores table
    const { data: score } = await supabase
      .from("scores")
      .select("email, company_name")
      .eq("id", slug)
      .maybeSingle();

    if (score?.email) {
      await sendScoreViewed({
        to: score.email,
        slug,
        viewerLabel: `by a highly engaged viewer (heat score: ${heatScore}/100)`,
        companyName: score.company_name,
      });
    }
  } catch (err) {
    console.error("[blockid:track] hot investor notify failed", err);
  }
}
