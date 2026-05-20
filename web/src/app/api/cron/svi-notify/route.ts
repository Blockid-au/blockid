import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  sendSVIWelcome,
  sendSVIWeeklyReport,
  sendNurtureFreeDay1,
  sendNurtureFreeDay3,
  sendNurtureFreeDay7,
  sendNurtureFreeDay14,
  sendNurturePaidDay1,
  sendNurturePaidDay3,
  sendNurturePaidDay14,
  sendNurturePaidDay30,
  sendNurtureReengageDay14,
  sendNurtureReengageDay30,
} from "@/lib/email";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helper: calculate whole days between two dates
// ---------------------------------------------------------------------------
function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

// ---------------------------------------------------------------------------
// Helper: send a nurture email and log it to svi_notifications
// ---------------------------------------------------------------------------
async function trySendNurture(
  supabase: ReturnType<typeof getSupabaseAdmin> & object,
  opts: {
    accountId?: string;
    email: string;
    notificationType: string;
    subject: string;
    sendFn: () => Promise<{ ok: boolean }>;
  },
): Promise<boolean> {
  const result = await opts.sendFn();
  // Log regardless of send success so we don't retry on SMTP-not-configured
  await supabase.from("svi_notifications").insert({
    ...(opts.accountId ? { account_id: opts.accountId } : {}),
    notification_type: opts.notificationType,
    subject: opts.subject,
    payload: { email: opts.email },
  });
  return result.ok;
}

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
    let notified = 0;
    let emailed = 0;

    // ======================================================================
    // EXISTING: Welcome + weekly report for SVI accounts
    // ======================================================================
    const { data: accounts } = await supabase
      .from("svi_accounts")
      .select("id, email, name, enrolled_at, current_svi, current_stage, plan, last_active_at");

    for (const account of accounts ?? []) {
      const enrolledAt = new Date(account.enrolled_at);
      const daysSinceEnroll = daysBetween(enrolledAt, now);

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

      // ==================================================================
      // SEQUENCE B: Post-Payment nurture (paid accounts only)
      // ==================================================================
      if (account.plan && account.plan !== "free") {
        const paidNurture: Array<{ day: number; type: string; subject: string; send: () => Promise<{ ok: boolean }> }> = [
          {
            day: 1,
            type: "nurture_paid_day1",
            subject: "Your 30-day growth plan starts now",
            send: () => sendNurturePaidDay1({ to: account.email, name: account.name }),
          },
          {
            day: 3,
            type: "nurture_paid_day3",
            subject: "Upload your first evidence — here's how",
            send: () => sendNurturePaidDay3({ to: account.email, name: account.name }),
          },
          // Day 7 is handled by the weekly report above
          {
            day: 14,
            type: "nurture_paid_day14",
            subject: "Have you explored these tools?",
            send: () => sendNurturePaidDay14({ to: account.email, name: account.name }),
          },
          {
            day: 30,
            type: "nurture_paid_day30",
            subject: "Your first month results on BlockID",
            send: () => sendNurturePaidDay30({ to: account.email, name: account.name, svi: account.current_svi }),
          },
        ];

        for (const step of paidNurture) {
          if (daysSinceEnroll >= step.day && !sentTypes.has(step.type)) {
            const ok = await trySendNurture(supabase, {
              accountId: account.id,
              email: account.email,
              notificationType: step.type,
              subject: step.subject,
              sendFn: step.send,
            });
            if (ok) emailed++;
            notified++;
          }
        }
      }

      // ==================================================================
      // SEQUENCE C: Re-engagement (inactive paid users)
      // ==================================================================
      if (account.plan && account.plan !== "free" && account.last_active_at) {
        const lastActive = new Date(account.last_active_at);
        const daysInactive = daysBetween(lastActive, now);

        const reengageNurture: Array<{ days: number; type: string; subject: string; send: () => Promise<{ ok: boolean }> }> = [
          {
            days: 14,
            type: "nurture_reengage_day14",
            subject: "We noticed you haven't been active — need help?",
            send: () => sendNurtureReengageDay14({ to: account.email, name: account.name }),
          },
          {
            days: 30,
            type: "nurture_reengage_day30",
            subject: "Your SVI may have changed — check your score",
            send: () => sendNurtureReengageDay30({ to: account.email, name: account.name }),
          },
        ];

        for (const step of reengageNurture) {
          if (daysInactive >= step.days && !sentTypes.has(step.type)) {
            const ok = await trySendNurture(supabase, {
              accountId: account.id,
              email: account.email,
              notificationType: step.type,
              subject: step.subject,
              sendFn: step.send,
            });
            if (ok) emailed++;
            notified++;
          }
        }
      }
    }

    // ======================================================================
    // SEQUENCE A: Post-Free Analysis (users who got SVI but didn't sign up)
    // ======================================================================
    // Query svi_analyses for emails that do NOT have an app_users account.
    const { data: freeAnalyses } = await supabase
      .from("svi_analyses")
      .select("id, email, total_svi, created_at");

    if (freeAnalyses && freeAnalyses.length > 0) {
      // Collect unique emails from analyses
      const analysisEmails = [...new Set(freeAnalyses.map((a: { email: string }) => a.email))];

      // Batch-check which emails already have an app_users account
      const { data: existingUsers } = await supabase
        .from("app_users")
        .select("email")
        .in("email", analysisEmails);

      const signedUpEmails = new Set(
        (existingUsers ?? []).map((u: { email: string }) => u.email.toLowerCase()),
      );

      // Group analyses by email, take the most recent created_at
      const emailMap = new Map<string, { email: string; svi: number; createdAt: Date }>();
      for (const a of freeAnalyses) {
        const key = a.email.toLowerCase();
        const existing = emailMap.get(key);
        const thisDate = new Date(a.created_at);
        if (!existing || thisDate > existing.createdAt) {
          emailMap.set(key, { email: a.email, svi: a.total_svi, createdAt: thisDate });
        }
      }

      for (const [key, info] of emailMap) {
        // Skip users who already signed up
        if (signedUpEmails.has(key)) continue;

        const daysSinceAnalysis = daysBetween(info.createdAt, now);

        // Query nurture_free_* notifications sent for this email via payload.
        // No account_id for non-signed-up users, so we filter by payload->>email.
        const { data: sentFreeRows } = await supabase
          .from("svi_notifications")
          .select("notification_type")
          .like("notification_type", "nurture_free_%")
          .filter("payload->>email", "eq", info.email);

        const sentFreeTypes = new Set(
          (sentFreeRows ?? []).map((s: { notification_type: string }) => s.notification_type),
        );

        const freeNurture: Array<{ day: number; type: string; subject: string; send: () => Promise<{ ok: boolean }> }> = [
          {
            day: 1,
            type: "nurture_free_day1",
            subject: "Your SVI score is waiting — 3 things to do next",
            send: () => sendNurtureFreeDay1({ to: info.email, svi: info.svi }),
          },
          {
            day: 3,
            type: "nurture_free_day3",
            subject: "How to boost your SVI by 20+ points",
            send: () => sendNurtureFreeDay3({ to: info.email }),
          },
          {
            day: 7,
            type: "nurture_free_day7",
            subject: "Australian founders who improved their score",
            send: () => sendNurtureFreeDay7({ to: info.email }),
          },
          {
            day: 14,
            type: "nurture_free_day14",
            subject: "Last chance: Founding 50 early access",
            send: () => sendNurtureFreeDay14({ to: info.email }),
          },
        ];

        for (const step of freeNurture) {
          if (daysSinceAnalysis >= step.day && !sentFreeTypes.has(step.type)) {
            const ok = await trySendNurture(supabase, {
              email: info.email,
              notificationType: step.type,
              subject: step.subject,
              sendFn: step.send,
            });
            if (ok) emailed++;
            notified++;
          }
        }
      }
    }

    return NextResponse.json({ ok: true, notified, emailed });
  } catch (err) {
    console.error("[blockid:svi-notify] notify cron failed", err);
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
