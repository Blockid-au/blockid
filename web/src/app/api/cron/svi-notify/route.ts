import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendSVIWelcome, sendSVIWeeklyReport } from "@/lib/email";

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
    let emailed = 0;

    for (const account of accounts ?? []) {
      const enrolledAt = new Date(account.enrolled_at);
      const daysSinceEnroll = Math.floor(
        (now.getTime() - enrolledAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Check which notifications have already been sent
      const { data: sent } = await supabase
        .from("svi_notifications")
        .select("notification_type")
        .eq("account_id", account.id);

      const sentTypes = new Set(
        (sent ?? []).map((s: { notification_type: string }) => s.notification_type),
      );

      // Day 1: Welcome
      if (daysSinceEnroll >= 1 && !sentTypes.has("welcome")) {
        await supabase.from("svi_notifications").insert({
          account_id: account.id,
          notification_type: "welcome",
          subject: "Welcome to BlockID — Your SVI Baseline is Ready",
          payload: { svi: account.current_svi, stage: account.current_stage },
        });

        // Send welcome email
        const emailResult = await sendSVIWelcome({
          to: account.email,
          name: account.name ?? null,
          svi: account.current_svi ?? 100,
          stage: account.current_stage ?? 0,
        });
        if (emailResult.ok) emailed++;

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

          const svi = snapshot?.svi_total ?? account.current_svi;
          const delta = snapshot?.delta ?? null;

          await supabase.from("svi_notifications").insert({
            account_id: account.id,
            notification_type: weeklyType,
            subject: `Week ${weekNum} SVI Report — ${delta != null && delta > 0 ? `+${delta}` : delta ?? "No change"} points`,
            payload: { svi, delta },
          });

          // Send weekly report email
          const emailResult = await sendSVIWeeklyReport({
            to: account.email,
            name: account.name ?? null,
            svi,
            delta,
            weekNum,
          });
          if (emailResult.ok) emailed++;

          notified++;
        }
      }
    }

    return NextResponse.json({ ok: true, notified, emailed });
  } catch (err) {
    console.error("[blockid:svi-notify] notify cron failed", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
