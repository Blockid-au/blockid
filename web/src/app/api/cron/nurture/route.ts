import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canSendEmail } from "@/lib/email-preferences";
import {
  sendNurtureFreeDay2,
  sendNurtureFreeDay4,
  sendNurtureFreeDay7,
  sendNurturePaidDay1,
  sendNurturePaidDay3,
  sendNurturePaidDay7,
  sendLowCreditAlert,
  sendNurtureFirstReport24h,
  sendEvidenceScoreBoost,
  sendUnlockDeeperAnalysis,
  sendWeeklySVISummary,
  sendReengagement30d,
  sendReengagement60d,
  sendReengagement90d,
  sendInsightDigest,
  sendActionReminder,
} from "@/lib/email";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { getBalance } from "@/lib/credits";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

async function trySendNurture(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  opts: {
    accountId?: string;
    email: string;
    notificationType: string;
    subject: string;
    sendFn: () => Promise<{ ok: boolean }>;
  },
): Promise<boolean> {
  const result = await opts.sendFn();
  // Log regardless of send outcome so we never retry on smtp-not-configured
  await supabase.from("svi_notifications").insert({
    ...(opts.accountId ? { account_id: opts.accountId } : {}),
    notification_type: opts.notificationType,
    subject: opts.subject,
    payload: { email: opts.email },
  });
  return result.ok;
}

