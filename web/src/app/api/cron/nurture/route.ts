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
} from "@/lib/email";

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
      .select("id, email, display_name, plan, created_at");

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
