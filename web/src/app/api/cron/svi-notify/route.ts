import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }

  try {
    const now = new Date();
    const { data: accounts } = await supabase
      .from("svi_accounts")
      .select("id, email, name, enrolled_at, current_svi, current_stage");

    let notified = 0;

    for (const account of accounts ?? []) {
      const enrolledAt = new Date(account.enrolled_at);
      const daysSinceEnroll = Math.floor((now.getTime() - enrolledAt.getTime()) / (1000 * 60 * 60 * 24));

      // Check which notifications have already been sent
      const { data: sent } = await supabase
        .from("svi_notifications")
        .select("notification_type")
        .eq("account_id", account.id);

      const sentTypes = new Set((sent ?? []).map((s: { notification_type: string }) => s.notification_type));

      // Day 1: Welcome
      if (daysSinceEnroll >= 1 && !sentTypes.has("welcome")) {
        await supabase.from("svi_notifications").insert({
          account_id: account.id,
          notification_type: "welcome",
          subject: "Welcome to BlockID — Your SVI Baseline is Ready",
          payload: { svi: account.current_svi, stage: account.current_stage },
        });
        notified++;
      }

      // Weekly report (day 7, 14, 21, 28...)
      if (daysSinceEnroll > 0 && daysSinceEnroll % 7 === 0) {
        const weekNum = Math.floor(daysSinceEnroll / 7);
        const weeklyType = `weekly_report_w${weekNum}`;
        if (!sentTypes.has(weeklyType)) {
          // Get latest snapshot with delta
          const { data: snapshot } = await supabase
            .from("svi_snapshots")
            .select("svi_total, delta")
            .eq("account_id", account.id)
            .order("snapshot_date", { ascending: false })
            .limit(1)
            .single();

          await supabase.from("svi_notifications").insert({
            account_id: account.id,
            notification_type: weeklyType,
            subject: `Week ${weekNum} SVI Report — ${snapshot?.delta && snapshot.delta > 0 ? `+${snapshot.delta}` : snapshot?.delta ?? "No change"} points`,
            payload: { svi: snapshot?.svi_total ?? account.current_svi, delta: snapshot?.delta },
          });
          notified++;
        }
      }
    }

    return NextResponse.json({ ok: true, notified });
  } catch (err) {
    console.error("svi-notify cron error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