// ---------------------------------------------------------------------------
// GET /api/cron/nurture — daily nurture email sequences
// Authorization: Bearer {CRON_SECRET}
//
// Sequences:
//   FREE users  (4-step, 7 days): Immediate (sendSVIReport) → Day 2 → Day 4 → Day 7
//   PAID users  (4-step, 7 days): Immediate (sendPaymentConfirmation) → Day 1 → Day 3 → Day 7
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase not configured" },
      { status: 503 },
    );
  }

  try {
    const now = new Date();
    let sent = 0;
    let skipped = 0;

    // ==================================================================
    // 1. Signed-up users (app_users) — free + paid nurture sequences
    // ==================================================================
    const { data: users } = await supabase
      .from("app_users")
      .select("id, email, display_name, plan, created_at, last_login_at");

    for (const user of users ?? []) {
      const createdAt = new Date(user.created_at);
      const daysSinceSignup = daysBetween(createdAt, now);

      // Check email preferences early
      const category = (!user.plan || user.plan === "free") ? "promotions" : "product_updates";
      const allowed = await canSendEmail(user.email, category);
      if (!allowed) {
        skipped++;
        continue;
      }

      // Fetch already-sent nurture types for this user
      const { data: sentRows } = await supabase
        .from("svi_notifications")
        .select("notification_type")
        .or(
          `account_id.eq.${user.id},payload->>email.eq.${user.email}`,
        )
        .like("notification_type", "nurture_%");

      const sentTypes = new Set(
        (sentRows ?? []).map(
          (s: { notification_type: string }) => s.notification_type,
        ),
      );

      const isFree = !user.plan || user.plan === "free";

      if (isFree) {
        // ---- Free user nurture sequence (Day 2, 4, 7) --------------------
        // Email 1 (Immediate "Your SVI Score is Ready") is sent by
        // sendSVIReport at analysis time, not by this cron.
        const freeSteps: Array<{
          day: number;
          type: string;
          subject: string;
          send: () => Promise<{ ok: boolean }>;
        }> = [
          {
            day: 2,
            type: "nurture_free_d2",
            subject: "Boost your SVI by 30+ points \u2014 here\u2019s how",
            send: () =>
              sendNurtureFreeDay2({
                to: user.email,
                name: user.display_name,
              }),
          },
          {
            day: 4,
            type: "nurture_free_d4",
            subject: "Are you splitting equity fairly? Check now (free)",
            send: () =>
              sendNurtureFreeDay4({
                to: user.email,
                name: user.display_name,
              }),
          },
          {
            day: 7,
            type: "nurture_free_d7",
            subject: "100 credits for A$49 \u2014 here\u2019s what Founding 50 members get",
            send: () =>
              sendNurtureFreeDay7({
                to: user.email,
                name: user.display_name,
              }),
          },
        ];

        for (const step of freeSteps) {
          if (daysSinceSignup >= step.day && !sentTypes.has(step.type)) {
            const ok = await trySendNurture(supabase, {
              accountId: user.id,
              email: user.email,
              notificationType: step.type,
              subject: step.subject,
              sendFn: step.send,
            });
            if (ok) sent++;
          }
        }
      } else {
        // ---- Paid user nurture sequence (Day 1, 3, 7) --------------------
        // Email 1 (Immediate "Welcome to Founder Plan") is sent by
        // sendPaymentConfirmation at payment time, not by this cron.

        // Fetch current SVI for the weekly progress email
        const { data: sviAccount } = await supabase
          .from("svi_accounts")
          .select("current_svi")
          .eq("email", user.email)
          .limit(1)
          .single();

        const currentSvi = sviAccount?.current_svi ?? undefined;

        const paidSteps: Array<{
          day: number;
          type: string;
          subject: string;
          send: () => Promise<{ ok: boolean }>;
        }> = [
          {
            day: 1,
            type: "nurture_paid_d1",
            subject: "Day 1: Upload your first piece of evidence",
            send: () =>
              sendNurturePaidDay1({
                to: user.email,
                name: user.display_name,
              }),
          },
          {
            day: 3,
            type: "nurture_paid_d3",
            subject: "Your equity, organized \u2014 try the Equity Setup Wizard",
            send: () =>
              sendNurturePaidDay3({
                to: user.email,
                name: user.display_name,
              }),
          },
          {
            day: 7,
            type: "nurture_paid_d7",
            subject: `Week 1 Progress: SVI ${currentSvi ?? ""} \u2014 here\u2019s what changed`.trim(),
            send: () =>
              sendNurturePaidDay7({
                to: user.email,
                name: user.display_name,
                svi: currentSvi,
              }),
          },
        ];

        for (const step of paidSteps) {
          if (daysSinceSignup >= step.day && !sentTypes.has(step.type)) {
            const ok = await trySendNurture(supabase, {
              accountId: user.id,
              email: user.email,
              notificationType: step.type,
              subject: step.subject,
              sendFn: step.send,
            });
            if (ok) sent++;
          }
        }
      }
    }

    // ==================================================================
    // 1b. Low credit alerts for signed-up users
    // ==================================================================
    for (const user of users ?? []) {
      const creditBalance = await getBalance(user.id);
      if (creditBalance >= 1.0) continue;

      const allowed = await canSendEmail(user.email, "product_updates");
      if (!allowed) continue;

      // Check if we already sent a low_credit_alert in the last 7 days
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentAlerts } = await supabase
        .from("svi_notifications")
        .select("id")
        .or(`account_id.eq.${user.id},payload->>email.eq.${user.email}`)
        .eq("notification_type", "low_credit_alert")
        .gte("created_at", sevenDaysAgo)
        .limit(1);

      if (recentAlerts && recentAlerts.length > 0) continue;

      const ok = await trySendNurture(supabase, {
        accountId: user.id,
        email: user.email,
        notificationType: "low_credit_alert",
        subject: "Your BlockID credits are running low",
        sendFn: () => sendLowCreditAlert({ to: user.email, balance: creditBalance }),
      });
      if (ok) sent++;
    }

    // ==================================================================
    // 2. Anonymous free-analysis users (svi_analyses without app_users)
    // ==================================================================
    const { data: freeAnalyses } = await supabase
      .from("svi_analyses")
      .select("id, email, total_svi, created_at");

    if (freeAnalyses && freeAnalyses.length > 0) {
      const analysisEmails = [
        ...new Set(
          freeAnalyses.map((a: { email: string }) => a.email),
        ),
      ];

      // Exclude users who already have an account
      const { data: existingUsers } = await supabase
        .from("app_users")
        .select("email")
        .in("email", analysisEmails);

      const signedUpEmails = new Set(
        (existingUsers ?? []).map((u: { email: string }) =>
          u.email.toLowerCase(),
        ),
      );

      // Group by email, keep most recent analysis
      const emailMap = new Map<
        string,
        { email: string; svi: number; createdAt: Date }
      >();
      for (const a of freeAnalyses) {
        const key = a.email.toLowerCase();
        const existing = emailMap.get(key);
        const thisDate = new Date(a.created_at);
        if (!existing || thisDate > existing.createdAt) {
          emailMap.set(key, {
            email: a.email,
            svi: a.total_svi,
            createdAt: thisDate,
          });
        }
      }

      for (const [key, info] of emailMap) {
        if (signedUpEmails.has(key)) continue;

        const allowed = await canSendEmail(info.email, "promotions");
        if (!allowed) {
          skipped++;
          continue;
        }

        const daysSinceAnalysis = daysBetween(info.createdAt, now);

        // Check already-sent nurture notifications for this email
        const { data: sentFreeRows } = await supabase
          .from("svi_notifications")
          .select("notification_type")
          .like("notification_type", "nurture_free_%")
          .filter("payload->>email", "eq", info.email);

        const sentFreeTypes = new Set(
          (sentFreeRows ?? []).map(
            (s: { notification_type: string }) => s.notification_type,
          ),
        );

        // Email 1 (Immediate "Your SVI Score is Ready") is sent at
        // analysis time by sendSVIReport. This cron handles Day 2+.
        const freeSteps: Array<{
          day: number;
          type: string;
          subject: string;
          send: () => Promise<{ ok: boolean }>;
        }> = [
          {
            day: 2,
            type: "nurture_free_d2",
            subject: "Boost your SVI by 30+ points \u2014 here\u2019s how",
            send: () =>
              sendNurtureFreeDay2({ to: info.email, svi: info.svi }),
          },
          {
            day: 4,
            type: "nurture_free_d4",
            subject: "Are you splitting equity fairly? Check now (free)",
            send: () => sendNurtureFreeDay4({ to: info.email }),
          },
          {
            day: 7,
            type: "nurture_free_d7",
            subject: "100 credits for A$49 \u2014 here\u2019s what Founding 50 members get",
            send: () => sendNurtureFreeDay7({ to: info.email }),
          },
        ];

        for (const step of freeSteps) {
          if (daysSinceAnalysis >= step.day && !sentFreeTypes.has(step.type)) {
            const ok = await trySendNurture(supabase, {
              email: info.email,
              notificationType: step.type,
              subject: step.subject,
              sendFn: step.send,
            });
            if (ok) sent++;
          }
        }
      }
    }

    // ==================================================================
    // 3. First Report 24h Follow-Up
    //    Targets users who had their FIRST SVI analysis 23–25 hours ago
    //    and haven't received this email yet.
    // ==================================================================
    const twentyFiveHoursAgo = new Date(now.getTime() - 25 * 60 * 60 * 1000).toISOString();
    const twentyThreeHoursAgo = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString();

    // Find analyses created in the 23–25 hour window
    const { data: recentFirstAnalyses } = await supabase
      .from("svi_analyses")
      .select("id, email, total_svi, analysis_json, created_at")
      .gte("created_at", twentyFiveHoursAgo)
      .lte("created_at", twentyThreeHoursAgo)
      .order("created_at", { ascending: true });

    if (recentFirstAnalyses && recentFirstAnalyses.length > 0) {
      // Group by email — we only want the first analysis per email
      const emailFirstAnalysis = new Map<string, typeof recentFirstAnalyses[0]>();
      for (const a of recentFirstAnalyses) {
        const key = a.email.toLowerCase();
        if (!emailFirstAnalysis.has(key)) {
          emailFirstAnalysis.set(key, a);
        }
      }

      for (const [emailKey, analysis] of emailFirstAnalysis) {
        // Verify this was their FIRST ever analysis (no earlier ones exist)
        const { data: olderAnalyses } = await supabase
          .from("svi_analyses")
          .select("id")
          .eq("email", emailKey)
          .lt("created_at", analysis.created_at)
          .limit(1);

        if (olderAnalyses && olderAnalyses.length > 0) continue; // Not their first

        // Check if we already sent first_report_24h to this email
        const { data: alreadySent } = await supabase
          .from("svi_notifications")
          .select("id")
          .eq("notification_type", "first_report_24h")
          .filter("payload->>email", "eq", analysis.email)
          .limit(1);

        if (alreadySent && alreadySent.length > 0) continue; // Already sent

        // Check email preferences
        const allowed24h = await canSendEmail(analysis.email, "promotions");
        if (!allowed24h) {
          skipped++;
          continue;
        }

        // Extract evidence gaps and stage label from analysis_json
        const analysisData = analysis.analysis_json as {
          stageLabel?: string;
          evidenceGaps?: { label: string; impact: number }[];
        } | null;
        const stageLabel = analysisData?.stageLabel ?? "Concept";
        const evidenceGaps = (analysisData?.evidenceGaps ?? []).slice(0, 3).map(
          (g: { label: string; impact: number }) => ({
            label: g.label,
            impact: g.impact,
          }),
        );

        // Look up display name if user has an account
        let displayName: string | null = null;
        const { data: appUser } = await supabase
          .from("app_users")
          .select("display_name")
          .eq("email", analysis.email)
          .maybeSingle();
        if (appUser?.display_name) displayName = appUser.display_name;

        const ok = await trySendNurture(supabase, {
          email: analysis.email,
          notificationType: "first_report_24h",
          subject: `Your startup scored ${analysis.total_svi} — here's how to improve`,
          sendFn: () =>
            sendNurtureFirstReport24h({
              to: analysis.email,
              name: displayName,
              svi: analysis.total_svi,
              stageLabel,
              slug: analysis.id,
              evidenceGaps,
            }),
        });
        if (ok) sent++;
      }
    }

    // ==================================================================
    // 4. Evidence Score Boost (Day 3 after signup)
    //    Targets users who signed up 3+ days ago, have at least 1 SVI
    //    analysis, but 0 evidence items uploaded.
    // ==================================================================
    for (const user of users ?? []) {
      const createdAt = new Date(user.created_at);
      const daysSinceSignup = daysBetween(createdAt, now);
      if (daysSinceSignup < 3) continue;

      const allowed = await canSendEmail(user.email, "promotions");
      if (!allowed) continue;

      // Already sent?
      const { data: boostSent } = await supabase
        .from("svi_notifications")
        .select("id")
        .or(`account_id.eq.${user.id},payload->>email.eq.${user.email}`)
        .eq("notification_type", "evidence_boost_3d")
        .limit(1);
      if (boostSent && boostSent.length > 0) continue;

      // Must have at least 1 analysis
      const { data: userAnalyses } = await supabase
        .from("svi_analyses")
        .select("total_svi, analysis_json")
        .eq("email", user.email)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!userAnalyses || userAnalyses.length === 0) continue;

      // Must have 0 evidence items
      const { count: evidenceCount } = await supabase
        .from("svi_evidence")
        .select("id", { count: "exact", head: true })
        .eq("account_id", user.id);
      if (evidenceCount && evidenceCount > 0) continue;

      // Extract evidence gaps from latest analysis
      const latestAnalysis = userAnalyses[0];
      const analysisData = latestAnalysis.analysis_json as SVIAnalysis | null;
      const evidenceGaps = (analysisData?.evidenceGaps ?? []).slice(0, 3).map(
        (g) => ({ label: g.label, impact: g.impact }),
      );
      if (evidenceGaps.length === 0) continue;

      const totalPoints = evidenceGaps.reduce((sum, g) => sum + g.impact, 0);

      const ok = await trySendNurture(supabase, {
        accountId: user.id,
        email: user.email,
        notificationType: "evidence_boost_3d",
        subject: `Your SVI score could be ${totalPoints}% higher \u2014 here\u2019s how`,
        sendFn: () =>
          sendEvidenceScoreBoost({
            to: user.email,
            name: user.display_name,
            svi: latestAnalysis.total_svi,
            evidenceGaps,
          }),
      });
      if (ok) sent++;
    }

    // ==================================================================
    // 5. Unlock Deeper Analysis (Day 7 after first analysis)
    //    Targets users whose first SVI analysis was 7+ days ago and
    //    who have never purchased credits.
    // ==================================================================
    for (const user of users ?? []) {
      const allowed = await canSendEmail(user.email, "promotions");
      if (!allowed) continue;

      // Already sent?
      const { data: unlockSent } = await supabase
        .from("svi_notifications")
        .select("id")
        .or(`account_id.eq.${user.id},payload->>email.eq.${user.email}`)
        .eq("notification_type", "unlock_deeper_7d")
        .limit(1);
      if (unlockSent && unlockSent.length > 0) continue;

      // Find first analysis for this user
      const { data: firstAnalysis } = await supabase
        .from("svi_analyses")
        .select("created_at, analysis_json")
        .eq("email", user.email)
        .order("created_at", { ascending: true })
        .limit(1);
      if (!firstAnalysis || firstAnalysis.length === 0) continue;

      const firstAnalysisDate = new Date(firstAnalysis[0].created_at);
      const daysSinceFirstAnalysis = daysBetween(firstAnalysisDate, now);
      if (daysSinceFirstAnalysis < 7) continue;

      // Check if user ever purchased credits (any positive credit transaction)
      const { data: creditPurchases } = await supabase
        .from("credit_transactions")
        .select("id")
        .eq("user_id", user.id)
        .gt("amount", 0)
        .limit(1);
      if (creditPurchases && creditPurchases.length > 0) continue;

      // Extract stage label from the latest analysis
      const { data: latestForStage } = await supabase
        .from("svi_analyses")
        .select("analysis_json")
        .eq("email", user.email)
        .order("created_at", { ascending: false })
        .limit(1);
      const stageLabel = (latestForStage?.[0]?.analysis_json as SVIAnalysis | null)?.stageLabel ?? "Concept";

      const ok = await trySendNurture(supabase, {
        accountId: user.id,
        email: user.email,
        notificationType: "unlock_deeper_7d",
        subject: `What investors will see in your ${stageLabel} startup`,
        sendFn: () =>
          sendUnlockDeeperAnalysis({
            to: user.email,
            name: user.display_name,
            stageLabel,
          }),
      });
      if (ok) sent++;
    }

    // ==================================================================
    // 6. Weekly SVI Summary (every week for active users)
    //    Targets users with at least 1 analysis in the last 30 days.
    //    Uses ISO week number to prevent duplicate sends within a week.
    // ==================================================================
    // Calculate current ISO week number
    const getISOWeek = (d: Date): number => {
      const tmp = new Date(d.getTime());
      tmp.setHours(0, 0, 0, 0);
      tmp.setDate(tmp.getDate() + 3 - ((tmp.getDay() + 6) % 7));
      const week1 = new Date(tmp.getFullYear(), 0, 4);
      return 1 + Math.round(((tmp.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    };
    const currentWeek = getISOWeek(now);
    const weekKey = `weekly_summary_${now.getFullYear()}_w${currentWeek}`;

    for (const user of users ?? []) {
      const allowed = await canSendEmail(user.email, "product_updates");
      if (!allowed) continue;

      // Already sent this week?
      const { data: weeklySent } = await supabase
        .from("svi_notifications")
        .select("id")
        .or(`account_id.eq.${user.id},payload->>email.eq.${user.email}`)
        .eq("notification_type", weekKey)
        .limit(1);
      if (weeklySent && weeklySent.length > 0) continue;

      // Must have at least 1 analysis
      const { data: userAnalyses } = await supabase
        .from("svi_analyses")
        .select("total_svi, analysis_json, created_at")
        .eq("email", user.email)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!userAnalyses || userAnalyses.length === 0) continue;

      // Last analysis must be within 30 days
      const lastAnalysisDate = new Date(userAnalyses[0].created_at);
      const daysSinceLastAnalysis = daysBetween(lastAnalysisDate, now);
      if (daysSinceLastAnalysis > 30) continue;

      const latestSvi = userAnalyses[0].total_svi;
      const analysisData = userAnalyses[0].analysis_json as SVIAnalysis | null;

      // Calculate delta from previous week's snapshot (look for last week's summary or use weeklyDelta)
      const delta = analysisData?.weeklyDelta ?? 0;

      // Count evidence uploaded in the last 7 days
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count: recentEvidenceCount } = await supabase
        .from("svi_evidence")
        .select("id", { count: "exact", head: true })
        .eq("account_id", user.id)
        .gte("created_at", sevenDaysAgo);

      // Extract top evidence gaps for recommended actions
      const evidenceGaps = (analysisData?.evidenceGaps ?? []).slice(0, 3).map(
        (g) => ({ label: g.label, impact: g.impact }),
      );

      const deltaStr = delta > 0 ? `+${delta}` : delta === 0 ? "no change" : `${delta}`;

      const ok = await trySendNurture(supabase, {
        accountId: user.id,
        email: user.email,
        notificationType: weekKey,
        subject: `Your startup this week: SVI ${latestSvi} (${deltaStr})`,
        sendFn: () =>
          sendWeeklySVISummary({
            to: user.email,
            name: user.display_name,
            svi: latestSvi,
            delta,
            evidenceCount: recentEvidenceCount ?? 0,
            evidenceGaps,
          }),
      });
      if (ok) sent++;
    }

    // ==================================================================
    // 7. Inactive User Re-engagement (30, 60, 90 days since last login)
    //    Targets users whose last_login_at is approximately 30, 60, or
    //    90 days ago (±1 day window). Sends escalating re-engagement
    //    emails to bring them back.
    // ==================================================================
    for (const user of users ?? []) {
      if (!user.last_login_at) continue;

      const lastLogin = new Date(user.last_login_at);
      const daysSinceLogin = daysBetween(lastLogin, now);

      const allowed = await canSendEmail(user.email, "promotions");
      if (!allowed) {
        skipped++;
        continue;
      }

      // Check already-sent re-engagement notifications for this user
      const { data: reengageSentRows } = await supabase
        .from("svi_notifications")
        .select("notification_type")
        .or(
          `account_id.eq.${user.id},payload->>email.eq.${user.email}`,
        )
        .like("notification_type", "reengagement_%");

      const reengageSentTypes = new Set(
        (reengageSentRows ?? []).map(
          (s: { notification_type: string }) => s.notification_type,
        ),
      );

      // Fetch latest SVI score for personalization (used in 30d email)
      let latestSvi: number | null = null;
      if (daysSinceLogin >= 29 && daysSinceLogin <= 31 && !reengageSentTypes.has("reengagement_30d")) {
        const { data: sviData } = await supabase
          .from("svi_analyses")
          .select("total_svi")
          .eq("email", user.email)
          .order("created_at", { ascending: false })
          .limit(1);
        latestSvi = sviData?.[0]?.total_svi ?? null;
      }

      const reengageSteps: Array<{
        minDays: number;
        maxDays: number;
        type: string;
        subject: string;
        send: () => Promise<{ ok: boolean }>;
      }> = [
        {
          minDays: 29,
          maxDays: 31,
          type: "reengagement_30d",
          subject: "Your startup score might have changed",
          send: () =>
            sendReengagement30d({
              to: user.email,
              name: user.display_name,
              svi: latestSvi,
            }),
        },
        {
          minDays: 59,
          maxDays: 61,
          type: "reengagement_60d",
          subject: "New features since you last visited BlockID",
          send: () =>
            sendReengagement60d({
              to: user.email,
              name: user.display_name,
            }),
        },
        {
          minDays: 89,
          maxDays: 91,
          type: "reengagement_90d",
          subject: "Your data is safe — come back anytime",
          send: () =>
            sendReengagement90d({
              to: user.email,
              name: user.display_name,
            }),
        },
      ];

      for (const step of reengageSteps) {
        if (
          daysSinceLogin >= step.minDays &&
          daysSinceLogin <= step.maxDays &&
          !reengageSentTypes.has(step.type)
        ) {
          const ok = await trySendNurture(supabase, {
            accountId: user.id,
            email: user.email,
            notificationType: step.type,
            subject: step.subject,
            sendFn: step.send,
          });
          if (ok) sent++;
        }
      }
    }

    // ==================================================================
    // 8. Weekly Insight Digest
    //    Sends a digest of unread user_insights from the past 7 days.
    //    Uses ISO week number key to prevent duplicate sends per week.
    // ==================================================================
    const digestWeekKey = `insight_digest_w${currentWeek}`;

    for (const user of users ?? []) {
      const allowed = await canSendEmail(user.email, "product_updates");
      if (!allowed) continue;

      // Already sent this week?
      const { data: digestSent } = await supabase
        .from("svi_notifications")
        .select("id")
        .or(`account_id.eq.${user.id},payload->>email.eq.${user.email}`)
        .eq("notification_type", digestWeekKey)
        .limit(1);
      if (digestSent && digestSent.length > 0) continue;

      // Find unread insights from the past 7 days
      const sevenDaysAgoISO = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: unreadInsights } = await supabase
        .from("user_insights")
        .select("id, title, summary")
        .eq("user_id", user.id)
        .is("read_at", null)
        .gte("created_at", sevenDaysAgoISO)
        .order("created_at", { ascending: false })
        .limit(3);

      if (!unreadInsights || unreadInsights.length === 0) continue;

      const ok = await trySendNurture(supabase, {
        accountId: user.id,
        email: user.email,
        notificationType: digestWeekKey,
        subject: `${unreadInsights.length} new insight${unreadInsights.length === 1 ? "" : "s"} for your startup`,
        sendFn: () =>
          sendInsightDigest({
            to: user.email,
            name: user.display_name,
            insights: unreadInsights.map((i: { title: string; summary: string }) => ({
              title: i.title,
              summary: i.summary,
            })),
          }),
      });
      if (ok) sent++;
    }

    // ==================================================================
    // 9. Weekly Action Reminder
    //    Finds users with SVI analyses containing nextActions and
    //    reminds them about their top uncompleted action item.
    //    Uses ISO week number key to prevent duplicate sends per week.
    // ==================================================================
    const actionWeekKey = `action_reminder_w${currentWeek}`;

    for (const user of users ?? []) {
      const allowed = await canSendEmail(user.email, "product_updates");
      if (!allowed) continue;

      // Already sent this week?
      const { data: actionSent } = await supabase
        .from("svi_notifications")
        .select("id")
        .or(`account_id.eq.${user.id},payload->>email.eq.${user.email}`)
        .eq("notification_type", actionWeekKey)
        .limit(1);
      if (actionSent && actionSent.length > 0) continue;

      // Find latest analysis with nextActions
      const { data: actionAnalyses } = await supabase
        .from("svi_analyses")
        .select("analysis_json")
        .eq("email", user.email)
        .order("created_at", { ascending: false })
        .limit(1);
      if (!actionAnalyses || actionAnalyses.length === 0) continue;

      const actionData = actionAnalyses[0].analysis_json as SVIAnalysis | null;
      const nextActions = actionData?.nextActions;
      if (!nextActions || nextActions.length === 0) continue;

      // Pick the top (highest priority) uncompleted action
      const topAction = nextActions[0];

      const ok = await trySendNurture(supabase, {
        accountId: user.id,
        email: user.email,
        notificationType: actionWeekKey,
        subject: `Your next step: ${topAction.title}`,
        sendFn: () =>
          sendActionReminder({
            to: user.email,
            name: user.display_name,
            actionTitle: topAction.title,
            actionDetail: topAction.detail,
            actionImpact: topAction.impact,
          }),
      });
      if (ok) sent++;
    }

    return NextResponse.json({
      ok: true,
      sent,
      skipped,
      ts: now.toISOString(),
    });
  } catch (err) {
    console.error("[blockid:nurture] cron failed", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
