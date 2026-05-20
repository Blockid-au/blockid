import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { canSendEmail } from "@/lib/email-preferences";
import {
  sendNurtureFreeDay1,
  sendNurtureFreeDay3,
  sendNurtureFreeDay7,
  sendNurtureFreeDay14,
  sendNurturePaidDay1,
  sendNurturePaidDay3,
  sendNurturePaidDay14,
  sendNurturePaidDay30,
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
      const allowed = await canSendEmail(user.email, "promotions");
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
        // ---- Free user nurture sequence -----------------------------------
        const freeSteps: Array<{
          day: number;
          type: string;
          subject: string;
          send: () => Promise<{ ok: boolean }>;
        }> = [
          {
            day: 1,
            type: "nurture_free_d1",
            subject: "Your SVI score is waiting — 3 things to do next",
            send: () =>
              sendNurtureFreeDay1({
                to: user.email,
                name: user.display_name,
              }),
          },
          {
            day: 3,
            type: "nurture_free_d3",
            subject: "How to boost your SVI by 20+ points",
            send: () =>
              sendNurtureFreeDay3({
                to: user.email,
                name: user.display_name,
              }),
          },
          {
            day: 7,
            type: "nurture_free_d7",
            subject: "Australian founders who improved their score",
            send: () =>
              sendNurtureFreeDay7({
                to: user.email,
                name: user.display_name,
              }),
          },
          {
            day: 14,
            type: "nurture_free_d14",
            subject: "Last chance: Founding 50 early access",
            send: () =>
              sendNurtureFreeDay14({
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
        // ---- Paid user nurture sequence -----------------------------------
        const paidSteps: Array<{
          day: number;
          type: string;
          subject: string;
          send: () => Promise<{ ok: boolean }>;
        }> = [
          {
            day: 1,
            type: "nurture_paid_d1",
            subject: "Your 30-day growth plan starts now",
            send: () =>
              sendNurturePaidDay1({
                to: user.email,
                name: user.display_name,
              }),
          },
          {
            day: 3,
            type: "nurture_paid_d3",
            subject: "Upload your first evidence — here's how",
            send: () =>
              sendNurturePaidDay3({
                to: user.email,
                name: user.display_name,
              }),
          },
          {
            day: 14,
            type: "nurture_paid_d14",
            subject: "Share your SVI with investors",
            send: () =>
              sendNurturePaidDay14({
                to: user.email,
                name: user.display_name,
              }),
          },
          {
            day: 30,
            type: "nurture_paid_d30",
            subject: "Your first month review on BlockID",
            send: () =>
              sendNurturePaidDay30({
                to: user.email,
                name: user.display_name,
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

        const freeSteps: Array<{
          day: number;
          type: string;
          subject: string;
          send: () => Promise<{ ok: boolean }>;
        }> = [
          {
            day: 1,
            type: "nurture_free_d1",
            subject: "Your SVI score is waiting — 3 things to do next",
            send: () =>
              sendNurtureFreeDay1({ to: info.email, svi: info.svi }),
          },
          {
            day: 3,
            type: "nurture_free_d3",
            subject: "How to boost your SVI by 20+ points",
            send: () => sendNurtureFreeDay3({ to: info.email }),
          },
          {
            day: 7,
            type: "nurture_free_d7",
            subject: "Australian founders who improved their score",
            send: () => sendNurtureFreeDay7({ to: info.email }),
          },
          {
            day: 14,
            type: "nurture_free_d14",
            subject: "Last chance: Founding 50 early access",
            send: () => sendNurtureFreeDay14({ to: info.email }),
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
